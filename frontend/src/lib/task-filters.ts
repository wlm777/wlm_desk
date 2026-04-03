import type { TaskStatus, TaskPriority } from "./types";

export interface TaskFilters {
  status: TaskStatus | "";
  priority: TaskPriority | "";
  assignee_id: string;
  due_mode: string;
  list_id: string;
  search: string;
}

/** Parse task filters from URL search params. Single source of truth. */
export function parseTaskFilters(searchParams: URLSearchParams): TaskFilters {
  return {
    status: (searchParams.get("status") as TaskStatus) || "",
    priority: (searchParams.get("priority") as TaskPriority) || "",
    assignee_id: searchParams.get("assignee_id") || "",
    due_mode: searchParams.get("due_mode") || "",
    list_id: searchParams.get("list") || "",
    search: searchParams.get("search") || "",
  };
}

/** Build API query string from filters. Only includes non-empty values. */
export function buildTaskQueryParams(filters: TaskFilters, limit = 100): URLSearchParams {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (filters.list_id) params.set("list_id", filters.list_id);
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.assignee_id) params.set("assignee_id", filters.assignee_id);
  if (filters.due_mode) params.set("due_mode", filters.due_mode);
  if (filters.search) params.set("search", filters.search);
  return params;
}

/** Check if any filter is active. */
export function hasActiveFilters(filters: TaskFilters): boolean {
  return !!(filters.status || filters.priority || filters.assignee_id || filters.due_mode || filters.list_id || filters.search);
}

/** Build a stable React Query key from filters. */
export function taskQueryKey(projectId: string, filters: TaskFilters): unknown[] {
  return ["tasks", projectId, filters.list_id, filters.status, filters.priority, filters.assignee_id, filters.due_mode, filters.search];
}
