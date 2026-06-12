import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/sidebar";
import { Canvas } from "./canvas/main";
import "./App.css";

interface Project {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function Dashboard() {
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const result = await invoke<Project[]>("list_projects");
      setProjects(result);
    } catch (error) {
      console.error("Failed to load projects:", error);
    }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await invoke("save_project", { name: name.trim() });
      setName("");
      await loadProjects();
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setLoading(false);
    }
  }

  async function openProject(id: number) {
    try {
      await invoke("open_project", { id });
    } catch (error) {
      console.error("Failed to open project:", error);
    }
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">
        <h1 className="text-3xl font-bold mb-6">Drawx — Brainstorm Ideas</h1>

        <form onSubmit={createProject} className="flex gap-2 mb-8">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter project name..."
            className="input input-bordered flex-1"
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
            {loading ? <span className="loading loading-spinner loading-sm"></span> : "Create"}
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => openProject(project.id)}
              className="card bg-base-200 hover:bg-base-300 cursor-pointer transition-colors"
            >
              <div className="card-body">
                <h2 className="card-title">{project.name}</h2>
                <p className="text-sm text-base-content/60">
                  Created: {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}

          {projects.length === 0 && (
            <div className="col-span-full text-center py-12 text-base-content/50">
              <p>No projects yet. Create one to get started!</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/canvas/:id" element={<Canvas />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
