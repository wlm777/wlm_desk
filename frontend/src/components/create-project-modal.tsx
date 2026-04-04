"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Check } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RichEditor } from "@/components/rich-editor";
import type { Project, User, Client, PaginatedResponse } from "@/lib/types";

interface CreateProjectModalProps {
  onClose: () => void;
}

export function CreateProjectModal({ onClose }: CreateProjectModalProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionRich, setDescriptionRich] = useState<Record<string, unknown> | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");

  // Fetch users for member selection (admin can see all, others see limited)
  const { data: usersData } = useQuery<PaginatedResponse<User>>({
    queryKey: ["users-for-project"],
    queryFn: () => api.get("/api/v1/users?limit=100"),
  });

  const users = usersData?.items?.filter((u) => u.is_active) ?? [];

  const { data: clientsData } = useQuery<PaginatedResponse<Client>>({
    queryKey: ["clients"],
    queryFn: () => api.get("/api/v1/clients?limit=100"),
  });
  const clients = clientsData?.items ?? [];

  const createProject = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Project>("/api/v1/projects", body),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
      router.push(`/projects/${project.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  function toggleMember(userId: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createProject.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      description_rich: descriptionRich || undefined,
      client_id: clientId || undefined,
      member_ids: selectedMembers.size > 0 ? Array.from(selectedMembers) : undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold">New Project</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <RichEditor
              content={descriptionRich}
              onChange={(json, plain) => { setDescriptionRich(json); setDescription(plain); }}
              placeholder="Project description..."
            />
          </div>

          {clients.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Client</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Members</label>
            <p className="text-[10px] text-gray-400 mb-2">You will be added automatically as owner</p>
            <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
              {users.map((u) => {
                const isSelected = selectedMembers.has(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleMember(u.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors",
                      isSelected && "bg-primary-50/50"
                    )}
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: u.color || "#E6E7EB" }}
                    >
                      {u.full_name.charAt(0)}
                    </span>
                    <div className="text-left min-w-0 flex-1">
                      <span className="text-xs text-gray-700 block truncate">{u.full_name}</span>
                      <span className="text-[10px] text-gray-400 block truncate">{u.email}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary-600 shrink-0" />}
                  </button>
                );
              })}
              {users.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-3">No users available</p>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-danger-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createProject.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {createProject.isPending ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
