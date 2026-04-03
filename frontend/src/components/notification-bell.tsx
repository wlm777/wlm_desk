"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { NotificationsResponse } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

const NOTIF_LABELS: Record<string, string> = {
  task_assigned: "assigned you a task",
  comment_added: "commented on a task",
  mention: "mentioned you in a comment",
  watcher_comment: "commented on a task you watch",
  due_reminder: "task is due",  // fallback; overridden by due_state below
};

const DUE_STATE_LABELS: Record<string, string> = {
  due_today: "Task is due today",
  overdue: "Task is overdue",
};

export function NotificationBell() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: () => api.get("/api/v1/notifications?limit=20"),
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch("/api/v1/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = data?.unread_count ?? 0;
  const notifications = data?.items ?? [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-96 flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No notifications</p>
            ) : (
              notifications.map((n) => {
                const payload = n.payload ?? {};
                const isSystem = n.type === "due_reminder";
                const dueState = typeof payload.due_state === "string" ? payload.due_state : "";
                const label = isSystem && dueState
                  ? (DUE_STATE_LABELS[dueState] || NOTIF_LABELS[n.type] || n.type)
                  : (NOTIF_LABELS[n.type] || n.type);
                const actor = isSystem ? "" : (payload.assigned_by || payload.author || "") as string;
                const taskTitle = (payload.task_title || "") as string;

                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.is_read) markRead.mutate(n.id);
                      const pId = payload.project_id as string | undefined;
                      const tId = payload.task_id as string | undefined;
                      if (pId && tId) {
                        router.push(`/projects/${pId}?task=${tId}`);
                        setOpen(false);
                      }
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors",
                      !n.is_read && "bg-primary-50/50"
                    )}
                  >
                    <p className="text-sm text-gray-700">
                      {actor ? (
                        <><span className="font-medium">{actor}</span> {label}</>
                      ) : (
                        <span className="capitalize">{label}</span>
                      )}
                    </p>
                    {taskTitle && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {taskTitle}
                        {isSystem && typeof payload.due_date === "string" && (
                          <span className="text-danger-500 ml-1">(due {payload.due_date})</span>
                        )}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
