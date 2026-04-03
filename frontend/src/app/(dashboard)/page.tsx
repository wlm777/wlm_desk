"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Clock, AlertTriangle, FolderKanban, User as UserIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Header } from "@/components/header";
import { api } from "@/lib/api";
import { PRIORITY_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DashboardSummary, WorkloadItem, StuckTask, TaskPriority } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();

  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery<DashboardSummary>({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/api/v1/dashboard/summary"),
  });

  const { data: workload, isLoading: workloadLoading } = useQuery<WorkloadItem[]>({
    queryKey: ["dashboard-workload"],
    queryFn: () => api.get("/api/v1/dashboard/workload"),
  });

  const { data: stuck, isLoading: stuckLoading } = useQuery<StuckTask[]>({
    queryKey: ["dashboard-stuck"],
    queryFn: () => api.get("/api/v1/dashboard/stuck"),
  });

  const cards = summary
    ? [
        {
          label: "My Tasks", value: summary.my_tasks_count, icon: UserIcon,
          color: "text-primary-600 bg-primary-50",
          onClick: () => router.push("/tasks/my"),
        },
        {
          label: "In Progress", value: summary.in_progress_count, icon: Clock,
          color: "text-primary-600 bg-primary-50",
          onClick: () => router.push("/tasks/in-progress"),
        },
        {
          label: "Due Today", value: summary.due_today_count, icon: AlertTriangle,
          color: "text-warning-700 bg-warning-50",
          onClick: () => router.push("/tasks/due-today"),
        },
        {
          label: "Overdue", value: summary.overdue_count, icon: AlertTriangle,
          color: "text-danger-700 bg-danger-50",
          onClick: () => router.push("/tasks/overdue"),
        },
        {
          label: "Projects", value: summary.projects_count, icon: FolderKanban,
          color: "text-success-700 bg-success-50",
          onClick: () => router.push("/projects"),
        },
      ]
    : [];

  const maxTasks = workload?.length
    ? Math.max(...workload.map((w) => w.active_task_count), 1)
    : 1;

  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex-1 p-3 sm:p-6 overflow-auto">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Dashboard</h1>

        {summaryError && (
          <p className="text-sm text-danger-500 mb-4">Failed to load dashboard data</p>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {summaryLoading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
              <div className="w-8 h-8 bg-gray-100 rounded-lg mb-3" />
              <div className="w-12 h-6 bg-gray-100 rounded mb-1" />
              <div className="w-16 h-4 bg-gray-100 rounded" />
            </div>
          ))}
          {cards.map((card) => (
            <button
              key={card.label}
              onClick={card.onClick}
              className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:shadow-md hover:border-gray-300 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${card.color}`}>
                  <card.icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
              <p className="text-sm text-gray-500 mt-1">{card.label}</p>
            </button>
          ))}
        </div>

        {/* Workload + Stuck side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team Workload */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Team Workload</h2>
            {workloadLoading ? (
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-100" />
                    <div className="flex-1"><div className="h-4 bg-gray-100 rounded w-2/3 mb-1" /><div className="h-1.5 bg-gray-100 rounded" /></div>
                  </div>
                ))}
              </div>
            ) : workload && workload.length > 0 ? (
              <div className="space-y-1">
                {workload.map((w) => (
                  <button
                    key={w.user_id}
                    onClick={() => router.push(`/tasks/user-${w.user_id}`)}
                    className="w-full flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: w.color || "#7BAE8A" }}>
                      {w.full_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm text-gray-700 truncate">{w.full_name}</p>
                        <span className="text-xs text-gray-500 shrink-0 ml-2">
                          {w.active_task_count} task{w.active_task_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full transition-all"
                          style={{ width: `${(w.active_task_count / maxTasks) * 100}%` }}
                        />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No active tasks</p>
            )}
          </div>

          {/* Stuck Tasks */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              Stuck Tasks
              <span className="text-xs text-gray-400 font-normal ml-1">(no activity {">"}5 days)</span>
            </h2>
            {stuckLoading ? (
              <div className="space-y-2 animate-pulse">
                {[1, 2].map((i) => (
                  <div key={i} className="p-3 border border-gray-100 rounded-lg">
                    <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : stuck && stuck.length > 0 ? (
              <div className="space-y-2">
                {stuck.map((t) => {
                  const pCfg = PRIORITY_CONFIG[t.priority as TaskPriority] ?? PRIORITY_CONFIG.none;
                  return (
                    <button
                      key={t.id}
                      onClick={() => router.push(`/projects/${t.project_id}?task=${t.id}`)}
                      className="w-full text-left p-3 border border-gray-100 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate flex-1">{t.title}</p>
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", pCfg.bg, pCfg.color)}>
                          {pCfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{t.project_name}</span>
                        <span>&middot;</span>
                        <span title={new Date(t.last_activity_at).toLocaleString()}>
                          last activity {formatDistanceToNow(new Date(t.last_activity_at), { addSuffix: true })}
                        </span>
                      </div>
                      {t.assignee_names.length > 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          {t.assignee_names.join(", ")}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No stuck tasks</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
