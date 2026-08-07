// Package store provides SQLite persistence for Drawx canvases and
// community libraries. It is intentionally free of any Wails dependency so
// it can be unit-tested with `go test ./internal/store`.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite" // pure-Go SQLite driver, no CGO required
)

// ErrNotFound is returned when a requested record does not exist.
var ErrNotFound = errors.New("store: record not found")

// Canvas is a single drawing document.
type Canvas struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	Elements    any     `json:"elements"`
	AppState    any     `json:"appState"`
	Files       any     `json:"files"`
}

// Author of a community library.
type Author struct {
	Name string `json:"name"`
	URL  string `json:"url,omitempty"`
}

// Library is a community library stored in the database. Content holds the
// downloaded library payload (libraryItems + optional files).
type Library struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Authors     []Author  `json:"authors"`
	Source      string    `json:"source"`
	Preview     string    `json:"preview"`
	Created     string    `json:"created"`
	Updated     string    `json:"updated"`
	Version     int64     `json:"version"`
	ItemNames   *[]string `json:"itemNames"`
	Content     any       `json:"content,omitempty"`
}

// Store wraps a SQLite database handle.
type Store struct {
	db   *sql.DB
	path string
}

// Open creates (if needed) and opens the SQLite database inside dataDir.
func Open(ctx context.Context, dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir %q: %w", dataDir, err)
	}
	path := filepath.Join(dataDir, "drawx.db")

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open database %q: %w", path, err)
	}
	// SQLite tolerates a single writer best; serialising access avoids
	// "database is locked" under concurrent autosaves.
	db.SetMaxOpenConns(1)

	s := &Store{db: db, path: path}
	if err := s.migrate(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

// Close releases the underlying database handle.
func (s *Store) Close() error { return s.db.Close() }

// Path returns the absolute path of the database file.
func (s *Store) Path() string { return s.path }

func (s *Store) migrate(ctx context.Context) error {
	stmts := []string{
		"PRAGMA journal_mode=WAL;",
		"PRAGMA foreign_keys=ON;",
		`CREATE TABLE IF NOT EXISTS canvases (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			description TEXT,
			elements TEXT NOT NULL DEFAULT '[]',
			app_state TEXT NOT NULL DEFAULT '{}',
			files TEXT NOT NULL DEFAULT '{}',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS libraries (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			authors TEXT NOT NULL DEFAULT '[]',
			source TEXT NOT NULL DEFAULT '',
			preview TEXT NOT NULL DEFAULT '',
			created TEXT NOT NULL DEFAULT '',
			updated TEXT NOT NULL DEFAULT '',
			version INTEGER NOT NULL DEFAULT 0,
			item_names TEXT,
			content TEXT
		);`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("migrate schema: %w", err)
		}
	}

	// Migrate pre-existing databases that lack the `files` column.
	rows, err := s.db.QueryContext(ctx, "PRAGMA table_info(canvases)")
	if err != nil {
		return fmt.Errorf("inspect canvases table: %w", err)
	}
	defer rows.Close()
	hasFiles := false
	for rows.Next() {
		var cid int
		var name, ctype string
		var notNull, pk int
		var dflt any
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &dflt, &pk); err != nil {
			return fmt.Errorf("scan table_info: %w", err)
		}
		if name == "files" {
			hasFiles = true
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate table_info: %w", err)
	}
	if !hasFiles {
		if _, err := s.db.ExecContext(ctx,
			"ALTER TABLE canvases ADD COLUMN files TEXT NOT NULL DEFAULT '{}'"); err != nil {
			return fmt.Errorf("add files column: %w", err)
		}
	}
	return nil
}

// --- helpers ---------------------------------------------------------------

func nowISO() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}

func newCanvasID() string {
	return fmt.Sprintf("c_%x", time.Now().UnixNano())
}

// scanCanvasRow maps one database row to a Canvas. When includeFiles is false
// the (potentially large) files blob is skipped, keeping list queries lean.
func scanCanvasRow(row interface{ Scan(...any) error }, includeFiles bool) (Canvas, error) {
	var c Canvas
	var description sql.NullString
	var elementsJSON, appStateJSON, created, updated string

	if includeFiles {
		var filesJSON string
		if err := row.Scan(&c.ID, &c.Title, &description, &elementsJSON, &appStateJSON, &filesJSON, &created, &updated); err != nil {
			return Canvas{}, err
		}
		if err := json.Unmarshal([]byte(filesJSON), &c.Files); err != nil {
			return Canvas{}, fmt.Errorf("decode files: %w", err)
		}
	} else {
		if err := row.Scan(&c.ID, &c.Title, &description, &elementsJSON, &appStateJSON, &created, &updated); err != nil {
			return Canvas{}, err
		}
	}

	c.Description = nullStringPtr(description)
	c.CreatedAt = created
	c.UpdatedAt = updated
	if err := json.Unmarshal([]byte(elementsJSON), &c.Elements); err != nil {
		return Canvas{}, fmt.Errorf("decode elements: %w", err)
	}
	if err := json.Unmarshal([]byte(appStateJSON), &c.AppState); err != nil {
		return Canvas{}, fmt.Errorf("decode app_state: %w", err)
	}
	return c, nil
}

func nullStringPtr(ns sql.NullString) *string {
	if !ns.Valid {
		return nil
	}
	v := ns.String
	return &v
}

// --- canvases --------------------------------------------------------------

// ListCanvases returns all canvases ordered by most recently updated.
func (s *Store) ListCanvases(ctx context.Context) ([]Canvas, error) {
	const q = `SELECT id, title, description, elements, app_state, created_at, updated_at
	           FROM canvases ORDER BY updated_at DESC`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list canvases: %w", err)
	}
	defer rows.Close()

	var canvases []Canvas
	for rows.Next() {
		c, err := scanCanvasRow(rows, false)
		if err != nil {
			return nil, fmt.Errorf("scan canvas: %w", err)
		}
		canvases = append(canvases, c)
	}
	return canvases, rows.Err()
}

// CreateCanvas inserts a new empty canvas and returns it.
func (s *Store) CreateCanvas(ctx context.Context, title string) (Canvas, error) {
	now := nowISO()
	id := newCanvasID()
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO canvases (id, title, description, elements, app_state, files, created_at, updated_at)
		 VALUES (?, ?, NULL, '[]', '{}', '{}', ?, ?)`,
		id, title, now, now)
	if err != nil {
		return Canvas{}, fmt.Errorf("create canvas: %w", err)
	}
	return Canvas{
		ID:        id,
		Title:     title,
		CreatedAt: now,
		UpdatedAt: now,
		Elements:  []any{},
		AppState:  map[string]any{},
		Files:     map[string]any{},
	}, nil
}

// DeleteCanvas removes a canvas by id.
func (s *Store) DeleteCanvas(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, "DELETE FROM canvases WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete canvas: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// LoadCanvas returns a single canvas (including its files) or ErrNotFound.
func (s *Store) LoadCanvas(ctx context.Context, id string) (Canvas, error) {
	const q = `SELECT id, title, description, elements, app_state, files, created_at, updated_at
	           FROM canvases WHERE id = ?`
	row := s.db.QueryRowContext(ctx, q, id)
	c, err := scanCanvasRow(row, true)
	if errors.Is(err, sql.ErrNoRows) {
		return Canvas{}, ErrNotFound
	}
	if err != nil {
		return Canvas{}, fmt.Errorf("load canvas: %w", err)
	}
	return c, nil
}

// SaveCanvas replaces the elements, app state and files of a canvas and
// bumps its updated timestamp.
func (s *Store) SaveCanvas(ctx context.Context, id string, elements, appState, files any) error {
	elementsJSON, err := json.Marshal(elements)
	if err != nil {
		return fmt.Errorf("encode elements: %w", err)
	}
	appStateJSON, err := json.Marshal(appState)
	if err != nil {
		return fmt.Errorf("encode app_state: %w", err)
	}
	filesJSON, err := json.Marshal(files)
	if err != nil {
		return fmt.Errorf("encode files: %w", err)
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE canvases SET elements = ?, app_state = ?, files = ?, updated_at = ? WHERE id = ?`,
		string(elementsJSON), string(appStateJSON), string(filesJSON), nowISO(), id)
	if err != nil {
		return fmt.Errorf("save canvas: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateCanvasTitle renames a canvas.
func (s *Store) UpdateCanvasTitle(ctx context.Context, id, title string) error {
	res, err := s.db.ExecContext(ctx,
		"UPDATE canvases SET title = ?, updated_at = ? WHERE id = ?", title, nowISO(), id)
	if err != nil {
		return fmt.Errorf("update canvas title: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// --- libraries -------------------------------------------------------------

func rowToLibrary(id, name, description, authorsJSON, source, preview, created, updated string, version int64, itemNames, content *string) (Library, error) {
	var lib Library
	if err := json.Unmarshal([]byte(authorsJSON), &lib.Authors); err != nil {
		return Library{}, fmt.Errorf("decode authors: %w", err)
	}
	lib.ID, lib.Name, lib.Description = id, name, description
	lib.Source, lib.Preview = source, preview
	lib.Created, lib.Updated = created, updated
	lib.Version = version
	if itemNames != nil {
		var names []string
		if err := json.Unmarshal([]byte(*itemNames), &names); err == nil {
			lib.ItemNames = &names
		}
	}
	if content != nil {
		var v any
		if err := json.Unmarshal([]byte(*content), &v); err == nil {
			lib.Content = v
		}
	}
	return lib, nil
}

// ListLibraries returns all stored libraries ordered by name.
func (s *Store) ListLibraries(ctx context.Context) ([]Library, error) {
	const q = `SELECT id, name, description, authors, source, preview, created, updated, version, item_names, content
	           FROM libraries ORDER BY name`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list libraries: %w", err)
	}
	defer rows.Close()

	var libraries []Library
	for rows.Next() {
		var (
			id, name, description, authorsJSON, source, preview, created, updated string
			version                                                               int64
			itemNames, content                                                    *string
		)
		if err := rows.Scan(&id, &name, &description, &authorsJSON, &source, &preview,
			&created, &updated, &version, &itemNames, &content); err != nil {
			return nil, fmt.Errorf("scan library: %w", err)
		}
		lib, err := rowToLibrary(id, name, description, authorsJSON, source, preview,
			created, updated, version, itemNames, content)
		if err != nil {
			return nil, err
		}
		libraries = append(libraries, lib)
	}
	return libraries, rows.Err()
}

// SaveLibraries upserts a batch of libraries.
func (s *Store) SaveLibraries(ctx context.Context, libraries []Library) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin library transaction: %w", err)
	}
	defer tx.Rollback()

	const upsert = `INSERT INTO libraries (id, name, description, authors, source, preview, created, updated, version, item_names, content)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			description = excluded.description,
			authors = excluded.authors,
			source = excluded.source,
			preview = excluded.preview,
			created = excluded.created,
			updated = excluded.updated,
			version = excluded.version,
			item_names = excluded.item_names,
			content = excluded.content`

	for _, lib := range libraries {
		authorsJSON, err := json.Marshal(lib.Authors)
		if err != nil {
			return fmt.Errorf("encode library authors: %w", err)
		}
		var itemNames, content *string
		if lib.ItemNames != nil {
			b, err := json.Marshal(*lib.ItemNames)
			if err != nil {
				return fmt.Errorf("encode library item names: %w", err)
			}
			s := string(b)
			itemNames = &s
		}
		if lib.Content != nil {
			b, err := json.Marshal(lib.Content)
			if err != nil {
				return fmt.Errorf("encode library content: %w", err)
			}
			s := string(b)
			content = &s
		}
		if _, err := tx.ExecContext(ctx, upsert,
			lib.ID, lib.Name, lib.Description, string(authorsJSON), lib.Source, lib.Preview,
			lib.Created, lib.Updated, lib.Version, itemNames, content); err != nil {
			return fmt.Errorf("upsert library %q: %w", lib.ID, err)
		}
	}
	return tx.Commit()
}

// ClearLibraries removes all stored libraries.
func (s *Store) ClearLibraries(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, "DELETE FROM libraries"); err != nil {
		return fmt.Errorf("clear libraries: %w", err)
	}
	return nil
}
