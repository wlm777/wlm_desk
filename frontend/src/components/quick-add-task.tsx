"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserPlus, Flag } from "lucide-react";
import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { PRIORITY_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ProjectMember, TaskPriority } from "@/lib/types";

interface QuickAddTaskProps {
  projectId: string;
  listId: string;
}

const PRIORITY_OPTIONS: TaskPriority[] = ["none", "low", "medium", "high"];

export function QuickAddTask({ projectId, listId }: QuickAddTaskProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [showAssignee, setShowAssignee] = useState(false);
  const [showPriority, setShowPriority] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const keepOpenRef = useRef(false);

  const { data: members } = useQuery<ProjectMember[]>({
    queryKey: ["members", projectId],
    queryFn: () => api.get(`/api/v1/projects/${projectId}/members`),
    enabled: editing,
  });

  const createTask = useMutation({
    mutationFn: (body: { title: string; assignee_ids?: string[]; priority?: string }) =>
      api.post(`/api/v1/projects/${projectId}/tasks`, {
        list_id: listId,
        title: body.title,
        ...(body.assignee_ids ? { assignee_ids: body.assignee_ids } : {}),
        ...(body.priority && body.priority !== "none" ? { priority: body.priority } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setTitle("");
      setAssigneeId(null);
      setPriority("none");
      inputRef.current?.focus();
    },
  });

  function handleBlur() {
    setTimeout(() => {
      if (keepOpenRef.current) {
        keepOpenRef.current = false;
        return;
      }
      if (!title.trim()) {
        setEditing(false);
        setAssigneeId(null);
        setPriority("none");
        setShowAssignee(false);
        setShowPriority(false);
      }
    }, 200);
  }

  function doSubmit() {
    const trimmed = title.trim();
    if (trimmed) {
      createTask.mutate({
        title: trimmed,
        assignee_ids: assigneeId ? [assigneeId] : undefined,
        priority: priority !== "none" ? priority : undefined,
      });
    }
  }

  const selectedMember = members?.find((m) => m.user_id === assigneeId);
  const priorityCfg = PRIORITY_CONFIG[priority];

  if (!editing) {
    return (
      <button
        onClick={() => {
          setEditing(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors rounded-b-lg"
      >
        <Plus className="w-3.5 h-3.5" />
        Add task
      </button>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); doSubmit(); }} className="px-4 py-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setTitle("");
              setAssigneeId(null);
              setPriority("none");
              setEditing(false);
            }
            if (e.key === "Enter") {
              e.preventDefault();
              doSubmit();
            }
          }}
          placeholder="Task title, then Enter"
          disabled={createTask.isPending}
          className="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-transparent"
          autoFocus
        />

        {/* Priority picker */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={() => { keepOpenRef.current = true; }}
            onClick={() => { setShowPriority(!showPriority); setShowAssignee(false); }}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              priority !== "none"
                ? "bg-gray-50"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            )}
            title={`Priority: ${priorityCfg.label}`}
          >
            <Flag className="w-4 h-4" style={{ color: priorityCfg.flag }} fill={priority !== "none" ? priorityCfg.flag : "none"} />
          </button>

          {showPriority && (
            <div className="absolute right-0 bottom-full mb-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
              {PRIORITY_OPTIONS.map((p) => {
                const cfg = PRIORITY_CONFIG[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setPriority(p); setShowPriority(false); inputRef.current?.focus(); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors",
                      priority === p && "bg-gray-50"
                    )}
                  >
                    <Flag className="w-3.5 h-3.5" style={{ color: cfg.flag }} fill={p !== "none" ? cfg.flag : "none"} />
                    <span className={cfg.color}>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Assignee picker */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={() => { keepOpenRef.current = true; }}
            onClick={() => { setShowAssignee(!showAssignee); setShowPriority(false); }}
            className={`p-1.5 rounded-md transition-colors ${
              assigneeId
                ? "text-primary-600 bg-primary-50"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            }`}
            title={selectedMember ? `Assigned: ${selectedMember.full_name}` : "Add assignee"}
          >
            {selectedMember ? (
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ backgroundColor: selectedMember.color || "#E6E7EB" }}
              >
                {selectedMember.full_name.charAt(0)}
              </span>
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
          </button>

          {showAssignee && members && (
            <div className="absolute right-0 bottom-full mb-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
              <button
                type="button"
                onClick={() => { setAssigneeId(null); setShowAssignee(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
              >
                Unassigned
              </button>
              {members.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => { setAssigneeId(m.user_id); setShowAssignee(false); inputRef.current?.focus(); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 ${
                    assigneeId === m.user_id ? "bg-primary-50" : ""
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                    style={{ backgroundColor: m.color || "#E6E7EB" }}
                  >
                    {m.full_name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <span className="text-xs text-gray-700 block truncate">{m.full_name}</span>
                    <span className="text-[10px] text-gray-400 block truncate">{m.email}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mobile submit button */}
        <button
          type="button"
          onClick={doSubmit}
          disabled={!title.trim() || createTask.isPending}
          className="sm:hidden px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors shrink-0"
        >
          Add
        </button>
      </div>
    </form>
  );
}
