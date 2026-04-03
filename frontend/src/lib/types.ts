// Enums matching backend
export type UserRole = "admin" | "manager" | "user";
export type TaskStatus = "no_progress" | "in_progress" | "completed";
export type TaskPriority = "none" | "low" | "medium" | "high";
export type SubtaskStatus = "no_progress" | "in_progress" | "completed";

// Entities
export interface User {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  timezone: string;
  is_active: boolean;
  color: string | null;
  slack_webhook_url: string | null;
  slack_enabled: boolean;
  notify_daily_new_tasks: boolean;
  notify_daily_in_progress: boolean;
  notify_comment: boolean;
  notify_task_created: boolean;
  notify_task_updated: boolean;
  notify_watcher: boolean;
  notify_task_assigned: boolean;
  notify_subtask: boolean;
  notify_file_upload: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  description_rich: Record<string, unknown> | null;
  owner_id: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  task_count?: number;
  member_count?: number;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  added_at: string;
  full_name: string;
  email: string;
  color: string | null;
}

export interface TaskList {
  id: string;
  project_id: string;
  name: string;
  position: number;
  color: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  task_count: number;
}

export interface Task {
  id: string;
  project_id: string;
  list_id: string;
  title: string;
  description_plain: string | null;
  description_rich: Record<string, unknown> | null;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: string | null;
  due_date: string | null;
  sort_order: number;
  created_by_id: string;
  is_completed: boolean;
  is_archived: boolean;
  last_activity_at: string;
  updated_by_id: string | null;
  created_at: string;
  updated_at: string;
  subtask_count: number;
  comment_count: number;
  assignee_ids: string[];
  subtasks?: { id: string; title: string; status: SubtaskStatus; is_completed: boolean; sort_order: number }[];
}

export interface GlobalTask extends Task {
  project_name: string;
  list_name: string;
}

export interface Attachment {
  id: string;
  task_id: string;
  file_name: string;
  file_size: number;
  uploaded_by: string;
  mime_type: string | null;
  is_image: boolean;
  preview_url: string | null;
  thumb_url: string | null;
  view_url: string | null;
  download_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWatcher {
  id: string;
  task_id: string;
  user_id: string;
  added_at: string;
}

export interface TaskAssignee {
  id: string;
  task_id: string;
  user_id: string;
  assigned_at: string;
}

export interface Comment {
  id: string;
  task_id: string;
  parent_id: string | null;
  author_id: string;
  content: string;
  content_rich: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  status: SubtaskStatus;
  sort_order: number;
  is_completed: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  items: Notification[];
  unread_count: number;
}

export interface ActivityEvent {
  id: string;
  entity_type: string;
  action: string;
  actor_name: string;
  description: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string;
  payload_json: Record<string, unknown> | null;
  created_at: string;
}

export interface DashboardSummary {
  my_tasks_count: number;
  in_progress_count: number;
  due_today_count: number;
  overdue_count: number;
  projects_count: number;
}

export interface WorkloadItem {
  user_id: string;
  full_name: string;
  email: string;
  color: string | null;
  active_task_count: number;
}

export interface StuckTask {
  id: string;
  title: string;
  project_id: string;
  project_name: string;
  priority: string;
  due_date: string | null;
  last_activity_at: string;
  assignee_names: string[];
}

export interface SavedFilter {
  id: string;
  user_id: string;
  name: string;
  filters_json: Record<string, string>;
  created_at: string;
  updated_at: string;
}

// Generic paginated response
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// Auth
export interface TokenResponse {
  access_token: string;
  token_type: string;
}
