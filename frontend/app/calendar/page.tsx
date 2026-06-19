// app/calendar/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  CustomerAPI,
  Customer,
  CustomerSessionLink,
  CustomerSessionLinkAPI,
  ProjectMeeting,
} from "@/lib/api";
import {
  fetchAllProjects,
  ApiProject,
  getProjectPresentationId,
  normalize,
} from "@/lib/conectr";
import AddCustomerModal from "@/components/AddCustomerModal";
import MeetingModal, { MeetingEntry } from "@/components/MeetingModal";
import PreSiteVisitModal from "@/components/PreSiteVisitModal";
import { format12HourTime, formatDisplayDate } from "@/lib/dateTime";
import {
  hasCompletedSessionEvidence,
  hasViewerActivity,
  getTimedMeetingStatus,
  timedMeetingStatusLabel,
  TimedMeetingStatus,
} from "@/lib/meetingStatus";

const WEEKDAYS_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const CALENDAR_CUSTOMERS_CACHE_KEY = "calendar:customers:v1";

const normalise = (c: Customer) => ({
  ...c,
  projects: safeProjects(c.projects),
});
function safeProjects(projects: unknown): ProjectMeeting[] {
  return Array.isArray(projects) ? (projects as ProjectMeeting[]) : [];
}
function fmt12(t: string) {
  return format12HourTime(t);
}

const SESSION_LINK_PILL = {
  bg: "rgba(59, 130, 246, 0.18)",
  text: "#000",
  border: "rgba(59, 130, 246, 0.4)",
  dot: "#60a5fa",
};
const SCHEDULED_PILL = {
  bg: "rgba(249,115,22,0.12)",
  text: "#7a3500",
  border: "rgba(249,115,22,0.32)",
  dot: "#f97316",
};
const SITE_VISIT_PILL = {
  bg: "rgba(34,197,94,0.14)",
  text: "#14532d",
  border: "rgba(34,197,94,0.34)",
  dot: "#16a34a",
};
const LIVE_PILL = {
  bg: "rgba(124,58,237,0.14)",
  text: "#5b21b6",
  border: "rgba(124,58,237,0.34)",
  dot: "#7c3aed",
};
const SELF_VIEW_PILL = {
  bg: "rgba(147,51,234,0.16)",
  text: "#581c87",
  border: "rgba(147,51,234,0.38)",
  dot: "#9333ea",
};
const COMPLETED_PILL = {
  bg: "rgba(107,114,128,0.14)",
  text: "#374151",
  border: "rgba(107,114,128,0.34)",
  dot: "#6b7280",
};

type CalendarSessionLink = CustomerSessionLink & {
  customer?: {
    id: number;
    user_id?: number;
    nickname?: string;
    name?: string;
    secret_code?: string;
    email?: string;
    phone?: string;
  };
};

type ConectrAnalyticsResponse = {
  session?: {
    status?: string;
    started_at?: string;
    ended_at?: string;
    joinees?: number;
    event_count?: number;
    summary?: Record<string, unknown>;
    feedback_submissions?: Array<Record<string, unknown>>;
  };
  events?: Array<Record<string, unknown>>;
  feedback_submissions?: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
  summary_payload?: Record<string, unknown>;
  ai_summary?: Record<string, unknown>;
  analysis?: Record<string, unknown>;
  analytics_summary?: Record<string, unknown>;
};

type SessionEvidence = {
  status?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  joinees?: number;
  eventCount?: number;
  hasAnalysis?: boolean;
};

type AnalyticsEntryResult = {
  sessionLinkId: number;
  evidence: SessionEvidence;
  entries: CalendarEntry[];
};

type SiteVisitFeedbackDetails = {
  formName: string;
  submittedAt?: string;
  preferredDateTime: string;
  answers: Record<string, unknown>;
  sessionLinkId: number;
  sessionToken: string;
};

type CalendarEntry = MeetingEntry & {
  kind: "meeting" | "site-visit" | "self-view";
  hasSessionLink?: boolean;
  sessionLinkCount?: number;
  latestSessionLinkId?: number | null;
  latestSessionCreatedAt?: string | null;
  latestSessionStatus?: string | null;
  latestSessionStartedAt?: string | null;
  latestSessionEndedAt?: string | null;
  latestSessionJoinees?: number;
  latestSessionEventCount?: number;
  sessionEvidence?: SessionEvidence;
  siteVisitFeedback?: SiteVisitFeedbackDetails;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function getRecordValue(record: Record<string, unknown>, keys: string[]) {
  const loweredKeys = keys.map((key) => key.toLowerCase());
  for (const [key, value] of Object.entries(record)) {
    if (loweredKeys.includes(key.toLowerCase())) {
      return value;
    }
  }
  return undefined;
}

function extractFeedbackAnswers(eventRecord: Record<string, unknown>) {
  const dataRecord = isRecord(eventRecord.data) ? eventRecord.data : undefined;
  const payloadRecord = [
    isRecord(eventRecord.payload) ? eventRecord.payload : undefined,
    dataRecord && isRecord(dataRecord.payload) ? dataRecord.payload : undefined,
    isRecord(eventRecord.answers) ? eventRecord.answers : undefined,
    dataRecord && isRecord(dataRecord.answers) ? dataRecord.answers : undefined,
    isRecord(eventRecord.form_data) ? eventRecord.form_data : undefined,
    dataRecord && isRecord(dataRecord.form_data)
      ? dataRecord.form_data
      : undefined,
    dataRecord,
  ].find((value) => isRecord(value));

  if (!payloadRecord || !isRecord(payloadRecord)) {
    return {};
  }

  const metadataKeys = new Set([
    "event_type",
    "type",
    "event",
    "name",
    "form_name",
    "form_title",
    "created_at",
    "submitted_at",
    "timestamp",
    "session_token",
  ]);

  return Object.fromEntries(
    Object.entries(payloadRecord).filter(
      ([key]) => !metadataKeys.has(key.toLowerCase()),
    ),
  );
}

function parsePreferredSiteVisitDateTime(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const isoMatch = trimmedValue.match(
    /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}))?/,
  );
  if (isoMatch) {
    return {
      date: isoMatch[1],
      time: isoMatch[2] || "",
    };
  }

  const dmyMatch = trimmedValue.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?/i,
  );
  if (dmyMatch) {
    const day = String(Number(dmyMatch[1])).padStart(2, "0");
    const month = String(Number(dmyMatch[2])).padStart(2, "0");
    const year = dmyMatch[3];

    let hour = dmyMatch[4] ? Number(dmyMatch[4]) : NaN;
    const minute = dmyMatch[5]
      ? String(Number(dmyMatch[5])).padStart(2, "0")
      : "00";
    const meridiem = dmyMatch[6]?.toUpperCase();

    if (!Number.isNaN(hour) && meridiem) {
      if (meridiem === "PM" && hour < 12) hour += 12;
      if (meridiem === "AM" && hour === 12) hour = 0;
    }

    return {
      date: `${year}-${month}-${day}`,
      time: Number.isNaN(hour)
        ? ""
        : `${String(hour).padStart(2, "0")}:${minute}`,
    };
  }

  return null;
}

function extractPreferredSiteVisitTextFromObject(
  value: unknown,
): string | undefined {
  if (!value) return undefined;

  if (typeof value === "string") {
    const regex = /Preferred Site Visit Date\s*[:\-]\s*([^\n,;]+)/i;
    const match = value.match(regex);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractPreferredSiteVisitTextFromObject(item);
      if (found) return found;
    }
    return undefined;
  }

  if (isRecord(value)) {
    const direct = firstString(
      value["Preferred Site Visit Date"],
      value.preferred_site_visit_date,
      value.preferredSiteVisitDate,
      value["Site Visit Date"],
      value.site_visit_date,
      value.preferred_date,
    );

    if (direct) return direct;

    for (const nested of Object.values(value)) {
      const found = extractPreferredSiteVisitTextFromObject(nested);
      if (found) return found;
    }
  }

  return undefined;
}

function resolvePreferredSiteVisitDateTime(
  answers: Record<string, unknown>,
  eventRecord: Record<string, unknown>,
  dataRecord?: Record<string, unknown>,
) {
  const preferredDate =
    firstString(
      getRecordValue(answers, [
        "Preferred Site Visit Date",
        "preferred_site_visit_date",
        "preferredSiteVisitDate",
        "Site Visit Date",
        "site_visit_date",
        "preferred_date",
      ]),
    ) ||
    extractPreferredSiteVisitTextFromObject(eventRecord) ||
    extractPreferredSiteVisitTextFromObject(dataRecord);

  if (!preferredDate) return undefined;

  const preferredTime = firstString(
    getRecordValue(answers, [
      "Preferred Site Visit Time",
      "preferred_site_visit_time",
      "preferredSiteVisitTime",
      "Site Visit Time",
      "site_visit_time",
      "preferred_time",
    ]),
    eventRecord.preferred_time,
    dataRecord?.preferred_time,
  );

  return preferredTime && !/\d{1,2}:\d{2}/.test(preferredDate)
    ? `${preferredDate} ${preferredTime}`
    : preferredDate;
}

function getFeedbackSourceRecords(analytics: ConectrAnalyticsResponse) {
  const events = Array.isArray(analytics.events) ? analytics.events : [];
  const sessionSubmissions = Array.isArray(
    analytics.session?.feedback_submissions,
  )
    ? analytics.session.feedback_submissions
    : [];
  const submissions = Array.isArray(analytics.feedback_submissions)
    ? analytics.feedback_submissions
    : sessionSubmissions;

  return [
    ...submissions.map((record) => ({ record, source: "feedback" as const })),
    ...events.map((record) => ({ record, source: "event" as const })),
  ];
}

function hasAnalysisPayload(value: unknown): boolean {
  return Boolean(value && isRecord(value) && Object.keys(value).length > 0);
}

function analyticsHasSummary(analytics: ConectrAnalyticsResponse): boolean {
  return (
    hasAnalysisPayload(analytics.summary) ||
    hasAnalysisPayload(analytics.summary_payload) ||
    hasAnalysisPayload(analytics.ai_summary) ||
    hasAnalysisPayload(analytics.analysis) ||
    hasAnalysisPayload(analytics.analytics_summary) ||
    hasAnalysisPayload(analytics.session?.summary)
  );
}

function buildCalendarCustomer(
  sessionLink: CalendarSessionLink,
  fallbackCustomer?: Customer,
) {
  if (fallbackCustomer) {
    return fallbackCustomer;
  }

  if (!sessionLink.customer) {
    return null;
  }

  return {
    id: sessionLink.customer_id,
    user_id: sessionLink.customer.user_id ?? 0,
    nickname:
      sessionLink.customer.name ||
      sessionLink.customer.nickname ||
      `Customer ${sessionLink.customer_id}`,
    secret_code:
      sessionLink.customer.secret_code || `CUS-${sessionLink.customer_id}`,
    name: sessionLink.customer.name,
    email: sessionLink.customer.email,
    phone: sessionLink.customer.phone,
    status: "active",
    created_at: sessionLink.created_at,
    updated_at: sessionLink.created_at,
    projects: [],
  } as Customer;
}

function extractSiteVisitEntries(
  sessionLink: CalendarSessionLink,
  analytics: ConectrAnalyticsResponse,
  customer: Customer,
): CalendarEntry[] {
  const sourceRecords = getFeedbackSourceRecords(analytics);
  if (sourceRecords.length === 0) {
    return [];
  }

  return sourceRecords.flatMap(({ record: eventRecord, source }) => {
    if (!isRecord(eventRecord)) {
      return [];
    }

    const dataRecord = isRecord(eventRecord.data)
      ? eventRecord.data
      : undefined;
    const eventType = firstString(
      eventRecord.event_type,
      eventRecord.type,
      eventRecord.event,
      eventRecord.name,
      dataRecord?.event_type,
      dataRecord?.type,
      dataRecord?.event,
      dataRecord?.name,
    );

    const answers = extractFeedbackAnswers(eventRecord);
    const formName =
      firstString(
        eventRecord.form_name,
        eventRecord.form_title,
        dataRecord?.form_name,
        dataRecord?.form_title,
      ) || "Site Visit Booking Form";

    const preferredSiteVisitValue = resolvePreferredSiteVisitDateTime(
      answers,
      eventRecord,
      dataRecord,
    );
    const submittedAt = firstString(
      eventRecord.created_at,
      eventRecord.submitted_at,
      eventRecord.timestamp,
      dataRecord?.created_at,
      dataRecord?.submitted_at,
      dataRecord?.timestamp,
    );

    const normalizedEventType = (eventType || "").toLowerCase();
    const normalizedFormName = formName.toLowerCase();
    const isLikelySiteVisitEvent =
      normalizedEventType === "feedback_submitted" ||
      normalizedEventType === "site_visit_booked" ||
      normalizedEventType === "site_visit_declined" ||
      normalizedEventType.includes("site") ||
      normalizedEventType.includes("form") ||
      normalizedFormName.includes("site visit") ||
      Boolean(preferredSiteVisitValue);

    if (!isLikelySiteVisitEvent) {
      return [];
    }

    const preferredSiteVisit = preferredSiteVisitValue
      ? parsePreferredSiteVisitDateTime(preferredSiteVisitValue)
      : submittedAt
        ? parsePreferredSiteVisitDateTime(submittedAt)
        : null;
    if (!preferredSiteVisit) {
      return [];
    }

    return [
      {
        customer,
        meeting_date: preferredSiteVisit.date,
        meeting_time: preferredSiteVisit.time,
        project_name:
          sessionLink.project_name ||
          sessionLink.presentation_title ||
          formName,
        kind: "site-visit",
        hasSessionLink: true,
        sessionLinkCount: 1,
        latestSessionLinkId: sessionLink.id,
        latestSessionCreatedAt: sessionLink.created_at,
        siteVisitFeedback: {
          formName,
          submittedAt,
          preferredDateTime: preferredSiteVisitValue || submittedAt || "",
          answers,
          sessionLinkId: sessionLink.id,
          sessionToken: sessionLink.session_token || source,
        },
      },
    ];
  });
}

function isCalendarVisibleSelfView(sessionLink: CalendarSessionLink) {
  return (
    Boolean(sessionLink.self_view_url) &&
    Boolean(sessionLink.meeting_date) &&
    Boolean(sessionLink.meeting_time) &&
    sessionLink.raw_response?.self_view_calendar_visible === true
  );
}

function buildSelfViewCalendarEntry(
  sessionLink: CalendarSessionLink,
  customer: Customer,
): CalendarEntry {
  return {
    customer,
    meeting_date: sessionLink.meeting_date || "",
    meeting_time: sessionLink.meeting_time || "",
    project_name:
      sessionLink.project_name ||
      sessionLink.presentation_title ||
      sessionLink.presentation_id,
    kind: "self-view",
    hasSessionLink: true,
    sessionLinkCount: 1,
    latestSessionLinkId: sessionLink.id,
    latestSessionCreatedAt: sessionLink.created_at,
    latestSessionStatus: sessionLink.status ?? null,
    latestSessionStartedAt: sessionLink.started_at ?? null,
    latestSessionEndedAt: sessionLink.ended_at ?? null,
    latestSessionJoinees: sessionLink.joinees ?? 0,
    latestSessionEventCount: sessionLink.event_count ?? 0,
    sessionEvidence: {
      status: sessionLink.status ?? "scheduled",
      startedAt: sessionLink.started_at ?? null,
      endedAt: sessionLink.ended_at ?? null,
      joinees: sessionLink.joinees ?? 0,
      eventCount: sessionLink.event_count ?? 0,
    },
  };
}

function getEntryPalette(entry: CalendarEntry) {
  if (entry.kind === "site-visit") {
    return SITE_VISIT_PILL;
  }
  if (entry.kind === "self-view") {
    return SELF_VIEW_PILL;
  }

  const status = getCalendarEntryTimedStatus(entry);
  if (status === "live") return LIVE_PILL;
  if (status === "completed") return COMPLETED_PILL;

  return entry.hasSessionLink ? SESSION_LINK_PILL : SCHEDULED_PILL;
}

function getEntryDisplayLabel(entry: CalendarEntry) {
  if (entry.kind === "site-visit") {
    return entry.customer.secret_code || entry.customer.name || entry.customer.nickname;
  }
  return entry.customer.name || entry.customer.nickname;
}

function getEntryCalendarPillLabel(entry: CalendarEntry) {
  const time = entry.meeting_time ? fmt12(entry.meeting_time) : "-";
  const secretCode = entry.customer.secret_code || "-";
  const nickname = entry.customer.name || entry.customer.nickname || "-";

  return {
    time,
    identity: `${secretCode} • ${nickname}`,
  };
}

function getEntryStatusLabel(entry: CalendarEntry) {
  if (entry.kind === "site-visit") {
    return "Site Visit Form Submitted";
  }
  if (entry.kind === "self-view") {
    return "Self-View Later";
  }
  const status = getCalendarEntryTimedStatus(entry);
  if (status === "scheduled") {
    return entry.hasSessionLink ? "Session Scheduled" : "Requested Session";
  }
  return timedMeetingStatusLabel(status);
}

function getCalendarEntryTimedStatus(entry: CalendarEntry): TimedMeetingStatus {
  const evidence = entry.sessionEvidence;
  const startedAt = evidence?.startedAt ?? entry.latestSessionStartedAt;
  const endedAt = evidence?.endedAt ?? entry.latestSessionEndedAt;
  const hasSession =
    Boolean(entry.hasSessionLink) || (entry.sessionLinkCount || 0) > 0;
  const hasActivity = hasViewerActivity({
    joinees: evidence?.joinees ?? entry.latestSessionJoinees,
    eventCount: evidence?.eventCount ?? entry.latestSessionEventCount,
  });

  if (startedAt && !endedAt) return "live";
  if (endedAt) {
    return evidence?.hasAnalysis && hasActivity ? "completed" : "scheduled";
  }

  return getTimedMeetingStatus({
    meetingDate: entry.meeting_date,
    meetingTime: entry.meeting_time,
    hasSession,
    hasViewerActivity: hasActivity,
    completedEvidence: hasCompletedSessionEvidence({
      status: evidence?.status ?? entry.latestSessionStatus,
      startedAt,
      endedAt,
      joinees: evidence?.joinees ?? entry.latestSessionJoinees,
      eventCount: evidence?.eventCount ?? entry.latestSessionEventCount,
    }) && Boolean(evidence?.hasAnalysis),
  });
}

function formatFeedbackValue(value: unknown): string {
  if (Array.isArray(value)) {
    const items: string[] = value
      .map((item) => formatFeedbackValue(item))
      .filter(Boolean);
    return items.length > 0 ? items.join(", ") : "-";
  }

  if (isRecord(value)) {
    return JSON.stringify(value);
  }

  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
}

function formatSubmittedAt(value?: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPreferredSiteVisit(value: string) {
  const parsed = parsePreferredSiteVisitDateTime(value);
  if (!parsed) {
    return value;
  }

  return `${formatDisplayDate(parsed.date)}${parsed.time ? ` · ${fmt12(parsed.time)}` : ""}`;
}

const TIME_SLOTS = Array.from({ length: 29 }, (_, i) => {
  const mins = 7 * 60 + i * 30;
  const h = Math.floor(mins / 60),
    m = mins % 60;
  const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { val, label: fmt12(val) };
});

/* ── small helpers ── */
function StepBadge({ n }: { n: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "1.3rem",
        height: "1.3rem",
        borderRadius: "50%",
        background: "linear-gradient(135deg,#1e4580,#0f2240)",
        color: "#fff",
        fontSize: "0.65rem",
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {n}
    </span>
  );
}

function Spin() {
  return (
    <div
      className="spinner"
      style={{ width: "0.9rem", height: "0.9rem", borderWidth: "2px" }}
    />
  );
}

/* ─── SheetOverlay ─── */
function SheetOverlay({
  onClose,
  children,
  hidden,
}: {
  onClose: () => void;
  children: React.ReactNode;
  hidden?: boolean;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: hidden ? "none" : "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(6,14,26,0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "fadeInBg 0.2s ease-out",
        padding: "1.25rem 0.75rem calc(env(safe-area-inset-bottom) + 3.5rem)",
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "30rem",
          maxHeight: "calc(100dvh - env(safe-area-inset-bottom) - 5.25rem)",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: "20px",
          boxShadow: "0 -8px 40px rgba(6,14,26,0.28)",
          overflow: "hidden",
          animation: "slideUpSheet 0.3s cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "10px 0 0",
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: "rgba(100,116,139,0.3)",
            }}
          />
        </div>
        {children}
      </div>
      <style>{`
        @keyframes slideUpSheet { from{transform:translateY(100%);opacity:.6} to{transform:translateY(0);opacity:1} }
        @keyframes fadeInBg     { from{opacity:0} to{opacity:1} }
        @keyframes fadeIn       { from{opacity:0} to{opacity:1} }
      `}</style>
    </div>
  );
}

function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      style={{
        width: "2rem",
        height: "2rem",
        borderRadius: "50%",
        background: "rgba(255,255,255,0.15)",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        flexShrink: 0,
      }}
    >
      <svg
        width="14"
        height="14"
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
  );
}

function SiteVisitDetailsModal({
  entry,
  onClose,
}: {
  entry: CalendarEntry;
  onClose: () => void;
}) {
  const feedback = entry.siteVisitFeedback;
  if (!feedback) return null;

  return (
    <SheetOverlay onClose={onClose}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.85rem 1.2rem",
          background: "linear-gradient(135deg,#14532d,#166534,#16a34a)",
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "1rem",
              color: "#fff",
              margin: "0 0 4px",
            }}
          >
            {entry.customer.name || entry.customer.nickname}
          </p>
          <span
            className="secret-code"
            style={{
              background: "rgba(255,255,255,0.16)",
              color: "#fff",
              borderColor: "rgba(255,255,255,0.2)",
            }}
          >
            {entry.customer.secret_code}
          </span>
        </div>
        <CloseBtn onClose={onClose} />
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "1rem 1.2rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
        }}
      >
        <span
          className="badge"
          style={{
            background: SITE_VISIT_PILL.bg,
            color: SITE_VISIT_PILL.text,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: SITE_VISIT_PILL.dot,
            }}
          />
          Site Visit Form Submitted
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.9rem",
            borderRadius: "var(--radius-lg)",
            background:
              "linear-gradient(135deg,rgba(34,197,94,0.09),rgba(22,163,74,0.05))",
            border: "1px solid rgba(34,197,94,0.18)",
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "var(--radius-lg)",
              flexShrink: 0,
              background: "linear-gradient(135deg,#166534,#15803d)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "1.1rem",
            }}
          >
            🏡
          </div>
          <div>
            <p
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "var(--color-text-muted)",
                margin: "0 0 2px",
              }}
            >
              Preferred Site Visit
            </p>
            <p
              style={{
                fontSize: "0.9rem",
                fontWeight: 700,
                color: SITE_VISIT_PILL.text,
                margin: 0,
              }}
            >
              {formatPreferredSiteVisit(feedback.preferredDateTime)}
            </p>
          </div>
        </div>

        <div
          style={{
            padding: "0.85rem",
            borderRadius: "var(--radius-lg)",
            background: "#fff",
            border: "1px solid var(--slate-200)",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <p
            style={{
              fontSize: "0.68rem",
              fontWeight: 700,
              color: "var(--color-text-muted)",
              margin: "0 0 0.35rem",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Form Details
          </p>
          <p style={{ margin: 0, fontSize: "0.84rem", fontWeight: 600 }}>
            {feedback.formName}
          </p>
          <p
            style={{
              margin: "0.35rem 0 0",
              fontSize: "0.75rem",
              color: "var(--color-text-muted)",
            }}
          >
            Submitted: {formatSubmittedAt(feedback.submittedAt)}
          </p>
          {entry.project_name && (
            <p
              style={{
                margin: "0.35rem 0 0",
                fontSize: "0.75rem",
                color: "var(--color-text-muted)",
              }}
            >
              Project: {entry.project_name}
            </p>
          )}
        </div>

        <div style={{ display: "grid", gap: "0.6rem" }}>
          {Object.entries(feedback.answers).map(([key, value]) => (
            <div
              key={key}
              style={{
                padding: "0.8rem 0.85rem",
                borderRadius: "var(--radius-lg)",
                background: "#fff",
                border: "1px solid var(--slate-200)",
                boxShadow: "var(--shadow-xs)",
              }}
            >
              <p
                style={{
                  margin: "0 0 0.28rem",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {key}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.84rem",
                  fontWeight: 500,
                  color: "var(--navy-900)",
                  wordBreak: "break-word",
                }}
              >
                {formatFeedbackValue(value)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "0.85rem 1.2rem",
          paddingBottom: "calc(0.85rem + env(safe-area-inset-bottom))",
          borderTop: "1px solid var(--slate-100)",
          background: "#fff",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          className="btn btn-primary"
          style={{ width: "100%" }}
        >
          Close
        </button>
      </div>
    </SheetOverlay>
  );
}

/* ═══════════════════════════════════════════
   ADD MEETING MODAL
═══════════════════════════════════════════ */
function AddMeetingModal({
  date,
  onClose,
  onAdded,
  allowedProjects,
  restrictToAllowedProjects,
}: {
  date: string;
  onClose: () => void;
  onAdded: () => void;
  allowedProjects: string[];
  restrictToAllowedProjects: boolean;
}) {
  const [apiProjects, setApiProjects] = useState<ApiProject[]>([]);
  const [loadingP, setLoadingP] = useState(true);

  const allowedProjectSet = useMemo(
    () => new Set(allowedProjects.map((p) => normalize(p))),
    [allowedProjects],
  );

  const filteredProjects = useMemo(() => {
    const projectsWithConectrCode = apiProjects.filter((project) =>
      getProjectPresentationId(project),
    );
    if (!restrictToAllowedProjects) {
      return projectsWithConectrCode;
    }
    return projectsWithConectrCode.filter((p) =>
      allowedProjectSet.has(normalize(p.title)),
    );
  }, [apiProjects, allowedProjectSet, restrictToAllowedProjects]);

  useEffect(() => {
    fetchAllProjects()
      .then(({ projects }) => setApiProjects(projects))
      .catch(() => {})
      .finally(() => setLoadingP(false));
  }, []);
  return (
    <PreSiteVisitModal
      isOpen
      onClose={onClose}
      initialDate={date}
      projectOptions={filteredProjects}
      loadingProjectOptions={loadingP}
      onScheduled={onAdded}
    />
  );
}

/* ═══════════════════════════════════════════
   MAIN CALENDAR PAGE
═══════════════════════════════════════════ */
export default function CalendarPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const restrictRoles = useMemo(
    () => new Set(["developer_super_admin", "sourcing_admin", "sales_user"]),
    [],
  );
  const restrictToAllowedProjects = Boolean(
    user?.role && restrictRoles.has(user.role),
  );

  const allowedProjectSet = useMemo(() => {
    const raw = Array.isArray(user?.assigned_projects)
      ? user.assigned_projects
      : [];
    return new Set(raw.map((name) => normalize(name)));
  }, [user?.assigned_projects]);

  const allowedProjects = useMemo(
    () => Array.from(allowedProjectSet),
    [allowedProjectSet],
  );

  const [showAdd, setShowAdd] = useState(false);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingSiteVisits, setLoadingSiteVisits] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(todayStr);
  const [datePanelOpen, setDatePanelOpen] = useState({
    siteVisit: true,
    selfView: true,
    live: true,
    scheduled: true,
    requested: true,
    completed: true,
  });
  const [siteVisitEntries, setSiteVisitEntries] = useState<CalendarEntry[]>([]);
  const [selfViewEntries, setSelfViewEntries] = useState<CalendarEntry[]>([]);
  const [sessionEvidenceByLinkId, setSessionEvidenceByLinkId] = useState<
    Record<number, SessionEvidence>
  >({});
  const [refreshTick, setRefreshTick] = useState(0);
  const [statusClock, setStatusClock] = useState(() => Date.now());
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(
    null,
  );
  const [addDate, setAddDate] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/");
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const id = window.setInterval(() => setStatusClock(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoadingData(customers.length === 0);
      const r = await CustomerAPI.calendarList();
      const normalized = r.data.map(normalise);
      setCustomers(normalized);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          CALENDAR_CUSTOMERS_CACHE_KEY,
          JSON.stringify(normalized),
        );
      }
    } catch {
      /**/
    } finally {
      setLoadingData(false);
    }
  }, [customers.length]);

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") return;
    const cached = window.sessionStorage.getItem(CALENDAR_CUSTOMERS_CACHE_KEY);
    if (!cached) return;

    try {
      const parsed = JSON.parse(cached) as Customer[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      setCustomers(parsed.map(normalise));
      setLoadingData(false);
    } catch {
      // ignore stale cache
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) fetchCustomers();
  }, [isAuthenticated, fetchCustomers, refreshTick]);

  const fetchSiteVisitEntries = useCallback(async () => {
    try {
      setLoadingSiteVisits(true);

      const customerById = new Map(
        customers.map((customer) => [customer.id, customer]),
      );
      const sessionLinksRes = await CustomerSessionLinkAPI.list();
      const sessionLinks = (sessionLinksRes.data ||
        []) as CalendarSessionLink[];
      const nextSelfViewEntries = sessionLinks
        .filter(isCalendarVisibleSelfView)
        .filter(
          (sessionLink) =>
            !restrictToAllowedProjects ||
            !sessionLink.project_name ||
            allowedProjectSet.has(normalize(sessionLink.project_name)),
        )
        .flatMap((sessionLink) => {
          const customer = buildCalendarCustomer(
            sessionLink,
            customerById.get(sessionLink.customer_id),
          );
          return customer
            ? [buildSelfViewCalendarEntry(sessionLink, customer)]
            : [];
        });
      setSelfViewEntries(nextSelfViewEntries);

      const analyticsResults = await Promise.allSettled(
        sessionLinks.map(async (sessionLink): Promise<AnalyticsEntryResult | null> => {
          if (!sessionLink.session_token) {
            return null;
          }

          if (
            restrictToAllowedProjects &&
            sessionLink.project_name &&
            !allowedProjectSet.has(normalize(sessionLink.project_name))
          ) {
            return null;
          }

          const customer = buildCalendarCustomer(
            sessionLink,
            customerById.get(sessionLink.customer_id),
          );
          if (!customer) {
            return null;
          }

          const analytics = (sessionLink.analytics_payload ??
            {}) as ConectrAnalyticsResponse;
          const feedbackCount = Math.max(
            Array.isArray(analytics.feedback_submissions)
              ? analytics.feedback_submissions.length
              : 0,
            Array.isArray(analytics.session?.feedback_submissions)
              ? analytics.session.feedback_submissions.length
              : 0,
          );

          const evidence: SessionEvidence = {
            status: analytics.session?.status ?? sessionLink.status ?? null,
            startedAt:
              analytics.session?.started_at ?? sessionLink.started_at ?? null,
            endedAt: analytics.session?.ended_at ?? sessionLink.ended_at ?? null,
            joinees: Number(analytics.session?.joinees ?? sessionLink.joinees ?? 0),
            eventCount: Math.max(
              Number(analytics.session?.event_count ?? 0),
              Array.isArray(analytics.events) ? analytics.events.length : 0,
              feedbackCount,
              Number(sessionLink.event_count ?? 0),
            ),
            hasAnalysis:
              analyticsHasSummary(analytics) ||
              hasAnalysisPayload(sessionLink.summary_payload),
          };

          return {
            sessionLinkId: sessionLink.id,
            evidence,
            entries: extractSiteVisitEntries(sessionLink, analytics, customer),
          };
        }),
      );

      const nextEvidence: Record<number, SessionEvidence> = {};
      analyticsResults.forEach((result) => {
        if (result.status !== "fulfilled" || !result.value) return;
        nextEvidence[result.value.sessionLinkId] = result.value.evidence;
      });
      setSessionEvidenceByLinkId(nextEvidence);

      const seenKeys = new Set<string>();
      const nextEntries = analyticsResults
        .flatMap((result) =>
          result.status === "fulfilled" && result.value
            ? result.value.entries
            : [],
        )
        .filter((entry) => {
          const uniqueKey = `${entry.siteVisitFeedback?.sessionLinkId ?? "na"}:${entry.meeting_date}:${entry.meeting_time}`;
          if (seenKeys.has(uniqueKey)) {
            return false;
          }
          seenKeys.add(uniqueKey);
          return true;
        })
        .sort((left, right) =>
          (left.meeting_date + left.meeting_time).localeCompare(
            right.meeting_date + right.meeting_time,
          ),
        );

      setSiteVisitEntries(nextEntries);
    } catch {
      setSiteVisitEntries([]);
      setSelfViewEntries([]);
      setSessionEvidenceByLinkId({});
    } finally {
      setLoadingSiteVisits(false);
    }
  }, [customers, restrictToAllowedProjects, allowedProjectSet]);

  useEffect(() => {
    if (isAuthenticated) fetchSiteVisitEntries();
  }, [isAuthenticated, fetchSiteVisitEntries, refreshTick]);

  const prevMonth = () =>
    month === 0
      ? (setMonth(11), setYear((y) => y - 1))
      : setMonth((m) => m - 1);
  const nextMonth = () =>
    month === 11
      ? (setMonth(0), setYear((y) => y + 1))
      : setMonth((m) => m + 1);
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const meetingEntries = useMemo<CalendarEntry[]>(() => {
    const out: CalendarEntry[] = [];
    customers.forEach((c) => {
      if (c.projects?.length) {
        c.projects.forEach((p) => {
          if (
            restrictToAllowedProjects &&
            !allowedProjectSet.has(normalize(p.project_name ?? ""))
          ) {
            return;
          }
          out.push({
            customer: c,
            meeting_date: p.meeting_date,
            meeting_time: p.meeting_time ?? "",
            project_name: p.project_name,
            created_by_name: p.created_by_name,
            assigned_to_user_name: p.assigned_to_user_name,
            updated_by_name: p.updated_by_name,
            kind: "meeting",
            hasSessionLink:
              Boolean(p.has_session_link) || (p.session_link_count || 0) > 0,
            sessionLinkCount: p.session_link_count ?? 0,
            latestSessionLinkId: p.latest_session_link_id ?? null,
            latestSessionCreatedAt: p.latest_session_created_at ?? null,
            latestSessionStatus: p.latest_session_status ?? null,
            latestSessionStartedAt: p.latest_session_started_at ?? null,
            latestSessionEndedAt: p.latest_session_ended_at ?? null,
            latestSessionJoinees: p.latest_session_joinees ?? 0,
            latestSessionEventCount: p.latest_session_event_count ?? 0,
            sessionEvidence: p.latest_session_link_id
              ? sessionEvidenceByLinkId[p.latest_session_link_id]
              : undefined,
          });
        });
      } else if (c.meeting_date) {
        if (
          restrictToAllowedProjects &&
          !allowedProjectSet.has(normalize(c.project_name ?? ""))
        ) {
          return;
        }
        out.push({
          customer: c,
          meeting_date: c.meeting_date,
          meeting_time: c.meeting_time ?? "",
          project_name: c.project_name ?? "",
          kind: "meeting",
          hasSessionLink:
            Boolean(c.has_session_link) || (c.session_link_count || 0) > 0,
          sessionLinkCount: c.session_link_count ?? 0,
        });
      }
    });
    return out;
  }, [
    customers,
    restrictToAllowedProjects,
    allowedProjectSet,
    sessionEvidenceByLinkId,
  ]);

  const allMeetings = useMemo(
    () =>
      [...meetingEntries, ...siteVisitEntries, ...selfViewEntries].sort((left, right) =>
        (left.meeting_date + left.meeting_time).localeCompare(
          right.meeting_date + right.meeting_time,
        ),
      ),
    [meetingEntries, siteVisitEntries, selfViewEntries],
  );

  const meetingMap = useMemo(() => {
    const map: Record<string, CalendarEntry[]> = {};
    allMeetings.forEach((e) => {
      const k = e.meeting_date.slice(0, 10);
      if (!map[k]) map[k] = [];
      map[k].push(e);
    });
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => a.meeting_time.localeCompare(b.meeting_time)),
    );
    return map;
  }, [allMeetings]);

  const selectedDateEntries = useMemo(
    () => meetingMap[selectedDateKey] || [],
    [meetingMap, selectedDateKey],
  );

  const selectedDateSiteVisits = useMemo(
    () => selectedDateEntries.filter((entry) => entry.kind === "site-visit"),
    [selectedDateEntries],
  );

  const selectedDateSelfViews = useMemo(
    () => selectedDateEntries.filter((entry) => entry.kind === "self-view"),
    [selectedDateEntries],
  );

  const selectedDateLive = useMemo(
    () => {
      void statusClock;
      return selectedDateEntries.filter(
        (entry) =>
          entry.kind === "meeting" &&
          getCalendarEntryTimedStatus(entry) === "live",
      );
    },
    [selectedDateEntries, statusClock],
  );

  const selectedDateSessionScheduled = useMemo(
    () => {
      void statusClock;
      return selectedDateEntries.filter(
        (entry) =>
          entry.kind === "meeting" &&
          getCalendarEntryTimedStatus(entry) === "scheduled" &&
          Boolean(entry.hasSessionLink),
      );
    },
    [selectedDateEntries, statusClock],
  );

  const selectedDateRequested = useMemo(
    () => {
      void statusClock;
      return selectedDateEntries.filter(
        (entry) =>
          entry.kind === "meeting" &&
          getCalendarEntryTimedStatus(entry) === "scheduled" &&
          !entry.hasSessionLink,
      );
    },
    [selectedDateEntries, statusClock],
  );

  const selectedDateCompleted = useMemo(
    () => {
      void statusClock;
      return selectedDateEntries.filter((entry) => {
        if (entry.kind !== "meeting") return false;
        const status = getCalendarEntryTimedStatus(entry);
        return status === "completed";
      });
    },
    [selectedDateEntries, statusClock],
  );

  const monthMeetings = useMemo(
    () =>
      allMeetings
        .filter((e) => {
          const d = new Date(e.meeting_date + "T00:00:00");
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .sort((a, b) =>
          (a.meeting_date + a.meeting_time).localeCompare(
            b.meeting_date + b.meeting_time,
          ),
        ),
    [allMeetings, year, month],
  );

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const makeDate = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  if (isLoading)
    return (
      <div className="page-loader">
        <div className="spinner spinner-lg" />
      </div>
    );
  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header variant="app" />
      <main className="flex-1" style={{ paddingTop: "var(--header-height)" }}>
        {/* Banner */}
        <div
          className="px-4 md:px-8 py-4 md:py-5"
          style={{ background: "var(--gradient-header)" }}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="page-banner-sub">Meeting Schedule</p>
              <h2 className="page-banner-title">📅 Calendar</h2>
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}
            >
              <div className="text-center">
                <p className="banner-stat-val">{monthMeetings.length}</p>
                <p className="banner-stat-label">This Month</p>
              </div>
              <div
                style={{
                  width: 1,
                  height: 36,
                  background: "rgba(255,255,255,0.18)",
                }}
              />
              <div className="text-center">
                <p className="banner-stat-val">{allMeetings.length}</p>
                <p className="banner-stat-label">Total</p>
              </div>
            </div>
          </div>
        </div>

        {/* Month Nav */}
        <div
          className="px-3 md:px-8 py-2.5 bg-white sticky z-10"
          style={{
            top: "var(--header-height)",
            borderBottom: "1px solid var(--slate-200)",
            boxShadow: "0 2px 8px rgba(10,22,40,0.06)",
          }}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            <button
              onClick={prevMonth}
              className="btn btn-ghost"
              style={{ padding: "0.5rem 0.75rem" }}
              aria-label="Previous month"
            >
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--navy-900)",
                  fontWeight: 700,
                  fontSize: "clamp(0.95rem,3vw,1.1rem)",
                  margin: 0,
                }}
              >
                {MONTHS[month]} {year}
              </h3>
              {(year !== today.getFullYear() || month !== today.getMonth()) && (
                <button
                  onClick={goToday}
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "2px 10px",
                    borderRadius: 999,
                    background: "var(--navy-50)",
                    color: "var(--navy-600)",
                    border: "1px solid var(--navy-100)",
                    cursor: "pointer",
                  }}
                >
                  Today
                </button>
              )}
            </div>
            <button
              onClick={nextMonth}
              className="btn btn-ghost"
              style={{ padding: "0.5rem 0.75rem" }}
              aria-label="Next month"
            >
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Hint strip */}
        <div
          style={{
            background:
              "linear-gradient(90deg,rgba(30,69,128,0.06),rgba(249,115,22,0.06))",
            borderBottom: "1px solid var(--slate-100)",
            padding: "0.4rem 1rem",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: "0.7rem",
              color: "var(--navy-600)",
              fontWeight: 600,
              margin: 0,
            }}
          >
            {restrictToAllowedProjects
              ? "🟢 Site visit form submitted = green · 🔵 Session link created = blue · 🟠 Meeting scheduled only = orange"
              : "🟢 Site visit form submitted = green · 🔵 Session link created = blue · 🟠 Meeting scheduled only = orange \u00a0·\u00a0 Click any date to view right panel details"}
          </p>
        </div>

        {/* Calendar Grid */}
        <div className="px-2 sm:px-4 md:px-6 py-3 md:py-4 max-w-7xl mx-auto">
          {loadingData ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "5rem 0",
              }}
            >
              <div className="spinner spinner-lg" />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div
                style={{
                  display: "contents",
                }}
              >
                <div
                  style={{
                    borderRadius: "var(--radius-xl)",
                    border: "1px solid var(--slate-200)",
                    boxShadow: "var(--shadow-sm)",
                    overflow: "hidden",
                  }}
                >
                  {/* Weekday headers */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7,1fr)",
                      background: "#fff",
                      borderBottom: "1px solid var(--slate-200)",
                    }}
                  >
                    {WEEKDAYS_FULL.map((d, i) => (
                      <div
                        key={d}
                        className="cal-weekday"
                        style={{
                          color:
                            i === 0 || i === 6
                              ? "var(--red-600)"
                              : "var(--navy-700)",
                        }}
                      >
                        <span className="md:hidden">{WEEKDAYS_SHORT[i]}</span>
                        <span className="hidden md:inline">{d}</span>
                      </div>
                    ))}
                  </div>

                  {/* Date cells */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7,1fr)",
                      background: "#fff",
                    }}
                  >
                    {Array.from({ length: totalCells }, (_, i) => {
                      const dayNum = i - firstDay + 1;
                      const isValid = dayNum >= 1 && dayNum <= daysInMonth;
                      const dateStr = isValid ? makeDate(dayNum) : null;
                      const isToday = dateStr === todayStr;
                      const isWknd = i % 7 === 0 || i % 7 === 6;
                      const entries = dateStr
                        ? (meetingMap[dateStr] ?? [])
                        : [];
                      const isPast = dateStr ? dateStr < todayStr : false;
                      const isSelectedDate = dateStr === selectedDateKey;
                      const isLastRow = i >= totalCells - 7;
                      const isLastCol = i % 7 === 6;

                      return (
                        <div
                          key={i}
                          className="cal-cell"
                          onClick={() => {
                            if (!isValid || !dateStr) return;

                            setSelectedDateKey(dateStr);

                            if (
                              entries.length === 0 &&
                              !isPast &&
                              !restrictToAllowedProjects
                            ) {
                              setAddDate(dateStr);
                            }
                          }}
                          style={{
                            background: !isValid
                              ? "var(--slate-50)"
                              : isToday
                                ? "rgba(30,69,128,0.05)"
                                : isWknd
                                  ? "rgba(255,241,241,0.45)"
                                  : "#fff",
                            borderRight: isLastCol
                              ? "none"
                              : "1px solid var(--slate-100)",
                            borderBottom: isLastRow
                              ? "none"
                              : "1px solid var(--slate-100)",
                            cursor: !isValid ? "default" : "pointer",
                            transition: "background 0.15s",
                            position: "relative",
                            boxShadow: isSelectedDate
                              ? "inset 0 0 0 2px var(--navy-500)"
                              : undefined,
                          }}
                        >
                          {isValid && (
                            <>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  marginBottom: 3,
                                }}
                              >
                                <span
                                  className="cal-day-num"
                                  style={
                                    isToday
                                      ? {
                                          background:
                                            "linear-gradient(135deg,#1e4580,#0f2240)",
                                          color: "#fff",
                                        }
                                      : {
                                          color: isWknd
                                            ? "var(--red-600)"
                                            : "var(--color-text-primary)",
                                        }
                                  }
                                >
                                  {dayNum}
                                </span>
                                <div
                                  className="hidden sm:flex items-center"
                                  style={{ gap: 4 }}
                                >
                                  {entries.length > 0 && (
                                    <span
                                      className="flex items-center justify-center"
                                      style={{
                                        minWidth: "1.15rem",
                                        height: "1.15rem",
                                        borderRadius: 999,
                                        padding: "0 3px",
                                        background:
                                          "linear-gradient(135deg,#1e4580,#0f2240)",
                                        color: "#fff",
                                        fontSize: "0.58rem",
                                        fontWeight: 800,
                                      }}
                                    >
                                      {entries.length}
                                    </span>
                                  )}
                                  {!isPast && !restrictToAllowedProjects && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (dateStr) setAddDate(dateStr);
                                      }}
                                      style={{
                                        width: "1.15rem",
                                        height: "1.15rem",
                                        borderRadius: "50%",
                                        border: "none",
                                        background: "rgba(30,69,128,0.08)",
                                        color: "var(--navy-400)",
                                        fontSize: "0.8rem",
                                        fontWeight: 900,
                                        cursor: "pointer",
                                        lineHeight: 1,
                                      }}
                                      aria-label="Schedule meeting"
                                      title="Schedule meeting"
                                    >
                                      +
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Mobile dots */}
                              <div
                                className="sm:hidden"
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 2,
                                }}
                              >
                                {entries.slice(0, 4).map((entry, idx) => {
                                  const pal = getEntryPalette(entry);
                                  return (
                                    <button
                                      key={idx}
                                      className="cal-dot"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedEntry(entry);
                                      }}
                                      style={{
                                        background: pal.dot,
                                        border: `1.5px solid ${pal.border}`,
                                      }}
                                      title={getEntryDisplayLabel(entry)}
                                    />
                                  );
                                })}
                                {entries.length === 0 &&
                                  !isPast &&
                                  !restrictToAllowedProjects && (
                                    <span
                                      style={{
                                        fontSize: "9px",
                                        color: "rgba(30,69,128,0.25)",
                                        fontWeight: 900,
                                        lineHeight: 1,
                                        marginTop: 2,
                                      }}
                                    >
                                      +
                                    </span>
                                  )}
                              </div>

                              {/* Desktop pills */}
                              <div
                                className="hidden sm:flex flex-col"
                                style={{
                                  gap: 2,
                                  maxHeight: "86px",
                                  overflowY:
                                    entries.length > 2 ? "auto" : "visible",
                                  paddingRight: entries.length > 2 ? 2 : 0,
                                }}
                              >
                                {entries.map((entry, idx) => {
                                  const pal = getEntryPalette(entry);
                                  const pillLabel =
                                    getEntryCalendarPillLabel(entry);
                                  return (
                                    <button
                                      key={idx}
                                      className="cal-pill"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedEntry(entry);
                                      }}
                                      style={{
                                        background: pal.bg,
                                        color: pal.text,
                                        border: `1px solid ${pal.border}`,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "flex-start",
                                        gap: 1,
                                        minHeight: "30px",
                                      }}
                                      title={`${getEntryDisplayLabel(entry)} — ${entry.project_name}`}
                                    >
                                      <span
                                        className="hidden md:inline"
                                        style={{
                                          opacity: 0.85,
                                          fontSize: "9px",
                                          fontWeight: 800,
                                          lineHeight: 1,
                                        }}
                                      >
                                        {pillLabel.time}
                                      </span>
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          lineHeight: 1.15,
                                          width: "100%",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                          textAlign: "left",
                                        }}
                                      >
                                        {pillLabel.identity}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div
                  style={{
                    borderRadius: "var(--radius-xl)",
                    border: "1px solid var(--slate-200)",
                    background: "#fff",
                    boxShadow: "var(--shadow-sm)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "0.85rem 1rem",
                      borderBottom: "1px solid var(--slate-200)",
                      background: "var(--slate-50)",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 700,
                        color: "var(--navy-900)",
                        fontSize: "0.92rem",
                      }}
                    >
                      {formatDisplayDate(selectedDateKey)}
                    </p>
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: "0.76rem",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      Selected Date Activity
                    </p>
                  </div>

                  <div style={{ padding: "0.6rem" }}>
                    {(
                      [
                        {
                          key: "siteVisit",
                          title: "Site Visit",
                          items: selectedDateSiteVisits,
                        },
                        {
                          key: "selfView",
                          title: "Self-View Later",
                          items: selectedDateSelfViews,
                        },
                        {
                          key: "live",
                          title: "Live Sessions",
                          items: selectedDateLive,
                        },
                        {
                          key: "scheduled",
                          title: "Session Scheduled",
                          items: selectedDateSessionScheduled,
                        },
                        {
                          key: "requested",
                          title: "Requested Session",
                          items: selectedDateRequested,
                        },
                        {
                          key: "completed",
                          title: "Completed",
                          items: selectedDateCompleted,
                        },
                      ] as const
                    ).map((section) => {
                      const open = datePanelOpen[section.key];
                      return (
                        <div
                          key={section.key}
                          style={{
                            border: "1px solid var(--slate-200)",
                            borderRadius: "10px",
                            overflow: "hidden",
                            marginBottom: "0.55rem",
                          }}
                        >
                          <button
                            onClick={() =>
                              setDatePanelOpen((prev) => ({
                                ...prev,
                                [section.key]: !prev[section.key],
                              }))
                            }
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "0.6rem 0.75rem",
                              border: "none",
                              background: "#f8fafc",
                              color: "var(--navy-900)",
                              fontWeight: 700,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              cursor: "pointer",
                            }}
                          >
                            <span>
                              {section.title} ({section.items.length})
                            </span>
                            <span>{open ? "▲" : "▼"}</span>
                          </button>

                          {open && (
                            <div style={{ padding: "0.5rem 0.6rem" }}>
                              {section.items.length === 0 ? (
                                <p
                                  style={{
                                    margin: 0,
                                    fontSize: "0.78rem",
                                    color: "var(--color-text-hint)",
                                  }}
                                >
                                  No records
                                </p>
                              ) : (
                                section.items.map((entry, idx) => {
                                  const pal = getEntryPalette(entry);
                                  return (
                                    <button
                                      key={`${section.key}-${entry.customer.id}-${idx}`}
                                      onClick={() => setSelectedEntry(entry)}
                                      style={{
                                        width: "100%",
                                        marginBottom: "0.45rem",
                                        textAlign: "left",
                                        border: `1px solid ${pal.border}`,
                                        borderRadius: "10px",
                                        background: pal.bg,
                                        padding: "0.55rem 0.6rem",
                                        cursor: "pointer",
                                        boxShadow: "var(--shadow-xs)",
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          gap: "0.45rem",
                                        }}
                                      >
                                        <p
                                          style={{
                                            margin: 0,
                                            fontSize: "0.78rem",
                                            fontWeight: 700,
                                            color: pal.text,
                                          }}
                                        >
                                          {entry.customer.name || entry.customer.nickname}
                                        </p>
                                        <span
                                          style={{
                                            fontSize: "0.64rem",
                                            fontWeight: 700,
                                            border: `1px solid ${pal.border}`,
                                            color: pal.text,
                                            background:
                                              "rgba(255,255,255,0.58)",
                                            borderRadius: 999,
                                            padding: "1px 7px",
                                            flexShrink: 0,
                                          }}
                                        >
                                          {entry.kind === "site-visit"
                                            ? "Site Visit"
                                            : getEntryStatusLabel(entry)}
                                        </span>
                                      </div>
                                      <p
                                        style={{
                                          margin: "3px 0 0",
                                          fontSize: "0.73rem",
                                          color: "var(--color-text-muted)",
                                        }}
                                      >
                                        {entry.customer.secret_code} ·{" "}
                                        {entry.project_name}
                                      </p>
                                      <p
                                        style={{
                                          margin: "2px 0 0",
                                          fontSize: "0.74rem",
                                          color: pal.text,
                                          fontWeight: 700,
                                        }}
                                      >
                                        {formatDisplayDate(entry.meeting_date)}
                                        {entry.meeting_time
                                          ? ` · ${fmt12(entry.meeting_time)}`
                                          : ""}
                                      </p>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Month meeting list */}
          {monthMeetings.length > 0 && (
            <div style={{ marginTop: "1.5rem" }}>
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--navy-900)",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  marginBottom: "0.75rem",
                  padding: "0 4px",
                }}
              >
                Calendar Activity in {MONTHS[month]}
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill,minmax(min(100%,260px),1fr))",
                  gap: "0.6rem",
                }}
              >
                {monthMeetings.map((entry, idx) => {
                  const pal = getEntryPalette(entry);
                  const d = new Date(entry.meeting_date + "T00:00:00");
                  const isPast =
                    d <
                    new Date(
                      today.getFullYear(),
                      today.getMonth(),
                      today.getDate(),
                    );
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedEntry(entry)}
                      style={{
                        textAlign: "left",
                        padding: "0.85rem 1rem",
                        borderRadius: "var(--radius-lg)",
                        background: "#fff",
                        border: `1.5px solid ${pal.border}`,
                        opacity: isPast ? 0.6 : 1,
                        boxShadow: "var(--shadow-xs)",
                        cursor: "pointer",
                        transition: "transform 0.18s, box-shadow 0.18s",
                      }}
                      onMouseEnter={(e) => {
                        const t = e.currentTarget;
                        t.style.transform = "translateY(-2px)";
                        t.style.boxShadow = "var(--shadow-md)";
                      }}
                      onMouseLeave={(e) => {
                        const t = e.currentTarget;
                        t.style.transform = "none";
                        t.style.boxShadow = "var(--shadow-xs)";
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "0.85rem",
                            color: pal.text,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {entry.customer.name || entry.customer.nickname}
                        </span>
                        <span
                          className="secret-code"
                          style={{
                            flexShrink: 0,
                            borderColor: pal.border,
                            color: pal.text,
                            background: pal.bg,
                          }}
                        >
                          {entry.customer.secret_code}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-text-muted)",
                          margin: 0,
                        }}
                      >
                        📅 {formatDisplayDate(entry.meeting_date)}
                        {entry.meeting_time && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontWeight: 700,
                              color: pal.text,
                            }}
                          >
                            · {fmt12(entry.meeting_time)}
                          </span>
                        )}
                      </p>
                      {entry.project_name && (
                        <p
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--color-text-muted)",
                            margin: "3px 0 0",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          🏠 {entry.project_name}
                        </p>
                      )}
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 6,
                          fontSize: "0.68rem",
                          padding: "1px 8px",
                          borderRadius: 999,
                          background: pal.bg,
                          color: pal.text,
                          border: `1px solid ${pal.border}`,
                        }}
                      >
                        {getEntryStatusLabel(entry)}
                      </span>
                      {isPast && (
                        <span
                          style={{
                            display: "inline-block",
                            marginTop: 5,
                            fontSize: "0.68rem",
                            padding: "1px 8px",
                            borderRadius: 999,
                            background: "var(--slate-100)",
                            color: "var(--slate-400)",
                          }}
                        >
                          Past
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loadingData && !loadingSiteVisits && monthMeetings.length === 0 && (
            <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
              <p style={{ fontSize: "3.5rem", marginBottom: "0.75rem" }}>📭</p>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--color-text-muted)",
                  marginBottom: "0.4rem",
                }}
              >
                No calendar activity in {MONTHS[month]}
              </h3>
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "var(--color-text-hint)",
                  marginBottom: "1.25rem",
                }}
              >
                {restrictToAllowedProjects
                  ? "No meetings or site visit form submissions for your assigned projects this month"
                  : "Click any date on the calendar above to schedule a meeting"}
              </p>
              {!restrictToAllowedProjects && (
                <button
                  onClick={() => setAddDate(todayStr)}
                  className="btn btn-primary"
                >
                  + Add Meeting Today
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* Modals */}
      {selectedEntry &&
        (selectedEntry.kind === "site-visit" ? (
          <SiteVisitDetailsModal
            entry={selectedEntry}
            onClose={() => setSelectedEntry(null)}
          />
        ) : (
          <MeetingModal
            entry={selectedEntry}
            onClose={() => setSelectedEntry(null)}
          />
        ))}
      {showAdd && (
        <AddCustomerModal
          onClose={() => setShowAdd(false)}
          onAdded={(c) => {
            setCustomers((prev) => [normalise(c), ...prev]);
            setShowAdd(false);
          }}
        />
      )}
      {addDate && (
        <AddMeetingModal
          date={addDate}
          onClose={() => setAddDate(null)}
          onAdded={() => {
            setAddDate(null);
            setRefreshTick((t) => t + 1);
          }}
          allowedProjects={allowedProjects}
          restrictToAllowedProjects={restrictToAllowedProjects}
        />
      )}
    </div>
  );
}
