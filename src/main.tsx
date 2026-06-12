import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "@excalidraw/excalidraw/index.css";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
