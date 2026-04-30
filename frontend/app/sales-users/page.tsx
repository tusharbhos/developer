"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import {
  SalesUser,
  SalesUserAPI,
  CreateSalesUserPayload,
  UpdateSalesUserPayload,
} from "@/lib/api";
import { formatDisplayDateTime } from "@/lib/dateTime";
import {
  isStrongPassword,
  PASSWORD_POLICY_ERROR,
  PASSWORD_POLICY_HINT,
} from "@/lib/passwordPolicy";

type FormState = {
  name: string;
  email: string;
  phone: string;
  address: string;
  assigned_projects: string[];
  password: string;
  password_confirmation: string;
  is_active: boolean;
};

const initialForm: FormState = {
  name: "",
  email: "",
  phone: "",
  address: "",
  assigned_projects: [],
  password: "",
  password_confirmation: "",
  is_active: true,
};

export default function SalesUsersPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<SalesUser[]>([]);
  const [deletedRows, setDeletedRows] = useState<SalesUser[]>([]);
  const [viewMode, setViewMode] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<SalesUser | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const canManageSalesUsers =
    user?.role === "sourcing_admin" ||
    user?.role === "admin" ||
    user?.role === "developer_super_admin";
  const availableProjects = user?.assigned_projects ?? [];
  const roleLabel = (role: string) =>
    role === "sales_user" ? "Sales User" : role;
  const roleClass = (role: string) =>
    role === "sales_user" ? "role-sales-user" : "";

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && !canManageSalesUsers) {
      router.replace("/projects");
    }
  }, [isLoading, isAuthenticated, canManageSalesUsers, router]);

  const load = async () => {
    try {
      setLoadingData(true);
      setError("");
      const res = await SalesUserAPI.list(search || undefined);
      setRows((res.data ?? []).filter((u) => u.id !== user?.id));
      setDeletedRows((res.deleted_data ?? []).filter((u) => u.id !== user?.id));
    } catch (e) {
      setError(
        (e as { message?: string }).message || "Failed to load sales users.",
      );
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && canManageSalesUsers) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, canManageSalesUsers]);

  const openCreate = () => {
    setEditRow(null);
    setForm(initialForm);
    setFormError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowModal(true);
  };

  const openEdit = (row: SalesUser) => {
    setEditRow(row);
    setForm({
      name: row.name,
      email: row.email,
      phone: row.phone || "",
      address: row.address || "",
      assigned_projects: row.assigned_projects || [],
      password: "",
      password_confirmation: "",
      is_active: row.is_active,
    });
    setFormError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowModal(true);
  };

  const toggleProject = (projectName: string) => {
    setForm((prev) => ({
      ...prev,
      assigned_projects: prev.assigned_projects.includes(projectName)
        ? prev.assigned_projects.filter((p) => p !== projectName)
        : [...prev.assigned_projects, projectName],
    }));
  };

  const submit = async () => {
    try {
      setSaving(true);
      setFormError("");

      if (!form.name.trim() || !form.email.trim()) {
        setFormError("Name and email are required.");
        return;
      }

      if (form.phone && form.phone.length !== 10) {
        setFormError("Phone must be exactly 10 digits.");
        return;
      }

      if (!editRow) {
        if (!form.password) {
          setFormError("Password is required.");
          return;
        }
        if (!isStrongPassword(form.password)) {
          setFormError(PASSWORD_POLICY_ERROR);
          return;
        }
        if (form.password !== form.password_confirmation) {
          setFormError("Password confirmation does not match.");
          return;
        }

        const payload: CreateSalesUserPayload = {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          address: form.address || undefined,
          assigned_projects: form.assigned_projects,
          password: form.password,
          password_confirmation: form.password_confirmation,
        };

        await SalesUserAPI.create(payload);
      } else {
        const payload: UpdateSalesUserPayload = {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          address: form.address || undefined,
          assigned_projects: form.assigned_projects,
          is_active: form.is_active,
        };

        if (form.password) {
          if (!isStrongPassword(form.password)) {
            setFormError(PASSWORD_POLICY_ERROR);
            return;
          }
          if (form.password !== form.password_confirmation) {
            setFormError("Password confirmation does not match.");
            return;
          }
          payload.password = form.password;
          payload.password_confirmation = form.password_confirmation;
        }

        await SalesUserAPI.update(editRow.id, payload);
      }

      setShowModal(false);
      setForm(initialForm);
      setEditRow(null);
      setFormError("");
      await load();
    } catch (e) {
      setFormError((e as { message?: string }).message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const removeRow = async (id: number) => {
    const ok = window.confirm("Delete this sales user?");
    if (!ok) return;

    try {
      setDeletingId(id);
      if (viewMode === "deleted") {
        await SalesUserAPI.forceDelete(id);
      } else {
        await SalesUserAPI.delete(id);
      }
      await load();
    } catch (e) {
      setError((e as { message?: string }).message || "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  const restoreRow = async (id: number) => {
    try {
      setRestoringId(id);
      await SalesUserAPI.restore(id);
      await load();
    } catch (e) {
      setError((e as { message?: string }).message || "Restore failed.");
    } finally {
      setRestoringId(null);
    }
  };

  if (isLoading || !isAuthenticated || !canManageSalesUsers) {
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
              <p className="page-banner-sub">Sourcing Admin Access</p>
              <h2 className="page-banner-title">Sales User Management</h2>
            </div>
            <button className="btn btn-gold" onClick={openCreate}>
              + Create Sales User
            </button>
          </div>
        </div>

        <div className="px-3 sm:px-4 md:px-8 py-4 md:py-6 max-w-7xl mx-auto">
          {error && <div className="alert alert-danger mb-4">{error}</div>}

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
                  Present Users ({rows.length})
                </button>
                <button
                  className={
                    viewMode === "deleted"
                      ? "btn btn-primary w-full sm:w-auto"
                      : "btn btn-ghost w-full sm:w-auto"
                  }
                  onClick={() => setViewMode("deleted")}
                >
                  Restore Users ({deletedRows.length})
                </button>
              </div>

              <div className="flex w-full lg:w-auto gap-3 items-center lg:justify-end">
                <input
                  className="input-field w-full sm:w-80"
                  placeholder="Search name, email, phone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="btn btn-primary shrink-0" onClick={load}>
                  Search
                </button>
              </div>
            </div>
          </div>

          {viewMode === "active" ? (
            <div className="glass-card table-shell p-0 overflow-hidden">
              <div className="table-responsive">
                <table className="data-table bg-white">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Developer</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Assigned Projects</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingData ? (
                      <tr>
                        <td colSpan={9} className="text-center py-8">
                          <div className="spinner" />
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-8">
                          No sales users found.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>
                            <span className="context-pill">
                              {r.developer_name || "—"}
                            </span>
                          </td>
                          <td>{r.email}</td>
                          <td>{r.phone || "-"}</td>
                          <td>
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {(r.assigned_projects ?? []).length ? (
                                r.assigned_projects.map((p) => (
                                  <span
                                    key={p}
                                    className="bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-0.5 text-xs"
                                  >
                                    {p}
                                  </span>
                                ))
                              ) : (
                                <span className="text-gray-400 text-xs">
                                  None
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`role-pill ${roleClass(r.role)}`}>
                              {roleLabel(r.role)}
                            </span>
                          </td>
                          <td>
                            <span
                              className={
                                r.is_active
                                  ? "badge badge-active"
                                  : "badge badge-inactive"
                              }
                            >
                              {r.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>{formatDisplayDateTime(r.created_at)}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <button
                                className="btn btn-ghost"
                                onClick={() => openEdit(r)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-danger"
                                onClick={() => removeRow(r.id)}
                                disabled={deletingId === r.id}
                              >
                                {deletingId === r.id ? "Deleting..." : "Delete"}
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
          ) : (
            <div className="glass-card table-shell p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200">
                <h3
                  className="font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Deleted Sales Users ({deletedRows.length})
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
                    {loadingData ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8">
                          <div className="spinner" />
                        </td>
                      </tr>
                    ) : deletedRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8">
                          No deleted sales users.
                        </td>
                      </tr>
                    ) : (
                      deletedRows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>
                            <span className="context-pill">
                              {r.developer_name || "—"}
                            </span>
                          </td>
                          <td>{r.email}</td>
                          <td>
                            <span className={`role-pill ${roleClass(r.role)}`}>
                              {roleLabel(r.role)}
                            </span>
                          </td>
                          <td>
                            {r.deleted_at
                              ? formatDisplayDateTime(r.deleted_at)
                              : "-"}
                          </td>
                          <td>
                            <span className="text-sm text-gray-600">
                              {r.deleted_by_name || "—"}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <button
                                className="btn btn-primary"
                                onClick={() => restoreRow(r.id)}
                                disabled={restoringId === r.id}
                              >
                                {restoringId === r.id
                                  ? "Restoring..."
                                  : "Restore"}
                              </button>
                              <button
                                className="btn btn-danger"
                                onClick={() => removeRow(r.id)}
                                disabled={deletingId === r.id}
                              >
                                {deletingId === r.id ? "Deleting..." : "Delete"}
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

      {showModal && (
        <div className="modal-overlay">
          <div
            className="modal-card bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">
                {editRow ? "Edit Sales User" : "Create Sales User"}
              </h3>
            </div>

            <div className="modal-body space-y-3">
              <input
                className="auth-form-input"
                placeholder="Name"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
              />
              <input
                className="auth-form-input"
                placeholder="Email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((p) => ({ ...p, email: e.target.value }))
                }
              />
              <input
                className="auth-form-input"
                placeholder="Phone"
                value={form.phone}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                  }))
                }
              />
              <input
                className="auth-form-input"
                placeholder="Address"
                value={form.address}
                onChange={(e) =>
                  setForm((p) => ({ ...p, address: e.target.value }))
                }
              />

              <div>
                <label className="auth-form-label mb-2">Assign Projects</label>
                {availableProjects.length === 0 ? (
                  <p
                    className="text-xs"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    No projects assigned to your sourcing account.
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {availableProjects.map((projectName) => {
                      const checked =
                        form.assigned_projects.includes(projectName);
                      return (
                        <label
                          key={projectName}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                            checked ? "bg-blue-50" : "hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProject(projectName)}
                            className="w-4 h-4 rounded shrink-0"
                            style={{ accentColor: "var(--navy-600)" }}
                          />
                          <span className="text-sm text-gray-800">
                            {projectName}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <input
                    className="auth-form-input"
                    placeholder={
                      editRow ? "New Password (optional)" : "Password"
                    }
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, password: e.target.value }))
                    }
                    style={{ paddingRight: "2.6rem" }}
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
                    className="auth-form-input"
                    placeholder={
                      editRow ? "Confirm New Password" : "Confirm Password"
                    }
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.password_confirmation}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        password_confirmation: e.target.value,
                      }))
                    }
                    style={{ paddingRight: "2.6rem" }}
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

              {editRow && (
                <label
                  className="flex items-center gap-2 text-sm"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, is_active: e.target.checked }))
                    }
                  />
                  Active User
                </label>
              )}
            </div>

            {formError && (
              <div className="alert alert-danger text-sm mb-3">{formError}</div>
            )}
            <div className="modal-footer">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setShowModal(false);
                  setFormError("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-gold"
                onClick={submit}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
