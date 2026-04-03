import type { TaskStatus, TaskPriority, SubtaskStatus } from "./types";

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; icon: string; iconColor: string }> = {
  no_progress: { label: "No Progress", color: "text-gray-600", bg: "bg-gray-100", icon: "○", iconColor: "#9ca3af" },
  in_progress: { label: "In Progress", color: "text-warning-700", bg: "bg-warning-50", icon: "◐", iconColor: "#e5a84b" },
  completed: { label: "Completed", color: "text-success-700", bg: "bg-success-50", icon: "●", iconColor: "#22c55e" },
};

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string; flag: string }> = {
  none: { label: "None", color: "text-gray-400", bg: "bg-gray-100", flag: "#9ca3af" },
  low: { label: "Low", color: "text-green-700", bg: "bg-green-100", flag: "#86C067" },
  medium: { label: "Medium", color: "text-amber-700", bg: "bg-amber-100", flag: "#E5A84B" },
  high: { label: "High", color: "text-red-600", bg: "bg-red-100", flag: "#E06054" },
};

export const SUBTASK_STATUS_CONFIG: Record<SubtaskStatus, { label: string; icon: string; color: string }> = {
  no_progress: { label: "No Progress", icon: "○", color: "text-gray-400" },
  in_progress: { label: "In Progress", icon: "◐", color: "text-warning-500" },
  completed: { label: "Completed", icon: "●", color: "text-success-500" },
};
