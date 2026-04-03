"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, X, Check as CheckIcon, Eye, EyeOff, Copy, RefreshCw } from "lucide-react";
import { Header } from "@/components/header";
import { TimezonePicker } from "@/components/timezone-picker";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { validatePassword, isPasswordStrong } from "@/lib/password";
import { cn } from "@/lib/utils";
import { canManageUsers } from "@/lib/permissions";
import { AccessDenied } from "@/components/access-denied";
import type { User, PaginatedResponse } from "@/lib/types";

const ROLE_LABELS: Record<string, string> = { admin: "Admin", manager: "Manager", user: "User" };
const ROLE_COLORS: Record<string, string> = { admin: "bg-danger-50 text-danger-700", manager: "bg-warning-50 text-warning-700", user: "bg-gray-100 text-gray-600" };

interface UserForm {
  full_name: string;
  email: string;
  role: string;
  timezone: string;
  password: string;
  slack_webhook_url: string;
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
}

const emptyForm: UserForm = {
  full_name: "", email: "", role: "user", timezone: "UTC", password: "",
  slack_webhook_url: "", slack_enabled: false,
  notify_daily_new_tasks: true, notify_daily_in_progress: true,
  notify_comment: true, notify_task_created: true, notify_task_updated: true,
  notify_watcher: true, notify_task_assigned: true, notify_subtask: true, notify_file_upload: true,
};

function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  let pw = "";
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += digits[Math.floor(Math.random() * digits.length)];
  pw += special[Math.floor(Math.random() * special.length)];
  for (let i = 4; i < 14; i++) pw += all[Math.floor(Math.random() * all.length)];
  return pw.split("").sort(() => Math.random() - 0.5).join("");
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [deleteMode, setDeleteMode] = useState<"reassign" | "keep">("keep");

  const { data } = useQuery<PaginatedResponse<User>>({
    queryKey: ["users"],
    queryFn: () => api.get("/api/v1/users?limit=100"),
    enabled: canManageUsers(currentUser?.role ?? "user"),
  });

  const createUser = useMutation({
    mutationFn: (body: UserForm) => api.post("/api/v1/users", body as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeModal();
      setSuccessMsg("User created successfully");
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, any> }) => api.put(`/api/v1/users/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeModal();
      setSuccessMsg("User updated successfully");
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: ({ id, reassignTo: rTo }: { id: string; reassignTo?: string }) =>
      api.delete(`/api/v1/users/${id}`, rTo ? { reassign_to: rTo } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeModal();
      setDeleteConfirm(false);
      setSuccessMsg("User deleted successfully");
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (e: Error) => setError(e.message),
  });

  function openCreate() {
    setEditingUser(null);
    setForm({ ...emptyForm, password: generatePassword() });
    setShowPassword(true);
    setError("");
    setShowModal(true);
  }

  function openEdit(u: User) {
    setEditingUser(u);
    setForm({
      full_name: u.full_name, email: u.email, role: u.role, timezone: u.timezone, password: "",
      slack_webhook_url: u.slack_webhook_url || "", slack_enabled: u.slack_enabled,

      notify_daily_new_tasks: u.notify_daily_new_tasks, notify_daily_in_progress: u.notify_daily_in_progress,
      notify_comment: u.notify_comment, notify_task_created: u.notify_task_created,
      notify_task_updated: u.notify_task_updated, notify_watcher: u.notify_watcher,
      notify_task_assigned: u.notify_task_assigned, notify_subtask: u.notify_subtask, notify_file_upload: u.notify_file_upload,
    });
    setError("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingUser(null);
    setForm(emptyForm);
    setError("");
    setShowPassword(false);
    setDeleteConfirm(false);
    setReassignTo("");
    setDeleteMode("keep");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.slack_webhook_url && !form.slack_webhook_url.startsWith("https://hooks.slack.com/")) {
      setError("Slack webhook URL must start with https://hooks.slack.com/");
      return;
    }
    if (form.slack_enabled && !form.slack_webhook_url) {
      setError("Webhook URL is required when Slack is enabled");
      return;
    }
    if (editingUser) {
      const body: Record<string, any> = {};
      if (form.full_name !== editingUser.full_name) body.full_name = form.full_name;
      if (form.email !== editingUser.email) body.email = form.email;
      if (form.role !== editingUser.role) body.role = form.role;
      if (form.timezone !== editingUser.timezone) body.timezone = form.timezone;
      if (form.password) {
        if (!isPasswordStrong(form.password)) { setError("Password does not meet requirements"); return; }
        body.password = form.password;
      }
      // Slack + notification fields
      if (form.slack_webhook_url !== (editingUser.slack_webhook_url || "")) body.slack_webhook_url = form.slack_webhook_url || null;
      if (form.slack_enabled !== editingUser.slack_enabled) body.slack_enabled = form.slack_enabled;

      if (form.notify_daily_new_tasks !== editingUser.notify_daily_new_tasks) body.notify_daily_new_tasks = form.notify_daily_new_tasks;
      if (form.notify_daily_in_progress !== editingUser.notify_daily_in_progress) body.notify_daily_in_progress = form.notify_daily_in_progress;
      if (form.notify_comment !== editingUser.notify_comment) body.notify_comment = form.notify_comment;
      if (form.notify_task_created !== editingUser.notify_task_created) body.notify_task_created = form.notify_task_created;
      if (form.notify_task_updated !== editingUser.notify_task_updated) body.notify_task_updated = form.notify_task_updated;
      if (form.notify_watcher !== editingUser.notify_watcher) body.notify_watcher = form.notify_watcher;
      if (form.notify_task_assigned !== editingUser.notify_task_assigned) body.notify_task_assigned = form.notify_task_assigned;
      if (form.notify_subtask !== editingUser.notify_subtask) body.notify_subtask = form.notify_subtask;
      if (form.notify_file_upload !== editingUser.notify_file_upload) body.notify_file_upload = form.notify_file_upload;
      updateUser.mutate({ id: editingUser.id, body });
    } else {
      if (!form.password) { setError("Password is required for new users"); return; }
      if (!isPasswordStrong(form.password)) { setError("Password does not meet requirements"); return; }
      createUser.mutate({ ...form, full_name: form.full_name.trim(), email: form.email.trim() });
    }
  }

  if (!canManageUsers(currentUser?.role ?? "user")) {
    return (
      <div className="flex flex-col h-full">
        <Header />
        <AccessDenied message="Only administrators can manage users." />
      </div>
    );
  }

  const users = data?.items ?? [];

  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex-1 p-3 sm:p-6 overflow-auto">
        {successMsg && (
          <div className="mb-4 px-4 py-2.5 bg-success-50 border border-success-100 text-success-700 text-sm rounded-lg flex items-center gap-2">
            <CheckIcon className="w-4 h-4 shrink-0" />
            {successMsg}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Users</h1>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>

        {/* Users table — desktop */}
        <div className="hidden sm:block bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-500">User</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Email</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Role</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Timezone</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: u.color || "#7BAE8A" }}>
                        {u.full_name.charAt(0)}
                      </div>
                      <span className="text-sm text-gray-900 font-medium">{u.full_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] font-medium px-2 py-1 rounded-full", ROLE_COLORS[u.role])}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{u.timezone}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1 text-xs", u.is_active ? "text-success-700" : "text-danger-500")}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", u.is_active ? "bg-success-500" : "bg-danger-500")} />
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(u)} className="p-1 text-gray-400 hover:text-primary-600 rounded transition-colors" title="Edit user">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Users cards — mobile */}
        <div className="sm:hidden space-y-2">
          {users.map((u) => (
            <div key={u.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3" onClick={() => openEdit(u)}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: u.color || "#7BAE8A" }}>
                {u.full_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{u.full_name}</p>
                <p className="text-xs text-gray-500 truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", ROLE_COLORS[u.role])}>{ROLE_LABELS[u.role]}</span>
                <span className={cn("w-2 h-2 rounded-full", u.is_active ? "bg-success-500" : "bg-danger-500")} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create / Edit User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 lg:mx-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-sm font-semibold">{editingUser ? "Edit User" : "Add User"}</h2>
              <button onClick={closeModal} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full name *</label>
                <input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="user">User</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Timezone</label>
                  <TimezonePicker value={form.timezone} onChange={(tz) => setForm({ ...form, timezone: tz })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {editingUser ? "New password (leave empty to keep)" : "Password *"}
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-3 py-2 pr-24 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono"
                    required={!editingUser}
                  />
                  <div className="absolute right-1.5 flex items-center gap-0.5">
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1 text-gray-400 hover:text-gray-600 rounded" title={showPassword ? "Hide" : "Show"}>
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button type="button" onClick={() => { navigator.clipboard.writeText(form.password); }} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="Copy">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => { setForm({ ...form, password: generatePassword() }); setShowPassword(true); }} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="Generate new">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {form.password && (
                  <div className="mt-2 space-y-0.5">
                    {validatePassword(form.password).map((check) => (
                      <div key={check.label} className="flex items-center gap-1.5">
                        {check.valid ? <CheckIcon className="w-3 h-3 text-success-500" /> : <X className="w-3 h-3 text-gray-300" />}
                        <span className={`text-[10px] ${check.valid ? "text-success-600" : "text-gray-400"}`}>{check.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Slack */}
              {editingUser && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Slack</p>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-700">Enable Slack</label>
                    <button type="button" onClick={() => setForm({ ...form, slack_enabled: !form.slack_enabled })}
                      className={cn("relative w-9 h-5 rounded-full transition-colors shrink-0", form.slack_enabled ? "bg-primary-600" : "bg-gray-300")}>
                      <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", form.slack_enabled && "translate-x-4")} />
                    </button>
                  </div>
                  <input type="url" value={form.slack_webhook_url} onChange={(e) => setForm({ ...form, slack_webhook_url: e.target.value })}
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  {form.slack_enabled && !form.slack_webhook_url && (
                    <p className="text-[10px] text-danger-500 mt-1">Webhook URL required</p>
                  )}
                </div>
              )}

              {/* Notifications */}
              {editingUser && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notifications</p>
                  {!form.slack_enabled && (
                    <p className="text-[10px] text-warning-700 bg-warning-50 px-2 py-1 rounded mb-2">Slack disabled — notifications won&apos;t be sent</p>
                  )}
                  <p className="text-[10px] text-gray-400 mb-1">Daily</p>
                  <div className="space-y-1 mb-2">
                    {([
                      { key: "notify_daily_new_tasks" as const, label: "New tasks" },
                      { key: "notify_daily_in_progress" as const, label: "In progress" },
                    ]).map((item) => (
                      <div key={item.key} className="flex items-center justify-between">
                        <label className="text-xs text-gray-700">{item.label}</label>
                        <button type="button" onClick={() => setForm({ ...form, [item.key]: !form[item.key] })}
                          className={cn("relative w-9 h-5 rounded-full transition-colors shrink-0", form[item.key] ? "bg-primary-600" : "bg-gray-300")}>
                          <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", form[item.key] && "translate-x-4")} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mb-1">Realtime</p>
                  <div className="space-y-1">
                    {([
                      { key: "notify_comment" as const, label: "Comments" },
                      { key: "notify_task_created" as const, label: "Task created" },
                      { key: "notify_task_updated" as const, label: "Task updated" },
                      { key: "notify_watcher" as const, label: "Watcher" },
                      { key: "notify_task_assigned" as const, label: "Task assigned" },
                      { key: "notify_subtask" as const, label: "Subtasks" },
                      { key: "notify_file_upload" as const, label: "File upload" },
                    ]).map((item) => (
                      <div key={item.key} className="flex items-center justify-between">
                        <label className="text-xs text-gray-700">{item.label}</label>
                        <button type="button" onClick={() => setForm({ ...form, [item.key]: !form[item.key] })}
                          className={cn("relative w-9 h-5 rounded-full transition-colors shrink-0", form[item.key] ? "bg-primary-600" : "bg-gray-300")}>
                          <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", form[item.key] && "translate-x-4")} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-danger-500">{error}</p>}

              {/* Delete confirmation */}
              {deleteConfirm && editingUser && (
                <div className="p-3 bg-danger-50 border border-danger-100 rounded-lg space-y-3">
                  <p className="text-xs font-medium text-danger-700">Delete user &quot;{editingUser.full_name}&quot;?</p>
                  <p className="text-[11px] text-gray-600">Choose what to do with their tasks and comments:</p>

                  <div className="space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="radio" name="deleteMode" checked={deleteMode === "keep"} onChange={() => { setDeleteMode("keep"); setReassignTo(""); }}
                        className="mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-700">Keep tasks and comments as-is</p>
                        <p className="text-[10px] text-gray-400">Remove assignments only, tasks stay with no owner</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="radio" name="deleteMode" checked={deleteMode === "reassign"} onChange={() => setDeleteMode("reassign")}
                        className="mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-700">Reassign to another user</p>
                        <p className="text-[10px] text-gray-400">Transfer tasks, assignments, and comments</p>
                      </div>
                    </label>

                    {deleteMode === "reassign" && (
                      <select
                        value={reassignTo}
                        onChange={(e) => setReassignTo(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ml-5"
                      >
                        <option value="">Select user...</option>
                        {users.filter((u) => u.id !== editingUser.id && u.is_active).map((u) => (
                          <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setDeleteConfirm(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-white rounded transition-colors">Cancel</button>
                    <button
                      type="button"
                      onClick={() => deleteUser.mutate({ id: editingUser.id, reassignTo: deleteMode === "reassign" ? reassignTo : undefined })}
                      disabled={deleteUser.isPending || (deleteMode === "reassign" && !reassignTo)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-danger-600 rounded hover:bg-danger-700 disabled:opacity-50 transition-colors"
                    >
                      {deleteUser.isPending ? "Deleting..." : "Delete User"}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center pt-2">
                {editingUser && !deleteConfirm && editingUser.id !== currentUser?.id && (
                  <button type="button" onClick={() => setDeleteConfirm(true)} className="text-xs text-danger-500 hover:text-danger-700 transition-colors">
                    Delete User
                  </button>
                )}
                <div className="flex-1" />
                <div className="flex gap-2">
                  <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                  <button type="submit" disabled={createUser.isPending || updateUser.isPending || (form.password ? !isPasswordStrong(form.password) : false)}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
                    {(createUser.isPending || updateUser.isPending) ? "Saving..." : editingUser ? "Save" : "Create User"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
