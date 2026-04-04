"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, FolderOpen, ListTodo, Users as UsersIcon, Trash2, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Header } from "@/components/header";
import { CreateProjectModal } from "@/components/create-project-modal";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { canCreateProject, canEditProject } from "@/lib/permissions";
import { useState } from "react";
import type { Project, PaginatedResponse } from "@/lib/types";

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth({ redirect: false });
  const [showCreate, setShowCreate] = useState(false);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  const clientFilter = searchParams.get("client") || "";

  const { data, isLoading } = useQuery<PaginatedResponse<Project>>({
    queryKey: ["projects"],
    queryFn: () => api.get("/api/v1/projects?limit=100"),
  });

  const { data: clientsData } = useQuery<PaginatedResponse<{ id: string; name: string }>>({
    queryKey: ["clients"],
    queryFn: () => api.get("/api/v1/clients?limit=100"),
    enabled: !!clientFilter,
  });
  const filterClientName = clientsData?.items?.find((c) => c.id === clientFilter)?.name;

  const deleteProject = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDeletingProject(null);
    },
  });

  const allProjects = data?.items ?? [];
  const projects = clientFilter ? allProjects.filter((p) => p.client_id === clientFilter) : allProjects;
  const userRole = user?.role ?? "user";
  const canDelete = userRole === "admin" || userRole === "manager";

  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex-1 p-3 sm:p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {filterClientName ? `${filterClientName} — Projects` : "Projects"}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {projects.length} project{projects.length !== 1 ? "s" : ""}
                {clientFilter && (
                  <button onClick={() => router.push("/projects")} className="ml-2 text-primary-600 hover:text-primary-700">Show all</button>
                )}
              </p>
            </div>
          </div>
          {user && canCreateProject(userRole) && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          )}
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                <div className="h-5 bg-gray-100 rounded w-2/3 mb-2" />
                <div className="h-3 bg-gray-50 rounded w-1/2 mb-4" />
                <div className="flex gap-4">
                  <div className="h-3 bg-gray-50 rounded w-16" />
                  <div className="h-3 bg-gray-50 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && projects.length === 0 && (
          <div className="text-center py-20">
            <FolderOpen className="w-10 h-10 text-gray-200 mx-auto mb-4" />
            <p className="text-sm font-medium text-gray-500">No projects yet</p>
            <p className="text-xs text-gray-400 mt-1">Create your first project to get started</p>
            {user && canCreateProject(userRole) && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
              >
                Create Project
              </button>
            )}
          </div>
        )}

        {/* Project cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="relative bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-gray-300 transition-all group cursor-pointer"
              onClick={() => router.push(`/projects/${p.id}`)}
            >
              {/* Delete button */}
              {canDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeletingProject(p); }}
                  className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-danger-500 rounded-lg hover:bg-danger-50 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete project"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <h3 className="text-sm font-semibold text-gray-900 truncate pr-6 group-hover:text-primary-600 transition-colors">{p.name}</h3>
              {p.description && (
                <p className="text-xs text-gray-500 truncate mt-1">{p.description}</p>
              )}

              {/* Counts */}
              <div className="flex items-center gap-4 mt-3">
                {p.task_count != null && (
                  <span className="flex items-center gap-1 text-[11px] text-gray-400">
                    <ListTodo className="w-3 h-3" />
                    {p.task_count} task{p.task_count !== 1 ? "s" : ""}
                  </span>
                )}
                {p.member_count != null && (
                  <span className="flex items-center gap-1 text-[11px] text-gray-400">
                    <UsersIcon className="w-3 h-3" />
                    {p.member_count} member{p.member_count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <p className="text-[10px] text-gray-400 mt-2">
                Updated {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
              </p>
            </div>
          ))}
        </div>
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}

      {/* Delete confirmation modal */}
      {deletingProject && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setDeletingProject(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 lg:mx-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-danger-600">Delete Project</h2>
              <button onClick={() => setDeletingProject(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete <span className="font-semibold">&quot;{deletingProject.name}&quot;</span>?
              </p>
              <p className="text-sm text-gray-500">
                This will permanently remove the project and all related tasks, subtasks, comments, attachments, assignees, and connections. This action cannot be undone.
              </p>
              {deletingProject.task_count != null && deletingProject.task_count > 0 && (
                <p className="text-xs text-danger-500 font-medium">
                  This project contains {deletingProject.task_count} task{deletingProject.task_count !== 1 ? "s" : ""} that will be deleted.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setDeletingProject(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteProject.mutate(deletingProject.id)}
                  disabled={deleteProject.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-danger-600 rounded-lg hover:bg-danger-700 disabled:opacity-50 transition-colors"
                >
                  {deleteProject.isPending ? "Deleting..." : "Delete Project"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
