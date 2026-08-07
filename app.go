package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"drawx/internal/store"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// AppService is the service bound to the frontend. Its exported methods are
// callable from TypeScript through the generated bindings in
// frontend/bindings/drawx.
type AppService struct {
	store  *store.Store
	dbPath string
}

// NewAppService builds a service whose store is opened during application
// startup (see ServiceStartup).
func NewAppService() *AppService {
	return &AppService{}
}

// ServiceName implements application.ServiceName so logs and bindings use a
// friendly name.
func (s *AppService) ServiceName() string { return "AppService" }

// ServiceStartup opens the SQLite database for the lifetime of the app.
func (s *AppService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	dataDir, err := resolveDataDir()
	if err != nil {
		return fmt.Errorf("resolve data dir: %w", err)
	}
	st, err := store.Open(ctx, dataDir)
	if err != nil {
		return fmt.Errorf("open store: %w", err)
	}
	s.store = st
	s.dbPath = st.Path()
	return nil
}

// ServiceShutdown closes the database cleanly.
func (s *AppService) ServiceShutdown() error {
	if s.store == nil {
		return nil
	}
	return s.store.Close()
}

// resolveDataDir returns the directory that stores drawx.db. It prefers the
// legacy Tauri data directory when a database already exists there so that
// drawings survive the Tauri → Wails migration; otherwise it falls back to the
// standard per-user config directory.
func resolveDataDir() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	candidate := filepath.Join(configDir, "drawx")

	if legacy := legacyDataDir(); legacy != "" {
		if _, err := os.Stat(filepath.Join(legacy, "drawx.db")); err == nil {
			return legacy, nil
		}
	}
	return candidate, nil
}

// legacyDataDir returns the app-data directory used by the previous Tauri
// build, or "" when the platform layout is unknown. The Tauri identifier was
// "com.pmustafi.drawx".
func legacyDataDir() string {
	switch {
	case isWindows():
		if appData := os.Getenv("APPDATA"); appData != "" {
			return filepath.Join(appData, "com.pmustafi.drawx")
		}
	case isDarwin():
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, "Library", "Application Support", "com.pmustafi.drawx")
		}
	default: // linux / unix
		dataHome := os.Getenv("XDG_DATA_HOME")
		if dataHome == "" {
			if home, err := os.UserHomeDir(); err == nil {
				dataHome = filepath.Join(home, ".local", "share")
			}
		}
		if dataHome != "" {
			return filepath.Join(dataHome, "com.pmustafi.drawx")
		}
	}
	return ""
}

func isWindows() bool { return runtime.GOOS == "windows" }
func isDarwin() bool  { return runtime.GOOS == "darwin" }

// --- canvases --------------------------------------------------------------

func (s *AppService) ListCanvases() ([]store.Canvas, error) {
	if s.store == nil {
		return nil, fmt.Errorf("store not initialised")
	}
	return s.store.ListCanvases(context.Background())
}

func (s *AppService) CreateCanvas(title string) (store.Canvas, error) {
	if s.store == nil {
		return store.Canvas{}, fmt.Errorf("store not initialised")
	}
	return s.store.CreateCanvas(context.Background(), title)
}

func (s *AppService) DeleteCanvas(id string) error {
	if s.store == nil {
		return fmt.Errorf("store not initialised")
	}
	return s.store.DeleteCanvas(context.Background(), id)
}

// LoadCanvas returns the canvas with the given id, or nil when it does not
// exist (serialised to JS null).
func (s *AppService) LoadCanvas(id string) (*store.Canvas, error) {
	if s.store == nil {
		return nil, fmt.Errorf("store not initialised")
	}
	c, err := s.store.LoadCanvas(context.Background(), id)
	if errors.Is(err, store.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *AppService) SaveCanvas(id string, elements []any, appState any, files any) error {
	if s.store == nil {
		return fmt.Errorf("store not initialised")
	}
	return s.store.SaveCanvas(context.Background(), id, elements, appState, files)
}

func (s *AppService) UpdateCanvasTitle(id, title string) error {
	if s.store == nil {
		return fmt.Errorf("store not initialised")
	}
	return s.store.UpdateCanvasTitle(context.Background(), id, title)
}

// --- libraries -------------------------------------------------------------

func (s *AppService) ListLibraries() ([]store.Library, error) {
	if s.store == nil {
		return nil, fmt.Errorf("store not initialised")
	}
	return s.store.ListLibraries(context.Background())
}

func (s *AppService) SaveLibraries(libraries []store.Library) error {
	if s.store == nil {
		return fmt.Errorf("store not initialised")
	}
	return s.store.SaveLibraries(context.Background(), libraries)
}

func (s *AppService) ClearLibraries() error {
	if s.store == nil {
		return fmt.Errorf("store not initialised")
	}
	return s.store.ClearLibraries(context.Background())
}

// GetDbPath returns the absolute path of the SQLite database file.
func (s *AppService) GetDbPath() (string, error) {
	if s.dbPath == "" {
		return "", fmt.Errorf("store not initialised")
	}
	return s.dbPath, nil
}
