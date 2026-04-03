"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Header } from "@/components/header";
import { AccessDenied } from "@/components/access-denied";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { HardDrive, Server, FileType, Image as ImageIcon, CheckCircle, XCircle, Clock, Save } from "lucide-react";

interface StorageInfo {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  max_upload_size_mb: number;
  allowed_file_types: string[];
  preview_max_width: number;
  thumbnail_size: number;
  slack_digest_hour: number;
}

interface SystemInfo {
  app_version: string;
  storage_path: string;
  database_connected: boolean;
  attachments_dir_exists: boolean;
}

interface SystemSettingsData {
  storage: StorageInfo;
  system: SystemInfo;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "JPEG", "image/png": "PNG", "image/gif": "GIF",
    "image/webp": "WebP", "image/svg+xml": "SVG",
    "application/pdf": "PDF", "application/msword": "DOC",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/vnd.ms-excel": "XLS",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "application/vnd.ms-powerpoint": "PPT",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
    "text/plain": "TXT", "text/csv": "CSV", "application/zip": "ZIP",
  };
  return map[mime] || mime;
}

export default function SystemPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SystemSettingsData>({
    queryKey: ["system-settings"],
    queryFn: () => api.get("/api/v1/system"),
    enabled: user?.role === "admin",
  });

  // Editable form state
  const [maxUpload, setMaxUpload] = useState(10);
  const [previewWidth, setPreviewWidth] = useState(640);
  const [thumbSize, setThumbSize] = useState(120);
  const [digestHour, setDigestHour] = useState(8);
  const [initialized, setInitialized] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (data && !initialized) {
      setMaxUpload(data.storage.max_upload_size_mb);
      setPreviewWidth(data.storage.preview_max_width);
      setThumbSize(data.storage.thumbnail_size);
      setDigestHour(data.storage.slack_digest_hour);
      setInitialized(true);
    }
  }, [data, initialized]);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, any>) => api.put("/api/v1/system", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      setSaveError("");
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  function handleSave() {
    saveMutation.mutate({
      max_upload_size_mb: maxUpload,
      image_preview_max_width: previewWidth,
      image_thumbnail_size: thumbSize,
      slack_digest_hour: digestHour,
    });
  }

  const hasChanges = data && (
    maxUpload !== data.storage.max_upload_size_mb ||
    previewWidth !== data.storage.preview_max_width ||
    thumbSize !== data.storage.thumbnail_size ||
    digestHour !== data.storage.slack_digest_hour
  );

  if (user && user.role !== "admin") {
    return (
      <div className="flex flex-col h-full">
        <Header />
        <AccessDenied message="Only administrators can access system settings." />
      </div>
    );
  }

  const storage = data?.storage;
  const system = data?.system;
  const usedPercent = storage ? Math.round((storage.used_bytes / Math.max(storage.total_bytes, 1)) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex-1 p-3 sm:p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">System Settings</h1>
              <p className="text-sm text-gray-500">Manage system configuration and monitor health</p>
            </div>
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                <Save className="w-4 h-4" />
                {saveMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            )}
          </div>

          {saveError && <p className="text-sm text-danger-500 mb-4">{saveError}</p>}

          {isLoading && (
            <div className="space-y-6 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-6">
                  <div className="h-5 bg-gray-100 rounded w-40 mb-4" />
                  <div className="space-y-3"><div className="h-4 bg-gray-50 rounded w-full" /><div className="h-4 bg-gray-50 rounded w-3/4" /></div>
                </div>
              ))}
            </div>
          )}

          {data && (
            <div className="space-y-6">
              {/* Storage */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <HardDrive className="w-4 h-4 text-primary-600" />
                  <h2 className="text-sm font-semibold text-gray-900">Storage</h2>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500">Used: {formatBytes(storage!.used_bytes)}</span>
                    <span className="text-xs text-gray-500">Total: {formatBytes(storage!.total_bytes)}</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${usedPercent > 90 ? "bg-danger-500" : usedPercent > 70 ? "bg-warning-500" : "bg-primary-500"}`}
                      style={{ width: `${Math.min(usedPercent, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-gray-400">{usedPercent}% used</span>
                    <span className="text-[10px] text-gray-400">{formatBytes(storage!.free_bytes)} free</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Max Upload Size (MB)</label>
                    <input
                      type="number" min={1} max={500} value={maxUpload}
                      onChange={(e) => setMaxUpload(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">1–500 MB</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg flex flex-col justify-center">
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Free Space</p>
                    <p className="text-sm font-medium text-gray-900">{formatBytes(storage!.free_bytes)}</p>
                  </div>
                </div>
              </div>

              {/* Image Processing */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <ImageIcon className="w-4 h-4 text-primary-600" />
                  <h2 className="text-sm font-semibold text-gray-900">Image Processing</h2>
                  <span className="text-[10px] text-gray-400">Changes apply to future uploads only</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Preview Max Width (px)</label>
                    <input
                      type="number" min={100} max={2000} value={previewWidth}
                      onChange={(e) => setPreviewWidth(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">100–2000 px. Used in description and comments.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Thumbnail Size (px)</label>
                    <input
                      type="number" min={50} max={500} value={thumbSize}
                      onChange={(e) => setThumbSize(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">50–500 px. Square crop for file list.</p>
                  </div>
                </div>
              </div>

              {/* Allowed File Types */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileType className="w-4 h-4 text-primary-600" />
                  <h2 className="text-sm font-semibold text-gray-900">Allowed File Types</h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {storage!.allowed_file_types.map((mime) => (
                    <span key={mime} className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-md" title={mime}>
                      {formatMime(mime)}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">File type editing via API only for now.</p>
              </div>

              {/* Digest Schedule */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-primary-600" />
                  <h2 className="text-sm font-semibold text-gray-900">Daily Digest</h2>
                </div>
                <div className="max-w-xs">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Digest Hour (0–23)</label>
                  <input
                    type="number" min={0} max={23} value={digestHour}
                    onChange={(e) => setDigestHour(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Hour in each user&apos;s local timezone when daily digest is sent.</p>
                </div>
              </div>

              {/* System Info */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Server className="w-4 h-4 text-primary-600" />
                  <h2 className="text-sm font-semibold text-gray-900">System Info</h2>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-500">App Version</span>
                    <span className="text-xs font-medium text-gray-900">{system!.app_version}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-500">Storage Path</span>
                    <span className="text-xs font-mono text-gray-600">{system!.storage_path}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-500">Database</span>
                    <span className="flex items-center gap-1 text-xs">
                      {system!.database_connected ? <><CheckCircle className="w-3.5 h-3.5 text-success-500" /> Connected</> : <><XCircle className="w-3.5 h-3.5 text-danger-500" /> Disconnected</>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-gray-500">Attachments Directory</span>
                    <span className="flex items-center gap-1 text-xs">
                      {system!.attachments_dir_exists ? <><CheckCircle className="w-3.5 h-3.5 text-success-500" /> Exists</> : <><XCircle className="w-3.5 h-3.5 text-danger-500" /> Missing</>}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
