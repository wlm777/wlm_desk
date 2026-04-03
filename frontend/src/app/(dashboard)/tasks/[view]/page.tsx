"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Search, X, CheckCircle, Inbox } from "lucide-react";
import { Header } from "@/components/header";
import { TaskDetailPanel } from "@/components/task-detail-panel";
import { PriorityBadge } from "@/components/priority-picker";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/lib/constants";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { GlobalTask, PaginatedResponse, TaskStatus, TaskPriority, User } from "@/lib/types";

const PAGE_SIZE = 30;

const VIEW_CONFIG: Record<string, { title: string; subtitle: string; emptyText: string; params: Record<string, string> }> = {
  my: { title: "My Tasks", subtitle: "Tasks assigned to you across all projects", emptyText: "You have no assigned tasks. Nice!", params: { assignee_id: "__me__" } },
  "in-progress": { title: "In Progress", subtitle: "All tasks currently being worked on", emptyText: "No tasks are in progress right now", params: { status: "in_progress" } },
  "due-today": { title: "Due Today", subtitle: "Tasks due today across all projects", emptyText: "Nothing due today!", params: { due_mode: "due_today" } },
  overdue: { title: "Overdue", subtitle: "Tasks past their due date", emptyText: "No overdue tasks. Great job!", params: { due_mode: "overdue" } },
  "high-priority": { title: "High Priority", subtitle: "All high-priority tasks", emptyText: "No high-priority tasks", params: { priority: "high" } },
  unassigned: { title: "Unassigned", subtitle: "Tasks with no assignee", emptyText: "All tasks have assignees", params: { assignee_id: "__none__" } },
  completed: { title: "Completed", subtitle: "All completed tasks", emptyText: "No completed tasks yet", params: { status: "completed" } },
};

export default function GlobalTasksPage() {
  const params = useParams();
  const router = useRouter();
  const view = params.view as string;

  // User-by-id view: /tasks/user-{uuid}
  const isUserView = view?.startsWith("user-");
  const userId = isUserView ? view.replace("user-", "") : null;

  // Resolve user name for user views
  const { data: viewUser } = useQuery<User>({
    queryKey: ["user", userId],
    queryFn: () => api.get(`/api/v1/users/${userId}`),
    enabled: !!userId,
  });

  const config = isUserView
    ? {
        title: viewUser ? `${viewUser.full_name}'s Tasks` : "User Tasks",
        subtitle: viewUser ? `Tasks assigned to ${viewUser.full_name}` : "Tasks assigned to this user across all projects",
        emptyText: "No tasks assigned to this user",
        params: { assignee_id: userId! },
      }
    : VIEW_CONFIG[view];

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  // Debounce search
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === debouncedSearch) return;
    const timer = setTimeout(() => setDebouncedSearch(trimmed), 300);
    return () => clearTimeout(timer);
  }, [searchInput, debouncedSearch]);

  const buildParams = useCallback((offset: number) => {
    const p = new URLSearchParams({
      limit: String(PAGE_SIZE), offset: String(offset),
      newest_first: "true",
      ...config?.params,
    });
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (statusFilter && !config?.params.status) p.set("status", statusFilter);
    if (priorityFilter && !config?.params.priority) p.set("priority", priorityFilter);
    return p;
  }, [config?.params, debouncedSearch, statusFilter, priorityFilter]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<PaginatedResponse<GlobalTask>>({
    queryKey: ["global-tasks", view, debouncedSearch, statusFilter, priorityFilter],
    queryFn: ({ pageParam }) => api.get(`/api/v1/tasks/global?${buildParams(pageParam as number)}`),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: !!config,
  });

  if (!config) {
    return (
      <div className="flex flex-col h-full">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Unknown view</p>
        </div>
      </div>
    );
  }

  // Data arrives newest-first; reverse for chronological display (oldest at top)
  const rawTasks = data?.pages.flatMap((p) => p.items) ?? [];
  const allTasks = [...rawTasks].reverse();
  const total = data?.pages[0]?.total ?? 0;

  // Group tasks by project (preserves chronological order within groups)
  const grouped = new Map<string, { projectName: string; projectId: string; tasks: GlobalTask[] }>();
  for (const t of allTasks) {
    if (!grouped.has(t.project_id)) {
      grouped.set(t.project_id, { projectName: t.project_name, projectId: t.project_id, tasks: [] });
    }
    grouped.get(t.project_id)!.tasks.push(t);
  }

  const selectedTask = selectedTaskId ? allTasks.find((t) => t.id === selectedTaskId) : null;
  const hasFilters = !!debouncedSearch || !!statusFilter || !!priorityFilter;

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <div className="flex-1 overflow-auto">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-3 sm:px-6 py-3">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => router.push("/")}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-semibold text-gray-900">{config.title}</h1>
                <p className="text-xs text-gray-500">
                  {total} task{total !== 1 ? "s" : ""} &middot; {config.subtitle}
                </p>
              </div>
            </div>

            {/* Search + filter bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[140px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Filter tasks..."
                  className="w-full text-xs border border-gray-200 rounded-md pl-8 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                {searchInput && (
                  <button
                    onClick={() => { setSearchInput(""); setDebouncedSearch(""); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              {/* Status filter (hidden if view already filters by status) */}
              {!config.params.status && (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">All Statuses</option>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              )}
              {/* Priority filter (hidden if view already filters by priority) */}
              {!config.params.priority && (
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">All Priorities</option>
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="p-3 sm:p-6">
            {/* Loading skeleton */}
            {isLoading && (
              <div className="space-y-4">
                {/* Skeleton group header */}
                <div className="animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-32 mb-2" />
                  <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-50">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="h-4 bg-gray-100 rounded w-3/5 mb-1.5" />
                          <div className="h-3 bg-gray-50 rounded w-2/5" />
                        </div>
                        <div className="flex gap-2">
                          <div className="h-4 w-10 bg-gray-100 rounded" />
                          <div className="h-4 w-16 bg-gray-100 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!isLoading && allTasks.length === 0 && (
              <div className="text-center py-20">
                {hasFilters ? (
                  <>
                    <Search className="w-10 h-10 text-gray-200 mx-auto mb-4" />
                    <p className="text-sm font-medium text-gray-500">No tasks match your filters</p>
                    <p className="text-xs text-gray-400 mt-1">Try adjusting your search or filters</p>
                    <button
                      onClick={() => { setSearchInput(""); setDebouncedSearch(""); setStatusFilter(""); setPriorityFilter(""); }}
                      className="mt-4 text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Clear filters
                    </button>
                  </>
                ) : (
                  <>
                    <Inbox className="w-10 h-10 text-gray-200 mx-auto mb-4" />
                    <p className="text-sm font-medium text-gray-500">{config.emptyText}</p>
                    <button
                      onClick={() => router.push("/")}
                      className="mt-4 text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Go to Dashboard
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Load earlier tasks — at top */}
            {hasNextPage && (
              <div className="text-center py-3 mb-2">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="px-5 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50"
                >
                  {isFetchingNextPage ? "Loading..." : `Load earlier tasks (${allTasks.length} of ${total})`}
                </button>
              </div>
            )}

            {/* All loaded indicator — at top when everything is loaded */}
            {!isLoading && !hasNextPage && allTasks.length > 0 && total > PAGE_SIZE && (
              <p className="text-center text-xs text-gray-400 py-2 mb-2">All tasks loaded</p>
            )}

            {/* Tasks grouped by project */}
            {Array.from(grouped.values()).map((group) => (
              <div key={group.projectId} className="mb-5">
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <button
                    onClick={() => router.push(`/projects/${group.projectId}`)}
                    className="text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-primary-600 transition-colors"
                  >
                    {group.projectName}
                  </button>
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{group.tasks.length}</span>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-50">
                  {group.tasks.map((task) => {
                    const sCfg = STATUS_CONFIG[task.status as TaskStatus] ?? STATUS_CONFIG.no_progress;
                    const statusBorder = { in_progress: "#e5a84b", completed: "#22c55e", no_progress: "#E6E7EB" }[task.status] ?? "#E6E7EB";
                    return (
                      <button
                        key={task.id}
                        onClick={() => setSelectedTaskId(task.id)}
                        className={cn(
                          "w-full flex items-center gap-2 sm:gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors",
                          selectedTaskId === task.id && "bg-primary-50"
                        )}
                        style={{ borderLeft: `3px solid ${statusBorder}` }}
                      >
                        {/* Title + context */}
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium truncate", task.is_completed ? "text-gray-400 line-through" : "text-gray-900")}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-gray-400 truncate">{task.list_name}</span>
                            {task.due_date && (
                              <>
                                <span className="text-gray-300">&middot;</span>
                                <span className={cn("text-[11px]", task.status !== "completed" && new Date(task.due_date) < new Date() ? "text-danger-500 font-medium" : "text-gray-400")}>
                                  {task.due_date}
                                </span>
                              </>
                            )}
                            {task.assignee_ids?.length > 0 && (
                              <>
                                <span className="text-gray-300 hidden sm:inline">&middot;</span>
                                <span className="hidden sm:inline text-[11px] text-gray-400">
                                  {task.assignee_ids.length} assignee{task.assignee_ids.length > 1 ? "s" : ""}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Metadata */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <PriorityBadge priority={task.priority} />
                          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded hidden sm:inline", sCfg.bg, sCfg.color)}>{sCfg.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

          </div>
        </div>
      </div>

      {/* Task detail panel */}
      {selectedTaskId && selectedTask && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          projectId={selectedTask.project_id}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
