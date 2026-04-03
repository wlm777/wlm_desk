"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  Settings,
  ChevronDown,
  LogOut,
  List,
  FolderOpen,
  Plus,
  User as UserIcon,
  AlertTriangle,
  ArrowUp,
  UserX,
  CheckCircle,
  Bookmark,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { logout } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { CreateProjectModal } from "@/components/create-project-modal";
import { canManageUsers, canCreateProject, canManageLists } from "@/lib/permissions";
import type { Project, TaskList, SavedFilter, PaginatedResponse } from "@/lib/types";

// Built-in system views (not stored in DB, frontend-only)
const BUILT_IN_VIEWS = [
  { id: "my-tasks", label: "My Tasks", icon: UserIcon, params: { assignee_id: "__me__" } },
  { id: "overdue", label: "Overdue", icon: AlertTriangle, params: { due_mode: "overdue" } },
  { id: "high-priority", label: "High Priority", icon: ArrowUp, params: { priority: "high" } },
  { id: "unassigned", label: "Unassigned", icon: UserX, params: { assignee_id: "__none__" } },
  { id: "completed", label: "Completed", icon: CheckCircle, params: { status: "completed" } },
] as const;

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth({ redirect: false });

  const [projectOpen, setProjectOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentProjectId = params?.id as string | undefined;
  const activeView = searchParams.get("view");

  const { data: projectsData } = useQuery<PaginatedResponse<Project>>({
    queryKey: ["projects"],
    queryFn: () => api.get("/api/v1/projects?limit=100"),
  });

  const { data: lists } = useQuery<TaskList[]>({
    queryKey: ["lists", currentProjectId],
    queryFn: () => api.get(`/api/v1/projects/${currentProjectId}/lists`),
    enabled: !!currentProjectId,
  });

  const { data: savedFilters } = useQuery<SavedFilter[]>({
    queryKey: ["saved-filters"],
    queryFn: () => api.get("/api/v1/saved-filters"),
  });

  const deleteFilter = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/saved-filters/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-filters"] }),
  });

  const createList = useMutation({
    mutationFn: (name: string) =>
      api.post<TaskList>(`/api/v1/projects/${currentProjectId}/lists`, { name }),
    onSuccess: (newList) => {
      // Optimistic: append new list immediately
      queryClient.setQueryData<TaskList[]>(["lists", currentProjectId], (old) =>
        old ? [...old, newList] : [newList]
      );
      queryClient.invalidateQueries({ queryKey: ["lists", currentProjectId] });
      setShowAddList(false);
      setNewListName("");
    },
  });

  const projects = projectsData?.items ?? [];
  const currentProject = projects.find((p) => p.id === currentProjectId);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.description?.toLowerCase().includes(projectSearch.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProjectOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function applyView(viewParams: Record<string, string>) {
    if (!currentProjectId) return;
    const sp = new URLSearchParams();
    sp.set("view", Object.entries(viewParams).map(([k, v]) => `${k}:${v}`).join(","));
    for (const [k, v] of Object.entries(viewParams)) {
      sp.set(k, v);
    }
    router.push(`/projects/${currentProjectId}?${sp}`);
    onNavigate?.();
  }

  function applySavedFilter(sf: SavedFilter) {
    if (!currentProjectId) return;
    const sp = new URLSearchParams();
    sp.set("view", `saved:${sf.id}`);
    for (const [k, v] of Object.entries(sf.filters_json)) {
      sp.set(k, v);
    }
    router.push(`/projects/${currentProjectId}?${sp}`);
    onNavigate?.();
  }

  const userRole = user?.role ?? "user";
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showUserMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/projects", icon: FolderOpen, label: "All Projects" },
  ];

  return (
    <>
    <aside className="w-60 h-screen bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Project selector */}
      <div className="p-3 border-b border-gray-200 relative" ref={dropdownRef}>
        <button
          onClick={() => setProjectOpen(!projectOpen)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2 truncate">
            <img src="/logo.svg" width={40} height={40} alt="WLM Desk" className="shrink-0" />
            <span className="truncate">
              {currentProject?.name ?? "Select project"}
            </span>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", projectOpen && "rotate-180")} />
        </button>

        {projectOpen && (
          <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-hidden">
            <div className="p-2">
              <input
                type="text"
                placeholder="Search projects..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    router.push(`/projects/${p.id}`);
                    setProjectOpen(false);
                    setProjectSearch("");
                    onNavigate?.();
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors",
                    p.id === currentProjectId && "bg-primary-50 text-primary-700"
                  )}
                >
                  {p.name}
                </button>
              ))}
              {filteredProjects.length === 0 && (
                <p className="px-3 py-2 text-sm text-gray-400">No projects found</p>
              )}
            </div>
            {/* New Project button */}
            {user && canCreateProject(userRole) && (
              <button
                onClick={() => { setProjectOpen(false); setShowCreateProject(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 border-t border-gray-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Project
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lists for current project */}
      {currentProjectId && (
        <div className="px-3 py-2 border-b border-gray-200">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2 mb-1">
            Lists
          </p>
          {/* Scrollable list area — max 7 items visible (7 × 32px = 224px) */}
          <div className={lists && lists.length > 7 ? "max-h-[224px] overflow-y-auto" : ""}>
            {lists?.map((list) => (
              <button
                key={list.id}
                onClick={() => { router.push(`/projects/${currentProjectId}?list=${list.id}`); onNavigate?.(); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: list.color || "#E6E7EB" }}
                />
                {list.name}
              </button>
            ))}
          </div>

          {/* Add List — outside scroll, always visible */}
          {user && canManageLists(userRole) && (
            showAddList ? (
              <form
                onSubmit={(e) => { e.preventDefault(); if (newListName.trim()) createList.mutate(newListName.trim()); }}
                className="px-2 py-1"
              >
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onBlur={() => { if (!newListName.trim()) setShowAddList(false); }}
                  onKeyDown={(e) => { if (e.key === "Escape") { setShowAddList(false); setNewListName(""); } }}
                  placeholder="List name, Enter to save"
                  autoFocus
                  className="w-full text-xs px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </form>
            ) : (
              <button
                onClick={() => setShowAddList(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-400 hover:text-primary-600 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add List
              </button>
            )
          )}
        </div>
      )}

      {/* Saved Views */}
      {currentProjectId && (
        <div className="px-3 py-2 border-b border-gray-200">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2 mb-1">
            Views
          </p>
          {/* Built-in views */}
          {BUILT_IN_VIEWS.map((view) => (
            <button
              key={view.id}
              onClick={() => applyView(view.params)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors",
                activeView?.includes(view.id) || activeView?.includes(Object.values(view.params)[0])
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              <view.icon className="w-3.5 h-3.5" />
              {view.label}
            </button>
          ))}

          {/* Custom saved filters */}
          {savedFilters && savedFilters.length > 0 && (
            <>
              <div className="h-px bg-gray-100 my-1" />
              {savedFilters.map((sf) => (
                <div
                  key={sf.id}
                  className={cn(
                    "flex items-center gap-1 group",
                    activeView === `saved:${sf.id}` && "bg-primary-50 rounded-md"
                  )}
                >
                  <button
                    onClick={() => applySavedFilter(sf)}
                    className="flex-1 flex items-center gap-2 px-2 py-1.5 text-sm text-gray-600 rounded-md hover:bg-gray-50 transition-colors truncate"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{sf.name}</span>
                  </button>
                  <button
                    onClick={() => deleteFilter.mutate(sf.id)}
                    className="p-1 text-gray-400 hover:text-danger-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <button
              key={item.href}
              onClick={() => { router.push(item.href); onNavigate?.(); }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User panel */}
      {user && (
        <div className="p-3 border-t border-gray-200 relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-full flex items-center gap-2.5 px-1 py-1 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ backgroundColor: user.color || "#7BAE8A" }}
            >
              {user.full_name.charAt(0)}
            </div>
            <div className="min-w-0 text-left flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}</p>
              <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
            </div>
            <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform shrink-0", showUserMenu && "rotate-180")} />
          </button>

          {showUserMenu && (
            <div className="absolute left-3 right-3 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1">
              <button
                onClick={() => { router.push("/account"); setShowUserMenu(false); onNavigate?.(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <UserIcon className="w-4 h-4 text-gray-400" />
                My Account
              </button>
              {userRole === "admin" && (
                <button
                  onClick={() => { router.push("/system"); setShowUserMenu(false); onNavigate?.(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Settings className="w-4 h-4 text-gray-400" />
                  Manage System
                </button>
              )}
              {canManageUsers(userRole) && (
                <button
                  onClick={() => { router.push("/users"); setShowUserMenu(false); onNavigate?.(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Users className="w-4 h-4 text-gray-400" />
                  Users
                </button>
              )}
              <div className="h-px bg-gray-100 my-1" />
              <button
                onClick={() => { logout(); setShowUserMenu(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </button>
            </div>
          )}
        </div>
      )}
    </aside>

    {showCreateProject && (
      <CreateProjectModal onClose={() => setShowCreateProject(false)} />
    )}
    </>
  );
}
