// app/customer/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AddCustomerModal from "@/components/AddCustomerModal";
import EditCustomerModal from "@/components/EditCustomerModal";
import ViewCustomerModal from "@/components/ViewCustomerModal";
import CustomerSessionLinkModal from "@/components/CustomerSessionLinkModal";
import {
  CustomerAPI,
  Customer,
  CustomerProjectLink,
  CustomerProjectLinkAPI,
  CustomerSessionLink,
  CustomerSessionLinkAPI,
  LinkedProjectCard,
  ProjectMeeting,
} from "@/lib/api";
import {
  hasCompletedSessionEvidence,
  hasViewerActivity,
  getTimedMeetingStatus,
  timedMeetingStatusLabel,
} from "@/lib/meetingStatus";

const CUSTOMER_LIST_CACHE_KEY = "customers:list:v1";

function safeProjects(projects: unknown): ProjectMeeting[] {
  return Array.isArray(projects) ? (projects as ProjectMeeting[]) : [];
}

function formatDisplayDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDisplayMeeting(date?: string | null, time?: string | null) {
  const formattedDate = formatDisplayDate(date);
  const formattedTime = time ? fmt12(time) : "-";
  if (!date && !time) return "-";
  if (!date) return formattedTime;
  if (!time) return formattedDate;
  return `${formattedDate} • ${formattedTime}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN");
}

function compareMeetingLikeItems(
  left: { meeting_date?: string; meeting_time?: string },
  right: { meeting_date?: string; meeting_time?: string },
  today: string,
) {
  const leftDate = left.meeting_date || "9999-99-99";
  const rightDate = right.meeting_date || "9999-99-99";
  const leftTime = left.meeting_time || "23:59";
  const rightTime = right.meeting_time || "23:59";

  const getTier = (dateValue?: string) => {
    if (!dateValue) return 3;
    if (dateValue === today) return 0;
    if (dateValue > today) return 1;
    return 2;
  };

  const leftTier = getTier(left.meeting_date);
  const rightTier = getTier(right.meeting_date);

  if (leftTier !== rightTier) return leftTier - rightTier;

  if (leftTier === 2) {
    if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
    return rightTime.localeCompare(leftTime);
  }

  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
  return leftTime.localeCompare(rightTime);
}

// ── Sub-components ─────────────────────────────────────────────
function StatusBadge({ status }: { status: Customer["status"] }) {
  const MAP = {
    active: "badge badge-active",
    inactive: "badge badge-inactive",
    Booked: "badge badge-Booked",
  };
  const LABELS = {
    active: "Active",
    inactive: "Inactive",
    Booked: "Booked",
  };
  return <span className={MAP[status] ?? MAP.active}>{LABELS[status]}</span>;
}

const CUSTOMER_PROJECT_STATUS_STYLES: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  Requested: {
    bg: "rgba(249,115,22,0.12)",
    text: "#7a3500",
    border: "rgba(249,115,22,0.32)",
  },
  Scheduled: {
    bg: "rgba(59,130,246,0.16)",
    text: "#1d4ed8",
    border: "rgba(59,130,246,0.38)",
  },
  Live: {
    bg: "rgba(239,68,68,0.14)",
    text: "#b91c1c",
    border: "rgba(239,68,68,0.34)",
  },
  Completed: {
    bg: "rgba(107,114,128,0.14)",
    text: "#374151",
    border: "rgba(107,114,128,0.34)",
  },
  "Site Visit": {
    bg: "rgba(34,197,94,0.16)",
    text: "#166534",
    border: "rgba(34,197,94,0.36)",
  },
};

function getCustomerProjectStatus(project: ProjectMeeting) {
  const hasSession =
    Boolean(project.has_session_link) || (project.session_link_count || 0) > 0;
  const timedStatus = getTimedMeetingStatus({
    meetingDate: project.meeting_date,
    meetingTime: project.meeting_time,
    hasSession,
    hasViewerActivity: hasViewerActivity({
      joinees: project.latest_session_joinees,
      eventCount: project.latest_session_event_count,
    }),
    completedEvidence: hasCompletedSessionEvidence({
      status: project.latest_session_status,
      startedAt: project.latest_session_started_at,
      endedAt: project.latest_session_ended_at,
      joinees: project.latest_session_joinees,
      eventCount: project.latest_session_event_count,
    }),
  });

  if (timedStatus === "scheduled" && !hasSession) return "Requested";
  return timedMeetingStatusLabel(timedStatus);
}

function MeetingStats({ projects }: { projects?: unknown }) {
  const list = safeProjects(projects);

  const upcoming = list.filter(
    (p) => getCustomerProjectStatus(p) === "Scheduled",
  ).length;
  const done = list.filter(
    (p) => getCustomerProjectStatus(p) === "Completed",
  ).length;

  if (!list.length)
    return <span style={{ color: "var(--color-text-hint)" }}>—</span>;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {upcoming > 0 && (
        <span
          className="badge"
          style={{
            background: CUSTOMER_PROJECT_STATUS_STYLES.Scheduled.bg,
            color: CUSTOMER_PROJECT_STATUS_STYLES.Scheduled.text,
            border: `1px solid ${CUSTOMER_PROJECT_STATUS_STYLES.Scheduled.border}`,
            fontSize: "0.63rem",
          }}
        >
          ⏰ {upcoming} upcoming
        </span>
      )}
      {done > 0 && (
        <span
          className="badge"
          style={{
            background: CUSTOMER_PROJECT_STATUS_STYLES.Completed.bg,
            color: CUSTOMER_PROJECT_STATUS_STYLES.Completed.text,
            border: `1px solid ${CUSTOMER_PROJECT_STATUS_STYLES.Completed.border}`,
            fontSize: "0.63rem",
          }}
        >
          ✅ {done} done
        </span>
      )}
    </div>
  );
}

function ProjectsCell({ projects }: { projects?: unknown }) {
  const list = safeProjects(projects);
  const today = new Date().toISOString().split("T")[0];
  const ordered = [...list].sort((left, right) =>
    compareMeetingLikeItems(left, right, today),
  );

  if (!list.length)
    return <span style={{ color: "var(--color-text-hint)" }}>—</span>;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        maxWidth: "220px",
        maxHeight: "142px",
        overflowY: "auto",
        paddingRight: "4px",
      }}
    >
      {ordered.map((p, i) => {
        const status = getCustomerProjectStatus(p);
        const style =
          CUSTOMER_PROJECT_STATUS_STYLES[status] ||
          CUSTOMER_PROJECT_STATUS_STYLES.Scheduled;
        return (
          <div
            key={i}
            className="text-xs px-1.5 py-1 rounded-md"
            style={{
              background: style.bg,
              color: style.text,
              border: `1px solid ${style.border}`,
            }}
          >
            <div className="truncate">
              <span className="font-semibold">{p.project_name}</span>
              <span className="opacity-70 ml-1" style={{ fontSize: "10px" }}>
                {formatDisplayMeeting(p.meeting_date, p.meeting_time)}
              </span>
            </div>
            <div
              className="mt-0.5"
              style={{ fontSize: "10px", fontWeight: 700 }}
            >
              {status}
            </div>
            {(p.created_by_name || p.assigned_to_user_name) && (
              <div
                className="truncate"
                style={{ fontSize: "10px", color: "var(--color-text-muted)" }}
              >
                {p.created_by_name ? `By: ${p.created_by_name}` : ""}
                {p.created_by_name && p.assigned_to_user_name ? " • " : ""}
                {p.assigned_to_user_name
                  ? `To: ${p.assigned_to_user_name}`
                  : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function IconEye() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg
      className="w-4 h-4"
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
  );
}
function IconTrash() {
  return (
    <svg
      className="w-4 h-4"
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
  );
}

function IconUserCard() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 10a2 2 0 104 0 2 2 0 00-4 0zm8 5a3 3 0 00-6 0"
      />
    </svg>
  );
}

function fmt12(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

const TIME_SLOTS = Array.from({ length: 29 }, (_, i) => {
  const mins = 7 * 60 + i * 30;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { val, label: fmt12(val) };
});

const DATE_OPTIONS = Array.from({ length: 60 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  const val = d.toISOString().split("T")[0];
  const label = d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return { val, label };
});

function LinkPreviewModal({
  customer,
  links,
  loading,
  onCustomerUpdated,
  onClose,
}: {
  customer: Customer | null;
  links: CustomerProjectLink[];
  loading: boolean;
  onCustomerUpdated?: (customer: Customer) => void;
  onClose: () => void;
}) {
  if (!customer) return null;

  const latestLink = links[0] ?? null;
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [schedulingKey, setSchedulingKey] = useState("");
  const [scheduleMsg, setScheduleMsg] = useState("");
  const [scheduleErr, setScheduleErr] = useState("");
  const [schedulePopup, setSchedulePopup] = useState<{
    project: LinkedProjectCard;
    idx: number;
    meetingDate: string;
    meetingTime: string;
  } | null>(null);

  useEffect(() => {
    setRecipientPhone((customer.phone || "").replace(/\D/g, ""));
    setRecipientEmail((customer.email || "").trim());
  }, [customer.id, customer.phone, customer.email]);

  const publicLink = latestLink
    ? CustomerProjectLinkAPI.publicUrl(latestLink.public_token)
    : "";
  const customerPhone = recipientPhone.replace(/\D/g, "");
  const customerEmail = recipientEmail.trim();
  const hasEmail = customerEmail.length > 0;
  const shareText = `Hi ${customer.name || customer.nickname || "Customer"}, here is your project link:\n${publicLink}`;
  const orderedSelectedProjects = [
    ...(latestLink?.selected_projects || []),
  ].sort((left, right) =>
    compareMeetingLikeItems(
      left,
      right,
      new Date().toISOString().split("T")[0],
    ),
  );
  const orderedLikedProjects = [...(latestLink?.liked_projects || [])].sort(
    (left, right) =>
      compareMeetingLikeItems(
        left,
        right,
        new Date().toISOString().split("T")[0],
      ),
  );

  const openSchedulePopup = (project: LinkedProjectCard, idx: number) => {
    setScheduleErr("");
    setScheduleMsg("");
    setSchedulePopup({
      project,
      idx,
      meetingDate: project.meeting_date || "",
      meetingTime: project.meeting_time || "",
    });
  };

  const submitScheduleMeeting = async () => {
    if (!schedulePopup) return;

    const { project, idx, meetingDate, meetingTime } = schedulePopup;
    const projectName = (project.title || "").trim();
    if (!projectName) {
      setScheduleErr("Project name missing. Cannot schedule meeting.");
      return;
    }
    if (!meetingDate || !meetingTime) {
      setScheduleErr(
        "Date and time are required on liked project to schedule.",
      );
      return;
    }

    const rowKey = `${projectName}-${idx}`;
    setSchedulingKey(rowKey);
    setScheduleErr("");
    setScheduleMsg("");

    try {
      const existingMeeting = safeProjects(customer.projects).find(
        (p) => p.project_name === projectName,
      );

      const res = existingMeeting
        ? await CustomerAPI.updateProjectMeeting(customer.id, projectName, {
            meeting_date: meetingDate,
            meeting_time: meetingTime,
          })
        : await CustomerAPI.scheduleMeeting(customer.id, {
            project_name: projectName,
            meeting_date: meetingDate,
            meeting_time: meetingTime,
          });

      if (res?.data && onCustomerUpdated) {
        onCustomerUpdated(res.data);
      }
      setScheduleMsg(
        existingMeeting
          ? `Meeting updated for ${projectName}.`
          : `Meeting scheduled for ${projectName}.`,
      );
      setSchedulePopup(null);
    } catch (e: unknown) {
      setScheduleErr(
        (e as { message?: string }).message || "Failed to schedule meeting.",
      );
    } finally {
      setSchedulingKey("");
    }
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-box"
        style={{ maxWidth: "72rem", width: "min(72rem, calc(100% - 1.2rem))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="modal-title">Customer Project Link Preview</p>
            <p className="modal-subtitle">
              {customer.name || customer.nickname} ({customer.secret_code})
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="spinner spinner-lg" />
            </div>
          ) : !latestLink ? (
            <div className="alert alert-info">
              No project link sent for this customer yet.
            </div>
          ) : (
            <>
              {scheduleErr && !schedulePopup && (
                <div className="alert alert-danger mb-3">{scheduleErr}</div>
              )}
              {scheduleMsg && (
                <div className="alert alert-success mb-3">{scheduleMsg}</div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <div
                  className="card p-3"
                  style={{ borderRadius: "var(--radius-lg)" }}
                >
                  <p
                    className="text-xs font-bold"
                    style={{ color: "var(--navy-700)" }}
                  >
                    Customer Card
                  </p>
                  <p
                    className="font-bold mt-2"
                    style={{ color: "var(--navy-900)" }}
                  >
                    {customer.name || customer.nickname}
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Code: {customer.secret_code}
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Code: {customer.secret_code}
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Phone: {customer.phone || "-"}
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Email: {customer.email || "-"}
                  </p>
                </div>

                <div
                  className="card p-3 lg:col-span-2"
                  style={{ borderRadius: "var(--radius-lg)" }}
                >
                  <p
                    className="text-xs font-bold"
                    style={{ color: "var(--navy-700)" }}
                  >
                    Public Link
                  </p>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <input
                      className="input-field"
                      readOnly
                      title="Public customer link"
                      aria-label="Public customer link"
                      value={publicLink}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        navigator.clipboard.writeText(publicLink).then(() => {
                          setPublicLinkCopied(true);
                          setTimeout(() => setPublicLinkCopied(false), 1600);
                        });
                      }}
                    >
                      {publicLinkCopied ? "Copied" : "Copy"}
                    </button>
                    <button
                      className="btn btn-gold"
                      onClick={() => window.open(publicLink, "_blank")}
                    >
                      Open
                    </button>
                    <button
                      className="btn"
                      style={{
                        background: "#16a34a",
                        color: "#fff",
                        opacity: customerPhone ? 1 : 0.6,
                        cursor: customerPhone ? "pointer" : "not-allowed",
                      }}
                      disabled={!customerPhone}
                      onClick={() => {
                        if (!customerPhone) return;
                        const digits = String(customerPhone).replace(/\D/g, "");
                        const phone =
                          digits.length === 10
                            ? `91${digits}`
                            : digits.length === 11 && digits.startsWith("0")
                              ? `91${digits.slice(1)}`
                              : digits;
                        if (!phone) return;
                        const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(shareText)}`;
                        const isAppleDevice =
                          /iPad|iPhone|iPod|Macintosh/i.test(
                            typeof navigator !== "undefined"
                              ? navigator.userAgent
                              : "",
                          );
                        if (isAppleDevice) {
                          window.location.href = whatsappUrl;
                        } else {
                          window.open(
                            whatsappUrl,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }
                      }}
                    >
                      WhatsApp
                    </button>
                    <button
                      className="btn"
                      style={{
                        background: "#ea580c",
                        color: "#fff",
                        opacity: hasEmail ? 1 : 0.6,
                        cursor: hasEmail ? "pointer" : "not-allowed",
                      }}
                      disabled={!hasEmail}
                      onClick={() => {
                        if (!hasEmail) return;
                        const subject = "Your Project Link";
                        const body = `${shareText}\n\nRegards`;
                        const mailUrl = `mailto:${customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                        window.location.href = mailUrl;
                      }}
                    >
                      Email
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label
                        className="text-xs font-bold"
                        style={{ color: "var(--navy-700)" }}
                      >
                        WhatsApp Number
                      </label>
                      <input
                        className="input-field mt-1"
                        type="tel"
                        placeholder="Enter phone number"
                        value={recipientPhone}
                        onChange={(e) => setRecipientPhone(e.target.value)}
                      />
                    </div>
                    <div>
                      <label
                        className="text-xs font-bold"
                        style={{ color: "var(--navy-700)" }}
                      >
                        Email Address
                      </label>
                      <input
                        className="input-field mt-1"
                        type="email"
                        placeholder="Enter email address"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p
                    className="text-xs font-bold mb-2"
                    style={{ color: "var(--navy-700)" }}
                  >
                    Left Side: Added Project Cards
                  </p>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {orderedSelectedProjects.map((project, idx) => (
                      <div
                        key={`${project.title}-${idx}`}
                        className="card p-3"
                        style={{ borderRadius: "var(--radius-md)" }}
                      >
                        <p
                          className="font-bold text-sm"
                          style={{ color: "var(--navy-900)" }}
                        >
                          {project.title}
                        </p>
                        <p
                          className="text-xs"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {project.developer || "-"}
                        </p>
                        <p
                          className="text-xs"
                          style={{ color: "var(--color-text-hint)" }}
                        >
                          {project.location || "-"}
                        </p>
                        <p
                          className="text-sm font-semibold mt-1"
                          style={{ color: "var(--orange-600)" }}
                        >
                          {project.price || "-"}
                        </p>
                        {(project.meeting_date || project.meeting_time) && (
                          <p
                            className="text-xs mt-1"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            Visit:{" "}
                            {formatDisplayMeeting(
                              project.meeting_date,
                              project.meeting_time,
                            )}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p
                    className="text-xs font-bold mb-2"
                    style={{ color: "var(--green-700)" }}
                  >
                    Right Side: Customer Liked Cards
                  </p>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {orderedLikedProjects.length > 0 ? (
                      orderedLikedProjects.map((project, idx) => {
                        const projectName = (project.title || "").trim();
                        const rowKey = `${project.title}-${idx}`;
                        const isAlreadyScheduled = safeProjects(
                          customer.projects,
                        ).some(
                          (p) =>
                            (p.project_name || "").trim().toLowerCase() ===
                            projectName.toLowerCase(),
                        );

                        const canSchedule =
                          Boolean(
                            project.meeting_date && project.meeting_time,
                          ) &&
                          !isAlreadyScheduled &&
                          schedulingKey !== rowKey;

                        return (
                          <div
                            key={rowKey}
                            className="card p-3"
                            style={{
                              borderRadius: "var(--radius-md)",
                              border: "1px solid #86efac",
                              background: "#f0fdf4",
                            }}
                          >
                            <p
                              className="font-bold text-sm"
                              style={{ color: "#166534" }}
                            >
                              {project.title}
                            </p>
                            <p className="text-xs" style={{ color: "#15803d" }}>
                              {project.developer || "-"}
                            </p>
                            <p className="text-xs" style={{ color: "#166534" }}>
                              {project.location || "-"}
                            </p>
                            <p
                              className="text-sm font-semibold mt-1"
                              style={{ color: "#15803d" }}
                            >
                              {project.price || "-"}
                            </p>
                            {(project.meeting_date || project.meeting_time) && (
                              <p
                                className="text-xs font-semibold mt-1"
                                style={{ color: "#166534" }}
                              >
                                Visit:{" "}
                                {formatDisplayMeeting(
                                  project.meeting_date,
                                  project.meeting_time,
                                )}
                              </p>
                            )}
                            <button
                              className="btn btn-primary mt-2"
                              style={{
                                width: "100%",
                                opacity: canSchedule ? 1 : 0.65,
                                cursor: canSchedule ? "pointer" : "not-allowed",
                                background: isAlreadyScheduled
                                  ? "#16a34a"
                                  : undefined,
                              }}
                              disabled={!canSchedule}
                              onClick={() => openSchedulePopup(project, idx)}
                            >
                              {schedulingKey === rowKey
                                ? "Scheduling..."
                                : isAlreadyScheduled
                                  ? "Meeting Scheduled"
                                  : "Schedule Meeting"}
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div
                        className="card p-3 text-sm"
                        style={{ color: "var(--color-text-hint)" }}
                      >
                        Customer has not liked any project yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {schedulePopup && (
          <div className="modal-overlay">
            <div
              className="modal-box"
              style={{
                maxWidth: "32rem",
                width: "min(32rem, calc(100% - 1.2rem))",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <p className="modal-title">Schedule Meeting</p>
                  <p className="modal-subtitle">Confirm meeting details</p>
                </div>
                <button
                  className="modal-close"
                  onClick={() => setSchedulePopup(null)}
                >
                  ×
                </button>
              </div>

              <div className="modal-body">
                {scheduleErr && (
                  <div className="alert alert-danger mb-3">{scheduleErr}</div>
                )}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="label">Customer Code</label>
                    <input
                      className="input-field"
                      value={customer.secret_code}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="label">Project Name</label>
                    <input
                      className="input-field"
                      value={schedulePopup.project.title || ""}
                      readOnly
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Meeting Date</label>
                      <select
                        className="input-field"
                        value={schedulePopup.meetingDate}
                        onChange={(e) =>
                          setSchedulePopup((prev) =>
                            prev
                              ? { ...prev, meetingDate: e.target.value }
                              : prev,
                          )
                        }
                      >
                        <option value="">— Select a date —</option>
                        {DATE_OPTIONS.map(({ val, label }) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">
                        Meeting Time{" "}
                        <span
                          className="text-gray-400"
                          style={{ fontSize: "0.7rem" }}
                        >
                          (30-min slots)
                        </span>
                      </label>
                      <select
                        className="input-field"
                        value={schedulePopup.meetingTime}
                        onChange={(e) =>
                          setSchedulePopup((prev) =>
                            prev
                              ? { ...prev, meetingTime: e.target.value }
                              : prev,
                          )
                        }
                      >
                        <option value="">— Select a time —</option>
                        {TIME_SLOTS.map(({ val, label }) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  className="btn btn-ghost"
                  onClick={() => setSchedulePopup(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-gold"
                  disabled={
                    schedulingKey ===
                    `${schedulePopup.project.title}-${schedulePopup.idx}`
                  }
                  onClick={submitScheduleMeeting}
                >
                  {schedulingKey ===
                  `${schedulePopup.project.title}-${schedulePopup.idx}`
                    ? "Scheduling..."
                    : "Schedule Meeting"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────
export default function CustomerPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linkModalCustomer, setLinkModalCustomer] = useState<Customer | null>(
    null,
  );
  const [linkRows, setLinkRows] = useState<CustomerProjectLink[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [sessionModalCustomer, setSessionModalCustomer] =
    useState<Customer | null>(null);
  const [sessionRows, setSessionRows] = useState<CustomerSessionLink[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionByCustomer, setSessionByCustomer] = useState<
    Record<number, CustomerSessionLink[]>
  >({});
  const [statusClock, setStatusClock] = useState(() => Date.now());

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/");
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const id = window.setInterval(() => setStatusClock(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const projectScopedRoles = useState(
    () => new Set<string>(),
  )[0];
  const restrictProjectsForRole = Boolean(
    user?.role && projectScopedRoles.has(user.role),
  );

  const normalizeProjectName = useCallback((value?: string | null) => {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }, []);

  const allowedProjectMap = useState(() => new Map<string, true>())[0];

  useEffect(() => {
    allowedProjectMap.clear();
    const assigned = Array.isArray(user?.assigned_projects)
      ? user.assigned_projects
      : [];

    assigned.forEach((project) => {
      const normalized = normalizeProjectName(project);
      if (normalized) allowedProjectMap.set(normalized, true);
    });
  }, [allowedProjectMap, normalizeProjectName, user?.assigned_projects]);

  const filterProjectsForRole = useCallback(
    (projects: unknown) => {
      const list = safeProjects(projects);

      if (!restrictProjectsForRole) {
        return list;
      }

      if (allowedProjectMap.size === 0) {
        return [];
      }

      return list.filter((project) => {
        const normalized = normalizeProjectName(project.project_name);
        return normalized !== "" && allowedProjectMap.has(normalized);
      });
    },
    [allowedProjectMap, normalizeProjectName, restrictProjectsForRole],
  );

  const fetchCustomers = useCallback(async () => {
    try {
      setLoadingData(customers.length === 0);
      setError("");
      const res = await CustomerAPI.list();
      const normalizedCustomers = res.data.map((c) => ({
        ...c,
        projects: filterProjectsForRole(c.projects),
      }));

      const nextCustomers = restrictProjectsForRole
        ? normalizedCustomers.filter(
            (customer) => safeProjects(customer.projects).length > 0,
          )
        : normalizedCustomers;

      setCustomers(nextCustomers);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          CUSTOMER_LIST_CACHE_KEY,
          JSON.stringify(nextCustomers),
        );
      }
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message ?? "Failed to load customers.",
      );
    } finally {
      setLoadingData(false);
    }
  }, [customers.length, filterProjectsForRole, restrictProjectsForRole]);

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") return;
    const cached = window.sessionStorage.getItem(CUSTOMER_LIST_CACHE_KEY);
    if (!cached) return;

    try {
      const parsed = JSON.parse(cached) as Customer[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;

      setCustomers(
        parsed.map((customer) => ({
          ...customer,
          projects: filterProjectsForRole(customer.projects),
        })),
      );
      setLoadingData(false);
    } catch {
      // ignore stale cache
    }
  }, [isAuthenticated, filterProjectsForRole]);

  useEffect(() => {
    if (isAuthenticated) fetchCustomers();
  }, [isAuthenticated, fetchCustomers]);

  const fetchSessionSummary = useCallback(async () => {
    try {
      const res = await CustomerSessionLinkAPI.list();
      const grouped: Record<number, CustomerSessionLink[]> = {};

      (res.data || []).forEach((row) => {
        if (!grouped[row.customer_id]) grouped[row.customer_id] = [];
        grouped[row.customer_id].push(row);
      });

      setSessionByCustomer(grouped);
    } catch {
      setSessionByCustomer({});
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchSessionSummary();
  }, [isAuthenticated, fetchSessionSummary]);

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      await CustomerAPI.delete(id);
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      setDeleteId(null);
    } catch {
      alert("Failed to archive customer.");
    } finally {
      setDeleting(false);
    }
  };

  const openLinkPreview = async (customer: Customer) => {
    setLinkModalCustomer(customer);
    setLinkLoading(true);
    try {
      const res = await CustomerProjectLinkAPI.byCustomer(customer.id);
      setLinkRows(res.data || []);
    } catch {
      setLinkRows([]);
    } finally {
      setLinkLoading(false);
    }
  };

  const openSessionModal = async (customer: Customer) => {
    setSessionModalCustomer(customer);
    setSessionLoading(true);

    try {
      const res = await CustomerSessionLinkAPI.byCustomer(customer.id);
      const rows = res.data || [];
      setSessionRows(rows);
      setSessionByCustomer((prev) => ({ ...prev, [customer.id]: rows }));
    } catch {
      setSessionRows([]);
    } finally {
      setSessionLoading(false);
    }
  };

  const normalise = useCallback(
    (c: Customer) => ({
      ...c,
      projects: filterProjectsForRole(c.projects),
    }),
    [filterProjectsForRole],
  );

  const visibleCustomers = useMemo(
    () =>
      restrictProjectsForRole
        ? customers.filter((c) => safeProjects(c.projects).length > 0)
        : customers,
    [customers, restrictProjectsForRole],
  );

  const filtered = visibleCustomers.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (c.name || c.nickname || "").toLowerCase().includes(q) ||
      c.secret_code.toLowerCase().includes(q) ||
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  });

  const today = new Date().toISOString().split("T")[0];
  const meetingStats = useMemo(() => {
    void statusClock;
    const allProjects = visibleCustomers.flatMap((c) =>
      safeProjects(c.projects),
    );

    const hasSession = (p: ProjectMeeting) =>
      Boolean(p.has_session_link) || (p.session_link_count || 0) > 0;
    const done = allProjects.filter(
      (p) => getCustomerProjectStatus(p) === "Completed",
    ).length;
    const upcoming = allProjects.filter(
      (p) => getCustomerProjectStatus(p) === "Scheduled",
    ).length;
    const live = allProjects.filter(
      (p) => getCustomerProjectStatus(p) === "Live",
    ).length;

    const sessionCreated = allProjects.filter(hasSession).length;

    const visitDone = allProjects.filter(
      (p) => getCustomerProjectStatus(p) === "Completed" && hasSession(p),
    ).length;


    const requested = allProjects.filter(
      (p) => getCustomerProjectStatus(p) === "Requested",
    ).length;

    return {
      done,
      sessionCreated,
      live,
      visitDone,
      requested,
      upcoming,
    };
  }, [visibleCustomers, statusClock]);

  if (isLoading)
    return (
      <div className="page-loader">
        <div className="spinner spinner-lg" />
      </div>
    );
  if (!isAuthenticated) return null;
  const isAdmin = user?.role === "admin";
  const canSeeCreatedBy = isAdmin || Boolean(user?.is_company_owner);
  const canAddCustomer = true;

  return (
    <div className="min-h-screen flex flex-col">
      <Header variant="app" />

      <main className="flex-1" style={{ paddingTop: "var(--header-height)" }}>
        {/* ── Banner ── */}
        <div
          className="px-4 md:px-8 py-4 md:py-5"
          style={{ background: "var(--gradient-header)" }}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="page-banner-sub">
                {isAdmin ? "Admin View — All Users" : "My Customers"}
              </p>
              <h2 className="page-banner-title">Customer Dashboard</h2>
            </div>
            {canAddCustomer && (
              <button
                onClick={() => setShowAdd(true)}
                className="btn btn-gold gap-2 text-sm"
              >
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Customer
              </button>
            )}
          </div>
        </div>
        {/* ── Stats bar ── */}
        <div className="stats-bar">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="stats-scroll">
              {[
                {
                  val: visibleCustomers.length,
                  label: "Customers",
                  color: "var(--navy-700)",
                },
                {
                  val: meetingStats.done,
                  label: "Done",
                  color: CUSTOMER_PROJECT_STATUS_STYLES.Completed.text,
                },
                {
                  val: meetingStats.sessionCreated,
                  label: "Sessions",
                  color: CUSTOMER_PROJECT_STATUS_STYLES.Scheduled.text,
                },
                {
                  val: meetingStats.live,
                  label: "Live",
                  color: CUSTOMER_PROJECT_STATUS_STYLES.Live.text,
                },
                {
                  val: meetingStats.visitDone,
                  label: "Visit Done",
                  color: CUSTOMER_PROJECT_STATUS_STYLES["Site Visit"].text,
                },
                {
                  val: meetingStats.requested,
                  label: "Requested",
                  color: CUSTOMER_PROJECT_STATUS_STYLES.Requested.text,
                },
                {
                  val: meetingStats.upcoming,
                  label: "Upcoming",
                  color: CUSTOMER_PROJECT_STATUS_STYLES.Scheduled.text,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex items-baseline gap-1 shrink-0"
                >
                  <span className="stat-val" style={{ color: s.color }}>
                    {s.val}
                  </span>
                  <span className="stat-label">{s.label}</span>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-64 mt-2 sm:mt-0">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, code, phone..."
                className="input-field pl-9"
              />
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="px-3 sm:px-4 md:px-8 py-4 md:py-6 max-w-7xl mx-auto">
          {error && (
            <div className="alert alert-danger mb-4">
              {error}
              <button
                onClick={fetchCustomers}
                className="ml-auto text-xs font-bold underline shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {loadingData ? (
            <div className="flex justify-center py-20">
              <div className="spinner spinner-lg" />
            </div>
          ) : filtered.length === 0 && !search ? (
            <div className="text-center py-16 md:py-20">
              <p className="text-5xl md:text-6xl mb-4">👥</p>
              <h3
                className="text-lg font-bold mb-2"
                style={{ color: "var(--color-text-muted)" }}
              >
                No customers yet
              </h3>
              <p
                className="text-sm mb-6"
                style={{ color: "var(--color-text-hint)" }}
              >
                Add your first customer to get started
              </p>
              {canAddCustomer && (
                <button
                  onClick={() => setShowAdd(true)}
                  className="btn btn-primary"
                >
                  + Add Customer
                </button>
              )}
            </div>
          ) : (
            <>
              {/* ── Desktop table ── */}
              <div className="hidden md:block">
                <div
                  className="table-responsive rounded-2xl overflow-hidden"
                  style={{
                    border: "1px solid var(--slate-200)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <table className="data-table bg-white">
                    <thead>
                      <tr>
                        {[
                          "Name",
                          "Secret Code",
                          ...(canSeeCreatedBy ? ["Created By"] : []),
                          "Customer",
                          "Phone",
                          "Projects",
                          "Meetings",
                          "Session Links",
                          "Status",
                          "Actions",
                        ].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td
                            colSpan={canSeeCreatedBy ? 10 : 9}
                            style={{
                              textAlign: "center",
                              padding: "3rem",
                              color: "var(--color-text-hint)",
                            }}
                          >
                            No customers match your search.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((c) => (
                          <tr
                            key={c.id}
                            onClick={() => router.push(`/customer/${c.id}`)}
                            style={{ cursor: "pointer" }}
                          >
                            <td>
                              <div className="flex flex-col gap-0.5">
                                <span
                                  className="font-bold text-sm"
                                  style={{ color: "var(--navy-900)" }}
                                >
                                  {c.name || c.nickname}
                                </span>
                                {isAdmin && (
                                  <>
                                    <span
                                      className="text-[11px]"
                                      style={{
                                        color: "var(--color-text-muted)",
                                      }}
                                    >
                                      Company: {c.user?.company_name ?? "—"}
                                    </span>
                                    <span
                                      className="text-[11px]"
                                      style={{
                                        color: "var(--color-text-hint)",
                                      }}
                                    >
                                      Customer: {c.name ?? c.nickname} | User:{" "}
                                      {c.user?.name ?? `#${c.user_id}`}
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className="secret-code">
                                {c.secret_code}
                              </span>
                            </td>
                            {canSeeCreatedBy && (
                              <td
                                className="text-xs"
                                style={{ color: "var(--color-text-muted)" }}
                              >
                                {isAdmin ? (
                                  <div className="leading-tight">
                                    <div>
                                      Company: {c.user?.company_name ?? "—"}
                                    </div>
                                    <div>
                                      User: {c.user?.name ?? `#${c.user_id}`}
                                    </div>
                                  </div>
                                ) : (
                                  (c.user?.name ?? `#${c.user_id}`)
                                )}
                              </td>
                            )}
                            <td
                              style={{
                                color: c.name
                                  ? "var(--color-text-primary)"
                                  : "var(--color-text-hint)",
                              }}
                            >
                              {c.name ?? "—"}
                            </td>
                            <td
                              style={{
                                color: c.phone
                                  ? "var(--color-text-primary)"
                                  : "var(--color-text-hint)",
                              }}
                            >
                              {c.phone ?? "—"}
                            </td>
                            <td>
                              <ProjectsCell projects={c.projects} />
                            </td>
                            <td>
                              <MeetingStats projects={c.projects} />
                            </td>
                            <td>
                              <div
                                className="space-y-1"
                                style={{ minWidth: "220px" }}
                              >
                                {(sessionByCustomer[c.id] || [])
                                  .slice(0, 2)
                                  .map((row) => (
                                    <div
                                      key={row.id}
                                      className="text-xs px-2 py-1 rounded-md"
                                      style={{
                                        border: "1px solid #bfdbfe",
                                        background: "#eff6ff",
                                        color: "#1d4ed8",
                                      }}
                                    >
                                      <div className="font-semibold truncate">
                                        {row.project_name ||
                                          row.presentation_id}
                                      </div>
                                      <div
                                        className="truncate"
                                        style={{ color: "#334155" }}
                                      >
                                        Viewer: {row.viewer_name}
                                      </div>
                                    </div>
                                  ))}
                                {(sessionByCustomer[c.id] || []).length ===
                                  0 && (
                                  <span
                                    className="text-xs"
                                    style={{ color: "var(--color-text-hint)" }}
                                  >
                                    No links yet
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <StatusBadge status={c.status} />
                            </td>
                            <td>
                              <div className="flex gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/customer/${c.id}`);
                                  }}
                                  title="Open customer detail page"
                                  className="p-1.5 rounded-lg hover:bg-green-50 transition-colors"
                                  style={{ color: "#16a34a" }}
                                >
                                  <IconEye />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openSessionModal(c);
                                  }}
                                  title="Create ConectR session links"
                                  className="p-1.5 rounded-lg hover:bg-violet-50 transition-colors"
                                  style={{ color: "#7c3aed" }}
                                >
                                  <IconUserCard />
                                </button>

                                {!restrictProjectsForRole && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditCustomer(c);
                                      }}
                                      title="Edit"
                                      className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                                      style={{ color: "var(--navy-600)" }}
                                    >
                                      <IconEdit />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteId(c.id);
                                      }}
                                      title="Archive"
                                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                      style={{ color: "var(--red-600)" }}
                                    >
                                      <IconTrash />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Mobile cards ── */}
              <div className="md:hidden space-y-2.5">
                {filtered.length === 0 && (
                  <p
                    className="text-center py-8 text-sm"
                    style={{ color: "var(--color-text-hint)" }}
                  >
                    No customers match your search.
                  </p>
                )}
                {filtered.map((c) => (
                  <div
                    key={c.id}
                    className="card p-3.5 rounded-xl"
                    style={{ borderRadius: "var(--radius-lg)" }}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div style={{ minWidth: 0 }}>
                        <p
                          className="font-bold text-sm truncate"
                          style={{ color: "var(--navy-900)" }}
                        >
                          {c.name || c.nickname}
                        </p>
                        <span className="secret-code mt-0.5 inline-block">
                          {c.secret_code}
                        </span>
                        {canSeeCreatedBy && c.user?.name && (
                          <p
                            className="text-xs mt-0.5"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {isAdmin
                              ? `Company: ${c.user.company_name ?? "—"} | User: ${c.user.name}`
                              : `Created by: ${c.user.name}`}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={c.status} />
                    </div>

                    {/* Details */}
                    {c.name && <p className="text-sm mb-1">👤 {c.name}</p>}
                    {c.phone && (
                      <p
                        className="text-xs mb-2"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        📞 {c.phone}
                      </p>
                    )}

                    <MeetingStats projects={c.projects} />

                    <div className="mt-2 space-y-1">
                      {(sessionByCustomer[c.id] || [])
                        .slice(0, 2)
                        .map((row) => (
                          <div
                            key={row.id}
                            className="text-xs px-2 py-1 rounded-md"
                            style={{
                              border: "1px solid #bfdbfe",
                              background: "#eff6ff",
                              color: "#1d4ed8",
                            }}
                          >
                            <div className="font-semibold truncate">
                              {row.project_name || row.presentation_id}
                            </div>
                            <div
                              className="truncate"
                              style={{ color: "#334155" }}
                            >
                              {formatDateTime(row.created_at)}
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => router.push(`/customer/${c.id}`)}
                        className="btn flex-1 text-white"
                        style={{
                          fontSize: "0.78rem",
                          background: "linear-gradient(135deg,#16a34a,#15803d)",
                          padding: "0.5rem",
                        }}
                      >
                        <IconEye /> View
                      </button>
                      <button
                        onClick={() => openSessionModal(c)}
                        className="btn flex-1 text-white"
                        style={{
                          fontSize: "0.78rem",
                          background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
                          padding: "0.5rem",
                        }}
                      >
                        <IconUserCard /> Link
                      </button>
                      {!restrictProjectsForRole && (
                        <>
                          <button
                            onClick={() => setEditCustomer(c)}
                            className="btn btn-primary flex-1"
                            style={{ fontSize: "0.78rem", padding: "0.5rem" }}
                          >
                            <IconEdit /> Edit
                          </button>
                          <button
                            onClick={() => setDeleteId(c.id)}
                            className="btn btn-danger flex-1"
                            style={{ fontSize: "0.78rem", padding: "0.5rem" }}
                          >
                            <IconTrash />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />

      {/* Modals */}
      {showAdd && canAddCustomer && (
        <AddCustomerModal
          onClose={() => setShowAdd(false)}
          onAdded={(c) => {
            setCustomers((prev) => [normalise(c), ...prev]);
            setShowAdd(false);
          }}
        />
      )}
      {viewCustomer && (
        <ViewCustomerModal
          customer={viewCustomer}
          onClose={() => setViewCustomer(null)}
          onCustomerUpdated={(u) => {
            const n = normalise(u);
            setCustomers((prev) => prev.map((c) => (c.id === n.id ? n : c)));
            setViewCustomer(n);
          }}
        />
      )}
      {!restrictProjectsForRole && editCustomer && (
        <EditCustomerModal
          customer={editCustomer}
          onClose={() => setEditCustomer(null)}
          onUpdated={(u) => {
            const n = normalise(u);
            setCustomers((prev) => prev.map((c) => (c.id === n.id ? n : c)));
            setEditCustomer(null);
          }}
        />
      )}

      <LinkPreviewModal
        customer={linkModalCustomer}
        links={linkRows}
        loading={linkLoading}
        onCustomerUpdated={(u) => {
          const n = normalise(u);
          setCustomers((prev) => prev.map((c) => (c.id === n.id ? n : c)));
          setLinkModalCustomer(n);
        }}
        onClose={() => {
          setLinkModalCustomer(null);
          setLinkRows([]);
          setLinkLoading(false);
        }}
      />

      <CustomerSessionLinkModal
        customer={sessionModalCustomer}
        user={user ?? null}
        links={sessionRows}
        loading={sessionLoading}
        onCreated={(newRow) => {
          setSessionRows((prev) => [newRow, ...prev]);
          setSessionByCustomer((prev) => ({
            ...prev,
            [newRow.customer_id]: [newRow, ...(prev[newRow.customer_id] || [])],
          }));
        }}
        onClose={() => {
          setSessionModalCustomer(null);
          setSessionRows([]);
          setSessionLoading(false);
        }}
      />

      {/* Delete confirm */}
      {!restrictProjectsForRole && deleteId !== null && (
        <div className="modal-overlay">
          <div
            className="modal-box"
            style={{ maxWidth: "22rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-body text-center py-6">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: "var(--red-100)" }}
              >
                <svg
                  className="w-7 h-7"
                  style={{ color: "var(--red-600)" }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3
                className="font-bold text-lg mb-1"
                style={{ color: "var(--navy-900)" }}
              >
                Archive Customer?
              </h3>
              <p
                className="text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                This will soft delete the customer and hide it from active
                lists.
              </p>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setDeleteId(null)}
                className="btn btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={deleting}
                className="btn btn-danger flex-1"
              >
                {deleting ? "Archiving..." : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
