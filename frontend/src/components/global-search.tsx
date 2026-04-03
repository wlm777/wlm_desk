"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, X, FolderOpen, ListTodo, CheckSquare } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SearchResult {
  type: "project" | "task" | "list";
  id: string;
  title: string;
  project_id: string | null;
  project_name: string | null;
  list_id: string | null;
  list_name: string | null;
}

const TYPE_CONFIG = {
  project: { icon: FolderOpen, label: "Projects", color: "text-primary-600" },
  list: { icon: ListTodo, label: "Lists", color: "text-warning-700" },
  task: { icon: CheckSquare, label: "Tasks", color: "text-success-700" },
} as const;

export function GlobalSearch() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce input
  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed === debounced) return;
    const timer = setTimeout(() => setDebounced(trimmed), 300);
    return () => clearTimeout(timer);
  }, [input, debounced]);

  // Fetch results
  const { data: results } = useQuery<SearchResult[]>({
    queryKey: ["global-search", debounced],
    queryFn: () => api.get(`/api/v1/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length > 0,
  });

  // Open dropdown when we have a query
  useEffect(() => {
    setOpen(debounced.length > 0);
  }, [debounced]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function navigate(result: SearchResult) {
    setOpen(false);
    setInput("");
    setDebounced("");
    setFocused(false);

    if (result.type === "project") {
      router.push(`/projects/${result.project_id}`);
    } else if (result.type === "list") {
      router.push(`/projects/${result.project_id}?list=${result.list_id}`);
    } else {
      // task — open project with task selected via URL hash
      router.push(`/projects/${result.project_id}?task=${result.id}`);
    }
  }

  // Group results by type
  const grouped = { project: [] as SearchResult[], list: [] as SearchResult[], task: [] as SearchResult[] };
  for (const r of results ?? []) {
    grouped[r.type]?.push(r);
  }
  const hasResults = (results ?? []).length > 0;

  return (
    <div ref={containerRef} className={cn("relative transition-all duration-200 min-w-0", focused ? "w-full" : "w-full sm:w-72")}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input
        type="text"
        placeholder="Search projects, tasks, lists..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => { setFocused(true); if (debounced) setOpen(true); }}
        onBlur={() => { if (!input) setFocused(false); }}
        className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
      {input && (
        <button
          onClick={() => { setInput(""); setDebounced(""); setOpen(false); setFocused(false); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Dropdown */}
      {open && debounced && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          {!hasResults && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-gray-500">No results found</p>
              <p className="text-xs text-gray-400 mt-1">Try a different keyword</p>
            </div>
          )}

          {(["project", "list", "task"] as const).map((type) => {
            const items = grouped[type];
            if (items.length === 0) return null;
            const cfg = TYPE_CONFIG[type];
            const Icon = cfg.icon;

            return (
              <div key={type}>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                  {cfg.label}
                </div>
                {items.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigate(r)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-primary-50 transition-colors border-b border-gray-50 last:border-0"
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", cfg.color)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 truncate">{r.title}</p>
                      {type !== "project" && r.project_name && (
                        <p className="text-[11px] text-gray-400 truncate">
                          {r.project_name}
                          {type === "task" && r.list_name && ` / ${r.list_name}`}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
