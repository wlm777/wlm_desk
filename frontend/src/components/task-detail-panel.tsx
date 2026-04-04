"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Check, Upload, FileText, Trash2, Eye, EyeOff, Pencil, GripVertical } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef, useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { STATUS_CONFIG, SUBTASK_STATUS_CONFIG } from "@/lib/constants";
import { PriorityPicker } from "@/components/priority-picker";
import { ImageLightbox } from "@/components/image-lightbox";
import type { Task, Subtask, Comment, Attachment, TaskWatcher, TaskAssignee, ActivityEvent, User, ProjectMember, TaskStatus, TaskPriority, PaginatedResponse } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { RichEditor, RichContent, extractAttachmentIds } from "@/components/rich-editor";

interface TaskDetailPanelProps {
  taskId: string;
  projectId: string;
  onClose: () => void;
  activeTabIndex?: number;
  onTabChange?: (index: number) => void;
}

function SortableSubtaskRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners}>{children}</div>;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskDetailPanel({ taskId, projectId, onClose, activeTabIndex, onTabChange }: TaskDetailPanelProps) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth({ redirect: false });
  const tabNames = ["overview", "subtasks", "comments", "files", "activity"] as const;
  const [localTab, setLocalTab] = useState<typeof tabNames[number]>("overview");
  // Use controlled tab from parent if provided, otherwise local state
  const activeTab = activeTabIndex != null ? tabNames[activeTabIndex] ?? "overview" : localTab;
  const setActiveTab = (tab: typeof tabNames[number]) => {
    const idx = tabNames.indexOf(tab);
    if (onTabChange) onTabChange(idx);
    setLocalTab(tab);
  };
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionRichDraft, setDescriptionRichDraft] = useState<Record<string, unknown> | null>(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(false);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [subtaskStatusMenu, setSubtaskStatusMenu] = useState<string | null>(null);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: task } = useQuery<Task>({
    queryKey: ["task", taskId],
    queryFn: () => api.get(`/api/v1/tasks/${taskId}`),
  });

  const { data: subtasks } = useQuery<Subtask[]>({
    queryKey: ["subtasks", taskId],
    queryFn: () => api.get(`/api/v1/tasks/${taskId}/subtasks`),
  });

  const { data: attachments } = useQuery<Attachment[]>({
    queryKey: ["attachments", taskId],
    queryFn: () => api.get(`/api/v1/tasks/${taskId}/attachments`),
  });

  const { data: comments } = useQuery<Comment[]>({
    queryKey: ["comments", taskId],
    queryFn: () => api.get(`/api/v1/tasks/${taskId}/comments`),
  });

  const [newComment, setNewComment] = useState("");
  const [newCommentRich, setNewCommentRich] = useState<Record<string, unknown> | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [editCommentRich, setEditCommentRich] = useState<Record<string, unknown> | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState<"description" | "comment" | "new-comment" | null>(null);
  const [commentEditorKey, setCommentEditorKey] = useState(0);
  const commentsScrollRef = useRef<HTMLDivElement>(null);
  const commentEditorRef = useRef<HTMLDivElement>(null);

  const addComment = useMutation({
    mutationFn: (body: { content: string; content_rich?: Record<string, unknown> | null }) =>
      api.post<Comment>(`/api/v1/tasks/${taskId}/comments`, body),
    onSuccess: (c) => {
      queryClient.setQueryData<Comment[]>(["comments", taskId], (old) => old ? [...old, c] : [c]);
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      setNewComment("");
      setNewCommentRich(null);
      setCommentEditorKey((k) => k + 1);
      // Scroll to bottom + refocus editor after new comment
      setTimeout(() => {
        commentsScrollRef.current?.scrollTo({ top: commentsScrollRef.current.scrollHeight, behavior: "smooth" });
        const tiptap = commentEditorRef.current?.querySelector(".tiptap-content") as HTMLElement | null;
        tiptap?.focus();
      }, 150);
    },
  });

  const updateComment = useMutation({
    mutationFn: ({ id, content, content_rich }: { id: string; content: string; content_rich?: Record<string, unknown> | null }) =>
      api.put<Comment>(`/api/v1/comments/${id}`, { content, content_rich }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", taskId] });
      setEditingCommentId(null);
    },
  });

  const deleteComment = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/comments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", taskId] });
      setDeletingCommentId(null);
    },
  });

  const { data: watchers } = useQuery<TaskWatcher[]>({
    queryKey: ["watchers", taskId],
    queryFn: () => api.get(`/api/v1/tasks/${taskId}/watchers`),
  });

  const { data: assignees } = useQuery<TaskAssignee[]>({
    queryKey: ["assignees", taskId],
    queryFn: () => api.get(`/api/v1/tasks/${taskId}/assignees`),
  });

  // Fetch project members + users for assignee picker
  const { data: members } = useQuery<ProjectMember[]>({
    queryKey: ["members", projectId],
    queryFn: () => api.get(`/api/v1/projects/${projectId}/members`),
  });

  const { data: usersData } = useQuery<PaginatedResponse<User>>({
    queryKey: ["users-all"],
    queryFn: () => api.get("/api/v1/users?limit=100"),
    enabled: false, // only admin can call this
  });

  const { data: activity } = useQuery<ActivityEvent[]>({
    queryKey: ["activity", taskId],
    queryFn: () => api.get(`/api/v1/tasks/${taskId}/activity?limit=50`),
    enabled: activeTab === "activity",
  });

  const isWatching = watchers?.some((w) => w.user_id === currentUser?.id) ?? false;

  const toggleWatch = useMutation({
    mutationFn: () =>
      isWatching
        ? api.delete(`/api/v1/tasks/${taskId}/watchers/${currentUser!.id}`)
        : api.post(`/api/v1/tasks/${taskId}/watchers`, { user_id: currentUser!.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchers", taskId] }),
  });

  const addAssignee = useMutation({
    mutationFn: (userId: string) => api.post<TaskAssignee>(`/api/v1/tasks/${taskId}/assignees`, { user_id: userId }),
    onSuccess: (newAssignee) => {
      queryClient.setQueryData<TaskAssignee[]>(["assignees", taskId], (old) =>
        old ? [...old, newAssignee] : [newAssignee]
      );
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });

  const removeAssignee = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/v1/tasks/${taskId}/assignees/${userId}`),
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: ["assignees", taskId] });
      const prev = queryClient.getQueryData<TaskAssignee[]>(["assignees", taskId]);
      queryClient.setQueryData<TaskAssignee[]>(["assignees", taskId], (old) =>
        old?.filter((a) => a.user_id !== userId) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["assignees", taskId], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["assignees", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });

  const assigneeIds = new Set(assignees?.map((a) => a.user_id) ?? []);

  // Optimistic: update task detail cache immediately, then background-sync list
  const updateTask = useMutation({
    mutationFn: (data: Partial<Task>) => api.put<Task>(`/api/v1/tasks/${taskId}`, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["task", taskId] });
      const prev = queryClient.getQueryData<Task>(["task", taskId]);
      queryClient.setQueryData<Task>(["task", taskId], (old) =>
        old ? { ...old, ...data } : old
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["task", taskId], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  // Optimistic: toggle subtask in panel cache immediately
  const toggleSubtask = useMutation({
    mutationFn: (subtaskId: string) => api.patch<Subtask>(`/api/v1/subtasks/${subtaskId}/toggle`),
    onMutate: async (subtaskId) => {
      await queryClient.cancelQueries({ queryKey: ["subtasks", taskId] });
      const prev = queryClient.getQueryData<Subtask[]>(["subtasks", taskId]);
      queryClient.setQueryData<Subtask[]>(["subtasks", taskId], (old) =>
        old?.map((s) => s.id === subtaskId ? { ...s, is_completed: !s.is_completed } : s) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["subtasks", taskId], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] });
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });

  const setSubtaskStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put<Subtask>(`/api/v1/subtasks/${id}`, { status }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Subtask[]>(["subtasks", taskId], (old) =>
        old?.map((s) => s.id === updated.id ? updated : s) ?? []
      );
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      setSubtaskStatusMenu(null);
    },
  });

  const renameSubtask = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.put<Subtask>(`/api/v1/subtasks/${id}`, { title }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Subtask[]>(["subtasks", taskId], (old) =>
        old?.map((s) => s.id === updated.id ? updated : s) ?? []
      );
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      setEditingSubtaskId(null);
    },
  });

  const archiveSubtask = useMutation({
    mutationFn: (subtaskId: string) => api.patch(`/api/v1/subtasks/${subtaskId}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] });
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });

  const [newSubtask, setNewSubtask] = useState("");
  const createSubtask = useMutation({
    mutationFn: (title: string) => api.post<Subtask>(`/api/v1/tasks/${taskId}/subtasks`, { title }),
    onSuccess: (newSub) => {
      queryClient.setQueryData<Subtask[]>(["subtasks", taskId], (old) =>
        old ? [...old, newSub] : [newSub]
      );
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      setNewSubtask("");
    },
  });

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const handleImagePaste = useCallback(async (file: File) => {
    try {
      const attachment = await api.upload<Attachment>(`/api/v1/tasks/${taskId}/attachments`, file);
      queryClient.invalidateQueries({ queryKey: ["attachments", taskId] });
      if (!attachment.preview_url) return null;
      return { attachmentId: attachment.id, previewUrl: `${API_BASE}${attachment.preview_url}` };
    } catch {
      return null;
    }
  }, [taskId, queryClient, API_BASE]);

  // Resolve attachment:{id} image references from description + all comments
  const allAttachmentIds = (() => {
    const ids: string[] = [];
    if (task) ids.push(...extractAttachmentIds(task.description_rich));
    if (comments) {
      for (const c of comments) {
        ids.push(...extractAttachmentIds(c.content_rich));
      }
    }
    return [...new Set(ids)];
  })();
  const { data: imageUrlMap } = useQuery<Record<string, string>>({
    queryKey: ["preview-urls", ...allAttachmentIds],
    queryFn: async () => {
      if (allAttachmentIds.length === 0) return {};
      const urls = await api.post<Record<string, string>>("/api/v1/attachments/preview-urls", {
        attachment_ids: allAttachmentIds,
      });
      const resolved: Record<string, string> = {};
      for (const [id, url] of Object.entries(urls)) {
        resolved[id] = `${API_BASE}${url}`;
      }
      return resolved;
    },
    enabled: allAttachmentIds.length > 0,
    staleTime: 20 * 60 * 1000,
  });

  const subtaskSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reorderSubtasks = useMutation({
    mutationFn: (body: { items: { id: string; sort_order: number }[] }) =>
      api.patch(`/api/v1/tasks/${taskId}/subtasks/reorder`, body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] }),
  });

  function handleSubtaskDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !subtasks) return;
    const oldIdx = subtasks.findIndex((s) => s.id === active.id);
    const newIdx = subtasks.findIndex((s) => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(subtasks, oldIdx, newIdx);
    const items = reordered.map((s, i) => ({ id: s.id, sort_order: (i + 1) * 1000 }));

    // Optimistic
    queryClient.setQueryData<Subtask[]>(["subtasks", taskId], reordered.map((s, i) => ({ ...s, sort_order: (i + 1) * 1000 })));
    reorderSubtasks.mutate({ items });
  }

  const uploadFile = useMutation({
    mutationFn: (file: File) => api.upload(`/api/v1/tasks/${taskId}/attachments`, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attachments", taskId] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: () => api.patch(`/api/v1/tasks/${taskId}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
  });

  const restoreTask = useMutation({
    mutationFn: () => api.patch(`/api/v1/tasks/${taskId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
  });

  const permanentDeleteTask = useMutation({
    mutationFn: () => api.delete(`/api/v1/tasks/${taskId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/attachments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attachments", taskId] });
    },
  });

  const [dragging, setDragging] = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files) {
      for (const file of Array.from(files)) {
        uploadFile.mutate(file);
      }
      e.target.value = "";
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      for (const file of Array.from(files)) {
        uploadFile.mutate(file);
      }
    }
  }

  if (!task) return null;

  // Esc key handling — editor exit with unsaved change detection
  function handlePanelEsc(e: React.KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (discardConfirm) return;

    // Lightbox open — close it only, stop here
    if (lightboxImage) {
      e.preventDefault();
      e.stopPropagation();
      setLightboxImage(null);
      return;
    }

    if (editingDescription) {
      e.preventDefault();
      e.stopPropagation();
      const hasChanges = JSON.stringify(descriptionRichDraft) !== JSON.stringify(task?.description_rich ?? null);
      if (hasChanges) { setDiscardConfirm("description"); } else { setEditingDescription(false); }
      return;
    }
    if (editingCommentId) {
      e.preventDefault();
      e.stopPropagation();
      const original = comments?.find((c) => c.id === editingCommentId);
      const hasChanges = JSON.stringify(editCommentRich) !== JSON.stringify(original?.content_rich ?? null);
      if (hasChanges) { setDiscardConfirm("comment"); } else { setEditingCommentId(null); }
      return;
    }
    if (newComment.trim()) {
      e.preventDefault();
      e.stopPropagation();
      setDiscardConfirm("new-comment");
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    onClose();
  }

  const statusCfg = STATUS_CONFIG[task.status];
  // priorityCfg removed — using PriorityPicker component
  const tabs = tabNames;

  return (
    <div
      className="fixed inset-0 z-30 bg-white flex flex-col lg:relative lg:z-auto lg:w-1/2 lg:border-l lg:border-gray-200 lg:h-full lg:shrink-0 outline-none"
      tabIndex={-1}
      onKeyDown={handlePanelEsc}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex-1 min-w-0 pr-2">
          {editingTitle ? (
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                if (titleDraft.trim() && titleDraft.trim() !== task.title) {
                  updateTask.mutate({ title: titleDraft.trim() } as any);
                }
                setEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                if (e.key === "Escape") { setEditingTitle(false); }
              }}
              autoFocus
              className="w-full text-sm font-semibold text-gray-900 bg-white border border-primary-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-gray-900 truncate">{task.title}</h2>
              <button
                onClick={() => { setTitleDraft(task.title); setEditingTitle(true); }}
                className="p-0.5 text-gray-300 hover:text-primary-600 transition-colors shrink-0"
                title="Edit title"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {task.is_archived && (
            <button
              onClick={() => restoreTask.mutate()}
              disabled={restoreTask.isPending}
              className="px-2 py-1 text-xs font-medium text-primary-600 bg-primary-50 rounded hover:bg-primary-100 transition-colors disabled:opacity-50"
            >
              {restoreTask.isPending ? "..." : "Restore"}
            </button>
          )}
          {!task.is_archived && (
            <button
              onClick={() => toggleWatch.mutate()}
              className={`p-1 rounded transition-colors ${isWatching ? "text-primary-600 hover:text-primary-700" : "text-gray-400 hover:text-gray-600"}`}
              title={isWatching ? "Stop watching" : "Watch this task"}
            >
              {isWatching ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          )}
          {/* Archive: user can only archive own tasks. Permanent delete: admin/manager only */}
          {(currentUser?.role !== "user" || (!task.is_archived && task.created_by_id === currentUser?.id)) && (
            <button
              onClick={() => setConfirmDeleteTask(true)}
              className="p-1 text-gray-400 hover:text-danger-500 rounded transition-colors"
              title={task.is_archived ? "Delete permanently" : "Archive task"}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Meta */}
      <div className="p-4 border-b border-gray-200 space-y-2.5">
        {/* Row 1: Created By + Priority */}
        <div className="grid grid-cols-2 gap-x-6">
          <div>
            <span className="text-xs text-gray-400">Created By</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {(() => {
                const creator = members?.find((m) => m.user_id === task.created_by_id);
                const cc = creator?.color || "#E6E7EB";
                return (
                  <>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: cc }}>{(creator?.full_name ?? "?").charAt(0)}</span>
                    <span className="text-xs text-gray-700">{creator?.full_name ?? "Unknown"}</span>
                    <span className="text-[10px] text-gray-400">on {new Date(task.created_at).toLocaleDateString()}</span>
                  </>
                );
              })()}
            </div>
          </div>
          <div>
            <span className="text-xs text-gray-400">Priority</span>
            <div className="mt-0.5">
              <PriorityPicker value={task.priority} onChange={(p) => updateTask.mutate({ priority: p })} />
            </div>
          </div>
        </div>

        {/* Row 2: Date + Status */}
        <div className="grid grid-cols-2 gap-x-6">
          <div>
            <span className="text-xs text-gray-400">Due date</span>
            <div className="mt-0.5">
              <input
                type="date"
                value={task.due_date || ""}
                onChange={(e) => updateTask.mutate({ due_date: e.target.value || null } as any)}
                className="text-xs text-gray-700 py-1 border-b border-gray-200 hover:border-primary-400 focus:border-primary-500 focus:outline-none transition-colors bg-transparent w-full"
              />
            </div>
          </div>
          <div className="relative">
            <span className="text-xs text-gray-400">Status</span>
            <button
              onClick={() => setShowStatusPicker(!showStatusPicker)}
              className={`mt-0.5 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${statusCfg.bg} hover:opacity-80 transition-opacity`}
            >
              <span style={{ color: statusCfg.iconColor }} className="text-sm leading-none">{statusCfg.icon}</span>
              <span className={statusCfg.color}>{statusCfg.label}</span>
              {task.updated_at && (
                <span className="text-[10px] text-gray-400 ml-1">{new Date(task.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              )}
            </button>
            {showStatusPicker && (
              <>
              <div className="fixed inset-0 z-40" onClick={() => setShowStatusPicker(false)} />
              <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 w-56">
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => { updateTask.mutate({ status: k as TaskStatus }); setShowStatusPicker(false); }}
                    className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors", task.status === k && "bg-primary-50")}
                  >
                    <span style={{ color: v.iconColor }} className="text-lg leading-none">{v.icon}</span>
                    <span className={cn("font-medium", v.color)}>{v.label}</span>
                  </button>
                ))}
              </div>
              </>
            )}
          </div>
        </div>

        {/* Row 3: Assigned to (full width) */}
        <div className="relative">
          <span className="text-xs text-gray-400">Assigned to</span>
          <button onClick={() => { setShowAssignPicker(true); setAssignSearch(""); }} className="flex items-center gap-2 mt-0.5 hover:opacity-80 transition-opacity flex-wrap">
            {assignees && assignees.length > 0 ? (
              assignees.map((a) => {
                const member = members?.find((m) => m.user_id === a.user_id);
                const uc = member?.color || "#E6E7EB";
                return (
                  <span key={a.user_id} className="inline-flex items-center gap-1 text-xs text-gray-700">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: uc }}>{(member?.full_name ?? "?").charAt(0)}</span>
                    {member?.full_name ?? "?"}
                  </span>
                );
              })
            ) : (
              <span className="text-xs text-gray-400">Not set</span>
            )}
          </button>

          {showAssignPicker && (
            <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50">
              <div className="flex items-center justify-between p-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-700">Assign to</span>
                <button onClick={() => setShowAssignPicker(false)} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-2">
                <input type="text" value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} placeholder="Search" autoFocus className="w-full px-2 py-1.5 text-sm border-b-2 border-primary-400 focus:outline-none" />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {assignees && assignees.length > 0 && (
                  <button onClick={() => { assignees.forEach((a) => removeAssignee.mutate(a.user_id)); setShowAssignPicker(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary-600 bg-primary-50 hover:bg-primary-100 transition-colors">
                    Unassigned
                  </button>
                )}
                {members?.filter((m) => m.full_name.toLowerCase().includes(assignSearch.toLowerCase())).map((m) => {
                  const isAssigned = assigneeIds.has(m.user_id);
                  const uc = m.color || "#E6E7EB";
                  return (
                    <button key={m.user_id} onClick={() => { if (isAssigned) removeAssignee.mutate(m.user_id); else addAssignee.mutate(m.user_id); }} className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors", isAssigned && "bg-primary-50/50")}>
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: uc }}>{m.full_name.charAt(0)}</span>
                      <span className="text-gray-700">{m.full_name}</span>
                      {isAssigned && <Check className="w-3.5 h-3.5 text-primary-600 ml-auto" />}
                      {m.user_id === currentUser?.id && !isAssigned && <span className="text-[10px] text-gray-400 ml-auto">(Me)</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-medium text-center capitalize transition-colors ${
              activeTab === tab
                ? "text-primary-600 border-b-2 border-primary-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "subtasks"
              ? `Subtasks (${subtasks?.length ?? 0})`
              : tab === "comments"
                ? `Comments (${comments?.length ?? 0})`
                : tab === "files"
                  ? `Files (${attachments?.length ?? 0})`
                  : tab === "activity"
                    ? "Activity"
                    : tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === "overview" && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</span>
              {!editingDescription && (
                <button
                  onClick={() => { setDescriptionRichDraft(task.description_rich || null); setEditingDescription(true); }}
                  className="p-1 text-gray-400 hover:text-primary-600 rounded transition-colors"
                  title="Edit Description"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {editingDescription ? (
              <div>
                <RichEditor
                  content={descriptionRichDraft}
                  onChange={(json, plain) => { setDescriptionRichDraft(json); setDescriptionDraft(plain); }}
                  onImagePaste={handleImagePaste}
                  imageUrlMap={imageUrlMap}
                  placeholder="Add a description..."
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => setEditingDescription(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      updateTask.mutate({ description_plain: descriptionDraft, description_rich: descriptionRichDraft } as any);
                      setEditingDescription(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={(e) => {
                  // Image click → open lightbox with original
                  const img = (e.target as HTMLElement).closest("img");
                  if (img && img.src && !img.src.startsWith("data:")) {
                    e.stopPropagation();
                    const originalSrc = img.src.replace("/preview?", "/view?");
                    setLightboxImage({ src: originalSrc, alt: img.alt || "Image" });
                  }
                }}
                className="bg-gray-50 rounded-lg p-3 min-h-[80px] border border-transparent"
              >
                <RichContent rich={task.description_rich} plain={task.description_plain} imageUrlMap={imageUrlMap} />
              </div>
            )}
          </div>
        )}

        {activeTab === "subtasks" && (
          <div>
            <DndContext sensors={subtaskSensors} collisionDetection={closestCenter} onDragEnd={handleSubtaskDragEnd}>
            <SortableContext items={subtasks?.map((s) => s.id) ?? []} strategy={verticalListSortingStrategy}>
              {subtasks?.map((s) => {
                const sCfg = SUBTASK_STATUS_CONFIG[s.status] ?? SUBTASK_STATUS_CONFIG.no_progress;
                const menuOpen = subtaskStatusMenu === s.id;
                return (
                  <SortableSubtaskRow key={s.id} id={s.id}>
                    <div className="flex items-center gap-2 py-1.5 group relative">
                      <GripVertical className="w-3 h-3 text-gray-300 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />

                      {/* Status icon — click opens dropdown */}
                      <button
                        onClick={() => setSubtaskStatusMenu(menuOpen ? null : s.id)}
                        className={cn("text-base leading-none shrink-0", sCfg.color)}
                        title={sCfg.label}
                      >
                        {sCfg.icon}
                      </button>

                      {/* Status dropdown popup */}
                      {menuOpen && (
                        <div className="absolute left-6 top-0 w-44 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1">
                          {Object.entries(SUBTASK_STATUS_CONFIG).map(([key, cfg]) => (
                            <button
                              key={key}
                              onClick={() => setSubtaskStatus.mutate({ id: s.id, status: key })}
                              className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors",
                                s.status === key && "bg-primary-50"
                              )}
                            >
                              <span className={cn("text-base leading-none", cfg.color)}>{cfg.icon}</span>
                              <span className="text-gray-700">{cfg.label}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {editingSubtaskId === s.id ? (
                        <input
                          type="text"
                          value={editingSubtaskTitle}
                          onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                          onBlur={() => {
                            const trimmed = editingSubtaskTitle.trim();
                            if (trimmed && trimmed !== s.title) {
                              renameSubtask.mutate({ id: s.id, title: trimmed });
                            } else {
                              setEditingSubtaskId(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.target as HTMLInputElement).blur();
                            }
                            if (e.key === "Escape") {
                              setEditingSubtaskId(null);
                            }
                          }}
                          autoFocus
                          className="flex-1 text-sm px-1 py-0 border border-primary-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      ) : (
                        <span
                          className={cn("text-sm flex-1 cursor-text", s.status === "completed" ? "text-gray-400 line-through" : "text-gray-700")}
                          onDoubleClick={() => { setEditingSubtaskId(s.id); setEditingSubtaskTitle(s.title); }}
                        >
                          {s.title}
                        </span>
                      )}

                      {/* Delete button */}
                      <button
                        onClick={() => archiveSubtask.mutate(s.id)}
                        className="p-0.5 text-gray-400 hover:text-danger-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Delete subtask"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </SortableSubtaskRow>
                );
              })}
            </SortableContext>
            </DndContext>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newSubtask.trim()) createSubtask.mutate(newSubtask.trim());
              }}
              className="mt-3"
            >
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Add subtask..."
                className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </form>
          </div>
        )}

        {activeTab === "comments" && (
          <div className="flex flex-col h-full">
            <div ref={commentsScrollRef} className="flex-1 overflow-auto space-y-3">
              {comments?.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No comments yet</p>
              )}
              {comments?.map((c) => {
                const author = members?.find((m) => m.user_id === c.author_id);
                const authorColor = author?.color || "#E6E7EB";
                const canEdit = currentUser && (c.author_id === currentUser.id || currentUser.role === "admin");
                const isEditing = editingCommentId === c.id;
                return (
                  <div key={c.id} className="flex gap-2.5 group">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5"
                      style={{ backgroundColor: authorColor }}
                    >
                      {(author?.full_name ?? "?").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-gray-900">
                          {author?.full_name ?? "Unknown"}
                        </span>
                        <span className="text-[10px] text-gray-400" title={new Date(c.created_at).toLocaleString()}>
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </span>
                        {canEdit && !isEditing && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.content); setEditCommentRich(c.content_rich || null); }}
                              className="p-0.5 text-gray-400 hover:text-primary-600"
                              title="Edit"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setDeletingCommentId(c.id)}
                              className="p-0.5 text-gray-400 hover:text-danger-500"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      {isEditing ? (
                        <div>
                          <RichEditor
                            content={editCommentRich}
                            onChange={(json, plain) => { setEditCommentRich(json); setEditCommentText(plain); }}
                            onImagePaste={handleImagePaste}
                            imageUrlMap={imageUrlMap}
                            minimal
                          />
                          <div className="flex justify-end gap-2 mt-1.5">
                            <button onClick={() => setEditingCommentId(null)} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded transition-colors">Cancel</button>
                            <button
                              onClick={() => { if (editCommentText.trim()) updateComment.mutate({ id: c.id, content: editCommentText.trim(), content_rich: editCommentRich }); }}
                              disabled={!editCommentText.trim() || updateComment.isPending}
                              className="px-2 py-1 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-40 transition-colors"
                            >
                              {updateComment.isPending ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={(e) => {
                            const img = (e.target as HTMLElement).closest("img");
                            if (img && img.src && !img.src.startsWith("data:")) {
                              const originalSrc = img.src.replace("/preview?", "/view?");
                              setLightboxImage({ src: originalSrc, alt: img.alt || "Image" });
                            }
                          }}
                        >
                          <RichContent rich={c.content_rich} plain={c.content} imageUrlMap={imageUrlMap} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Delete comment confirmation */}
            {deletingCommentId && (
              <div className="p-3 bg-danger-50 border border-danger-100 rounded-lg mb-3">
                <p className="text-xs text-gray-700 mb-2">Delete this comment permanently?</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDeletingCommentId(null)} className="px-2 py-1 text-xs text-gray-500 hover:bg-white rounded transition-colors">Cancel</button>
                  <button
                    onClick={() => deleteComment.mutate(deletingCommentId)}
                    disabled={deleteComment.isPending}
                    className="px-2 py-1 text-xs font-medium text-white bg-danger-600 rounded hover:bg-danger-700 disabled:opacity-50 transition-colors"
                  >
                    {deleteComment.isPending ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            )}

            {/* Comment input */}
            <div className="mt-3 pt-3 border-t border-gray-100" ref={commentEditorRef}>
              <RichEditor
                key={commentEditorKey}
                content={newCommentRich}
                onChange={(json, plain) => { setNewCommentRich(json); setNewComment(plain); }}
                onImagePaste={handleImagePaste}
                imageUrlMap={imageUrlMap}
                onSubmit={() => { if (newComment.trim()) addComment.mutate({ content: newComment.trim(), content_rich: newCommentRich }); }}
                placeholder="Write a comment..."
                minimal
              />
              <div className="flex justify-end mt-1.5">
                <button
                  onClick={() => { if (newComment.trim()) addComment.mutate({ content: newComment.trim(), content_rich: newCommentRich }); }}
                  disabled={!newComment.trim() || addComment.isPending}
                  className="px-3 py-1 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-40 transition-colors"
                >
                  {addComment.isPending ? "Sending..." : "Comment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "files" && (
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadFile.isPending}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed rounded-lg text-sm transition-colors disabled:opacity-50",
                dragging
                  ? "border-primary-400 bg-primary-50 text-primary-600"
                  : "border-gray-300 text-gray-500 hover:border-primary-400 hover:text-primary-600"
              )}
            >
              <Upload className="w-4 h-4" />
              {uploadFile.isPending ? "Uploading..." : dragging ? "Drop files here" : "Upload or drop files"}
            </button>

            {uploadFile.isError && (
              <p className="text-xs text-danger-500">{uploadFile.error.message}</p>
            )}

            {attachments?.map((a) => (
              <div key={a.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg group">
                {a.is_image && a.preview_url ? (
                  <button
                    onClick={() => setLightboxImage({ src: `${API_BASE}${a.view_url || a.preview_url}`, alt: a.file_name })}
                    className="w-12 h-12 rounded overflow-hidden shrink-0 hover:opacity-80 transition-opacity"
                  >
                    <img src={`${API_BASE}${a.thumb_url || a.preview_url}`} alt={a.file_name} className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  {a.is_image ? (
                    <button
                      onClick={() => setLightboxImage({ src: `${API_BASE}${a.view_url || a.preview_url}`, alt: a.file_name })}
                      className="text-sm text-gray-700 hover:text-primary-600 truncate block text-left"
                    >
                      {a.file_name}
                    </button>
                  ) : (
                    <a
                      href={`${API_BASE}${a.view_url || a.download_url || ""}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-sm text-gray-700 hover:text-primary-600 truncate block"
                    >
                      {a.file_name}
                    </a>
                  )}
                  <p className="text-[10px] text-gray-400">{formatFileSize(a.file_size)}</p>
                </div>
                <button
                  onClick={() => deleteAttachment.mutate(a.id)}
                  className="p-1 text-gray-400 hover:text-danger-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {attachments?.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No files attached</p>
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <div className="space-y-0">
            {activity?.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>
            )}
            {activity?.map((event) => (
              <div key={event.id} className="flex gap-2 py-2 border-b border-gray-50 last:border-0">
                <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5">
                  {event.actor_name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">{event.actor_name}</span>{" "}
                    <span className="text-gray-500">{event.description}</span>
                  </p>
                  <p
                    className="text-[10px] text-gray-400 mt-0.5"
                    title={new Date(event.created_at).toLocaleString()}
                  >
                    {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 text-xs text-gray-400">
        Created {new Date(task.created_at).toLocaleDateString()}
        {task.updated_by_id && (
          <> &middot; Updated {new Date(task.updated_at).toLocaleDateString()}</>
        )}
      </div>

      {/* Delete task confirmation */}
      {confirmDeleteTask && (
        <div className="absolute inset-0 bg-black/20 z-50 flex items-center justify-center" onClick={() => setConfirmDeleteTask(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-4" onClick={(e) => e.stopPropagation()}>
            {task.is_archived ? (
              <>
                <p className="text-sm font-medium text-danger-600 mb-1">Delete Permanently</p>
                <p className="text-sm text-gray-500 mb-4">This will permanently delete &quot;{task.title}&quot; and all its subtasks, comments, and attachments. This cannot be undone.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setConfirmDeleteTask(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
                  <button
                    onClick={() => permanentDeleteTask.mutate()}
                    disabled={permanentDeleteTask.isPending}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-danger-600 rounded-md hover:bg-danger-700 disabled:opacity-50 transition-colors"
                  >
                    {permanentDeleteTask.isPending ? "Deleting..." : "Delete Forever"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-900 mb-1">Archive Task</p>
                <p className="text-sm text-gray-500 mb-4">Archive &quot;{task.title}&quot;? You can restore it later from the Archived view.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setConfirmDeleteTask(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
                  <button
                    onClick={() => deleteTask.mutate()}
                    disabled={deleteTask.isPending}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-warning-700 rounded-md hover:bg-warning-800 disabled:opacity-50 transition-colors"
                  >
                    {deleteTask.isPending ? "Archiving..." : "Archive"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Discard changes confirmation */}
      {discardConfirm && (
        <div className="absolute inset-0 bg-black/20 z-50 flex items-center justify-center" onClick={() => setDiscardConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium text-gray-900 mb-1">Unsaved changes</p>
            <p className="text-sm text-gray-500 mb-4">You have unsaved changes. Are you sure you want to discard them?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDiscardConfirm(null)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                Stay
              </button>
              <button
                onClick={() => {
                  if (discardConfirm === "description") setEditingDescription(false);
                  else if (discardConfirm === "comment") setEditingCommentId(null);
                  else if (discardConfirm === "new-comment") {
                    setNewComment("");
                    setNewCommentRich(null);
                    setCommentEditorKey((k) => k + 1);
                  }
                  setDiscardConfirm(null);
                }}
                className="px-3 py-1.5 text-xs font-medium text-white bg-danger-600 rounded-md hover:bg-danger-700 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxImage && (
        <ImageLightbox src={lightboxImage.src} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
}
