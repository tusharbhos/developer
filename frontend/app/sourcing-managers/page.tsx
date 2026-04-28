"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  SourcingManagerAPI,
  SourcingManager,
  CreateSourcingManagerPayload,
  UpdateSourcingManagerPayload,
} from "@/lib/api";
import { fetchAllProjects, ApiProject } from "@/lib/conectr";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { formatDisplayDateTime } from "@/lib/dateTime";
import {
  isStrongPassword,
  PASSWORD_POLICY_ERROR,
  PASSWORD_POLICY_HINT,
} from "@/lib/passwordPolicy";

// ── helpers ───────────────────────────────────────────────────────────────────
function normalize(s?: string | null) {
  return (s ?? "").trim().toLowerCase();
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SourcingManagersPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const canManageSourcingManagers =
    user?.role === "developer_super_admin" || user?.role === "admin";

  const [managers, setManagers] = useState<SourcingManager[]>([]);
  const [deletedManagers, setDeletedManagers] = useState<SourcingManager[]>([]);
  const [viewMode, setViewMode] = useState<"active" | "deleted">("active");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Developer's projects only
  const [devProjects, setDevProjects] = useState<ApiProject[]>([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SourcingManager | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    assigned_projects: [] as string[],
    password: "",
    password_confirmation: "",
  });

  const roleLabel = (role: string) =>
    role === "sourcing_admin" ? "Sourcing Admin" : role;
  const roleClass = (role: string) =>
    role === "sourcing_admin" ? "role-sourcing-admin" : "role-company-user";

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (!authLoading && isAuthenticated && !canManageSourcingManagers) {
      router.replace("/projects");
    }
  }, [authLoading, isAuthenticated, canManageSourcingManagers, router]);

  // ── Fetch developer's projects ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    fetchAllProjects().then(({ projects }) => {
      if (user.role === "admin") {
        setDevProjects(projects);
        return;
      }
      if (!user.developer_name) {
        setDevProjects([]);
        return;
      }
      const mine = projects.filter(
        (p) => normalize(p.developer) === normalize(user.developer_name),
      );
      setDevProjects(mine);
    });
  }, [user?.developer_name]);

  // ── Fetch managers ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await SourcingManagerAPI.list(search || undefined);
      setManagers((res.data ?? []).filter((u) => u.id !== user?.id));
      setDeletedManagers(
        (res.deleted_data ?? []).filter((u) => u.id !== user?.id),
      );
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message ?? "Failed to load managers",
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (canManageSourcingManagers) {
      load();
    }
  }, [load, canManageSourcingManagers]);

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      email: "",
      phone: "",
      address: "",
      assigned_projects: [],
      password: "",
      password_confirmation: "",
    });
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(mgr: SourcingManager) {
    setEditing(mgr);
    setForm({
      name: mgr.name,
      email: mgr.email,
      phone: mgr.phone ?? "",
      address: mgr.address ?? "",
      assigned_projects: mgr.assigned_projects ?? [],
      password: "",
      password_confirmation: "",
    });
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFormError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setFormError(null);
  }

  function toggleProject(title: string) {
    setForm((prev) => ({
      ...prev,
      assigned_projects: prev.assigned_projects.includes(title)
        ? prev.assigned_projects.filter((p) => p !== title)
        : [...prev.assigned_projects, title],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.name.trim() || !form.email.trim()) {
      setFormError("Name and Email are required.");
      return;
    }
    if (form.phone && form.phone.length !== 10) {
      setFormError("Phone must be exactly 10 digits.");
      return;
    }
    if (!editing && !form.password) {
      setFormError("Password is required.");
      return;
    }
    if (form.password && !isStrongPassword(form.password)) {
      setFormError(PASSWORD_POLICY_ERROR);
      return;
    }
    if (form.password && form.password !== form.password_confirmation) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        const payload: UpdateSourcingManagerPayload = {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          address: form.address || undefined,
          assigned_projects: form.assigned_projects,
        };
        if (form.password) {
          payload.password = form.password;
          payload.password_confirmation = form.password_confirmation;
        }
        await SourcingManagerAPI.update(editing.id, payload);
      } else {
        const payload: CreateSourcingManagerPayload = {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          address: form.address || undefined,
          assigned_projects: form.assigned_projects,
          password: form.password,
          password_confirmation: form.password_confirmation,
        };
        await SourcingManagerAPI.create(payload);
      }
      closeModal();
      load();
    } catch (e: unknown) {
      const err = e as { message?: string; errors?: Record<string, string[]> };
      if (err.errors) {
        setFormError(Object.values(err.errors).flat().join(", "));
      } else {
        setFormError(err.message ?? "Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(mgr: SourcingManager) {
    if (
      !confirm(`Delete sourcing manager "${mgr.name}"? This cannot be undone.`)
    )
      return;
    try {
      if (viewMode === "deleted") {
        await SourcingManagerAPI.forceDelete(mgr.id);
      } else {
        await SourcingManagerAPI.delete(mgr.id);
      }
      load();
    } catch {
      alert("Failed to delete. Please try again.");
    }
  }

  async function handleToggleActive(mgr: SourcingManager) {
    try {
      await SourcingManagerAPI.update(mgr.id, { is_active: !mgr.is_active });
      load();
    } catch {
      alert("Failed to update status.");
    }
  }

  async function handleRestore(mgr: SourcingManager) {
    try {
      setRestoringId(mgr.id);
      await SourcingManagerAPI.restore(mgr.id);
      load();
    } catch {
      alert("Failed to restore. Please try again.");
    } finally {
      setRestoringId(null);
    }
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(
    () =>
      managers.filter(
        (m) =>
          !search ||
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          m.email.toLowerCase().includes(search.toLowerCase()) ||
          (m.phone || "").includes(search),
      ),
    [managers, search],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (authLoading || !isAuthenticated || !canManageSourcingManagers) {
    return (
      <div className="page-loader">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-main">
      <Header variant="app" />

      <main className="flex-1" style={{ paddingTop: "var(--header-height)" }}>
        <div
          className="px-4 md:px-8 py-5"
          style={{ background: "var(--gradient-header)" }}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="page-banner-sub">Developer Super Admin</p>
              <h2 className="page-banner-title">Sourcing Manager Management</h2>
            </div>
            <button className="btn btn-gold" onClick={openCreate}>
              + Add Sourcing Manager
            </button>
          </div>
        </div>

        <div className="px-3 sm:px-4 md:px-8 py-4 md:py-6 max-w-7xl mx-auto">
          {/* Page header */}
          <div className="glass-card p-4 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm" style={{ color: "var(--slate-500)" }}>
                  Manage sourcing managers under{" "}
                  <span
                    className="font-semibold"
                    style={{ color: "var(--navy-700)" }}
                  >
                    {user.developer_name}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="glass-card p-4 mb-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div
                className="flex w-full sm:w-fit flex-col sm:flex-row rounded-xl p-1"
                style={{ background: "var(--slate-100)" }}
              >
                <button
                  className={
                    viewMode === "active"
                      ? "btn btn-primary w-full sm:w-auto"
                      : "btn btn-ghost w-full sm:w-auto"
                  }
                  onClick={() => setViewMode("active")}
                >
                  Present Users ({filtered.length})
                </button>
                <button
                  className={
                    viewMode === "deleted"
                      ? "btn btn-primary w-full sm:w-auto"
                      : "btn btn-ghost w-full sm:w-auto"
                  }
                  onClick={() => setViewMode("deleted")}
                >
                  Restore Users ({deletedManagers.length})
                </button>
              </div>

              <div className="flex w-full lg:w-auto gap-3 items-center lg:justify-end">
                <input
                  type="text"
                  placeholder="Search name, email, phone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-field w-full sm:w-80"
                />
                <button className="btn btn-primary shrink-0" onClick={load}>
                  Search
                </button>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && <div className="alert alert-danger mb-4">{error}</div>}

          {viewMode === "active" && loading && (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
          )}

          {viewMode === "active" && !loading && filtered.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              <div className="text-5xl mb-4">👤</div>
              <p className="text-lg font-medium">No sourcing managers found</p>
              <p className="text-sm mt-1">
                Click "Add Sourcing Manager" to create one.
              </p>
            </div>
          )}

          {viewMode === "active" && !loading && filtered.length > 0 && (
            <div className="glass-card table-shell p-0 overflow-hidden">
              <div className="table-responsive">
                <table className="data-table bg-white">
                  <thead>
                    <tr>
                      {[
                        "#",
                        "Name",
                        "Email",
                        "Phone",
                        "Address",
                        "Role",
                        "Assigned Projects",
                        "Status",
                        "Created",
                        "Actions",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((mgr, idx) => (
                      <tr
                        key={mgr.id}
                        className="hover:bg-blue-50/40 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-gray-400">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {mgr.name}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="context-pill">
                            {mgr.developer_name || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {mgr.email}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {mgr.phone || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {mgr.address || (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`role-pill ${roleClass(mgr.role)}`}>
                            {roleLabel(mgr.role)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {mgr.assigned_projects?.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {mgr.assigned_projects.map((p) => (
                                <span
                                  key={p}
                                  className="bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-0.5 text-xs"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">
                              None assigned
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleActive(mgr)}
                            className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                              mgr.is_active
                                ? "bg-green-100 text-green-700 hover:bg-green-200"
                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${mgr.is_active ? "bg-green-500" : "bg-gray-400"}`}
                            />
                            {mgr.is_active ? "Active" : "Inactive"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDisplayDateTime(mgr.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEdit(mgr)}
                              className="btn btn-ghost"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(mgr)}
                              className="btn btn-danger"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewMode === "deleted" && (
            <div className="glass-card table-shell p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200">
                <h3
                  className="font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Deleted Sourcing Managers ({deletedManagers.length})
                </h3>
              </div>
              <div className="table-responsive">
                <table className="data-table bg-white">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Developer</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Deleted At</th>
                      <th>Deleted By</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8">
                          <div className="spinner" />
                        </td>
                      </tr>
                    ) : deletedManagers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8">
                          No deleted sourcing managers.
                        </td>
                      </tr>
                    ) : (
                      deletedManagers.map((mgr) => (
                        <tr key={mgr.id}>
                          <td>{mgr.name}</td>
                          <td>
                            <span className="context-pill">
                              {mgr.developer_name || "—"}
                            </span>
                          </td>
                          <td>{mgr.email}</td>
                          <td>
                            <span
                              className={`role-pill ${roleClass(mgr.role)}`}
                            >
                              {roleLabel(mgr.role)}
                            </span>
                          </td>
                          <td>
                            {mgr.deleted_at
                              ? formatDisplayDateTime(mgr.deleted_at)
                              : "-"}
                          </td>
                          <td>
                            <span className="text-sm text-gray-600">
                              {mgr.deleted_by_name || "—"}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <button
                                className="btn btn-primary"
                                onClick={() => handleRestore(mgr)}
                                disabled={restoringId === mgr.id}
                              >
                                {restoringId === mgr.id
                                  ? "Restoring..."
                                  : "Restore"}
                              </button>
                              <button
                                className="btn btn-danger"
                                onClick={() => handleDelete(mgr)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay">
          <div
            className="modal-card bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">
                {editing ? "Edit Sourcing Manager" : "Add Sourcing Manager"}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="modal-body space-y-3">
              {/* Name */}
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Full name"
                className="auth-form-input"
                required
              />

              {/* Email */}
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="email@example.com"
                className="auth-form-input"
                required
              />

              <input
                type="text"
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                  }))
                }
                placeholder="Phone"
                className="auth-form-input"
              />

              {/* Address */}
              <textarea
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
                placeholder="Office address"
                rows={2}
                className="auth-form-input resize-none"
              />

              {/* Project multi-select */}
              <div>
                <label className="auth-form-label mb-2">
                  Assign Projects
                  <span
                    className="ml-2 text-xs font-normal"
                    style={{ color: "var(--slate-500)" }}
                  >
                    ({form.assigned_projects.length} selected)
                  </span>
                </label>

                {devProjects.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    No projects found for {user.developer_name}.
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {devProjects.map((proj) => {
                      const title = proj.title ?? "";
                      const checked = form.assigned_projects.includes(title);
                      return (
                        <label
                          key={proj.id}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                            checked ? "bg-blue-50" : "hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProject(title)}
                            className="w-4 h-4 rounded shrink-0"
                            style={{ accentColor: "var(--navy-600)" }}
                          />
                          <span className="text-sm text-gray-800">{title}</span>
                          {proj.location && (
                            <span className="ml-auto text-xs text-gray-400 truncate max-w-30">
                              {proj.location}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                    placeholder={
                      editing ? "New Password (optional)" : "Password"
                    }
                    className="auth-form-input"
                    style={{ paddingRight: "2.6rem" }}
                    {...(!editing ? { required: true } : {})}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{
                      color: "var(--color-text-muted)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      lineHeight: 0,
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M2 12C3.6 7.9 7.4 5 12 5s8.4 2.9 10 7c-1.6 4.1-5.4 7-10 7s-8.4-2.9-10-7Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="3"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      {showPassword && (
                        <path
                          d="M4 20 20 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      )}
                    </svg>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.password_confirmation}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        password_confirmation: e.target.value,
                      }))
                    }
                    placeholder={
                      editing ? "Confirm New Password" : "Confirm Password"
                    }
                    className="auth-form-input"
                    style={{ paddingRight: "2.6rem" }}
                    {...(!editing ? { required: true } : {})}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirm password"
                        : "Show confirm password"
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{
                      color: "var(--color-text-muted)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      lineHeight: 0,
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M2 12C3.6 7.9 7.4 5 12 5s8.4 2.9 10 7c-1.6 4.1-5.4 7-10 7s-8.4-2.9-10-7Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="3"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      {showConfirmPassword && (
                        <path
                          d="M4 20 20 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              <p
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                {PASSWORD_POLICY_HINT}
              </p>

              {formError && (
                <div className="alert alert-danger text-sm mb-3">
                  {formError}
                </div>
              )}

              {/* Submit */}
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-gold"
                >
                  {submitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
