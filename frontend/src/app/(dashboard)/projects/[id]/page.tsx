"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import { MessageSquare, ListChecks, Bookmark, GripVertical, Pencil, X, Check, Trash2, Search, ChevronRight, Plus } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Header } from "@/components/header";
import { TaskDetailPanel } from "@/components/task-detail-panel";
import { AddTaskModal } from "@/components/add-task-modal";
import { BatchToolbar } from "@/components/batch-toolbar";
import { QuickAddTask } from "@/components/quick-add-task";
import { PriorityBadge } from "@/components/priority-picker";
import { AvatarStack } from "@/components/avatar-stack";
import { RichEditor } from "@/components/rich-editor";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { canEditProject, canManageLists } from "@/lib/permissions";
import { parseTaskFilters, buildTaskQueryParams, hasActiveFilters as checkActiveFilters, taskQueryKey } from "@/lib/task-filters";
import { STATUS_CONFIG, PRIORITY_CONFIG, SUBTASK_STATUS_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Project, Task, TaskList, ProjectMember, User, PaginatedResponse, TaskStatus, TaskPriority, SubtaskStatus } from "@/lib/types";

const PAGE_SIZE = 30;

function SortableTaskRow({ id, statusBorder, children }: { id: string; statusBorder: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeft: `3px solid ${statusBorder}`,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function SortableSubtaskRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      <div {...attributes} {...listeners} className="cursor-grab p-0.5 shrink-0 hidden sm:block">
        <GripVertical className="w-2.5 h-2.5 text-gray-300" />
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const projectId = params.id as string;

  // Parse all filters from URL — single source of truth
  const filters = parseTaskFilters(searchParams);
  const listFilter = filters.list_id;

  const { user: currentUser } = useAuth({ redirect: false });
  const taskFromUrl = searchParams.get("task") || null;
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(taskFromUrl);
  const [panelTabIndex, setPanelTabIndex] = useState(0);
  const PANEL_TABS = ["overview", "subtasks", "comments", "files", "activity"] as const;
  const [showAddTask, setShowAddTask] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">("");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [showEditProject, setShowEditProject] = useState(false);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectDesc, setEditProjectDesc] = useState("");
  const [editProjectMembers, setEditProjectMembers] = useState<Set<string>>(new Set());
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [deletingList, setDeletingList] = useState<{ id: string; name: string; taskCount: number } | null>(null);
  const [deleteDestListId, setDeleteDestListId] = useState("");
  const [editingListName, setEditingListName] = useState("");
  const [inlineSubtaskMenu, setInlineSubtaskMenu] = useState<string | null>(null);
  const [extraTasks, setExtraTasks] = useState<Map<string, Task[]>>(new Map());
  const [loadingListId, setLoadingListId] = useState<string | null>(null);
  const [collapsedLists, setCollapsedLists] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const stored = new Set<string>();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("wlm:list:") && key.endsWith(":collapsed") && localStorage.getItem(key) === "true") {
          stored.add(key.replace("wlm:list:", "").replace(":collapsed", ""));
        }
      }
    } catch {}
    return stored;
  });

  function toggleListCollapse(listId: string) {
    setCollapsedLists((prev) => {
      const next = new Set(prev);
      const collapsed = !next.has(listId);
      if (collapsed) {
        next.add(listId);
        try { localStorage.setItem(`wlm:list:${listId}:collapsed`, "true"); } catch {}
      } else {
        next.delete(listId);
        try { localStorage.removeItem(`wlm:list:${listId}:collapsed`); } catch {}
      }
      return next;
    });
  }

  // Subtask accordion — default collapsed, persisted per task
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const stored = new Set<string>();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("wlm:task:") && key.endsWith(":subtasks:expanded") && localStorage.getItem(key) === "true") {
          stored.add(key.replace("wlm:task:", "").replace(":subtasks:expanded", ""));
        }
      }
    } catch {}
    return stored;
  });

  function toggleSubtasksState(taskId: string) {
    setExpandedSubtasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
        try { localStorage.removeItem(`wlm:task:${taskId}:subtasks:expanded`); } catch {}
      } else {
        next.add(taskId);
        try { localStorage.setItem(`wlm:task:${taskId}:subtasks:expanded`, "true"); } catch {}
      }
      return next;
    });
  }

  // Inline subtask editing
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubTitle, setEditingSubTitle] = useState("");
  // Quick-add subtask
  const [addingSubForTask, setAddingSubForTask] = useState<string | null>(null);
  const [newSubTitle, setNewSubTitle] = useState("");
  // Active row for keyboard nav
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const renameSubtaskInline = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.put(`/api/v1/subtasks/${id}`, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      setEditingSubId(null);
    },
  });

  const createSubtaskInline = useMutation({
    mutationFn: ({ taskId, title }: { taskId: string; title: string }) =>
      api.post(`/api/v1/tasks/${taskId}/subtasks`, { title }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      // Auto-expand subtasks for the parent task
      setExpandedSubtasks((prev) => {
        const next = new Set(prev);
        next.add(vars.taskId);
        try { localStorage.setItem(`wlm:task:${vars.taskId}:subtasks:expanded`, "true"); } catch {}
        return next;
      });
      setNewSubTitle("");
    },
  });

  const toggleSubtaskComplete = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/subtasks/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });

  function startEditSub(subId: string, currentTitle: string) {
    setEditingSubId(subId);
    setEditingSubTitle(currentTitle);
  }

  function saveEditSub(subId: string) {
    const trimmed = editingSubTitle.trim();
    if (trimmed && trimmed !== editingSubTitle) {
      renameSubtaskInline.mutate({ id: subId, title: trimmed });
    } else if (trimmed) {
      renameSubtaskInline.mutate({ id: subId, title: trimmed });
    }
    setEditingSubId(null);
  }

  const [searchInput, setSearchInput] = useState(filters.search);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  // Sync dropdown state from URL filters
  useEffect(() => {
    setStatusFilter(filters.status);
    setPriorityFilter(filters.priority);
  }, [filters.status, filters.priority]);

  // Open task detail panel from URL param (?task=...)
  useEffect(() => {
    if (taskFromUrl && taskFromUrl !== selectedTaskId) {
      setSelectedTaskId(taskFromUrl);
    }
  }, [taskFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync search input from URL on initial load or back/forward navigation
  // Only sync if local state is empty and URL has a value (avoids resetting during typing)
  useEffect(() => {
    if (filters.search && !searchInput) {
      setSearchInput(filters.search);
      setDebouncedSearch(filters.search);
    }
  }, [filters.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce: searchInput → debouncedSearch (drives the query)
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === debouncedSearch) return;
    const timer = setTimeout(() => setDebouncedSearch(trimmed), 350);
    return () => clearTimeout(timer);
  }, [searchInput, debouncedSearch]);

  // Sync debouncedSearch to URL (for permalink / back-forward)
  // Uses window.history directly to avoid Next.js navigation remounting the component
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const currentUrlSearch = url.searchParams.get("search") || "";
    if (debouncedSearch === currentUrlSearch) return;
    if (debouncedSearch) {
      url.searchParams.set("search", debouncedSearch);
    } else {
      url.searchParams.delete("search");
    }
    window.history.replaceState(window.history.state, "", url.toString());
  }, [debouncedSearch]);

  function clearSearch() {
    setSearchInput("");
    setDebouncedSearch("");
  }

  const saveFilter = useMutation({
    mutationFn: (body: { name: string; filters_json: Record<string, string> }) =>
      api.post("/api/v1/saved-filters", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-filters"] }),
  });

  const setSubtaskStatusInline = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/api/v1/subtasks/${id}`, { status }),
    onMutate: async ({ id, status: newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", projectId] });
      const taskListKeys = queryClient.getQueryCache()
        .findAll({ queryKey: ["tasks", projectId] })
        .map((q) => q.queryKey);

      const snapshots: [readonly unknown[], unknown][] = [];
      for (const key of taskListKeys) {
        const prev = queryClient.getQueryData<PaginatedResponse<Task>>(key);
        if (prev) {
          snapshots.push([key, prev]);
          queryClient.setQueryData<PaginatedResponse<Task>>(key, {
            ...prev,
            items: prev.items.map((t) => ({
              ...t,
              subtasks: t.subtasks?.map((s) =>
                s.id === id ? { ...s, status: newStatus as SubtaskStatus, is_completed: newStatus === "completed" } : s
              ),
            })),
          });
        }
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSuccess: () => setInlineSubtaskMenu(null),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["task"] });
      queryClient.invalidateQueries({ queryKey: ["subtasks"] });
    },
  });

  const updateProject = useMutation({
    mutationFn: (body: { name?: string; description?: string }) =>
      api.put(`/api/v1/projects/${projectId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const [savingProject, setSavingProject] = useState(false);

  async function handleSaveProject() {
    setSavingProject(true);
    try {
      // 1. Update name/description
      await api.put(`/api/v1/projects/${projectId}`, {
        name: editProjectName.trim(),
        description: editProjectDesc.trim() || undefined,
      });

      // 2. Sync members
      const currentMemberIds = new Set(members?.map((m) => m.user_id) ?? []);
      const targetMemberIds = editProjectMembers;

      // Add new members
      for (const uid of targetMemberIds) {
        if (!currentMemberIds.has(uid)) {
          try { await api.post(`/api/v1/projects/${projectId}/members`, { user_id: uid }); } catch {}
        }
      }
      // Remove old members (skip owner)
      for (const uid of currentMemberIds) {
        if (!targetMemberIds.has(uid) && uid !== project?.owner_id) {
          try { await api.delete(`/api/v1/projects/${projectId}/members/${uid}`); } catch {}
        }
      }

      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["members", projectId] });
      setShowEditProject(false);
    } finally {
      setSavingProject(false);
    }
  }

  const renameList = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.put(`/api/v1/lists/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists", projectId] });
      setEditingListId(null);
    },
  });

  const deleteList = useMutation({
    mutationFn: ({ id, destinationListId }: { id: string; destinationListId?: string }) =>
      api.delete(`/api/v1/lists/${id}`, destinationListId ? { destination_list_id: destinationListId } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists", projectId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      setDeletingList(null);
      setDeleteDestListId("");
    },
  });

  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => api.get(`/api/v1/projects/${projectId}`),
  });

  const { data: lists } = useQuery<TaskList[]>({
    queryKey: ["lists", projectId],
    queryFn: () => api.get(`/api/v1/projects/${projectId}/lists`),
  });

  const { data: members } = useQuery<ProjectMember[]>({
    queryKey: ["members", projectId],
    queryFn: () => api.get(`/api/v1/projects/${projectId}/members`),
  });

  // All users for member picker in edit modal
  const { data: allUsersData } = useQuery<PaginatedResponse<User>>({
    queryKey: ["users-for-edit"],
    queryFn: () => api.get("/api/v1/users?limit=100"),
    enabled: showEditProject,
  });
  const allUsers = allUsersData?.items?.filter((u) => u.is_active) ?? [];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reorderTasks = useMutation({
    mutationFn: (body: { list_id: string; items: { id: string; sort_order: number }[] }) =>
      api.patch("/api/v1/tasks/reorder", body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
  });

  const reorderSubtasks = useMutation({
    mutationFn: ({ taskId, items }: { taskId: string; items: { id: string; sort_order: number }[] }) =>
      api.patch(`/api/v1/tasks/${taskId}/subtasks/reorder`, { items }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
  });

  const subtaskSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleSubtaskDragEnd(taskId: string, subtasks: { id: string; sort_order: number }[], event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = subtasks.findIndex((s) => s.id === active.id);
    const newIdx = subtasks.findIndex((s) => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(subtasks, oldIdx, newIdx);
    const items = reordered.map((s, i) => ({ id: s.id, sort_order: (i + 1) * 1000 }));

    // Optimistic update
    const taskKeys = queryClient.getQueryCache().findAll({ queryKey: ["tasks", projectId] }).map((q) => q.queryKey);
    for (const key of taskKeys) {
      const prev = queryClient.getQueryData<PaginatedResponse<Task>>(key);
      if (prev) {
        queryClient.setQueryData<PaginatedResponse<Task>>(key, {
          ...prev,
          items: prev.items.map((t) =>
            t.id === taskId && t.subtasks
              ? { ...t, subtasks: arrayMove(t.subtasks, oldIdx, newIdx).map((s, i) => ({ ...s, sort_order: (i + 1) * 1000 })) }
              : t
          ),
        });
      }
    }

    reorderSubtasks.mutate({ taskId, items });
  }

  function handleTaskDragEnd(listId: string, listTasks: Task[], event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = listTasks.findIndex((t) => t.id === active.id);
    const newIdx = listTasks.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(listTasks, oldIdx, newIdx);
    const items = reordered.map((t, i) => ({ id: t.id, sort_order: (i + 1) * 1000 }));

    // Optimistic update
    const taskListKeys = queryClient.getQueryCache().findAll({ queryKey: ["tasks", projectId] }).map((q) => q.queryKey);
    for (const key of taskListKeys) {
      const prev = queryClient.getQueryData<PaginatedResponse<Task>>(key);
      if (prev) {
        const updated = prev.items.map((t) => {
          const match = items.find((it) => it.id === t.id);
          return match ? { ...t, sort_order: match.sort_order } : t;
        });
        updated.sort((a, b) => a.sort_order - b.sort_order);
        queryClient.setQueryData<PaginatedResponse<Task>>(key, { ...prev, items: updated });
      }
    }

    reorderTasks.mutate({ list_id: listId, items });
  }

  // Merge URL filters with local state overrides (local state drives the query, URL is secondary)
  const activeFilters = {
    ...filters,
    status: statusFilter || filters.status,
    priority: priorityFilter || filters.priority,
    search: debouncedSearch,
  };
  // Main query: newest PAGE_SIZE tasks (DESC order from backend)
  const queryParams = buildTaskQueryParams(activeFilters, PAGE_SIZE);
  const mainUrl = `/api/v1/projects/${projectId}/tasks?${queryParams}&newest_first=true`;
  const { data: tasksData } = useQuery<PaginatedResponse<Task>>({
    queryKey: taskQueryKey(projectId, activeFilters),
    queryFn: () => api.get(mainUrl),
  });

  const rawTasks = tasksData?.items ?? [];

  const toggleCheck = useCallback((taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  // Group tasks by list. Raw tasks arrive newest-first; we reverse per list for display (oldest at top).
  const tasksByList = new Map<string, Task[]>();
  for (const t of rawTasks) {
    const group = tasksByList.get(t.list_id) ?? [];
    group.push(t);
    tasksByList.set(t.list_id, group);
  }
  // Reverse each list so oldest is at top
  for (const [listId, items] of tasksByList) {
    tasksByList.set(listId, items.reverse());
  }

  // Merge extra-loaded (older) tasks — prepend to top of each list
  for (const [listId, older] of extraTasks) {
    const existing = tasksByList.get(listId) ?? [];
    const existingIds = new Set(existing.map((t) => t.id));
    // older tasks arrive newest-first from backend; reverse so oldest is at top
    const reversed = [...older].reverse();
    const unique = reversed.filter((t) => !existingIds.has(t.id));
    tasksByList.set(listId, [...unique, ...existing]);
  }

  // Reset extra tasks when filters/search change
  useEffect(() => { setExtraTasks(new Map()); }, [debouncedSearch, statusFilter, priorityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-list "Load more" — fetches next PAGE_SIZE older tasks for a specific list
  async function loadMoreTasks(listId: string) {
    const currentLoaded = tasksByList.get(listId)?.length ?? 0;
    setLoadingListId(listId);
    try {
      const p = new URLSearchParams(queryParams.toString());
      p.set("list_id", listId);
      p.set("newest_first", "true");
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", String(currentLoaded));
      const data = await api.get<PaginatedResponse<Task>>(`/api/v1/projects/${projectId}/tasks?${p}`);
      setExtraTasks((prev) => {
        const next = new Map(prev);
        const prevExtra = next.get(listId) ?? [];
        next.set(listId, [...prevExtra, ...data.items]);
        return next;
      });
    } finally {
      setLoadingListId(null);
    }
  }

  const filtersActive = checkActiveFilters(activeFilters);

  const displayLists = listFilter
    ? lists?.filter((l) => l.id === listFilter)
    : filtersActive
      ? lists?.filter((l) => (tasksByList.get(l.id)?.length ?? 0) > 0)
      : lists;

  const userRole = currentUser?.role ?? "user";
  const isMember = members?.some((m) => m.user_id === currentUser?.id) ?? false;
  const canEdit = canEditProject(userRole, isMember);
  const canLists = canManageLists(userRole, isMember);

  // Build flat list of navigable IDs: [task1, sub1a, sub1b, task2, ...]
  const navIds = useCallback(() => {
    const ids: { id: string; type: "task" | "subtask" | "add-subtask"; taskId?: string }[] = [];
    for (const list of displayLists ?? []) {
      if (collapsedLists.has(list.id)) continue;
      const lt = tasksByList.get(list.id) ?? [];
      for (const t of lt) {
        ids.push({ id: t.id, type: "task" });
        if (expandedSubtasks.has(t.id)) {
          if (t.subtasks) {
            for (const s of t.subtasks) {
              ids.push({ id: s.id, type: "subtask", taskId: t.id });
            }
          }
          ids.push({ id: `add-sub-${t.id}`, type: "add-subtask", taskId: t.id });
        }
      }
    }
    return ids;
  }, [displayLists, tasksByList, collapsedLists, expandedSubtasks]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inTextInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Left/Right Arrow tab navigation when panel is open
      if (selectedTaskId && !inTextInput) {
        if (e.key === "ArrowRight") {
          if (panelTabIndex < PANEL_TABS.length - 1) {
            e.preventDefault();
            setPanelTabIndex(panelTabIndex + 1);
          }
          return;
        }
        if (e.key === "ArrowLeft") {
          if (panelTabIndex > 0) {
            e.preventDefault();
            setPanelTabIndex(panelTabIndex - 1);
          } else {
            // First tab — close panel
            e.preventDefault();
            setSelectedTaskId(null);
          }
          return;
        }
      }
      if (e.key === "Escape") {
        if (!inTextInput) { setActiveRowId(null); }
        return;
      }

      // Block all other nav when editing or in text inputs
      if (editingSubId || addingSubForTask) return;
      if (inTextInput) return;

      const ids = navIds();
      const idx = ids.findIndex((r) => r.id === activeRowId);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = idx < ids.length - 1 ? ids[idx + 1] : ids[0];
        if (next) setActiveRowId(next.id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = idx > 0 ? ids[idx - 1] : ids[ids.length - 1];
        if (prev) setActiveRowId(prev.id);
      } else if (e.key === "Enter" && activeRowId) {
        e.preventDefault();
        const row = ids.find((r) => r.id === activeRowId);
        if (row?.type === "task") {
          toggleSubtasksState(row.id);
        } else if (row?.type === "subtask") {
          for (const list of displayLists ?? []) {
            for (const t of tasksByList.get(list.id) ?? []) {
              const sub = t.subtasks?.find((s) => s.id === row.id);
              if (sub) { startEditSub(sub.id, sub.title); return; }
            }
          }
        } else if (row?.type === "add-subtask" && row.taskId) {
          setAddingSubForTask(row.taskId);
          setNewSubTitle("");
        }
      } else if (e.key === "ArrowRight" && activeRowId && !selectedTaskId) {
        const row = ids.find((r) => r.id === activeRowId);
        if (row?.type === "task") {
          e.preventDefault();
          setSelectedTaskId(row.id);
          setPanelTabIndex(0);
        }
      } else if (e.key === " " && activeRowId) {
        const row = ids.find((r) => r.id === activeRowId);
        if (row?.type === "subtask") {
          e.preventDefault();
          toggleSubtaskComplete.mutate(row.id);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRowId, editingSubId, addingSubForTask, navIds]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <Header onAddTask={() => setShowAddTask(true)} />

        <div className="flex-1 overflow-auto p-3 sm:p-6">
          {/* Project header */}
          {project && (
            <div className="mb-6">
              <div className="flex items-center gap-2">
                <h1
                  className="text-xl font-semibold text-primary-600 hover:text-primary-700 cursor-pointer transition-colors"
                  onClick={() => router.push(`/projects/${projectId}`)}
                >
                  {project.name}
                </h1>
                {canEdit && (
                  <button
                    onClick={() => {
                      setEditProjectName(project.name);
                      setEditProjectDesc(project.description || "");
                      setEditProjectMembers(new Set(members?.map((m) => m.user_id) ?? []));
                      setShowEditProject(true);
                    }}
                    className="p-1 text-gray-400 hover:text-primary-600 rounded transition-colors"
                    title="Edit project"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {project.description && (
                <p className="text-sm text-gray-500 mt-1">{project.description}</p>
              )}
            </div>
          )}

          {/* Batch toolbar */}
          {checkedIds.size > 0 && (
            <div className="mb-4">
              <BatchToolbar
                selectedIds={Array.from(checkedIds)}
                projectId={projectId}
                onClear={() => setCheckedIds(new Set())}
              />
            </div>
          )}

          {/* Search + Filters */}
          <div className="flex items-center gap-2 sm:gap-3 mb-4 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search tasks..."
                className="text-xs border border-gray-200 rounded-md pl-7 pr-7 py-1.5 w-36 sm:w-48 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:w-52 sm:focus:w-64 transition-all"
              />
              {searchInput && (
                <button
                  onClick={clearSearch}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "")}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | "")}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">All Priorities</option>
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {/* Save current filters */}
            {(statusFilter || priorityFilter || listFilter) && (
              <button
                onClick={() => {
                  const name = prompt("Save filter as:");
                  if (!name?.trim()) return;
                  const filters: Record<string, string> = {};
                  if (statusFilter) filters.status = statusFilter;
                  if (priorityFilter) filters.priority = priorityFilter;
                  if (listFilter) filters.list_id = listFilter;
                  saveFilter.mutate({ name: name.trim(), filters_json: filters });
                }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary-600 transition-colors"
                title="Save current filters as a view"
              >
                <Bookmark className="w-3 h-3" />
                Save
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {tasksData?.total ?? 0} tasks
            </span>
          </div>

          {/* Task list grouped by lists */}
          {displayLists?.map((list) => {
            const listTasks = tasksByList.get(list.id) ?? [];
            const isCollapsed = collapsedLists.has(list.id);

            return (
              <div key={list.id} className="mb-6">
                {/* List header — clickable to toggle */}
                <div className="flex items-center gap-1.5 mb-2 px-1 py-1 group">
                  <button
                    onClick={() => toggleListCollapse(list.id)}
                    className="flex items-center gap-1.5 flex-1 min-w-0"
                  >
                    <ChevronRight strokeWidth={3} className={cn("w-4 h-4 text-gray-400 transition-transform duration-200", !isCollapsed && "rotate-90")} />
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: list.color || "#E6E7EB" }}
                    />
                    {editingListId === list.id ? (
                      <input
                        type="text"
                        value={editingListName}
                        onChange={(e) => setEditingListName(e.target.value)}
                        onBlur={() => {
                          if (editingListName.trim() && editingListName.trim() !== list.name) {
                            renameList.mutate({ id: list.id, name: editingListName.trim() });
                          } else {
                            setEditingListId(null);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setEditingListId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="text-xs font-semibold uppercase bg-white border border-primary-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    ) : (
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider truncate">{list.name}</span>
                    )}
                    <span className="text-xs text-gray-400 font-normal shrink-0">{list.task_count ?? listTasks.length}</span>
                  </button>

                  {/* Actions — always visible, stop propagation to header toggle */}
                  {canLists && editingListId !== list.id && (
                    <div className="flex items-center shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingListId(list.id); setEditingListName(list.name); }}
                        className="p-0.5 text-gray-300 hover:text-primary-600 transition-colors"
                        title="Rename list"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingList({ id: list.id, name: list.name, taskCount: listTasks.length });
                          setDeleteDestListId("");
                        }}
                        className="p-0.5 text-gray-300 hover:text-danger-500 transition-colors"
                        title="Delete list"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Tasks — hidden when collapsed */}
                {!isCollapsed && (() => {
                  const listTotal = list.task_count ?? 0;
                  const hasMore = listTasks.length < listTotal && !filtersActive;
                  return (
                <>
                {/* Load earlier tasks — at top of list */}
                {hasMore && (
                  <div className="text-center py-2">
                    <button
                      onClick={() => loadMoreTasks(list.id)}
                      disabled={loadingListId === list.id}
                      className="px-4 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 rounded-md hover:bg-primary-100 transition-colors disabled:opacity-50"
                    >
                      {loadingListId === list.id ? "Loading..." : `Load earlier tasks (${listTasks.length} of ${listTotal})`}
                    </button>
                  </div>
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleTaskDragEnd(list.id, listTasks, e)}>
                <SortableContext items={listTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {listTasks.map((task) => {
                    const sCfg = STATUS_CONFIG[task.status];
                    // pCfg removed — using PriorityBadge
                    const isChecked = checkedIds.has(task.id);
                    const statusBorder = { in_progress: "#e5a84b", completed: "#22c55e", no_progress: "#E6E7EB" }[task.status] ?? "#E6E7EB";

                    const hasSubtasks = task.subtask_count > 0;
                    const subtasksExpanded = expandedSubtasks.has(task.id);

                    return (
                      <SortableTaskRow key={task.id} id={task.id} statusBorder={statusBorder}>
                        <div
                          className={cn(
                            "flex items-center gap-2 px-2 py-3 hover:bg-gray-50 transition-colors cursor-pointer",
                            selectedTaskId === task.id && "bg-primary-50",
                            isChecked && "bg-primary-50/50",
                            activeRowId === task.id && !selectedTaskId && "bg-gray-50"
                          )}
                          onClick={() => { setSelectedTaskId(task.id); setActiveRowId(task.id); setPanelTabIndex(0); }}
                        >
                          <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0 cursor-grab hidden sm:block" />

                          <div onClick={(e) => toggleCheck(task.id, e)} className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", isChecked ? "bg-primary-600 border-primary-600" : "border-gray-300 hover:border-gray-400")}>
                            {isChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                          </div>

                          {/* Subtask chevron toggle — always visible */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSubtasksState(task.id); }}
                            className="p-0.5 shrink-0"
                          >
                            <ChevronRight strokeWidth={3} className={cn("w-4 h-4 text-gray-400 transition-transform duration-200", subtasksExpanded && "rotate-90")} />
                          </button>

                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <p className={cn("text-sm font-medium truncate", task.is_completed ? "text-gray-400 line-through" : "text-gray-900")}>{task.title}</p>
                            {hasSubtasks && (
                              <span className="text-[10px] text-gray-400 shrink-0">({task.subtask_count})</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            {task.comment_count > 0 && <span className="hidden sm:flex items-center gap-1 text-xs text-gray-400"><MessageSquare className="w-3 h-3" />{task.comment_count}</span>}
                            <PriorityBadge priority={task.priority} />
                            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", sCfg.bg, sCfg.color)}>{sCfg.label}</span>
                            {task.due_date && <span className="hidden sm:inline text-[10px] text-gray-400">{task.due_date}</span>}
                            {task.assignee_ids?.length > 0 && <span className="hidden sm:block"><AvatarStack userIds={task.assignee_ids} members={members} /></span>}
                          </div>
                        </div>

                        {/* Subtasks — only rendered when expanded */}
                        {subtasksExpanded && task.subtasks && task.subtasks.length > 0 && (
                          <div className="pl-14 sm:pl-16 pr-4 pb-1 space-y-0" onClick={(e) => e.stopPropagation()}>
                            <DndContext sensors={subtaskSensors} collisionDetection={closestCenter} onDragEnd={(e) => handleSubtaskDragEnd(task.id, task.subtasks!, e)}>
                            <SortableContext items={task.subtasks!.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                            {task.subtasks!.map((sub) => {
                              const subCfg = SUBTASK_STATUS_CONFIG[sub.status as SubtaskStatus] ?? SUBTASK_STATUS_CONFIG.no_progress;
                              const menuOpen = inlineSubtaskMenu === sub.id;
                              const isEditing = editingSubId === sub.id;
                              const isActive = activeRowId === sub.id;
                              return (
                              <SortableSubtaskRow key={sub.id} id={sub.id}>
                              <div
                                className={cn("flex items-center gap-2 py-1 px-1 -mx-1 rounded relative", isActive && "bg-primary-50/60")}
                                onClick={() => setActiveRowId(sub.id)}
                                onDoubleClick={() => startEditSub(sub.id, sub.title)}
                              >
                                <button onClick={() => setInlineSubtaskMenu(menuOpen ? null : sub.id)} className={cn("text-sm shrink-0 leading-none", subCfg.color)} title={subCfg.label}>
                                  {subCfg.icon}
                                </button>
                                {menuOpen && (
                                  <div className="absolute left-4 top-0 w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1">
                                    {Object.entries(SUBTASK_STATUS_CONFIG).map(([key, cfg]) => (
                                      <button key={key} onClick={() => { setSubtaskStatusInline.mutate({ id: sub.id, status: key }); setInlineSubtaskMenu(null); }} className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors", sub.status === key && "bg-primary-50")}>
                                        <span className={cn("text-sm leading-none", cfg.color)}>{cfg.icon}</span>
                                        <span className="text-gray-700">{cfg.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingSubTitle}
                                    onChange={(e) => setEditingSubTitle(e.target.value)}
                                    onBlur={() => saveEditSub(sub.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { e.preventDefault(); saveEditSub(sub.id); }
                                      if (e.key === "Escape") setEditingSubId(null);
                                    }}
                                    autoFocus
                                    className="flex-1 text-[11px] bg-white border border-primary-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                  />
                                ) : (
                                  <span className={cn("text-[11px] flex-1 min-w-0 truncate", sub.status === "completed" ? "text-gray-400 line-through" : "text-gray-500")}>{sub.title}</span>
                                )}
                              </div>
                              </SortableSubtaskRow>
                              );
                            })}
                            </SortableContext>
                            </DndContext>

                            {/* Quick add subtask */}
                            {addingSubForTask === task.id ? (
                              <div className="flex items-center gap-2 py-1 px-1 -mx-1">
                                <Plus className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                                <input
                                  type="text"
                                  value={newSubTitle}
                                  onChange={(e) => setNewSubTitle(e.target.value)}
                                  onBlur={() => { if (!newSubTitle.trim()) { setAddingSubForTask(null); setNewSubTitle(""); } }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && newSubTitle.trim()) {
                                      createSubtaskInline.mutate({ taskId: task.id, title: newSubTitle.trim() });
                                    }
                                    if (e.key === "Escape") { setAddingSubForTask(null); setNewSubTitle(""); }
                                  }}
                                  placeholder="Subtask title..."
                                  autoFocus
                                  className="flex-1 text-[11px] bg-white border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                />
                              </div>
                            ) : (
                              <button
                                onClick={() => setAddingSubForTask(task.id)}
                                className={cn(
                                  "flex items-center gap-1.5 py-1 px-1 -mx-1 rounded text-[11px] text-gray-400 hover:text-primary-600 transition-colors",
                                  activeRowId === `add-sub-${task.id}` && "bg-primary-50/60 text-primary-600"
                                )}
                              >
                                <Plus className="w-3 h-3" />
                                Add subtask
                              </button>
                            )}
                          </div>
                        )}

                        {/* Quick add when subtasks expanded but empty */}
                        {subtasksExpanded && (!task.subtasks || task.subtasks.length === 0) && (
                          <div className="pl-14 sm:pl-16 pr-4 pb-1" onClick={(e) => e.stopPropagation()}>
                            {addingSubForTask === task.id ? (
                              <div className="flex items-center gap-2 py-1">
                                <Plus className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                                <input
                                  type="text"
                                  value={newSubTitle}
                                  onChange={(e) => setNewSubTitle(e.target.value)}
                                  onBlur={() => { if (!newSubTitle.trim()) { setAddingSubForTask(null); setNewSubTitle(""); } }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && newSubTitle.trim()) {
                                      createSubtaskInline.mutate({ taskId: task.id, title: newSubTitle.trim() });
                                    }
                                    if (e.key === "Escape") { setAddingSubForTask(null); setNewSubTitle(""); }
                                  }}
                                  placeholder="Subtask title..."
                                  autoFocus
                                  className="flex-1 text-[11px] bg-white border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                />
                              </div>
                            ) : (
                              <button
                                onClick={() => setAddingSubForTask(task.id)}
                                className={cn(
                                  "flex items-center gap-1.5 py-1 px-1 -mx-1 rounded text-[11px] text-gray-400 hover:text-primary-600 transition-colors",
                                  activeRowId === `add-sub-${task.id}` && "bg-primary-50/60 text-primary-600"
                                )}
                              >
                                <Plus className="w-3 h-3" />
                                Add subtask
                              </button>
                            )}
                          </div>
                        )}
                      </SortableTaskRow>
                    );
                  })}

                  {listTasks.length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-400">No tasks</p>
                  )}

                  <QuickAddTask projectId={projectId} listId={list.id} />
                </div>
                </SortableContext>
                </DndContext>

                </>
                  );
                })()}
              </div>
            );
          })}

          {/* Empty state when search/filters return nothing */}
          {rawTasks.length === 0 && filtersActive && (
            <div className="text-center py-12">
              <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">No tasks found</p>
              <p className="text-xs text-gray-400 mt-1">Try a different keyword or adjust your filters</p>
              {searchInput && (
                <button onClick={clearSearch} className="mt-3 text-xs text-primary-600 hover:text-primary-700 font-medium">
                  Clear search
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Task detail panel */}
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          projectId={projectId}
          onClose={() => setSelectedTaskId(null)}
          activeTabIndex={panelTabIndex}
          onTabChange={setPanelTabIndex}
        />
      )}

      {/* Add task modal */}
      {showAddTask && (
        <AddTaskModal
          projectId={projectId}
          defaultListId={listFilter ?? undefined}
          onClose={() => setShowAddTask(false)}
        />
      )}

      {/* Delete list confirmation modal */}
      {deletingList && (() => {
        const otherLists = lists?.filter((l) => l.id !== deletingList.id && !l.is_archived) ?? [];
        const hasTasks = deletingList.taskCount > 0;
        const isOnlyList = hasTasks && otherLists.length === 0;

        return (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => { setDeletingList(null); setDeleteDestListId(""); }}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 lg:mx-0" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-danger-600">Delete List</h2>
                <button onClick={() => { setDeletingList(null); setDeleteDestListId(""); }} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-4">
                {isOnlyList ? (
                  <>
                    <p className="text-sm text-gray-700">
                      The list <span className="font-semibold">&quot;{deletingList.name}&quot;</span> contains{" "}
                      <span className="font-semibold">{deletingList.taskCount} task{deletingList.taskCount !== 1 ? "s" : ""}</span> and is the only list in this project.
                      You must create another list first so tasks can be moved before deleting.
                    </p>
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => { setDeletingList(null); setDeleteDestListId(""); }}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        OK
                      </button>
                    </div>
                  </>
                ) : hasTasks ? (
                  <>
                    <p className="text-sm text-gray-700">
                      The list <span className="font-semibold">&quot;{deletingList.name}&quot;</span> contains{" "}
                      <span className="font-semibold">{deletingList.taskCount} task{deletingList.taskCount !== 1 ? "s" : ""}</span>.
                      Choose a list to move them to before deleting.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Move tasks to *</label>
                      <select
                        value={deleteDestListId}
                        onChange={(e) => setDeleteDestListId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Select a list...</option>
                        {otherLists.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => { setDeletingList(null); setDeleteDestListId(""); }}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteList.mutate({ id: deletingList.id, destinationListId: deleteDestListId })}
                        disabled={deleteList.isPending || !deleteDestListId}
                        className="px-4 py-2 text-sm font-medium text-white bg-danger-600 rounded-lg hover:bg-danger-700 disabled:opacity-50 transition-colors"
                      >
                        {deleteList.isPending ? "Deleting..." : "Move Tasks & Delete List"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-700">
                      Are you sure you want to delete the list <span className="font-semibold">&quot;{deletingList.name}&quot;</span>?
                      This list is empty and will be removed permanently.
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => { setDeletingList(null); setDeleteDestListId(""); }}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteList.mutate({ id: deletingList.id })}
                        disabled={deleteList.isPending}
                        className="px-4 py-2 text-sm font-medium text-white bg-danger-600 rounded-lg hover:bg-danger-700 disabled:opacity-50 transition-colors"
                      >
                        {deleteList.isPending ? "Deleting..." : "Delete List"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit project modal */}
      {showEditProject && project && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowEditProject(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] mx-4 lg:mx-0 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
              <h2 className="text-sm font-semibold">Edit Project</h2>
              <button onClick={() => setShowEditProject(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-4 overflow-auto flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={editProjectDesc}
                  onChange={(e) => setEditProjectDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Members */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Members</label>
                <p className="text-[10px] text-gray-400 mb-2">Project owner cannot be removed</p>
                <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                  {allUsers.map((u) => {
                    const isSelected = editProjectMembers.has(u.id);
                    const isOwner = u.id === project.owner_id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          if (isOwner) return;
                          setEditProjectMembers((prev) => {
                            const next = new Set(prev);
                            if (next.has(u.id)) next.delete(u.id);
                            else next.add(u.id);
                            return next;
                          });
                        }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors",
                          isSelected && "bg-primary-50/50",
                          isOwner && "opacity-60 cursor-default"
                        )}
                      >
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: u.color || "#E6E7EB" }}>
                          {u.full_name.charAt(0)}
                        </span>
                        <div className="text-left min-w-0 flex-1">
                          <span className="text-xs text-gray-700 block truncate">{u.full_name}{isOwner ? " (owner)" : ""}</span>
                          <span className="text-[10px] text-gray-400 block truncate">{u.email}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowEditProject(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button
                  onClick={handleSaveProject}
                  disabled={!editProjectName.trim() || savingProject}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {savingProject ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
