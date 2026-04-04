"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, UsersRound, Trash2 } from "lucide-react";
import { Header } from "@/components/header";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Client, PaginatedResponse } from "@/lib/types";

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", notes: "" });
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const router = useRouter();

  const { data, isLoading } = useQuery<PaginatedResponse<Client>>({
    queryKey: ["clients"],
    queryFn: () => api.get("/api/v1/clients?limit=100"),
  });

  const { data: clientCounts } = useQuery<{ id: string; project_count: number }[]>({
    queryKey: ["clients-with-counts"],
    queryFn: () => api.get("/api/v1/clients/with-counts"),
  });
  const countMap = new Map(clientCounts?.map((c) => [c.id, c.project_count]) ?? []);

  const createClient = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/clients", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      closeModal();
      setSuccessMsg("Client created");
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateClient = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, any> }) => api.put(`/api/v1/clients/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      closeModal();
      setSuccessMsg("Client updated");
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteClient = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/clients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      closeModal();
      setSuccessMsg("Client deactivated");
      setTimeout(() => setSuccessMsg(""), 3000);
    },
  });

  function openCreate() {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", company: "", notes: "" });
    setError("");
    setShowModal(true);
  }

  function openEdit(c: Client) {
    setEditing(c);
    setForm({ name: c.name, email: c.email || "", phone: c.phone || "", company: c.company || "", notes: c.notes || "" });
    setError("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setError("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (editing) {
      const body: Record<string, any> = {};
      if (form.name !== editing.name) body.name = form.name;
      if (form.email !== (editing.email || "")) body.email = form.email || null;
      if (form.phone !== (editing.phone || "")) body.phone = form.phone || null;
      if (form.company !== (editing.company || "")) body.company = form.company || null;
      if (form.notes !== (editing.notes || "")) body.notes = form.notes || null;
      updateClient.mutate({ id: editing.id, body });
    } else {
      createClient.mutate(form);
    }
  }

  const clients = data?.items ?? [];
  const canManage = user?.role === "admin" || user?.role === "manager";

  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex-1 p-3 sm:p-6 overflow-auto">
        {successMsg && (
          <div className="mb-4 px-4 py-2.5 bg-success-50 border border-success-100 text-success-700 text-sm rounded-lg">
            {successMsg}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
            <p className="text-sm text-gray-500 mt-0.5">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
          </div>
          {canManage && (
            <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors">
              <Plus className="w-4 h-4" />
              Add Client
            </button>
          )}
        </div>

        {isLoading && (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg" />)}
          </div>
        )}

        {!isLoading && clients.length === 0 && (
          <div className="text-center py-20">
            <UsersRound className="w-10 h-10 text-gray-200 mx-auto mb-4" />
            <p className="text-sm font-medium text-gray-500">No clients yet</p>
          </div>
        )}

        <div className="space-y-2">
          {clients.map((c) => {
            const pCount = countMap.get(c.id) ?? 0;
            return (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4 hover:shadow-sm transition-all">
              <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 font-bold text-sm shrink-0">
                {c.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {c.company && <span>{c.company}</span>}
                  {c.email && <span>{c.email}</span>}
                  {c.phone && <span>{c.phone}</span>}
                </div>
              </div>
              <button
                onClick={() => router.push(`/projects?client=${c.id}`)}
                className="text-xs text-gray-500 hover:text-primary-600 transition-colors shrink-0"
              >
                {pCount} project{pCount !== 1 ? "s" : ""}
              </button>
              {canManage && (
                <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            );
          })}
        </div>
      </div>

      {/* Client modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-sm font-semibold">{editing ? "Edit Client" : "Add Client"}</h2>
              <button onClick={closeModal} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Company</label>
                <input type="text" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>

              {error && <p className="text-sm text-danger-500">{error}</p>}

              <div className="flex items-center pt-2">
                {editing && (
                  <button type="button" onClick={() => deleteClient.mutate(editing.id)} className="text-xs text-danger-500 hover:text-danger-700">
                    Deactivate
                  </button>
                )}
                <div className="flex-1" />
                <div className="flex gap-2">
                  <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                  <button type="submit" disabled={createClient.isPending || updateClient.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                    {editing ? "Save" : "Create Client"}
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
