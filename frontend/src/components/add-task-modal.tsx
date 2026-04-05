"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Check, Plus } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RichEditor } from "@/components/rich-editor";
import { PriorityPicker } from "@/components/priority-picker";
import type { TaskList, TaskPriority, ProjectMember } from "@/lib/types";

interface AddTaskModalProps {
  projectId: string;
  defaultListId?: string;
  onClose: () => void;
}

export function AddTaskModal({ projectId, defaultListId, onClose }: AddTaskModalProps) {
  const queryClient = useQueryClient();

  const { data: lists } = useQuery<TaskList[]>({
    queryKey: ["lists", projectId],
    queryFn: () => api.get(`/api/v1/projects/${projectId}/lists`),
  });

  const { data: members } = useQuery<ProjectMember[]>({
    queryKey: ["members", projectId],
    queryFn: () => api.get(`/api/v1/projects/${projectId}/members`),
  });

  const [title, setTitle] = useState("");
  const [descriptionPlain, setDescriptionPlain] = useState("");
  const [descriptionRich, setDescriptionRich] = useState<Record<string, unknown> | null>(null);
  const [listId, setListId] = useState(defaultListId ?? "");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    if (!listId && lists && lists.length > 0) {
      setListId(lists[0].id);
    }
  }, [lists, listId]);

  const createTask = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post(`/api/v1/projects/${projectId}/tasks`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const createList = useMutation({
    mutationFn: (name: string) =>
      api.post<TaskList>(`/api/v1/projects/${projectId}/lists`, { name }),
    onSuccess: (newList) => {
      queryClient.invalidateQueries({ queryKey: ["lists", projectId] });
      setListId(newList.id);
      setShowAddList(false);
      setNewListName("");
    },
  });

  function toggleAssignee(userId: string) {
    setSelectedAssignees((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const [formError, setFormError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!title.trim()) { setFormError("Title is required"); return; }
    if (!listId) { setFormError("Please select a list"); return; }
    createTask.mutate({
      list_id: listId,
      title: title.trim(),
      description_plain: descriptionPlain.trim() || null,
      description_rich: descriptionRich || null,
      priority,
      due_date: dueDate || null,
      assignee_ids: selectedAssignees.size > 0 ? Array.from(selectedAssignees) : null,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] mx-4 lg:mx-0 flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold">New Task</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add List Modal */}
        {showAddList && (
          <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center" onClick={() => { setShowAddList(false); setNewListName(""); }}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-sm font-semibold">Add List</h3>
                <button type="button" onClick={() => { setShowAddList(false); setNewListName(""); }} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Title <span className="text-danger-500">*</span></label>
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="List name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); if (newListName.trim()) createList.mutate(newListName.trim()); }
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setShowAddList(false); setNewListName(""); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (newListName.trim()) createList.mutate(newListName.trim()); }}
                    disabled={!newListName.trim() || createList.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                  >
                    {createList.isPending ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-auto flex-1">
          {/* List — full width at top */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">List</label>
            {lists && lists.length > 0 ? (
              <div className="flex gap-2">
                <select
                  value={listId}
                  onChange={(e) => setListId(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowAddList(true)}
                  className="px-3 py-2 text-xs text-primary-600 hover:bg-primary-50 border border-gray-300 rounded-lg transition-colors whitespace-nowrap"
                >
                  + Add List
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddList(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm text-primary-600 border-2 border-dashed border-primary-300 rounded-lg hover:bg-primary-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create your first list to add tasks
              </button>
            )}
          </div>

          {/* Title + Priority in one row */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoFocus
              />
              <PriorityPicker value={priority} onChange={setPriority} size="large" />
            </div>
          </div>

          {/* Description — WYSIWYG, expands on focus, shrinks back if short */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <RichEditor
              content={descriptionRich}
              onChange={(json, plain) => { setDescriptionRich(json); setDescriptionPlain(plain); }}
              onFocus={() => setDescExpanded(true)}
              onBlur={() => {
                const lineCount = descriptionPlain.split("\n").length;
                if (descriptionPlain.trim().length === 0 || lineCount < 3) {
                  setDescExpanded(false);
                }
              }}
              placeholder="Task description..."
              minimal
              minHeight={descExpanded ? 200 : undefined}
            />
          </div>

          {/* Assigned to */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Assigned to</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {selectedAssignees.size === 0 && (
                <span className="text-xs text-gray-400">No assignees selected</span>
              )}
              {Array.from(selectedAssignees).map((uid) => {
                const m = members?.find((x) => x.user_id === uid);
                if (!m) return null;
                return (
                  <span
                    key={uid}
                    className="inline-flex items-center gap-1 text-xs text-gray-700 px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: (m.color || "#E6E7EB") + "40" }}
                  >
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: m.color || "#E6E7EB" }}>
                      {m.full_name.charAt(0)}
                    </span>
                    {m.full_name}
                    <button type="button" onClick={() => toggleAssignee(uid)} className="text-gray-400 hover:text-danger-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="border border-gray-200 rounded-lg max-h-32 overflow-y-auto">
              {members?.map((m) => {
                const isSelected = selectedAssignees.has(m.user_id);
                return (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => toggleAssignee(m.user_id)}
                    className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors", isSelected && "bg-primary-50/50")}
                  >
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ backgroundColor: m.color || "#E6E7EB" }}>
                      {m.full_name.charAt(0)}
                    </span>
                    <span className="text-xs text-gray-700 flex-1 text-left truncate">{m.full_name}</span>
                    <span className="text-[10px] text-gray-400 truncate">{m.email}</span>
                    {isSelected && <Check className="w-3 h-3 text-primary-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Due date */}
          <div>
            <div className="max-w-[200px]">
              <label className="block text-xs font-medium text-gray-700 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {(error || formError) && <p className="text-sm text-danger-500">{error || formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTask.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {createTask.isPending ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
