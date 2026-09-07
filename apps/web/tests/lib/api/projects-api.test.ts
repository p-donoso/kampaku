import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from "../../../src/lib/api/projects";

describe("projects API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listProjects fetches all projects", async () => {
    const mockProjects = [{ id: "proj-1", name: "Test Project" }];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ projects: mockProjects }),
    });

    const result = await listProjects();
    expect(result.projects).toEqual(mockProjects);
  });

  it("getProject fetches single project", async () => {
    const mockProject = { id: "proj-1", name: "Test Project" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockProject,
    });

    const result = await getProject("proj-1");
    expect(result).toEqual(mockProject);
  });

  it("createProject posts new project", async () => {
    const mockProject = { id: "proj-new", name: "New Project" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockProject,
    });

    const result = await createProject({ name: "New Project" });
    expect(result).toEqual(mockProject);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/pm/projects",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("updateProject sends PATCH request", async () => {
    const mockUpdated = { id: "proj-1", name: "Updated" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockUpdated,
    });

    const result = await updateProject("proj-1", { name: "Updated" });
    expect(result).toEqual(mockUpdated);
  });

  it("deleteProject sends DELETE request", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => "",
    });

    await deleteProject("proj-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/pm/projects/proj-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
