"use client";

import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { GlobalSearch } from "@/components/global-search";

interface HeaderProps {
  onAddTask?: () => void;
}

export function Header({ onAddTask }: HeaderProps) {
  const { user } = useAuth({ redirect: false });

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-3 sm:px-6 shrink-0 gap-2">
      <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {onAddTask && (
          <button
            onClick={onAddTask}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Task</span>
          </button>
        )}

      </div>
    </header>
  );
}
