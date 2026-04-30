"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  DeveloperUser,
  DeveloperUserAPI,
  CreateDeveloperUserPayload,
  UpdateDeveloperUserPayload,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDisplayDateTime } from "@/lib/dateTime";
import {
  isStrongPassword,
  PASSWORD_POLICY_ERROR,
  PASSWORD_POLICY_HINT,
} from "@/lib/passwordPolicy";

// Generate a random 6-char uppercase key (preview only; server generates the real one)
function generatePreviewKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let key = "";
  for (let i = 0; i < 6; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

type FormState = {
  name: string; // manager name
  email: string;
  phone: string;
  developer_name: string;
  rera_no: string;
  gst_no: string;
  address: string;
  password: string;
  password_confirmation: string;
  is_active: boolean;
  preview_key: string; // read-only display key
};

const initialForm = (): FormState => ({
  name: "",
  email: "",
  phone: "",
  developer_name: "",
  rera_no: "",
  gst_no: "",
  address: "",
  password: "",
  password_confirmation: "",
  is_active: true,
  preview_key: generatePreviewKey(),
});

export default function DeveloperUsersPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<DeveloperUser[]>([]);
  const [deletedRows, setDeletedRows] = useState<DeveloperUser[]>([]);
  const [viewMode, setViewMode] = useState<"active" | "deleted">("active");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<DeveloperUser | null>(null);
  const [form, setForm] = useState<FormState>(initialForm());
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isAdmin = useMemo(() => user?.role === "admin", [user]);
  const roleLabel = (role: string) =>
    role === "developer_super_admin" ? "Developer Super Admin" : role;
  const roleClass = (role: string) =>
    role === "developer_super_admin"
      ? "role-developer-super-admin"
      : "";

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/");
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isAdmin) {
      router.replace("/customer");
    }
  }, [isLoading, isAuthenticated, isAdmin, router]);

  const load = async () => {
    try {
      setLoadingData(true);
      setError("");
      const res = await DeveloperUserAPI.list(search || undefined);
      setRows((res.data ?? []).filter((u) => u.id !== user?.id));
      setDeletedRows((res.deleted_data ?? []).filter((u) => u.id !== user?.id));
    } catch (e) {
      setError(
        (e as { message?: string }).message ||
          "Failed to load developer users.",
      );
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isAdmin]);

  const openCreate = () => {
    setEditRow(null);
    setForm(initialForm());
    setFormError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowModal(true);
  };

  const openEdit = (row: DeveloperUser) => {
    setEditRow(row);
    setForm({
      name: row.name,
      email: row.email,
      phone: row.phone || "",
      developer_name: row.developer_name || "",
      rera_no: row.rera_no || "",
      gst_no: row.gst_no || "",
      address: row.address || "",
      password: "",
      password_confirmation: "",
      is_active: row.is_active,
      preview_key: row.unique_key,
    });
    setFormError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowModal(true);
  };

  const submit = async () => {
    try {
      setSaving(true);
      setFormError("");

      if (
        !form.name.trim() ||
        !form.email.trim() ||
        !form.developer_name.trim()
      ) {
        setFormError("Manager name, email and developer name are required.");
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

        const payload: CreateDeveloperUserPayload = {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          developer_name: form.developer_name,
          rera_no: form.rera_no || undefined,
          gst_no: form.gst_no || undefined,
          address: form.address || undefined,
          password: form.password,
          password_confirmation: form.password_confirmation,
        };

        await DeveloperUserAPI.create(payload);
      } else {
        const payload: UpdateDeveloperUserPayload = {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          developer_name: form.developer_name,
          rera_no: form.rera_no || undefined,
          gst_no: form.gst_no || undefined,
          address: form.address || undefined,
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

        await DeveloperUserAPI.update(editRow.id, payload);
      }

      setShowModal(false);
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
    const ok = window.confirm("Delete this developer user?");
    if (!ok) return;
    try {
      setDeletingId(id);
      if (viewMode === "deleted") {
        await DeveloperUserAPI.forceDelete(id);
      } else {
        await DeveloperUserAPI.delete(id);
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
      await DeveloperUserAPI.restore(id);
      await load();
    } catch (e) {
      setError((e as { message?: string }).message || "Restore failed.");
    } finally {
      setRestoringId(null);
    }
  };

  if (isLoading || !isAuthenticated || !isAdmin) {
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
        {/* Banner */}
        <div
          className="px-4 md:px-8 py-5"
          style={{ background: "var(--gradient-header)" }}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="page-banner-sub">Admin Access</p>
              <h2 className="page-banner-title">Developer User Management</h2>
            </div>
            <button className="btn btn-gold" onClick={openCreate}>
              + Create Developer User
            </button>
          </div>
        </div>

        <div className="px-3 sm:px-4 md:px-8 py-4 md:py-6 max-w-7xl mx-auto">
          {error && <div className="alert alert-danger mb-4">{error}</div>}

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
                  placeholder="Search name, email, developer name, key"
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
                      <th>Manager Name</th>
                      <th>Developer Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>RERA</th>
                      <th>GST</th>
                      <th>Unique Key</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingData ? (
                      <tr>
                        <td colSpan={11} className="text-center py-8">
                          <div className="spinner" />
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="text-center py-8">
                          No developer users found.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr key={r.id}>
                          <td className="font-medium">{r.name}</td>
                          <td>
                            <span className="context-pill">
                              {r.developer_name || "—"}
                            </span>
                          </td>
                          <td>{r.email}</td>
                          <td>{r.phone || "-"}</td>
                          <td>{r.rera_no || "-"}</td>
                          <td>{r.gst_no || "-"}</td>
                          <td>
                            <span
                              className="font-mono text-xs font-bold px-2 py-1 rounded"
                              style={{
                                background: "var(--gold-50, #fef9e7)",
                                color: "var(--gold-700, #b45309)",
                                border: "1px solid var(--gold-200, #fde68a)",
                                letterSpacing: "0.15em",
                              }}
                            >
                              {r.unique_key}
                            </span>
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
                  Deleted Developer Users ({deletedRows.length})
                </h3>
              </div>
              <div className="table-responsive">
                <table className="data-table bg-white">
                  <thead>
                    <tr>
                      <th>Manager Name</th>
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
                          No deleted developer users.
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

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div
            className="modal-card bg-white"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">
                {editRow ? "Edit Developer User" : "Create Developer User"}
              </h3>
            </div>

            <div className="modal-body space-y-3">
              {/* Role badge */}
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
                style={{
                  background: "var(--navy-50, #eef2ff)",
                  color: "var(--navy-700, #3730a3)",
                  border: "1px solid var(--navy-200, #c7d2fe)",
                }}
              >
                <span>🏗️</span>
                <span>Role: Developer Super Admin</span>
              </div>

              {/* Unique Key (read-only) */}
              <div>
                <label className="auth-form-label text-xs font-semibold mb-1 block">
                  Unique Key (auto-generated, read-only)
                </label>
                <input
                  className="auth-form-input font-mono tracking-widest font-bold text-center"
                  value={form.preview_key}
                  readOnly
                  style={{
                    background: "var(--slate-50, #f8fafc)",
                    color: "var(--gold-700, #b45309)",
                    cursor: "not-allowed",
                  }}
                />
                {!editRow && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--slate-400)" }}
                  >
                    The final key will be generated by the server when saving.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="auth-form-label">Manager Name *</label>
                  <input
                    className="auth-form-input"
                    placeholder="Manager Name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="auth-form-label">
                    Developer / Company Name *
                  </label>
                  <input
                    className="auth-form-input"
                    placeholder="Developer Name"
                    value={form.developer_name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, developer_name: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="auth-form-label">Email *</label>
                  <input
                    className="auth-form-input"
                    placeholder="Email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, email: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="auth-form-label">Phone No</label>
                  <input
                    className="auth-form-input"
                    placeholder="10-digit phone"
                    value={form.phone}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="auth-form-label">RERA No</label>
                  <input
                    className="auth-form-input"
                    placeholder="RERA Registration No"
                    value={form.rera_no}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, rera_no: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="auth-form-label">GST No</label>
                  <input
                    className="auth-form-input"
                    placeholder="GST Number"
                    value={form.gst_no}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        gst_no: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                </div>
              </div>

              <div>
                <label className="auth-form-label">Address</label>
                <input
                  className="auth-form-input"
                  placeholder="Address"
                  value={form.address}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, address: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="auth-form-label">
                    {editRow ? "New Password (optional)" : "Password *"}
                  </label>
                  <div className="relative">
                    <input
                      className="auth-form-input"
                      placeholder={
                        editRow ? "Leave blank to keep" : "Min 8 chars"
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
                </div>
                <div>
                  <label className="auth-form-label">Confirm Password</label>
                  <div className="relative">
                    <input
                      className="auth-form-input"
                      placeholder="Confirm Password"
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
              </div>
              <p
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                {PASSWORD_POLICY_HINT}
              </p>

              {editRow && (
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, is_active: e.target.checked }))
                    }
                  />
                  Active
                </label>
              )}
            </div>

            {formError && (
              <div className="alert alert-danger text-sm mb-3">{formError}</div>
            )}
            <div className="modal-footer flex gap-2 justify-end">
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
                {saving
                  ? "Saving..."
                  : editRow
                    ? "Update"
                    : "Create Developer User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
