use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::db::DbState;

pub const DEFAULT_MCP_PORT: u16 = 39281;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ActiveCanvasState {
    pub id: Option<String>,
    pub title: Option<String>,
    pub elements: Vec<serde_json::Value>,
    pub app_state: serde_json::Value,
}

#[derive(Clone)]
pub struct McpState {
    pub active_canvas: Arc<Mutex<ActiveCanvasState>>,
    pub sessions: Arc<Mutex<HashMap<String, Sender<String>>>>,
    pub app_handle: AppHandle,
}

impl McpState {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            active_canvas: Arc::new(Mutex::new(ActiveCanvasState::default())),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            app_handle,
        }
    }
}

// ---------------------------------------------------------------------------
// HTTP Server & SSE Handler
// ---------------------------------------------------------------------------

pub fn start_mcp_server(state: McpState, port: u16) {
    let addr = format!("127.0.0.1:{}", port);
    let listener = match TcpListener::bind(&addr) {
        Ok(l) => {
            eprintln!("[drawx-mcp] Listening on http://{}", addr);
            l
        }
        Err(e) => {
            eprintln!("[drawx-mcp] Could not bind to {}: {}", addr, e);
            return;
        }
    };

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let state_clone = state.clone();
                std::thread::spawn(move || {
                    handle_connection(stream, state_clone);
                });
            }
            Err(e) => {
                eprintln!("[drawx-mcp] Connection error: {}", e);
            }
        }
    }
}

fn handle_connection(mut stream: TcpStream, state: McpState) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let stream_clone = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };
    let mut reader = BufReader::new(stream_clone);

    let mut first_line = String::new();
    if reader.read_line(&mut first_line).is_err() || first_line.trim().is_empty() {
        return;
    }

    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }
    let method = parts[0].to_uppercase();
    let full_path = parts[1];
    let (path, query_string) = match full_path.split_once('?') {
        Some((p, q)) => (p, q),
        None => (full_path, ""),
    };

    // Read headers
    let mut headers: HashMap<String, String> = HashMap::new();
    loop {
        let mut header_line = String::new();
        if reader.read_line(&mut header_line).is_err() || header_line == "\r\n" || header_line == "\n" {
            break;
        }
        if let Some((k, v)) = header_line.split_once(':') {
            headers.insert(k.trim().to_lowercase(), v.trim().to_string());
        }
    }

    // Parse query params
    let mut query: HashMap<String, String> = HashMap::new();
    for pair in query_string.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            query.insert(k.to_string(), v.to_string());
        }
    }

    // CORS preflight
    if method == "OPTIONS" {
        let response = "HTTP/1.1 204 No Content\r\n\
                        Access-Control-Allow-Origin: *\r\n\
                        Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                        Access-Control-Allow-Headers: Content-Type, Authorization, Accept\r\n\
                        Access-Control-Max-Age: 86400\r\n\
                        Content-Length: 0\r\n\r\n";
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();
        return;
    }

    // SSE Endpoint (GET /sse)
    if method == "GET" && path == "/sse" {
        let session_id = format!(
            "{:x}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );

        let header = "HTTP/1.1 200 OK\r\n\
                      Content-Type: text/event-stream\r\n\
                      Cache-Control: no-cache\r\n\
                      Connection: keep-alive\r\n\
                      Access-Control-Allow-Origin: *\r\n\
                      Access-Control-Allow-Headers: Content-Type, Authorization, Accept\r\n\r\n";
        if stream.write_all(header.as_bytes()).is_err() {
            return;
        }

        let endpoint_event = format!("event: endpoint\r\ndata: /message?sessionId={}\r\n\r\n", session_id);
        if stream.write_all(endpoint_event.as_bytes()).is_err() || stream.flush().is_err() {
            return;
        }

        let (tx, rx) = channel::<String>();
        {
            if let Ok(mut sessions) = state.sessions.lock() {
                sessions.insert(session_id.clone(), tx);
            }
        }

        loop {
            match rx.recv_timeout(Duration::from_secs(15)) {
                Ok(msg) => {
                    let event_payload = format!("event: message\r\ndata: {}\r\n\r\n", msg);
                    if stream.write_all(event_payload.as_bytes()).is_err() || stream.flush().is_err() {
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if stream.write_all(b": keepalive\r\n\r\n").is_err() || stream.flush().is_err() {
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
            }
        }

        if let Ok(mut sessions) = state.sessions.lock() {
            sessions.remove(&session_id);
        }
        return;
    }

    // Read body helper
    let content_length: usize = headers
        .get("content-length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        let _ = reader.read_exact(&mut body);
    }

    // POST /message?sessionId=... (SSE client responses)
    if method == "POST" && path == "/message" {
        let req_json: serde_json::Value = match serde_json::from_slice(&body) {
            Ok(v) => v,
            Err(_) => {
                let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
                return;
            }
        };

        let session_id = query.get("sessionId").cloned();
        let response = handle_jsonrpc(&state, &req_json);

        if let Some(resp) = response {
            if let Some(ref sid) = session_id {
                if let Ok(sessions) = state.sessions.lock() {
                    if let Some(tx) = sessions.get(sid) {
                        let _ = tx.send(resp.to_string());
                    }
                }
            }
        }

        let ack = "HTTP/1.1 202 Accepted\r\n\
                   Access-Control-Allow-Origin: *\r\n\
                   Content-Length: 0\r\n\r\n";
        let _ = stream.write_all(ack.as_bytes());
        let _ = stream.flush();
        return;
    }

    // POST / or POST /mcp (Direct HTTP JSON-RPC)
    if method == "POST" && (path == "/" || path == "/mcp") {
        let req_json: serde_json::Value = match serde_json::from_slice(&body) {
            Ok(v) => v,
            Err(_) => {
                let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
                return;
            }
        };

        let response = handle_jsonrpc(&state, &req_json);
        let resp_str = match response {
            Some(r) => r.to_string(),
            None => "{}".to_string(),
        };

        let resp_header = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: application/json\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Access-Control-Allow-Headers: Content-Type, Authorization, Accept\r\n\
             Content-Length: {}\r\n\r\n{}",
            resp_str.len(),
            resp_str
        );
        let _ = stream.write_all(resp_header.as_bytes());
        let _ = stream.flush();
        return;
    }

    // GET / or GET /health
    if method == "GET" && (path == "/" || path == "/health") {
        let info = serde_json::json!({
            "status": "online",
            "app": "Drawx",
            "mcp": {
                "version": "2024-11-05",
                "sse": "/sse",
                "mcp": "/mcp"
            }
        }).to_string();

        let resp = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: application/json\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Content-Length: {}\r\n\r\n{}",
            info.len(),
            info
        );
        let _ = stream.write_all(resp.as_bytes());
        let _ = stream.flush();
        return;
    }

    // 404 fallback
    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
}

// ---------------------------------------------------------------------------
// JSON-RPC Protocol & Tool Dispatcher
// ---------------------------------------------------------------------------

fn handle_jsonrpc(state: &McpState, req: &serde_json::Value) -> Option<serde_json::Value> {
    let id = req.get("id");
    let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("");

    match method {
        "initialize" => {
            let result = serde_json::json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {},
                    "resources": {}
                },
                "serverInfo": {
                    "name": "drawx-mcp",
                    "version": "0.7.2"
                },
                "instructions": "Drawx MCP Server provides live access to inspect and modify diagrams in Drawx. Use get_active_canvas or get_canvas_summary to read diagrams, and add_elements to draw shapes and text."
            });
            id.map(|req_id| json_rpc_success(req_id, result))
        }
        "notifications/initialized" => None,
        "ping" => {
            id.map(|req_id| json_rpc_success(req_id, serde_json::json!({})))
        }
        "tools/list" => {
            let tools = get_tool_definitions();
            id.map(|req_id| json_rpc_success(req_id, serde_json::json!({ "tools": tools })))
        }
        "tools/call" => {
            let params = req.get("params");
            let tool_name = params.and_then(|p| p.get("name")).and_then(|n| n.as_str()).unwrap_or("");
            let arguments = params.and_then(|p| p.get("arguments")).cloned().unwrap_or(serde_json::json!({}));
            let call_result = execute_tool(state, tool_name, &arguments);
            id.map(|req_id| json_rpc_success(req_id, call_result))
        }
        "resources/list" => {
            let resources = serde_json::json!([
                {
                    "uri": "drawx://active",
                    "name": "Active Canvas",
                    "description": "Currently open canvas in Drawx editor",
                    "mimeType": "application/json"
                },
                {
                    "uri": "drawx://canvases",
                    "name": "All Canvases",
                    "description": "List of all saved canvases in Drawx database",
                    "mimeType": "application/json"
                }
            ]);
            id.map(|req_id| json_rpc_success(req_id, serde_json::json!({ "resources": resources })))
        }
        "resources/read" => {
            let uri = req.get("params").and_then(|p| p.get("uri")).and_then(|u| u.as_str()).unwrap_or("");
            let read_result = read_resource(state, uri);
            id.map(|req_id| json_rpc_success(req_id, read_result))
        }
        _ => {
            id.map(|req_id| json_rpc_error(req_id, -32601, &format!("Method not found: {}", method)))
        }
    }
}

fn json_rpc_success(id: &serde_json::Value, result: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    })
}

fn json_rpc_error(id: &serde_json::Value, code: i64, message: &str) -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message
        }
    })
}

fn execute_tool(state: &McpState, name: &str, args: &serde_json::Value) -> serde_json::Value {
    match name {
        "get_active_canvas" => {
            let active = match state.active_canvas.lock() {
                Ok(a) => a.clone(),
                Err(_) => ActiveCanvasState::default(),
            };
            let json_str = serde_json::to_string_pretty(&active).unwrap_or_default();
            serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": json_str
                }]
            })
        }
        "get_canvas_summary" => {
            let canvas_id = args.get("canvas_id").and_then(|c| c.as_str());
            let summary = if let Some(cid) = canvas_id {
                match get_canvas_from_db(state, cid) {
                    Some(canvas) => generate_canvas_summary(&canvas.title, &canvas.elements),
                    None => format!("Canvas with ID '{}' not found.", cid),
                }
            } else {
                let active = match state.active_canvas.lock() {
                    Ok(a) => a.clone(),
                    Err(_) => ActiveCanvasState::default(),
                };
                let title = active.title.as_deref().unwrap_or("Active Canvas");
                generate_canvas_summary(title, &active.elements)
            };
            serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": summary
                }]
            })
        }
        "list_canvases" => {
            let canvases = list_canvases_from_db(state);
            let json_str = serde_json::to_string_pretty(&canvases).unwrap_or_default();
            serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": json_str
                }]
            })
        }
        "get_canvas" => {
            let id = args.get("id").and_then(|i| i.as_str()).unwrap_or("");
            if id.is_empty() {
                return serde_json::json!({
                    "isError": true,
                    "content": [{
                        "type": "text",
                        "text": "Parameter 'id' is required"
                    }]
                });
            }
            match get_canvas_from_db(state, id) {
                Some(canvas) => {
                    let json_str = serde_json::to_string_pretty(&canvas).unwrap_or_default();
                    serde_json::json!({
                        "content": [{
                            "type": "text",
                            "text": json_str
                        }]
                    })
                }
                None => serde_json::json!({
                    "isError": true,
                    "content": [{
                        "type": "text",
                        "text": format!("Canvas with ID '{}' not found", id)
                    }]
                }),
            }
        }
        "add_elements" => {
            let elements_opt = args.get("elements").and_then(|e| e.as_array());
            let elements = match elements_opt {
                Some(arr) if !arr.is_empty() => arr,
                _ => {
                    return serde_json::json!({
                        "isError": true,
                        "content": [{
                            "type": "text",
                            "text": "Parameter 'elements' must be a non-empty array of objects"
                        }]
                    });
                }
            };

            let normalized: Vec<serde_json::Value> = elements
                .iter()
                .enumerate()
                .map(|(idx, el)| normalize_element(el, idx))
                .collect();

            let count = normalized.len();

            // 1. Update in-memory active canvas
            if let Ok(mut active) = state.active_canvas.lock() {
                active.elements.extend(normalized.clone());
            }

            // 2. Emit live event to webview
            let _ = state.app_handle.emit("drawx://mcp-add-elements", &normalized);

            serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": format!("Successfully added {} element(s) to active canvas. They are now rendered on screen.", count)
                }]
            })
        }
        "clear_active_canvas" => {
            if let Ok(mut active) = state.active_canvas.lock() {
                active.elements.clear();
            }
            let _ = state.app_handle.emit("drawx://mcp-clear-canvas", ());
            serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": "Active canvas has been cleared."
                }]
            })
        }
        _ => serde_json::json!({
            "isError": true,
            "content": [{
                "type": "text",
                "text": format!("Unknown tool: {}", name)
            }]
        }),
    }
}

fn read_resource(state: &McpState, uri: &str) -> serde_json::Value {
    if uri == "drawx://active" {
        let active = match state.active_canvas.lock() {
            Ok(a) => a.clone(),
            Err(_) => ActiveCanvasState::default(),
        };
        let text = serde_json::to_string_pretty(&active).unwrap_or_default();
        serde_json::json!({
            "contents": [{
                "uri": uri,
                "mimeType": "application/json",
                "text": text
            }]
        })
    } else if uri == "drawx://canvases" {
        let canvases = list_canvases_from_db(state);
        let text = serde_json::to_string_pretty(&canvases).unwrap_or_default();
        serde_json::json!({
            "contents": [{
                "uri": uri,
                "mimeType": "application/json",
                "text": text
            }]
        })
    } else if let Some(cid) = uri.strip_prefix("drawx://canvas/") {
        match get_canvas_from_db(state, cid) {
            Some(canvas) => {
                let text = serde_json::to_string_pretty(&canvas).unwrap_or_default();
                serde_json::json!({
                    "contents": [{
                        "uri": uri,
                        "mimeType": "application/json",
                        "text": text
                    }]
                })
            }
            None => serde_json::json!({
                "isError": true,
                "contents": [{
                    "uri": uri,
                    "mimeType": "text/plain",
                    "text": format!("Canvas with ID '{}' not found", cid)
                }]
            }),
        }
    } else {
        serde_json::json!({
            "isError": true,
            "contents": [{
                "uri": uri,
                "mimeType": "text/plain",
                "text": format!("Unknown resource URI: {}", uri)
            }]
        })
    }
}

// ---------------------------------------------------------------------------
// Diagram Summarizer & Element Normalizer
// ---------------------------------------------------------------------------

fn generate_canvas_summary(title: &str, elements: &[serde_json::Value]) -> String {
    if elements.is_empty() {
        return format!("# Canvas: {}\n\n(Empty canvas — no elements)", title);
    }

    let mut shapes = Vec::new();
    let mut texts = Vec::new();
    let mut arrows = Vec::new();

    for el in elements {
        let is_deleted = el.get("isDeleted").and_then(|d| d.as_bool()).unwrap_or(false);
        if is_deleted {
            continue;
        }

        let id = el.get("id").and_then(|i| i.as_str()).unwrap_or("?");
        let el_type = el.get("type").and_then(|t| t.as_str()).unwrap_or("unknown");
        let x = el.get("x").and_then(|n| n.as_f64()).unwrap_or(0.0) as i64;
        let y = el.get("y").and_then(|n| n.as_f64()).unwrap_or(0.0) as i64;
        let w = el.get("width").and_then(|n| n.as_f64()).unwrap_or(0.0) as i64;
        let h = el.get("height").and_then(|n| n.as_f64()).unwrap_or(0.0) as i64;

        if el_type == "text" {
            let text = el.get("text").and_then(|t| t.as_str()).unwrap_or("").trim();
            texts.push(format!("- Text [id: {}]: \"{}\" at ({}, {})", id, text, x, y));
        } else if el_type == "arrow" || el_type == "line" {
            let start_id = el.get("startBinding")
                .and_then(|b| b.get("elementId"))
                .and_then(|i| i.as_str())
                .unwrap_or("start");
            let end_id = el.get("endBinding")
                .and_then(|b| b.get("elementId"))
                .and_then(|i| i.as_str())
                .unwrap_or("end");
            arrows.push(format!(
                "- {} [id: {}]: connects [{}] -> [{}] (from {},{} to {},{})",
                el_type, id, start_id, end_id, x, y, x + w, y + h
            ));
        } else {
            let stroke = el.get("strokeColor").and_then(|s| s.as_str()).unwrap_or("#000");
            let bg = el.get("backgroundColor").and_then(|s| s.as_str()).unwrap_or("transparent");
            shapes.push(format!(
                "- {} [id: {}]: pos ({}, {}), size ({}x{}), stroke: {}, bg: {}",
                el_type, id, x, y, w, h, stroke, bg
            ));
        }
    }

    let mut out = String::new();
    out.push_str(&format!("# Canvas: {}\n", title));
    out.push_str(&format!("Total elements: {}\n\n", shapes.len() + texts.len() + arrows.len()));

    if !shapes.is_empty() {
        out.push_str("### Shapes & Containers:\n");
        for s in shapes {
            out.push_str(&s);
            out.push('\n');
        }
        out.push('\n');
    }

    if !texts.is_empty() {
        out.push_str("### Labels & Text:\n");
        for t in texts {
            out.push_str(&t);
            out.push('\n');
        }
        out.push('\n');
    }

    if !arrows.is_empty() {
        out.push_str("### Connectors & Flow:\n");
        for a in arrows {
            out.push_str(&a);
            out.push('\n');
        }
        out.push('\n');
    }

    out
}

fn normalize_element(el: &serde_json::Value, index_offset: usize) -> serde_json::Value {
    let mut obj = match el.as_object() {
        Some(o) => o.clone(),
        None => serde_json::Map::new(),
    };

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        + (index_offset as u128);

    if !obj.contains_key("id") || obj["id"].is_null() {
        obj.insert("id".to_string(), serde_json::json!(format!("el_{:x}", nanos)));
    }
    if !obj.contains_key("type") {
        obj.insert("type".to_string(), serde_json::json!("rectangle"));
    }
    if !obj.contains_key("x") {
        obj.insert("x".to_string(), serde_json::json!(100));
    }
    if !obj.contains_key("y") {
        obj.insert("y".to_string(), serde_json::json!(100));
    }
    if !obj.contains_key("width") {
        obj.insert("width".to_string(), serde_json::json!(120));
    }
    if !obj.contains_key("height") {
        obj.insert("height".to_string(), serde_json::json!(60));
    }
    if !obj.contains_key("angle") {
        obj.insert("angle".to_string(), serde_json::json!(0));
    }
    if !obj.contains_key("strokeColor") {
        obj.insert("strokeColor".to_string(), serde_json::json!("#1e1e1e"));
    }
    if !obj.contains_key("backgroundColor") {
        obj.insert("backgroundColor".to_string(), serde_json::json!("transparent"));
    }
    if !obj.contains_key("fillStyle") {
        obj.insert("fillStyle".to_string(), serde_json::json!("solid"));
    }
    if !obj.contains_key("strokeWidth") {
        obj.insert("strokeWidth".to_string(), serde_json::json!(2));
    }
    if !obj.contains_key("strokeStyle") {
        obj.insert("strokeStyle".to_string(), serde_json::json!("solid"));
    }
    if !obj.contains_key("roughness") {
        obj.insert("roughness".to_string(), serde_json::json!(1));
    }
    if !obj.contains_key("opacity") {
        obj.insert("opacity".to_string(), serde_json::json!(100));
    }
    if !obj.contains_key("groupIds") {
        obj.insert("groupIds".to_string(), serde_json::json!([]));
    }
    if !obj.contains_key("frameId") {
        obj.insert("frameId".to_string(), serde_json::Value::Null);
    }
    if !obj.contains_key("roundness") {
        obj.insert("roundness".to_string(), serde_json::json!({"type": 3}));
    }
    if !obj.contains_key("seed") {
        obj.insert("seed".to_string(), serde_json::json!((nanos % 1000000) as i64));
    }
    if !obj.contains_key("version") {
        obj.insert("version".to_string(), serde_json::json!(1));
    }
    if !obj.contains_key("versionNonce") {
        obj.insert("versionNonce".to_string(), serde_json::json!(((nanos / 7) % 10000000) as i64));
    }
    if !obj.contains_key("isDeleted") {
        obj.insert("isDeleted".to_string(), serde_json::json!(false));
    }
    if !obj.contains_key("boundElements") {
        obj.insert("boundElements".to_string(), serde_json::Value::Null);
    }
    if !obj.contains_key("updated") {
        obj.insert("updated".to_string(), serde_json::json!((nanos / 1_000_000) as i64));
    }
    if !obj.contains_key("link") {
        obj.insert("link".to_string(), serde_json::Value::Null);
    }
    if !obj.contains_key("locked") {
        obj.insert("locked".to_string(), serde_json::json!(false));
    }

    let el_type = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
    if el_type == "text" {
        if !obj.contains_key("fontSize") {
            obj.insert("fontSize".to_string(), serde_json::json!(20));
        }
        if !obj.contains_key("fontFamily") {
            obj.insert("fontFamily".to_string(), serde_json::json!(1));
        }
        if !obj.contains_key("text") {
            obj.insert("text".to_string(), serde_json::json!(""));
        }
        if !obj.contains_key("textAlign") {
            obj.insert("textAlign".to_string(), serde_json::json!("left"));
        }
        if !obj.contains_key("verticalAlign") {
            obj.insert("verticalAlign".to_string(), serde_json::json!("top"));
        }
        if !obj.contains_key("baseline") {
            obj.insert("baseline".to_string(), serde_json::json!(18));
        }
        if !obj.contains_key("originalText") {
            let t = obj.get("text").cloned().unwrap_or(serde_json::json!(""));
            obj.insert("originalText".to_string(), t);
        }
        if !obj.contains_key("lineHeight") {
            obj.insert("lineHeight".to_string(), serde_json::json!(1.25));
        }
    }

    if el_type == "arrow" || el_type == "line" {
        if !obj.contains_key("points") {
            let w = obj.get("width").and_then(|w| w.as_f64()).unwrap_or(100.0);
            let h = obj.get("height").and_then(|h| h.as_f64()).unwrap_or(0.0);
            obj.insert("points".to_string(), serde_json::json!([[0.0, 0.0], [w, h]]));
        }
        if !obj.contains_key("lastCommittedPoint") {
            obj.insert("lastCommittedPoint".to_string(), serde_json::Value::Null);
        }
        if !obj.contains_key("startBinding") {
            obj.insert("startBinding".to_string(), serde_json::Value::Null);
        }
        if !obj.contains_key("endBinding") {
            obj.insert("endBinding".to_string(), serde_json::Value::Null);
        }
        if !obj.contains_key("startArrowhead") {
            obj.insert("startArrowhead".to_string(), serde_json::Value::Null);
        }
        if el_type == "arrow" && !obj.contains_key("endArrowhead") {
            obj.insert("endArrowhead".to_string(), serde_json::json!("arrow"));
        }
    }

    serde_json::Value::Object(obj)
}

fn list_canvases_from_db(state: &McpState) -> Vec<serde_json::Value> {
    let db_state = match state.app_handle.try_state::<DbState>() {
        Some(s) => s,
        None => return Vec::new(),
    };
    let conn_guard = match db_state.conn.lock() {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let mut stmt = match conn_guard.prepare(
        "SELECT id, title, description, created_at, updated_at, elements FROM canvases ORDER BY updated_at DESC"
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let title: String = row.get(1)?;
        let description: Option<String> = row.get(2)?;
        let created_at: String = row.get(3)?;
        let updated_at: String = row.get(4)?;
        let elements_json: String = row.get(5)?;
        let elements_count = serde_json::from_str::<Vec<serde_json::Value>>(&elements_json)
            .map(|e| e.len())
            .unwrap_or(0);
        Ok(serde_json::json!({
            "id": id,
            "title": title,
            "description": description,
            "created_at": created_at,
            "updated_at": updated_at,
            "element_count": elements_count
        }))
    });
    match rows {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    }
}

fn get_canvas_from_db(state: &McpState, id: &str) -> Option<crate::canvas::Canvas> {
    let db_state = state.app_handle.try_state::<DbState>()?;
    let conn_guard = db_state.conn.lock().ok()?;
    let mut stmt = conn_guard.prepare(
        "SELECT id, title, description, elements, app_state, created_at, updated_at FROM canvases WHERE id = ?1"
    ).ok()?;
    stmt.query_row(rusqlite::params![id], |row| {
        let id: String = row.get(0)?;
        let title: String = row.get(1)?;
        let description: Option<String> = row.get(2)?;
        let elements_json: String = row.get(3)?;
        let app_state_json: String = row.get(4)?;
        let created_at: String = row.get(5)?;
        let updated_at: String = row.get(6)?;
        let elements = serde_json::from_str(&elements_json).unwrap_or_default();
        let app_state = serde_json::from_str(&app_state_json).unwrap_or_default();
        Ok(crate::canvas::Canvas {
            id,
            title,
            description,
            created_at,
            updated_at,
            elements,
            app_state,
        })
    }).ok()
}

fn get_tool_definitions() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
            "name": "get_active_canvas",
            "description": "Get the canvas currently open in the Drawx editor, including all live elements, title, and view settings.",
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        }),
        serde_json::json!({
            "name": "get_canvas_summary",
            "description": "Get a concise, structured markdown summary of the diagram (shapes, text labels, and arrow connections). Significantly saves LLM tokens compared to raw JSON.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "canvas_id": {
                        "type": "string",
                        "description": "Optional canvas ID. Defaults to current active canvas if not specified."
                    }
                }
            }
        }),
        serde_json::json!({
            "name": "list_canvases",
            "description": "List all saved canvases in Drawx with ID, title, element count, and updated timestamp.",
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        }),
        serde_json::json!({
            "name": "get_canvas",
            "description": "Retrieve full canvas data and raw elements of any canvas by ID from SQLite.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "The canvas ID to retrieve"
                    }
                },
                "required": ["id"]
            }
        }),
        serde_json::json!({
            "name": "add_elements",
            "description": "Add new Excalidraw shapes/elements to the active canvas in real time. Can include rectangles, diamonds, ellipses, text, arrows, etc. Elements appear on screen immediately.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "elements": {
                        "type": "array",
                        "description": "Array of element objects to add (e.g. [{ type: 'rectangle', x: 100, y: 100, width: 140, height: 60, strokeColor: '#1e1e1e', backgroundColor: '#a5d8ff' }])",
                        "items": { "type": "object" }
                    }
                },
                "required": ["elements"]
            }
        }),
        serde_json::json!({
            "name": "clear_active_canvas",
            "description": "Clear all elements from the active canvas.",
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        })
    ]
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn sync_active_canvas(
    state: tauri::State<'_, McpState>,
    id: String,
    title: String,
    elements: Vec<serde_json::Value>,
    app_state: serde_json::Value,
) -> Result<(), String> {
    if let Ok(mut active) = state.active_canvas.lock() {
        active.id = Some(id);
        active.title = Some(title);
        active.elements = elements;
        active.app_state = app_state;
    }
    Ok(())
}

#[tauri::command]
pub fn get_mcp_status() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "running": true,
        "port": DEFAULT_MCP_PORT,
        "sse_url": format!("http://127.0.0.1:{}/sse", DEFAULT_MCP_PORT),
        "mcp_url": format!("http://127.0.0.1:{}/mcp", DEFAULT_MCP_PORT)
    }))
}
