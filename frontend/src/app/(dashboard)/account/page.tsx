"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { User as UserIcon, Globe, Lock, Bell, Check, X, Pencil, MessageSquare } from "lucide-react";
import { Header } from "@/components/header";
import { TimezonePicker } from "@/components/timezone-picker";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { validatePassword, isPasswordStrong } from "@/lib/password";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

const COLOR_PALETTE = [
  { name: "Sage", hex: "#7BAE8A" },
  { name: "Denim", hex: "#5B8DB5" },
  { name: "Clay", hex: "#C47A5A" },
  { name: "Mauve", hex: "#9B7BAE" },
  { name: "Jade", hex: "#3D9B8A" },
  { name: "Saffron", hex: "#C4A84A" },
  { name: "Slate", hex: "#5A7A9B" },
  { name: "Fern", hex: "#6B9B5A" },
  { name: "Dusk", hex: "#7B6BAE" },
  { name: "Copper", hex: "#B5804A" },
  { name: "Mist", hex: "#4A8B9B" },
  { name: "Herb", hex: "#8B9B4A" },
];

const SECTIONS = [
  { id: "profile", label: "Profile & Settings", icon: UserIcon },
  { id: "slack", label: "Slack", icon: MessageSquare },
  { id: "notifications", label: "Notifications", icon: Bell },
] as const;

type Section = typeof SECTIONS[number]["id"];

export default function AccountPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>("profile");
  const [fullName, setFullName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [saved, setSaved] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Init form from user data
  if (user && !initialized) {
    setFullName(user.full_name);
    setTimezone(user.timezone);
    setInitialized(true);
  }

  const updateProfile = useMutation({
    mutationFn: (body: Record<string, string>) => api.put<User>("/api/v1/auth/me", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setSaved(true);
      setPassword("");
      setPasswordConfirm("");
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const updateColor = useMutation({
    mutationFn: (color: string) => api.put<User>("/api/v1/auth/me", { color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setShowColorPicker(false);
    },
  });

  function handleSaveProfile() {
    const body: Record<string, string> = {};
    if (fullName.trim() !== user?.full_name) body.full_name = fullName.trim();
    if (timezone !== user?.timezone) body.timezone = timezone;
    if (password) {
      if (password !== passwordConfirm) return;
      if (!isPasswordStrong(password)) return;
      body.password = password;
    }
    if (Object.keys(body).length > 0) {
      updateProfile.mutate(body);
    }
  }

  if (!user) return null;

  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-3 sm:p-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left nav */}
            <div className="lg:w-64 shrink-0">
              {/* User card */}
              <div className="flex items-center gap-3 mb-6">
                <div className="relative">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white"
                    style={{ backgroundColor: user.color || "#7BAE8A" }}
                  >
                    {user.full_name.charAt(0)}
                  </div>
                  <button
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="absolute -bottom-0.5 -right-0.5 w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:shadow-md hover:border-gray-300 transition-all"
                    title="Change avatar color"
                  >
                    <Pencil className="w-3 h-3 text-gray-500" />
                  </button>

                  {/* Color picker popup */}
                  {showColorPicker && (
                    <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-3 w-52">
                      <p className="text-xs font-medium text-gray-500 mb-2">Choose avatar color</p>
                      <div className="grid grid-cols-6 gap-1.5">
                        {COLOR_PALETTE.map((c) => (
                          <button
                            key={c.hex}
                            onClick={() => updateColor.mutate(c.hex)}
                            className={cn(
                              "w-7 h-7 rounded-full transition-all hover:scale-110",
                              user.color === c.hex && "ring-2 ring-offset-2 ring-primary-500"
                            )}
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{user.full_name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
              </div>

              {/* Section nav */}
              <nav className="flex lg:flex-col gap-1 lg:gap-0.5 overflow-x-auto">
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`lg:w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors whitespace-nowrap ${
                      activeSection === s.id
                        ? "bg-primary-600 text-white font-medium"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <s.icon className="w-4 h-4" />
                    {s.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Right content */}
            <div className="flex-1 min-w-0">
              {activeSection === "profile" && (
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                    <UserIcon className="w-5 h-5 text-gray-400" />
                    Profile & Settings
                  </h2>

                  {/* Account information */}
                  <div className="mb-8">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                      <span className="w-2 h-5 bg-primary-500 rounded-full" />
                      Account information
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Email</label>
                        <input
                          type="email"
                          defaultValue={user.email}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (!val || val === user.email) return;
                            updateProfile.mutate({ email: val } as any);
                          }}
                          className="w-full text-sm text-gray-900 py-2 px-0 border-b border-gray-100 focus:border-primary-500 focus:outline-none transition-colors bg-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Name</label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full text-sm text-gray-900 py-2 border-b border-gray-200 focus:border-primary-500 focus:outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Role</label>
                        <p className="text-sm text-gray-900 py-2 border-b border-gray-100 capitalize">{user.role}</p>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Status</label>
                        <p className="text-sm text-gray-900 py-2 border-b border-gray-100">
                          <span className={`inline-flex items-center gap-1 ${user.is_active ? "text-success-700" : "text-danger-500"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? "bg-success-500" : "bg-danger-500"}`} />
                            {user.is_active ? "Active" : "Inactive"}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Password */}
                  <div className="mb-8">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                      <span className="w-2 h-5 bg-warning-500 rounded-full" />
                      Password
                    </h3>
                    {!showPassword ? (
                      <button
                        onClick={() => setShowPassword(true)}
                        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Change password
                      </button>
                    ) : (
                      <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">New password</label>
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full text-sm py-2 border-b border-gray-200 focus:border-primary-500 focus:outline-none"
                            placeholder="Enter new password"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Confirm password</label>
                          <input
                            type="password"
                            value={passwordConfirm}
                            onChange={(e) => setPasswordConfirm(e.target.value)}
                            className="w-full text-sm py-2 border-b border-gray-200 focus:border-primary-500 focus:outline-none"
                            placeholder="Confirm new password"
                          />
                          {password && passwordConfirm && password !== passwordConfirm && (
                            <p className="text-[10px] text-danger-500 mt-1">Passwords do not match</p>
                          )}
                        </div>
                      </div>
                      {password && (
                        <div className="mt-3 space-y-1">
                          {validatePassword(password).map((check) => (
                            <div key={check.label} className="flex items-center gap-1.5">
                              {check.valid ? <Check className="w-3 h-3 text-success-500" /> : <X className="w-3 h-3 text-gray-300" />}
                              <span className={`text-[10px] ${check.valid ? "text-success-600" : "text-gray-400"}`}>{check.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      </>
                    )}
                  </div>

                  {/* Locale */}
                  <div className="mb-8">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                      <span className="w-2 h-5 bg-orange-500 rounded-full" />
                      Locale settings
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Timezone</label>
                        <TimezonePicker value={timezone} onChange={setTimezone} />
                      </div>
                    </div>
                  </div>

                  {/* Save */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveProfile}
                      disabled={updateProfile.isPending}
                      className="px-5 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                    >
                      {updateProfile.isPending ? "Saving..." : "Save changes"}
                    </button>
                    {saved && <span className="text-sm text-success-600">Saved!</span>}
                    {updateProfile.isError && <span className="text-sm text-danger-500">Error saving</span>}
                  </div>
                </div>
              )}

              {activeSection === "slack" && (
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-gray-400" />
                    Slack Notifications
                  </h2>
                  <p className="text-xs text-gray-500 mb-5">Receive task notifications directly in your Slack channel via Incoming Webhooks.</p>

                  <div className="space-y-5">
                    {/* 1. Toggle */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Enable Slack Notifications</p>
                        <p className="text-[10px] text-gray-400">Receive realtime and daily digest notifications via Slack</p>
                      </div>
                      <button
                        onClick={() => updateProfile.mutate({ slack_enabled: !user.slack_enabled } as any)}
                        className={cn("relative w-10 h-5 rounded-full transition-colors shrink-0", user.slack_enabled ? "bg-primary-600" : "bg-gray-300")}
                      >
                        <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", user.slack_enabled && "translate-x-5")} />
                      </button>
                    </div>

                    {/* 2. Webhook URL */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Webhook URL {user.slack_enabled && <span className="text-danger-500">*</span>}</label>
                      <input
                        type="url"
                        defaultValue={user.slack_webhook_url || ""}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val === (user.slack_webhook_url || "")) return;
                          if (val && !val.startsWith("https://hooks.slack.com/")) {
                            e.target.setCustomValidity("Must start with https://hooks.slack.com/");
                            e.target.reportValidity();
                            return;
                          }
                          e.target.setCustomValidity("");
                          updateProfile.mutate({ slack_webhook_url: val || null } as any);
                        }}
                        placeholder="https://hooks.slack.com/services/..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>

                    {/* 3. Validation messages */}
                    {user.slack_enabled && !user.slack_webhook_url && (
                      <p className="text-xs text-danger-500 bg-danger-50 px-3 py-2 rounded-lg">Webhook URL is required when Slack is enabled.</p>
                    )}

                    {!user.slack_enabled && (
                      <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">Enable Slack notifications to start receiving updates in your channel.</p>
                    )}

                    {/* 4. Test button */}
                    {user.slack_enabled && user.slack_webhook_url && (
                      <div>
                        <button
                          onClick={async () => {
                            try {
                              await api.post("/api/v1/auth/me/test-slack");
                              alert("Test message sent!");
                            } catch {
                              alert("Failed to send test message. Check your webhook URL.");
                            }
                          }}
                          className="px-4 py-2 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                        >
                          Send Test Notification
                        </button>
                      </div>
                    )}

                    {/* Setup instructions */}
                    <details className="group">
                      <summary className="text-xs font-medium text-primary-600 cursor-pointer hover:text-primary-700 select-none">
                        How to get your Slack webhook URL
                      </summary>
                      <ol className="mt-2 ml-4 space-y-1.5 text-xs text-gray-600 list-decimal">
                        <li>Go to <span className="font-medium">slack.com</span> and log in to your workspace</li>
                        <li>In the left panel, go to <span className="font-medium">Manage</span> &rarr; <span className="font-medium">Custom Integrations</span></li>
                        <li>Search for <span className="font-medium">Incoming WebHooks</span> and enable the app</li>
                        <li>Click <span className="font-medium">Add to Slack</span></li>
                        <li>Select the channel in <span className="font-medium">Post to Channel</span></li>
                        <li>Click <span className="font-medium">Add Incoming WebHooks Integration</span></li>
                        <li>Copy the <span className="font-medium">Webhook URL</span> and paste it above</li>
                      </ol>
                    </details>
                  </div>
                </div>
              )}

              {activeSection === "notifications" && (
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    <Bell className="w-5 h-5 text-gray-400" />
                    Notification Preferences
                  </h2>
                  <p className="text-xs text-gray-500 mb-5">Choose which notifications you want to receive.</p>

                  {!user.slack_enabled && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-warning-50 border border-warning-100 rounded-lg mb-5">
                      <MessageSquare className="w-3.5 h-3.5 text-warning-700 shrink-0" />
                      <p className="text-xs text-warning-700">Slack is disabled — notifications will not be sent. Enable Slack in the Slack tab first.</p>
                    </div>
                  )}

                  {/* Daily Digest */}
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Daily Digest</h3>
                      <span className="text-[10px] text-gray-400">8:00 AM</span>
                    </div>
                    <div className="space-y-2 pl-4 border-l-2 border-gray-100">
                      {([
                        { key: "notify_daily_new_tasks", label: "New tasks assigned to me", desc: "Summary of tasks assigned since last digest" },
                        { key: "notify_daily_in_progress", label: "Tasks in progress", desc: "Reminder of your active tasks" },
                      ] as const).map((item) => (
                        <div key={item.key} className="flex items-center justify-between py-1.5">
                          <div>
                            <p className="text-sm text-gray-700">{item.label}</p>
                            <p className="text-[10px] text-gray-400">{item.desc}</p>
                          </div>
                          <button
                            onClick={() => updateProfile.mutate({ [item.key]: !user[item.key] } as any)}
                            className={cn("relative w-10 h-5 rounded-full transition-colors shrink-0", user[item.key] ? "bg-primary-600" : "bg-gray-300")}
                          >
                            <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", user[item.key] && "translate-x-5")} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Realtime */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-success-500" />
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Realtime</h3>
                    </div>
                    <div className="space-y-2 pl-4 border-l-2 border-gray-100">
                      {([
                        { key: "notify_comment", label: "New comments", desc: "When someone comments on your tasks" },
                        { key: "notify_task_created", label: "Task created", desc: "When a task is created in your projects" },
                        { key: "notify_task_updated", label: "Task updated", desc: "When a task you follow is updated" },
                        { key: "notify_watcher", label: "Watcher notifications", desc: "Updates on tasks you are watching" },
                        { key: "notify_task_assigned", label: "Task assigned", desc: "When you are assigned to a task" },
                        { key: "notify_subtask", label: "Subtask updates", desc: "When subtasks are added or completed" },
                        { key: "notify_file_upload", label: "File uploads", desc: "When files are uploaded to your tasks" },
                      ] as const).map((item) => (
                        <div key={item.key} className="flex items-center justify-between py-1.5">
                          <div>
                            <p className="text-sm text-gray-700">{item.label}</p>
                            <p className="text-[10px] text-gray-400">{item.desc}</p>
                          </div>
                          <button
                            onClick={() => updateProfile.mutate({ [item.key]: !user[item.key] } as any)}
                            className={cn("relative w-10 h-5 rounded-full transition-colors shrink-0", user[item.key] ? "bg-primary-600" : "bg-gray-300")}
                          >
                            <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", user[item.key] && "translate-x-5")} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
