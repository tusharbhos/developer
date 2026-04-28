"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  CompanyUser,
  CompanyUserAPI,
  CreateCompanyUserPayload,
  UpdateCompanyUserPayload,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
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
  password: string;
  password_confirmation: string;
  is_active: boolean;
};

const initialForm: FormState = {
  name: "",
  email: "",
  phone: "",
  address: "",
  password: "",
  password_confirmation: "",
  is_active: true,
};

export default function CompanyUsersPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CompanyUser[]>([]);
  const [deletedRows, setDeletedRows] = useState<CompanyUser[]>([]);
  const [viewMode, setViewMode] = useState<"active" | "deleted">("active");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<CompanyUser | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, router]);

  const canManage = useMemo(() => Boolean(user?.is_company_owner), [user]);

  const canView = useMemo(
    () => canManage || user?.role === "admin",
    [canManage, user],
  );
  const isAdmin = user?.role === "admin";
  const canCreate = canManage || isAdmin;
  const canManageRows = canCreate;

  const roleLabel = (row: CompanyUser) =>
    row.is_company_owner ? "Company Owner" : "Company User";

  const roleClass = (row: CompanyUser) =>
    row.is_company_owner ? "role-company-owner" : "role-company-user";

  useEffect(() => {
    if (!isLoading && isAuthenticated && !canView) {
      router.replace("/customer");
    }
  }, [isLoading, isAuthenticated, canView, router]);

  const load = async () => {
    try {
      setLoadingData(true);
      setError("");
      const res = await CompanyUserAPI.list(search || undefined);
      setRows((res.data ?? []).filter((u) => u.id !== user?.id));
      setDeletedRows((res.deleted_data ?? []).filter((u) => u.id !== user?.id));
    } catch (e) {
      setError(
        (e as { message?: string }).message || "Failed to load company users.",
      );
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && canView) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, canView]);

  const openCreate = () => {
    setEditRow(null);
    setForm(initialForm);
    setFormError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowModal(true);
  };

  const openEdit = (row: CompanyUser) => {
    setEditRow(row);
    setForm({
      name: row.name,
      email: row.email,
      phone: row.phone || "",
      address: row.address || "",
      password: "",
      password_confirmation: "",
      is_active: row.is_active,
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

      if (!form.name.trim() || !form.email.trim()) {
        setFormError("Name and email are required.");
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

        const payload: CreateCompanyUserPayload = {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          address: form.address || undefined,
          password: form.password,
          password_confirmation: form.password_confirmation,
          is_active: form.is_active,
        };

        await CompanyUserAPI.create(payload);
      } else {
        const payload: UpdateCompanyUserPayload = {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
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

        await CompanyUserAPI.update(editRow.id, payload);
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
    const ok = window.confirm("Delete this company user?");
    if (!ok) return;

    try {
      setDeletingId(id);
      if (viewMode === "deleted") {
        await CompanyUserAPI.forceDelete(id);
      } else {
        await CompanyUserAPI.delete(id);
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
      await CompanyUserAPI.restore(id);
      await load();
    } catch (e) {
      setError((e as { message?: string }).message || "Restore failed.");
    } finally {
      setRestoringId(null);
    }
  };

  if (isLoading || !isAuthenticated || !canView) {
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
              <p className="page-banner-sub">Company Level Access</p>
              <h2 className="page-banner-title">Company User Management</h2>
            </div>
            {canCreate && viewMode === "active" && (
              <button className="btn btn-gold" onClick={openCreate}>
                + Create Company User
              </button>
            )}
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
                      <th>Company</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Created</th>
                      {canManageRows && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingData ? (
                      <tr>
                        <td
                          colSpan={canManageRows ? 8 : 7}
                          className="text-center py-8"
                        >
                          <div className="spinner" />
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={canManageRows ? 8 : 7}
                          className="text-center py-8"
                        >
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr key={r.id}>
                          <td className="font-medium">{r.name}</td>
                          <td>
                            <span className="context-pill">
                              {r.company_name || "—"}
                            </span>
                          </td>
                          <td>{r.email}</td>
                          <td>{r.phone || "-"}</td>
                          <td>
                            <span className={`role-pill ${roleClass(r)}`}>
                              {roleLabel(r)}
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
                          {canManageRows && (
                            <td>
                              <div className="flex items-center gap-2">
                                <button
                                  className="btn btn-ghost"
                                  onClick={() => openEdit(r)}
                                  disabled={Boolean(r.is_company_owner)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-danger"
                                  onClick={() => removeRow(r.id)}
                                  disabled={
                                    deletingId === r.id ||
                                    Boolean(r.is_company_owner)
                                  }
                                >
                                  {deletingId === r.id
                                    ? "Deleting..."
                                    : "Delete"}
                                </button>
                              </div>
                            </td>
                          )}
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
                  Deleted Users ({deletedRows.length})
                </h3>
              </div>
              <div className="table-responsive">
                <table className="data-table bg-white">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Company</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Deleted At</th>
                      <th>Deleted By</th>
                      {canManageRows && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingData ? (
                      <tr>
                        <td
                          colSpan={canManageRows ? 7 : 6}
                          className="text-center py-8"
                        >
                          <div className="spinner" />
                        </td>
                      </tr>
                    ) : deletedRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={canManageRows ? 7 : 6}
                          className="text-center py-8"
                        >
                          No deleted users.
                        </td>
                      </tr>
                    ) : (
                      deletedRows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>
                            <span className="context-pill">
                              {r.company_name || "—"}
                            </span>
                          </td>
                          <td>{r.email}</td>
                          <td>
                            <span className={`role-pill ${roleClass(r)}`}>
                              {roleLabel(r)}
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
                          {canManageRows && (
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
                                  {deletingId === r.id
                                    ? "Deleting..."
                                    : "Delete"}
                                </button>
                              </div>
                            </td>
                          )}
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

      {showModal && canCreate && (
        <div className="modal-overlay">
          <div
            className="modal-card bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">
                {editRow ? "Edit Company User" : "Create Company User"}
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
