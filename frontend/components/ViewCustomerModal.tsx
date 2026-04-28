// components/ViewCustomerModal.tsx
"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Customer, ProjectMeeting, CustomerAPI } from "@/lib/api";
import { fetchAllProjects, ApiProject, normalize } from "@/lib/conectr";
import {
  format12HourTime,
  formatDisplayDateTime,
  formatDisplayMeeting,
} from "@/lib/dateTime";

interface Props {
  customer: Customer;
  onClose: () => void;
  onCustomerUpdated?: (customer: Customer) => void;
}

// ── helpers ───────────────────────────────────────────────
function safeProjects(p: unknown): ProjectMeeting[] {
  return Array.isArray(p) ? (p as ProjectMeeting[]) : [];
}

function fmt12(t: string) {
  return format12HourTime(t);
}

function toMins(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const TIME_SLOTS = Array.from({ length: 29 }, (_, i) => {
  const mins = 7 * 60 + i * 30;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { val, label: fmt12(val) };
});

const STATUS_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  active: { bg: "#dcfce7", border: "#16a34a", text: "#15803d" },
  inactive: { bg: "#f1f5f9", border: "#94a3b8", text: "#475569" },
  Booked: { bg: "#f3e8ff", border: "#9333ea", text: "#7e22ce" },
};

// ── component ────────────────────────────────────────────
export default function ViewCustomerModal({
  customer,
  onClose,
  onCustomerUpdated,
}: Props) {
  // 👇 Set default tab to "projects" instead of "details"
  const [activeTab, setActiveTab] = useState<"details" | "projects">(
    "projects",
  );
  const [projects, setProjects] = useState<ProjectMeeting[]>(
    safeProjects(customer.projects),
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProj, setEditingProj] = useState<ProjectMeeting | null>(null);
  const [newProj, setNewProj] = useState({
    project_name: "",
    meeting_date: "",
    meeting_time: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [conflictWarn, setConflictWarn] = useState("");

  // API project list for dropdown
  const [apiProjects, setApiProjects] = useState<ApiProject[]>([]);
  const [projLoading, setProjLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setProjLoading(true);
    fetchAllProjects()
      .then(({ projects: all }) => {
        if (active) setApiProjects(all);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setProjLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const today = new Date().toISOString().split("T")[0];

  // ── conflict detection ───────────────────────────────
  const findConflict = useCallback(
    (
      date: string,
      time: string,
      excludeName?: string,
    ): ProjectMeeting | null => {
      const mins = toMins(time);
      for (const p of projects) {
        if (excludeName && p.project_name === excludeName) continue;
        if (!p.meeting_date || !p.meeting_time) continue;
        if (p.meeting_date !== date) continue;
        if (Math.abs(toMins(p.meeting_time) - mins) < 30) return p;
      }
      return null;
    },
    [projects],
  );

  const checkConflict = (date: string, time: string, excludeName?: string) => {
    if (!date || !time) {
      setConflictWarn("");
      return;
    }
    const c = findConflict(date, time, excludeName);
    setConflictWarn(
      c
        ? `⚠️ Conflict with "${c.project_name}" at ${fmt12(c.meeting_time!)} — less than 30 min apart.`
        : "",
    );
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  // ── add project ──────────────────────────────────────
  const handleAdd = async () => {
    setError("");
    if (!newProj.project_name) {
      setError("Select a project.");
      return;
    }
    if (!newProj.meeting_date) {
      setError("Select a meeting date.");
      return;
    }
    if (!newProj.meeting_time) {
      setError("Select a meeting time.");
      return;
    }
    if (projects.some((p) => p.project_name === newProj.project_name)) {
      setError(`"${newProj.project_name}" is already added.`);
      return;
    }
    const conflict = findConflict(newProj.meeting_date, newProj.meeting_time);
    if (conflict) {
      setError(
        `Time conflict with "${conflict.project_name}" at ${fmt12(conflict.meeting_time!)}.`,
      );
      return;
    }

    setSaving(true);
    try {
      const res = await CustomerAPI.scheduleMeeting(customer.id, {
        meeting_date: newProj.meeting_date,
        meeting_time: newProj.meeting_time,
        project_name: newProj.project_name,
      });
      setProjects((prev) => [
        ...prev,
        { ...newProj, scheduled_at: new Date().toISOString() },
      ]);
      setNewProj({ project_name: "", meeting_date: "", meeting_time: "" });
      setShowAddForm(false);
      showSuccess("Project meeting added!");
      if (onCustomerUpdated && res.data) onCustomerUpdated(res.data);
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? "Failed to add meeting.");
    } finally {
      setSaving(false);
    }
  };

  // ── update project ───────────────────────────────────
  const handleUpdate = async () => {
    if (!editingProj) return;
    const conflict = findConflict(
      editingProj.meeting_date,
      editingProj.meeting_time,
      editingProj.project_name,
    );
    if (conflict) {
      setError(
        `Time conflict with "${conflict.project_name}" at ${fmt12(conflict.meeting_time!)}.`,
      );
      return;
    }

    setSaving(true);
    try {
      const res = await CustomerAPI.updateProjectMeeting(
        customer.id,
        editingProj.project_name,
        {
          meeting_date: editingProj.meeting_date,
          meeting_time: editingProj.meeting_time,
        },
      );
      setProjects((prev) =>
        prev.map((p) =>
          p.project_name === editingProj.project_name ? editingProj : p,
        ),
      );
      setEditingProj(null);
      setConflictWarn("");
      showSuccess("Meeting updated!");
      if (onCustomerUpdated && res.data) onCustomerUpdated(res.data);
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? "Failed to update.");
    } finally {
      setSaving(false);
    }
  };

  // ── delete project ───────────────────────────────────
  const handleDelete = async (projectName: string) => {
    if (!confirm(`Remove "${projectName}" from this customer?`)) return;
    setSaving(true);
    try {
      const res = await CustomerAPI.deleteProjectMeeting(
        customer.id,
        projectName,
      );
      setProjects((prev) => prev.filter((p) => p.project_name !== projectName));
      showSuccess("Project removed.");
      if (onCustomerUpdated && res.data) onCustomerUpdated(res.data);
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? "Failed to remove.");
    } finally {
      setSaving(false);
    }
  };

  // ── WhatsApp reminder ────────────────────────────────
  const sendWhatsApp = (proj: ProjectMeeting) => {
    if (!customer.phone) return;
    const msg = `Hello ${customer.name || customer.nickname},\n\nReminder: Your site visit for *${proj.project_name}* is scheduled on ${formatDisplayMeeting(proj.meeting_date, proj.meeting_time)}.\n\nRegards,\nChannelPartner.Network`;
    const digits = String(customer.phone).replace(/\D/g, "");
    const phone =
      digits.length === 10
        ? `91${digits}`
        : digits.length === 11 && digits.startsWith("0")
          ? `91${digits.slice(1)}`
          : digits;
    if (!phone) return;

    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
    const isAppleDevice = /iPad|iPhone|iPod|Macintosh/i.test(
      typeof navigator !== "undefined" ? navigator.userAgent : "",
    );

    if (isAppleDevice) {
      window.location.href = whatsappUrl;
    } else {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }
  };

  const statusStyle = STATUS_COLORS[customer.status] ?? STATUS_COLORS.active;
  const upcoming = projects.filter((p) => p.meeting_date >= today);
  const past = projects.filter((p) => p.meeting_date < today);

  return (
    <div className="modal-overlay">
      <div
        className="modal-box"
        style={{ maxWidth: "52rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="modal-header">
          <div>
            <p className="modal-title">{customer.nickname}</p>
            <p className="modal-subtitle">
              Code:{" "}
              <span className="font-mono font-bold">
                {customer.secret_code}
              </span>
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* ── Tabs ── */}
        <div
          className="flex border-b"
          style={{ borderColor: "var(--slate-200)" }}
        >
          {(["projects", "details"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-semibold transition-all ${
                activeTab === tab
                  ? "border-b-2 border-blue-600 text-blue-700"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "projects"
                ? "🏗️ Projects & Meetings"
                : "📋 Customer Details"}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="modal-body">
          {/* Alerts */}
          {error && (
            <div className="alert alert-danger mb-4">
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {error}
              <button
                onClick={() => setError("")}
                className="ml-auto text-xs opacity-60 hover:opacity-100"
              >
                ×
              </button>
            </div>
          )}
          {success && (
            <div className="alert alert-success mb-4">
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {success}
            </div>
          )}

          {/* ════════ PROJECTS TAB ════════ */}
          {activeTab === "projects" && (
            <div className="space-y-4">
              {/* Summary chips */}
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className="text-xs font-semibold px-3 py-1 rounded-full"
                  style={{
                    background: "var(--gold-100)",
                    color: "var(--gold-700)",
                  }}
                >
                  ⏰ {upcoming.length} Upcoming
                </span>
                <span
                  className="text-xs font-semibold px-3 py-1 rounded-full"
                  style={{
                    background: "var(--slate-100)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  ✅ {past.length} Completed
                </span>
                <div className="ml-auto">
                  <button
                    onClick={() => {
                      setShowAddForm((v) => !v);
                      setEditingProj(null);
                      setError("");
                    }}
                    className="btn btn-primary"
                    style={{ fontSize: "0.75rem", padding: "0.4rem 1rem" }}
                  >
                    {showAddForm ? "− Cancel" : "+ Add Project"}
                  </button>
                </div>
              </div>

              {/* ── Add form ── */}
              {showAddForm && (
                <div
                  className="p-4 rounded-xl space-y-3"
                  style={{
                    background: "var(--navy-50)",
                    border: "1px solid var(--navy-100)",
                  }}
                >
                  <p
                    className="text-sm font-bold"
                    style={{ color: "var(--navy-700)" }}
                  >
                    Schedule New Site Visit
                  </p>

                  {/* Project select */}
                  <div>
                    <label className="label">
                      Select Project <span className="req">*</span>
                    </label>
                    <select
                      value={newProj.project_name}
                      onChange={(e) =>
                        setNewProj({ ...newProj, project_name: e.target.value })
                      }
                      className="input-field"
                      disabled={projLoading}
                    >
                      <option value="">
                        {projLoading
                          ? "Loading projects…"
                          : "— Choose a project —"}
                      </option>
                      {apiProjects.map((p) => (
                        <option key={p.id} value={normalize(p.title)}>
                          {normalize(p.title)}
                          {p.location ? ` — ${normalize(p.location)}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date + Time */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">
                        Date <span className="req">*</span>
                      </label>
                      <input
                        type="date"
                        value={newProj.meeting_date}
                        min={today}
                        className="input-field"
                        onChange={(e) => {
                          setNewProj({
                            ...newProj,
                            meeting_date: e.target.value,
                          });
                          checkConflict(e.target.value, newProj.meeting_time);
                        }}
                      />
                    </div>
                    <div>
                      <label className="label">
                        Time <span className="req">*</span>
                      </label>
                      <select
                        value={newProj.meeting_time}
                        className="input-field"
                        onChange={(e) => {
                          setNewProj({
                            ...newProj,
                            meeting_time: e.target.value,
                          });
                          checkConflict(newProj.meeting_date, e.target.value);
                        }}
                      >
                        <option value="">— Select time —</option>
                        {TIME_SLOTS.map(({ val, label }) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {conflictWarn && (
                    <div className="alert alert-warn text-xs">
                      {conflictWarn}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleAdd}
                      disabled={
                        saving ||
                        !newProj.project_name ||
                        !newProj.meeting_date ||
                        !newProj.meeting_time
                      }
                      className="btn btn-primary flex-1"
                    >
                      {saving ? "Adding…" : "Add Project"}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddForm(false);
                        setNewProj({
                          project_name: "",
                          meeting_date: "",
                          meeting_time: "",
                        });
                        setConflictWarn("");
                      }}
                      className="btn btn-ghost flex-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* ── Edit form ── */}
              {editingProj && (
                <div
                  className="p-4 rounded-xl space-y-3"
                  style={{
                    background: "var(--gold-50)",
                    border: "1px solid var(--gold-300)",
                  }}
                >
                  <p
                    className="text-sm font-bold"
                    style={{ color: "var(--gold-700)" }}
                  >
                    ✏️ Editing: {editingProj.project_name}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Date</label>
                      <input
                        type="date"
                        value={editingProj.meeting_date}
                        min={today}
                        className="input-field"
                        onChange={(e) => {
                          setEditingProj({
                            ...editingProj,
                            meeting_date: e.target.value,
                          });
                          checkConflict(
                            e.target.value,
                            editingProj.meeting_time,
                            editingProj.project_name,
                          );
                        }}
                      />
                    </div>
                    <div>
                      <label className="label">Time</label>
                      <select
                        value={editingProj.meeting_time}
                        className="input-field"
                        onChange={(e) => {
                          setEditingProj({
                            ...editingProj,
                            meeting_time: e.target.value,
                          });
                          checkConflict(
                            editingProj.meeting_date,
                            e.target.value,
                            editingProj.project_name,
                          );
                        }}
                      >
                        <option value="">— Select time —</option>
                        {TIME_SLOTS.map(({ val, label }) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {conflictWarn && (
                    <div className="alert alert-warn text-xs">
                      {conflictWarn}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdate}
                      disabled={saving || !!conflictWarn}
                      className="btn btn-primary flex-1"
                    >
                      {saving ? "Updating…" : "Update Meeting"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingProj(null);
                        setConflictWarn("");
                        setError("");
                      }}
                      className="btn btn-ghost flex-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* ── Project list ── */}
              {projects.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-4xl mb-3">📭</p>
                  <p
                    className="text-sm mb-3"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    No projects assigned yet
                  </p>
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="btn btn-gold text-sm"
                  >
                    + Schedule First Visit
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {[...upcoming, ...past].map((proj, idx) => {
                    const isPast = proj.meeting_date < today;
                    const isToday = proj.meeting_date === today;
                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-xl transition-all"
                        style={{
                          background: isPast
                            ? "var(--slate-50)"
                            : isToday
                              ? "rgba(240,165,0,0.08)"
                              : "#fff",
                          border: `1px solid ${isPast ? "var(--slate-200)" : isToday ? "var(--gold-300)" : "var(--slate-200)"}`,
                          opacity: isPast ? 0.7 : 1,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p
                                className="font-bold text-sm truncate"
                                style={{ color: "var(--navy-800)" }}
                              >
                                {proj.project_name}
                              </p>
                              {isPast && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 shrink-0">
                                  Past
                                </span>
                              )}
                              {isToday && (
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full shrink-0"
                                  style={{
                                    background: "var(--gold-100)",
                                    color: "var(--gold-700)",
                                  }}
                                >
                                  Today
                                </span>
                              )}
                            </div>
                            <p
                              className="text-xs"
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              {formatDisplayMeeting(
                                proj.meeting_date,
                                proj.meeting_time,
                              )}
                            </p>
                            {(proj.created_by_name ||
                              proj.assigned_to_user_name ||
                              proj.updated_by_name) && (
                              <p
                                className="text-xs mt-1"
                                style={{ color: "var(--color-text-hint)" }}
                              >
                                {proj.created_by_name
                                  ? `By: ${proj.created_by_name}`
                                  : ""}
                                {proj.created_by_name &&
                                proj.assigned_to_user_name
                                  ? " • "
                                  : ""}
                                {proj.assigned_to_user_name
                                  ? `To: ${proj.assigned_to_user_name}`
                                  : ""}
                                {(proj.created_by_name ||
                                  proj.assigned_to_user_name) &&
                                proj.updated_by_name
                                  ? " • "
                                  : ""}
                                {proj.updated_by_name
                                  ? `Updated: ${proj.updated_by_name}`
                                  : ""}
                              </p>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1 shrink-0">
                            {/* WhatsApp - only future meetings with phone */}
                            {!isPast && customer.phone && (
                              <button
                                onClick={() => sendWhatsApp(proj)}
                                title="Send WhatsApp Reminder"
                                className="p-1.5 rounded-lg transition-colors hover:bg-green-50"
                                style={{ color: "#25d366" }}
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 2C6.48 2 2 6.48 2 12c0 2.108.576 4.082 1.579 5.79L2 22l4.21-1.579A9.93 9.93 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" />
                                </svg>
                              </button>
                            )}

                            {/* Edit */}
                            <button
                              onClick={() => {
                                setEditingProj(proj);
                                setShowAddForm(false);
                                setError("");
                              }}
                              title="Edit meeting"
                              className="p-1.5 rounded-lg transition-colors hover:bg-blue-50"
                              style={{ color: "var(--navy-600)" }}
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => handleDelete(proj.project_name)}
                              title="Remove project"
                              className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                              style={{ color: "var(--red-600)" }}
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ════════ DETAILS TAB ════════ */}
          {activeTab === "details" && (
            <div className="space-y-4">
              {/* Status */}
              <span
                className="inline-flex items-center gap-1.5 badge"
                style={{ background: statusStyle.bg, color: statusStyle.text }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: statusStyle.border }}
                />
                {customer.status.charAt(0).toUpperCase() +
                  customer.status.slice(1)}
              </span>

              {/* Info grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: "👤", label: "Full Name", val: customer.name },
                  { icon: "📞", label: "Phone", val: customer.phone },
                  { icon: "✉️", label: "Email", val: customer.email },
                  { icon: "📍", label: "Address", val: customer.address },
                ]
                  .filter((f) => f.val)
                  .map((f) => (
                    <div
                      key={f.label}
                      className="p-3 rounded-xl"
                      style={{
                        background: "var(--slate-50)",
                        border: "1px solid var(--slate-200)",
                      }}
                    >
                      <p
                        className="text-xs font-semibold mb-0.5"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {f.icon} {f.label}
                      </p>
                      <p className="text-sm font-medium">{f.val}</p>
                    </div>
                  ))}
              </div>

              {/* Notes */}
              {customer.notes && (
                <div
                  className="p-3 rounded-xl"
                  style={{
                    background: "var(--gold-50)",
                    border: "1px solid var(--gold-200)",
                  }}
                >
                  <p
                    className="text-xs font-semibold mb-1"
                    style={{ color: "var(--gold-700)" }}
                  >
                    📝 Notes
                  </p>
                  <p className="text-sm italic">{customer.notes}</p>
                </div>
              )}

              {/* Metadata */}
              <div
                className="text-xs text-gray-400 border-t pt-3"
                style={{ borderColor: "var(--slate-100)" }}
              >
                <p>Created: {formatDisplayDateTime(customer.created_at)}</p>
                <p>
                  Last updated: {formatDisplayDateTime(customer.updated_at)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-primary flex-1">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
