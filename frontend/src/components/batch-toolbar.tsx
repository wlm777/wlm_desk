"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/lib/constants";
import type { TaskList, TaskStatus, TaskPriority } from "@/lib/types";

interface BatchToolbarProps {
  selectedIds: string[];
  projectId: string;
  onClear: () => void;
  isArchived?: boolean;
}

interface BatchResult {
  updated: number;
  skipped: number;
  errors: { task_id: string; reason: string }[];
}

export function BatchToolbar({ selectedIds, projectId, onClear, isArchived = false }: BatchToolbarProps) {
  const queryClient = useQueryClient();
  const [showResult, setShowResult] = useState<BatchResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: lists } = useQuery<TaskList[]>({
    queryKey: ["lists", projectId],
    queryFn: () => api.get(`/api/v1/projects/${projectId}/lists`),
  });

  const batchUpdate = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<BatchResult>("/api/v1/tasks/batch-update", body),
    onSuccess: (result) => {
      setShowResult(result);
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["lists", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      // Invalidate any open task detail panels
      queryClient.invalidateQueries({ queryKey: ["task"] });
      if (result.errors.length === 0) {
        setTimeout(() => {
          onClear();
          setShowResult(null);
        }, 1500);
      }
    },
  });

  const batchArchive = useMutation({
    mutationFn: async () => {
      for (const id of selectedIds) {
        await api.patch(`/api/v1/tasks/${id}/archive`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["lists", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setConfirmDelete(false);
      onClear();
    },
  });

  const batchPermanentDelete = useMutation({
    mutationFn: async () => {
      for (const id of selectedIds) {
        await api.delete(`/api/v1/tasks/${id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["lists", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setConfirmDelete(false);
      onClear();
    },
  });

  function apply(changes: Record<string, unknown>) {
    batchUpdate.mutate({ task_ids: selectedIds, changes });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-4 py-2 flex items-center gap-3 flex-wrap">
      <span className="text-sm font-medium text-gray-700">
        {selectedIds.length} selected
      </span>

      <div className="h-5 w-px bg-gray-200" />

      {/* Status */}
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) apply({ status: e.target.value });
          e.target.value = "";
        }}
        className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
      >
        <option value="">Set status...</option>
        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>

      {/* Priority */}
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) apply({ priority: e.target.value });
          e.target.value = "";
        }}
        className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
      >
        <option value="">Set priority...</option>
        {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>

      {/* Move to list */}
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) apply({ list_id: e.target.value });
          e.target.value = "";
        }}
        className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
      >
        <option value="">Move to list...</option>
        {lists?.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>

      {/* Restore (archived view only) */}
      {isArchived && !confirmDelete && (
        <button
          onClick={() => {
            (async () => {
              for (const id of selectedIds) await api.patch(`/api/v1/tasks/${id}/restore`);
              queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
              onClear();
            })();
          }}
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 transition-colors"
        >
          Restore
        </button>
      )}

      {/* Delete / Archive */}
      {!confirmDelete ? (
        <button
          onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1 text-xs text-danger-500 hover:text-danger-700 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          {isArchived ? "Delete forever" : "Archive"}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-danger-500">{isArchived ? "Delete permanently" : "Archive"} {selectedIds.length} task{selectedIds.length > 1 ? "s" : ""}?</span>
          <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-700">No</button>
          <button
            onClick={() => isArchived ? batchPermanentDelete.mutate() : batchArchive.mutate()}
            disabled={batchArchive.isPending || batchPermanentDelete.isPending}
            className="text-xs font-medium text-white bg-danger-600 px-2 py-0.5 rounded hover:bg-danger-700 disabled:opacity-50"
          >
            {(batchArchive.isPending || batchPermanentDelete.isPending) ? "..." : "Yes"}
          </button>
        </div>
      )}

      {/* Result feedback */}
      {showResult && (
        <span className="text-xs text-success-700">
          {showResult.updated} updated
          {showResult.skipped > 0 && `, ${showResult.skipped} skipped`}
          {showResult.errors.length > 0 && `, ${showResult.errors.length} error(s)`}
        </span>
      )}

      {batchUpdate.isPending && (
        <span className="text-xs text-gray-400">Updating...</span>
      )}

      <button
        onClick={onClear}
        className="ml-auto p-1 text-gray-400 hover:text-gray-600 rounded"
        title="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
