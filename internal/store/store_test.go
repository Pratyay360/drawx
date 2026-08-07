package store

import (
	"context"
	"errors"
	"testing"
)

func TestCanvasLifecycle(t *testing.T) {
	ctx := context.Background()
	s := openTestStore(t, ctx)
	defer s.Close()

	// Empty initially.
	got, err := s.ListCanvases(ctx)
	if err != nil {
		t.Fatalf("ListCanvases: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected no canvases, got %d", len(got))
	}

	// Create.
	c, err := s.CreateCanvas(ctx, "My Drawing")
	if err != nil {
		t.Fatalf("CreateCanvas: %v", err)
	}
	if c.ID == "" || c.Title != "My Drawing" {
		t.Fatalf("unexpected canvas: %+v", c)
	}
	if c.CreatedAt == "" || c.UpdatedAt == "" {
		t.Fatalf("missing timestamps: %+v", c)
	}

	// List returns it.
	got, err = s.ListCanvases(ctx)
	if err != nil {
		t.Fatalf("ListCanvases after create: %v", err)
	}
	if len(got) != 1 || got[0].ID != c.ID {
		t.Fatalf("expected [%s], got %+v", c.ID, got)
	}

	// Load (with files).
	loaded, err := s.LoadCanvas(ctx, c.ID)
	if err != nil {
		t.Fatalf("LoadCanvas: %v", err)
	}
	if loaded.Title != c.Title {
		t.Fatalf("expected title %q, got %q", c.Title, loaded.Title)
	}

	// Save elements / app state / files.
	elements := []any{map[string]any{"id": "e1", "type": "rectangle"}}
	appState := map[string]any{"gridSize": 20, "zenModeEnabled": true}
	files := map[string]any{"img1": map[string]any{"mimeType": "image/png"}}
	if err := s.SaveCanvas(ctx, c.ID, elements, appState, files); err != nil {
		t.Fatalf("SaveCanvas: %v", err)
	}

	reloaded, err := s.LoadCanvas(ctx, c.ID)
	if err != nil {
		t.Fatalf("reload canvas: %v", err)
	}
	els, ok := reloaded.Elements.([]any)
	if !ok || len(els) != 1 {
		t.Fatalf("expected 1 element, got %#v", reloaded.Elements)
	}
	if st, ok := reloaded.AppState.(map[string]any); !ok || st["gridSize"] != float64(20) {
		t.Fatalf("unexpected app state: %#v", reloaded.AppState)
	}
	if fs, ok := reloaded.Files.(map[string]any); !ok || len(fs) != 1 {
		t.Fatalf("unexpected files: %#v", reloaded.Files)
	}

	// Rename.
	if err := s.UpdateCanvasTitle(ctx, c.ID, "Renamed"); err != nil {
		t.Fatalf("UpdateCanvasTitle: %v", err)
	}
	renamed, _ := s.LoadCanvas(ctx, c.ID)
	if renamed.Title != "Renamed" {
		t.Fatalf("expected title Renamed, got %q", renamed.Title)
	}

	// Delete.
	if err := s.DeleteCanvas(ctx, c.ID); err != nil {
		t.Fatalf("DeleteCanvas: %v", err)
	}
	if _, err := s.LoadCanvas(ctx, c.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestLoadCanvasNotFound(t *testing.T) {
	ctx := context.Background()
	s := openTestStore(t, ctx)
	defer s.Close()

	if _, err := s.LoadCanvas(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestLibrariesUpsertAndClear(t *testing.T) {
	ctx := context.Background()
	s := openTestStore(t, ctx)
	defer s.Close()

	libs := []Library{
		{
			ID:          "lib-1",
			Name:        "Icons",
			Description: "Icons library",
			Authors:     []Author{{Name: "Alice", URL: "https://alice.dev"}},
			Source:      "icons",
			Preview:     "preview.png",
			Created:     "2026-01-01T00:00:00.000Z",
			Updated:     "2026-01-02T00:00:00.000Z",
			Version:     3,
			ItemNames:   &[]string{"star", "heart"},
			Content:     map[string]any{"libraryItems": []any{map[string]any{"id": "x"}}},
		},
	}
	if err := s.SaveLibraries(ctx, libs); err != nil {
		t.Fatalf("SaveLibraries: %v", err)
	}

	stored, err := s.ListLibraries(ctx)
	if err != nil {
		t.Fatalf("ListLibraries: %v", err)
	}
	if len(stored) != 1 || stored[0].ID != "lib-1" {
		t.Fatalf("expected 1 library, got %+v", stored)
	}
	if stored[0].ItemNames == nil || len(*stored[0].ItemNames) != 2 {
		t.Fatalf("expected 2 item names, got %+v", stored[0].ItemNames)
	}
	if stored[0].Content == nil {
		t.Fatal("expected content to survive the round trip")
	}

	// Upsert updates the existing row rather than duplicating it.
	libs[0].Version = 4
	if err := s.SaveLibraries(ctx, libs); err != nil {
		t.Fatalf("SaveLibraries upsert: %v", err)
	}
	stored, _ = s.ListLibraries(ctx)
	if len(stored) != 1 || stored[0].Version != 4 {
		t.Fatalf("expected upserted single row with version 4, got %+v", stored)
	}

	if err := s.ClearLibraries(ctx); err != nil {
		t.Fatalf("ClearLibraries: %v", err)
	}
	stored, _ = s.ListLibraries(ctx)
	if len(stored) != 0 {
		t.Fatalf("expected libraries cleared, got %d", len(stored))
	}
}

func openTestStore(t *testing.T, ctx context.Context) *Store {
	t.Helper()
	s, err := Open(ctx, t.TempDir())
	if err != nil {
		t.Fatalf("Open store: %v", err)
	}
	return s
}
