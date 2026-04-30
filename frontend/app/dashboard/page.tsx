"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  ConectrCustomerAnalyticsResponse,
  ConectrCustomerAnalyticsSession,
  Customer,
  CustomerAPI,
  CustomerSessionLink,
  CustomerSessionStatusSnapshot,
  CustomerSessionLinkAPI,
} from "@/lib/api";
import { formatDisplayMeeting } from "@/lib/dateTime";
import {
  getTimedMeetingStatus,
  hasCompletedSessionEvidence,
  hasViewerActivity,
} from "@/lib/meetingStatus";
import Header from "@/components/Header";

type DashboardStatus =
  | "requested"
  | "scheduled"
  | "live"
  | "completed"
  | "sitevisit";

type DashboardRow = {
  key: string;
  customerId: number;
  customerName: string;
  secretCode: string;
  projectName: string;
  sessionToken?: string;
  meetingDate: string;
  meetingTime: string;
  createdAt: string;
  dateKey: string;
  status: "scheduled" | "live" | "completed";
  joinState: string;
  joinees: number;
  eventCount: number;
  startedAt?: string;
  endedAt?: string;
  presenterLink?: string;
  viewerLink?: string;
  selfViewUrl?: string;
  hasSessionLink: boolean;
  siteVisitCount: number;
  analysis: string;
  isSiteVisit?: boolean;
};

type DashboardSiteVisitRow = DashboardRow;

type ConectrAnalyticsResponse = {
  events?: Array<Record<string, unknown>>;
};

const CONECTR_SESSION_BASE_URL = (() => {
  const rawBaseUrl =
    process.env.NEXT_PUBLIC_CONECTR_SESSION_BASE_URL?.trim() || "";
  const sanitizedBaseUrl =
    rawBaseUrl && rawBaseUrl !== "undefined" && rawBaseUrl !== "null"
      ? rawBaseUrl
      : "https://conectr.pro";

  return sanitizedBaseUrl.replace(/\/+$/, "");
})();

function buildConectrSessionAnalyticsUrl(sessionToken: string) {
  return `${CONECTR_SESSION_BASE_URL}/api/session/${encodeURIComponent(sessionToken)}/analytics`;
}

const ROWS_PER_PAGE = 10;

const STATUS_BUTTONS: Array<{
  key: DashboardStatus;
  label: string;
  mobileLabel: string;
  bg: string;
  color: string;
  border: string;
}> = [
  {
    key: "requested",
    label: "Requested Session",
    mobileLabel: "Requested",
    bg: "rgba(249,115,22,0.18)",
    color: "#9a3412",
    border: "rgba(249,115,22,0.4)",
  },
  {
    key: "scheduled",
    label: "Session Scheduled",
    mobileLabel: "Scheduled",
    bg: "rgba(59,130,246,0.18)",
    color: "#1d4ed8",
    border: "rgba(59,130,246,0.4)",
  },
  {
    key: "live",
    label: "Live Session",
    mobileLabel: "Live",
    bg: "rgba(239,68,68,0.18)",
    color: "#b91c1c",
    border: "rgba(239,68,68,0.4)",
  },
  {
    key: "completed",
    label: "Completed Session",
    mobileLabel: "Completed",
    bg: "rgba(107,114,128,0.2)",
    color: "#374151",
    border: "rgba(107,114,128,0.45)",
  },
  {
    key: "sitevisit",
    label: "Site Visit",
    mobileLabel: "Site Visit",
    bg: "rgba(34,197,94,0.18)",
    color: "#166534",
    border: "rgba(34,197,94,0.42)",
  },
];

function normalizeProjectName(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toDateKey(value?: string | null): string {
  if (!value) return "";
  const isoPrefix = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  if (isoPrefix) return isoPrefix[0];

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function extractSummarySnippet(summaryValue: unknown): string {
  if (!summaryValue || typeof summaryValue !== "object") return "";

  const container = summaryValue as Record<string, unknown>;
  const summary =
    container.summary && typeof container.summary === "object"
      ? (container.summary as Record<string, unknown>)
      : container;

  const preferredKeys = [
    "buyer_interest_profile",
    "recommended_next_pitch",
    "suggested_followup_message",
  ];

  for (const key of preferredKeys) {
    const value = summary[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 180);
    }
  }

  const sessionOverview = summary.session_overview;
  if (sessionOverview && typeof sessionOverview === "object") {
    const buyerReadiness = (sessionOverview as Record<string, unknown>)
      .buyer_readiness;
    if (typeof buyerReadiness === "string" && buyerReadiness.trim()) {
      return buyerReadiness.trim().slice(0, 180);
    }
  }

  return "";
}

function normalizeSessionStatus(
  rawStatus?: string,
  startedAt?: string,
  endedAt?: string,
  meetingDate?: string,
  meetingTime?: string,
  hasSession = true,
  joinees = 0,
  eventCount = 0,
) {
  const normalized = String(rawStatus || "scheduled").toLowerCase();
  const completedEvidence = hasCompletedSessionEvidence({
    status: rawStatus,
    startedAt,
    endedAt,
    joinees,
    eventCount,
  });
  const viewerActivity = hasViewerActivity({ joinees, eventCount });
  if (endedAt || normalized.includes("completed") || normalized.includes("ended")) {
    return completedEvidence ? ("completed" as const) : ("scheduled" as const);
  }
  const timedStatus = getTimedMeetingStatus({
    meetingDate,
    meetingTime,
    hasSession,
    hasViewerActivity: viewerActivity,
    completedEvidence,
  });
  if (timedStatus === "completed") return "completed" as const;
  if (timedStatus === "live") return "live" as const;
  if (startedAt) return "live" as const;
  if (normalized.includes("live")) return "live" as const;
  if (normalized.includes("started")) return "live" as const;
  return "scheduled" as const;
}

function inferViewerCount(
  rawJoinees: unknown,
  eventCount: number,
  feedbackCount: number,
) {
  const joinees = Number(rawJoinees || 0);
  if (joinees > 0) return joinees;
  return eventCount > 0 || feedbackCount > 0 ? 1 : 0;
}

function resolveJoinState(
  status: DashboardRow["status"],
  joinees: number,
  eventCount: number,
  snapshotJoinState?: string,
) {
  const hasViewerActivity = joinees > 0 || eventCount > 0;
  const normalizedSnapshot = String(snapshotJoinState || "").trim();

  if (
    normalizedSnapshot &&
    !(
      (normalizedSnapshot.toLowerCase().includes("not attended") ||
        normalizedSnapshot.toLowerCase().includes("viewer waiting")) &&
      hasViewerActivity
    )
  ) {
    return normalizedSnapshot;
  }

  if (status === "completed") {
    return hasViewerActivity ? "Session completed" : "Customer not attended";
  }

  if (status === "live") {
    return hasViewerActivity
      ? "Presenter and viewer joined"
      : "Presenter joined, viewer waiting";
  }

  return "Waiting for presenter";
}

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

function extractPreferredSiteVisitTextFromObject(
  value: unknown,
): string | undefined {
  if (!value) return undefined;

  if (typeof value === "string") {
    const match = value.match(/Preferred Site Visit Date\s*[:\-]\s*([^\n,;]+)/i);
    return match?.[1]?.trim() || undefined;
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
    );
    if (direct) return direct;

    for (const nested of Object.values(value)) {
      const found = extractPreferredSiteVisitTextFromObject(nested);
      if (found) return found;
    }
  }

  return undefined;
}

function parsePreferredSiteVisitDateTime(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const isoMatch = trimmedValue.match(
    /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}))?/,
  );
  if (isoMatch) {
    return { date: isoMatch[1], time: isoMatch[2] || "" };
  }

  const dmyMatch = trimmedValue.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?/i,
  );
  if (!dmyMatch) return null;

  const day = String(Number(dmyMatch[1])).padStart(2, "0");
  const month = String(Number(dmyMatch[2])).padStart(2, "0");
  const year = dmyMatch[3];
  let hour = dmyMatch[4] ? Number(dmyMatch[4]) : NaN;
  const minute = dmyMatch[5] ? String(Number(dmyMatch[5])).padStart(2, "0") : "00";
  const meridiem = dmyMatch[6]?.toUpperCase();

  if (!Number.isNaN(hour) && meridiem) {
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
  }

  return {
    date: `${year}-${month}-${day}`,
    time: Number.isNaN(hour) ? "" : `${String(hour).padStart(2, "0")}:${minute}`,
  };
}

function extractFeedbackAnswers(eventRecord: Record<string, unknown>) {
  const dataRecord = isRecord(eventRecord.data) ? eventRecord.data : undefined;
  const payloadRecord = [
    isRecord(eventRecord.payload) ? eventRecord.payload : undefined,
    dataRecord && isRecord(dataRecord.payload) ? dataRecord.payload : undefined,
    isRecord(eventRecord.answers) ? eventRecord.answers : undefined,
    dataRecord && isRecord(dataRecord.answers) ? dataRecord.answers : undefined,
    isRecord(eventRecord.form_data) ? eventRecord.form_data : undefined,
    dataRecord && isRecord(dataRecord.form_data) ? dataRecord.form_data : undefined,
    dataRecord,
  ].find((value) => isRecord(value));

  if (!payloadRecord || !isRecord(payloadRecord)) return {};

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

function extractSummaryRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.summary)) return value.summary;
  return value;
}

function formatDateTimeValue(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN");
}

function extractEventDetail(event: Record<string, unknown>): string {
  const detailParts = [event.label, event.action_type, event.option]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);

  if (detailParts.length > 0) return detailParts.join(" • ");

  if (isRecord(event.data)) {
    const compactPairs = Object.entries(event.data)
      .filter(
        ([, value]) => value !== null && value !== undefined && value !== "",
      )
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${String(value)}`);

    if (compactPairs.length > 0) return compactPairs.join(" • ");
  }

  return "-";
}

function extractFeedbackSummaryRows(
  feedbackRows: Array<Record<string, unknown>> | undefined,
) {
  return (feedbackRows || []).map((row, index) => ({
    id: `${row.id ?? row.created_at ?? index}`,
    formName: String(row.form_name ?? row.form_title ?? row.form ?? "-") || "-",
    status:
      String(row.status ?? row.submission_status ?? "submitted") || "submitted",
    submittedAt: formatDateTimeValue(
      typeof row.created_at === "string"
        ? row.created_at
        : typeof row.submitted_at === "string"
          ? row.submitted_at
          : null,
    ),
    responseCount: isRecord(row.data) ? Object.keys(row.data).length : 0,
  }));
}

const tryParseStructuredString = (raw: string): unknown | null => {
  const trimmed = raw.trim();
  const looksStructured =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));

  if (!looksStructured) return null;

  const normalizedQuotes = trimmed
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");

  const singleToDoubleQuoteCandidate = normalizedQuotes
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
    .replace(/,\s*([}\]])/g, "$1");

  const candidates = [trimmed, normalizedQuotes, singleToDoubleQuoteCandidate];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  return null;
};

function prettifyKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function renderSummaryValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return "-";

  if (typeof value === "string") {
    const parsed = tryParseStructuredString(value);
    if (parsed !== null) return renderSummaryValue(parsed);
    return (
      <div
        style={{
          overflowWrap: "anywhere",
          wordBreak: "normal",
          whiteSpace: "pre-wrap",
        }}
      >
        {value}
      </div>
    );
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "-";

    const allRecords = value.every((item) => isRecord(item));
    if (allRecords) {
      const headerSet = new Set<string>();
      value.forEach((item) => {
        Object.keys(item).forEach((key) => headerSet.add(key));
      });
      const headers = Array.from(headerSet);

      return (
        <div style={{ overflowX: "auto", marginTop: "0.3rem" }}>
          <table
            style={{
              width: "100%",
              minWidth: 520,
              borderCollapse: "collapse",
              fontSize: "0.78rem",
              border: "1px solid #d1d5db",
            }}
          >
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                {headers.map((header, idx) => (
                  <th
                    key={header}
                    style={{
                      padding: "0.35rem 0.5rem",
                      textAlign: "left",
                      fontWeight: 600,
                      color: "#1f2937",
                      borderRight:
                        idx < headers.length - 1 ? "1px solid #e5e7eb" : "none",
                    }}
                  >
                    {prettifyKey(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {value.map((item, rowIdx) => (
                <tr
                  key={rowIdx}
                  style={{
                    background: rowIdx % 2 === 0 ? "#f9fafb" : "#fff",
                    borderBottom:
                      rowIdx < value.length - 1 ? "1px solid #e5e7eb" : "none",
                  }}
                >
                  {headers.map((header, colIdx) => (
                    <td
                      key={`${rowIdx}-${header}`}
                      style={{
                        padding: "0.35rem 0.5rem",
                        color: "#4b5563",
                        borderRight:
                          colIdx < headers.length - 1
                            ? "1px solid #e5e7eb"
                            : "none",
                        verticalAlign: "top",
                      }}
                    >
                      {renderSummaryValue(item[header])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div style={{ display: "grid", gap: "0.35rem", marginTop: "0.3rem" }}>
        {value.map((item, idx) => (
          <div
            key={idx}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: "0.35rem 0.5rem",
              background: idx % 2 === 0 ? "#f9fafb" : "#fff",
            }}
          >
            {renderSummaryValue(item)}
          </div>
        ))}
      </div>
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "-";

    return (
      <div style={{ overflowX: "auto", marginTop: "0.3rem" }}>
        <table
          style={{
            width: "100%",
            minWidth: 520,
            borderCollapse: "collapse",
            fontSize: "0.78rem",
            border: "1px solid #d1d5db",
          }}
        >
          <tbody>
            {entries.map(([key, val], idx) => (
              <tr
                key={key}
                style={{
                  background: idx % 2 === 0 ? "#f9fafb" : "#fff",
                  borderBottom:
                    idx < entries.length - 1 ? "1px solid #e5e7eb" : "none",
                  verticalAlign: "top",
                }}
              >
                <td
                  style={{
                    padding: "0.35rem 0.5rem",
                    fontWeight: 600,
                    color: "#1f2937",
                    width: "42%",
                    minWidth: 170,
                    borderRight: "1px solid #e5e7eb",
                  }}
                >
                  {prettifyKey(key)}
                </td>
                <td style={{ padding: "0.35rem 0.5rem", color: "#4b5563" }}>
                  {renderSummaryValue(val)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return String(value);
}

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const today = new Date().toISOString().split("T")[0];

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sessionLinks, setSessionLinks] = useState<CustomerSessionLink[]>([]);
  const [siteVisitRows, setSiteVisitRows] = useState<DashboardSiteVisitRow[]>(
    [],
  );
  const [sessionSnapshots, setSessionSnapshots] = useState<
    Record<string, CustomerSessionStatusSnapshot>
  >({});
  const [analyticsByCustomer, setAnalyticsByCustomer] = useState<
    Record<number, ConectrCustomerAnalyticsResponse>
  >({});
  const [loading, setLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [siteVisitLoading, setSiteVisitLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedStatus, setSelectedStatus] =
    useState<DashboardStatus>("requested");
  const [columnSearch, setColumnSearch] = useState({
    project: "",
    customer: "",
    secretCode: "",
    meeting: "",
    status: "",
  });
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedProjectKeys, setExpandedProjectKeys] = useState<string[]>([]);
  const [expandedTableSearchByProject, setExpandedTableSearchByProject] =
    useState<Record<string, { customer: string; secretCode: string }>>({});
  const [analyticsModalRow, setAnalyticsModalRow] =
    useState<DashboardRow | null>(null);
  const [analyticsModalSession, setAnalyticsModalSession] =
    useState<ConectrCustomerAnalyticsSession | null>(null);
  const [analyticsModalLoading, setAnalyticsModalLoading] = useState(false);
  const [analyticsModalTab, setAnalyticsModalTab] = useState<
    "summary" | "events" | "feedback"
  >("summary");

  const scopedRoles = useMemo(
    () => new Set<string>(),
    [],
  );
  const restrictProjectsForRole = Boolean(
    user?.role && scopedRoles.has(user.role),
  );

  const allowedProjectSet = useMemo(() => {
    const assigned = Array.isArray(user?.assigned_projects)
      ? user.assigned_projects
      : [];

    return new Set(
      assigned.map((project) => normalizeProjectName(project)).filter(Boolean),
    );
  }, [user?.assigned_projects]);

  const isAllowedProject = useCallback(
    (projectName?: string | null) => {
      if (!restrictProjectsForRole) return true;
      const normalized = normalizeProjectName(projectName);
      return normalized !== "" && allowedProjectSet.has(normalized);
    },
    [allowedProjectSet, restrictProjectsForRole],
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [authLoading, router, user]);

  const loadSiteVisitRows = useCallback(
    async (
      links: CustomerSessionLink[],
      customerMap: Map<number, Customer>,
    ) => {
      setSiteVisitLoading(true);
      const candidates = links.filter((link) =>
        isAllowedProject(
          link.project_name || link.presentation_title || link.presentation_id,
        ),
      );

      if (candidates.length === 0) {
        setSiteVisitRows([]);
        setSiteVisitLoading(false);
        return;
      }

      try {
        const settled = await Promise.allSettled(
          candidates.map(async (link) => {
          if (!link.session_token) return [] as DashboardSiteVisitRow[];

          const response = await fetch(
            buildConectrSessionAnalyticsUrl(link.session_token),
            {
              method: "GET",
              headers: { Accept: "application/json" },
            },
          );

          if (!response.ok) return [] as DashboardSiteVisitRow[];

          const analytics = (await response.json()) as ConectrAnalyticsResponse;
          const events = Array.isArray(analytics.events) ? analytics.events : [];
          const customer = customerMap.get(link.customer_id);

          if (!customer) return [] as DashboardSiteVisitRow[];

          return events.flatMap((eventRecord, index) => {
            if (!isRecord(eventRecord)) return [];

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
            const preferredSiteVisitValue =
              firstString(
                getRecordValue(answers, [
                  "Preferred Site Visit Date",
                  "preferred_site_visit_date",
                  "preferredSiteVisitDate",
                  "Site Visit Date",
                  "site_visit_date",
                ]),
              ) ||
              extractPreferredSiteVisitTextFromObject(eventRecord) ||
              extractPreferredSiteVisitTextFromObject(dataRecord);
            const normalizedEventType = (eventType || "").toLowerCase();
            const normalizedFormName = formName.toLowerCase();
            const isLikelySiteVisit =
              normalizedEventType === "feedback_submitted" ||
              normalizedEventType.includes("site") ||
              normalizedEventType.includes("form") ||
              normalizedFormName.includes("site visit") ||
              Boolean(preferredSiteVisitValue);

            if (!isLikelySiteVisit || !preferredSiteVisitValue) return [];

            const preferredSiteVisit = parsePreferredSiteVisitDateTime(
              preferredSiteVisitValue,
            );
            if (!preferredSiteVisit) return [];

            const projectName =
              link.project_name || link.presentation_title || link.presentation_id || "N/A";
            const submittedAt = firstString(
              eventRecord.created_at,
              eventRecord.submitted_at,
              eventRecord.timestamp,
              dataRecord?.created_at,
              dataRecord?.submitted_at,
              dataRecord?.timestamp,
            );

            return [
              {
                key: `site-${link.id}-${preferredSiteVisit.date}-${preferredSiteVisit.time}-${submittedAt || index}`,
                customerId: customer.id,
                customerName: customer.nickname || "N/A",
                secretCode: customer.secret_code || "N/A",
                projectName,
                sessionToken: link.session_token,
                meetingDate: preferredSiteVisit.date,
                meetingTime: preferredSiteVisit.time,
                createdAt: submittedAt || link.created_at || "",
                dateKey: preferredSiteVisit.date,
                status: "completed" as const,
                joinState: "Site visit form submitted",
                joinees: 1,
                eventCount: events.length,
                startedAt: undefined,
                endedAt: submittedAt,
                presenterLink: link.presenter_link,
                viewerLink: link.viewer_link,
                selfViewUrl: link.self_view_url,
                hasSessionLink: true,
                siteVisitCount: 1,
                analysis: String(preferredSiteVisitValue),
                isSiteVisit: true,
              },
            ];
          });
          }),
        );

        const seen = new Set<string>();
        const nextRows = settled
          .flatMap((result) =>
            result.status === "fulfilled" ? result.value : [],
          )
          .filter((row) => {
            const key = `${row.sessionToken}:${row.meetingDate}:${row.meetingTime}:${row.createdAt}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

        setSiteVisitRows(nextRows);
      } finally {
        setSiteVisitLoading(false);
      }
    },
    [isAllowedProject],
  );

  const loadSessionSnapshots = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setInsightsLoading(true);
    }

    try {
      const snapshotRes = await CustomerSessionLinkAPI.statusSnapshots();
      setSessionSnapshots(snapshotRes.data || {});
    } catch {
      setSessionSnapshots({});
    } finally {
      if (showLoading) {
        setInsightsLoading(false);
      }
    }
  }, []);

  const loadDashboardData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError("");

    try {
      const customerRes = await CustomerAPI.list(user.company_id);
      const normalizedCustomers = (customerRes.data || []).map((customer) => ({
        ...customer,
        projects: (customer.projects || []).filter((project) =>
          isAllowedProject(project.project_name),
        ),
      }));

      const visibleCustomers = restrictProjectsForRole
        ? normalizedCustomers.filter((customer) =>
            (customer.projects || []).some((project) =>
              isAllowedProject(project.project_name),
            ),
          )
        : normalizedCustomers;

      setCustomers(visibleCustomers);

      const customerIdSet = new Set(
        visibleCustomers.map((customer) => customer.id),
      );
      const linkRes = await CustomerSessionLinkAPI.list();
      const filteredLinks = (linkRes.data || []).filter(
        (link) =>
          customerIdSet.has(link.customer_id) &&
          isAllowedProject(
            link.project_name ||
              link.presentation_title ||
              link.presentation_id,
          ),
      );
      setSessionLinks(filteredLinks);
      setLoading(false);

      const customerMap = new Map(
        visibleCustomers.map((customer) => [customer.id, customer]),
      );
      void loadSiteVisitRows(filteredLinks, customerMap);

      void loadSessionSnapshots(true);

      if (visibleCustomers.length === 0) {
        setAnalyticsByCustomer({});
      }
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message || "Failed to load dashboard data.",
      );
      setLoading(false);
      setInsightsLoading(false);
      setSiteVisitLoading(false);
    }
  }, [
    isAllowedProject,
    loadSessionSnapshots,
    loadSiteVisitRows,
    restrictProjectsForRole,
    user,
  ]);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [loadDashboardData, user]);

  useEffect(() => {
    if (!user) return;

    const intervalId = window.setInterval(() => {
      void loadSessionSnapshots(false);
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [loadSessionSnapshots, user]);

  const customerById = useMemo(() => {
    const map = new Map<number, Customer>();
    customers.forEach((customer) => map.set(customer.id, customer));
    return map;
  }, [customers]);

  const analyticsSessionByToken = useMemo(() => {
    const map = new Map<string, ConectrCustomerAnalyticsSession>();

    Object.values(analyticsByCustomer).forEach((analytics) => {
      (analytics.sessions || []).forEach((session) => {
        if (session.session_token) {
          map.set(session.session_token, session);
        }
      });
    });

    return map;
  }, [analyticsByCustomer]);

  const rows = useMemo(() => {
    const projectMeetingIndex = new Map<
      string,
      { meetingDate: string; meetingTime: string }
    >();

    customers.forEach((customer) => {
      (customer.projects || []).forEach((project) => {
        projectMeetingIndex.set(
          `${customer.id}::${normalizeProjectName(project.project_name)}`,
          {
            meetingDate: project.meeting_date || "",
            meetingTime: project.meeting_time || "",
          },
        );
      });
    });

    const linkedProjectKeys = new Set<string>();

    const withLinks = sessionLinks.reduce<DashboardRow[]>((acc, link) => {
      const customer = customerById.get(link.customer_id);
      if (!customer) return acc;

      const projectName =
        link.project_name ||
        link.presentation_title ||
        link.presentation_id ||
        "N/A";
      const projectKey = `${customer.id}::${normalizeProjectName(projectName)}`;
      linkedProjectKeys.add(projectKey);

      const meeting = projectMeetingIndex.get(projectKey);
      const analyticsSession = analyticsSessionByToken.get(link.session_token);
      const snapshot = sessionSnapshots[link.session_token];
      const feedbackCount = Array.isArray(
        analyticsSession?.feedback_submissions,
      )
        ? analyticsSession.feedback_submissions.length
        : 0;
      const eventCount = Number(
        snapshot?.event_count ||
          analyticsSession?.event_count ||
          analyticsSession?.events?.length ||
          0,
      );
      const joinees = inferViewerCount(
        snapshot?.joinees ?? analyticsSession?.joinees,
        eventCount,
        0,
      );
      const status = normalizeSessionStatus(
        snapshot?.status || analyticsSession?.status,
        snapshot?.started_at || analyticsSession?.started_at,
        snapshot?.ended_at || analyticsSession?.ended_at,
        meeting?.meetingDate || link.meeting_date,
        meeting?.meetingTime || link.meeting_time,
        true,
        joinees,
        eventCount,
      );

      acc.push({
        key: `${link.id}`,
        customerId: customer.id,
        customerName: customer.nickname || "N/A",
        secretCode: customer.secret_code || "N/A",
        projectName,
        sessionToken: link.session_token,
        meetingDate: meeting?.meetingDate || link.meeting_date || "",
        meetingTime: meeting?.meetingTime || link.meeting_time || "",
        createdAt: link.created_at || "",
        dateKey:
          meeting?.meetingDate || link.meeting_date || toDateKey(link.created_at),
        status,
        joinState: resolveJoinState(
          status,
          joinees,
          eventCount,
          snapshot?.join_state,
        ),
        joinees,
        eventCount,
        startedAt: snapshot?.started_at || analyticsSession?.started_at,
        endedAt: snapshot?.ended_at || analyticsSession?.ended_at,
        presenterLink: snapshot?.presenter_link || link.presenter_link,
        viewerLink: snapshot?.viewer_link || link.viewer_link,
        selfViewUrl: snapshot?.self_view_url || link.self_view_url,
        hasSessionLink: true,
        siteVisitCount: feedbackCount,
        analysis: extractSummarySnippet(analyticsSession?.summary),
      });

      return acc;
    }, []);

    const scheduledOnly: DashboardRow[] = customers.flatMap((customer) =>
      (customer.projects || [])
        .filter((project) => {
          const key = `${customer.id}::${normalizeProjectName(project.project_name)}`;
          return !linkedProjectKeys.has(key);
        })
        .map((project, index) => ({
          key: `sched-${customer.id}-${index}-${normalizeProjectName(project.project_name)}`,
          customerId: customer.id,
          customerName: customer.nickname || "N/A",
          secretCode: customer.secret_code || "N/A",
          projectName: project.project_name || "N/A",
          sessionToken: undefined,
          meetingDate: project.meeting_date || "",
          meetingTime: project.meeting_time || "",
          createdAt: "",
          dateKey: project.meeting_date || "",
          status: "scheduled" as const,
          joinState: "No session link yet",
          joinees: 0,
          eventCount: 0,
          startedAt: undefined,
          endedAt: undefined,
          presenterLink: undefined,
          viewerLink: undefined,
          selfViewUrl: undefined,
          hasSessionLink: false,
          siteVisitCount: 0,
          analysis: "",
        })),
    );

    return [...withLinks, ...scheduledOnly, ...siteVisitRows].sort((left, right) => {
      const leftTime = `${left.dateKey}T${left.meetingTime || "00:00"}`;
      const rightTime = `${right.dateKey}T${right.meetingTime || "00:00"}`;
      return rightTime.localeCompare(leftTime);
    });
  }, [
    analyticsSessionByToken,
    customerById,
    customers,
    sessionLinks,
    sessionSnapshots,
    siteVisitRows,
  ]);

  const dateFilteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!row.dateKey) return true;
      if (fromDate && row.dateKey < fromDate) return false;
      if (toDate && row.dateKey > toDate) return false;
      return true;
    });
  }, [fromDate, rows, toDate]);

  const statusCounts = useMemo(() => {
    const requested = dateFilteredRows.filter(
      (row) => !row.hasSessionLink,
    ).length;
    const scheduled = dateFilteredRows.filter(
      (row) => row.status === "scheduled" && row.hasSessionLink,
    ).length;
    // Live sessions should remain visible regardless of selected date range.
    const live = rows.filter((row) => row.status === "live").length;
    const completed = rows.filter(
      (row) => row.status === "completed" && !row.isSiteVisit,
    ).length;
    const sitevisit = dateFilteredRows.filter(
      (row) => row.siteVisitCount > 0,
    ).length;

    return { requested, scheduled, live, completed, sitevisit };
  }, [dateFilteredRows, rows]);

  const statusRows = useMemo(() => {
    if (selectedStatus === "requested") {
      return dateFilteredRows.filter((row) => !row.hasSessionLink);
    }
    if (selectedStatus === "live") {
      return rows.filter((row) => row.status === "live");
    }
    if (selectedStatus === "completed") {
      return rows.filter((row) => row.status === "completed" && !row.isSiteVisit);
    }
    if (selectedStatus === "sitevisit") {
      return dateFilteredRows.filter((row) => row.isSiteVisit);
    }
    if (selectedStatus === "scheduled") {
      return dateFilteredRows.filter(
        (row) => row.status === "scheduled" && row.hasSessionLink,
      );
    }
    return dateFilteredRows.filter((row) => row.status === selectedStatus);
  }, [dateFilteredRows, rows, selectedStatus]);

  const isStatusCountLoading = useCallback(
    (status: DashboardStatus) => {
      if (loading) return true;
      if (status === "live" || status === "completed") {
        return insightsLoading;
      }
      if (status === "sitevisit") {
        return siteVisitLoading;
      }
      return false;
    },
    [insightsLoading, loading, siteVisitLoading],
  );

  const searchedStatusRows = useMemo(() => {
    const projectQuery = columnSearch.project.trim().toLowerCase();
    const customerQuery = columnSearch.customer.trim().toLowerCase();
    const codeQuery = columnSearch.secretCode.trim().toLowerCase();
    const meetingQuery = columnSearch.meeting.trim().toLowerCase();
    const statusQuery = columnSearch.status.trim().toLowerCase();

    return statusRows.filter((row) => {
      const meetingText = row.meetingDate
        ? formatDisplayMeeting(row.meetingDate, row.meetingTime)
        : row.createdAt
          ? new Date(row.createdAt).toLocaleString("en-IN")
          : "-";

      if (
        projectQuery &&
        !String(row.projectName).toLowerCase().includes(projectQuery)
      ) {
        return false;
      }

      if (
        customerQuery &&
        !String(row.customerName).toLowerCase().includes(customerQuery)
      ) {
        return false;
      }

      if (
        codeQuery &&
        !String(row.secretCode).toLowerCase().includes(codeQuery)
      ) {
        return false;
      }

      if (meetingQuery && !meetingText.toLowerCase().includes(meetingQuery)) {
        return false;
      }

      if (
        statusQuery &&
        !`${row.status} ${row.joinState}`
          .toLowerCase()
          .includes(statusQuery)
      ) {
        return false;
      }

      return true;
    });
  }, [columnSearch, statusRows]);

  const groupedSearchedRows = useMemo(() => {
    const map = new Map<
      string,
      { projectName: string; rows: DashboardRow[] }
    >();

    searchedStatusRows.forEach((row) => {
      const key = normalizeProjectName(row.projectName) || row.projectName;
      if (!map.has(key)) {
        map.set(key, { projectName: row.projectName, rows: [] });
      }
      map.get(key)?.rows.push(row);
    });

    return Array.from(map.values());
  }, [searchedStatusRows]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(groupedSearchedRows.length / ROWS_PER_PAGE)),
    [groupedSearchedRows.length],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatus, fromDate, toDate, columnSearch]);

  useEffect(() => {
    setExpandedProjectKeys([]);
    setExpandedTableSearchByProject({});
  }, [selectedStatus, fromDate, toDate, columnSearch, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const groupedPagedRows = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return groupedSearchedRows.slice(start, start + ROWS_PER_PAGE);
  }, [currentPage, groupedSearchedRows]);

  const serialByProjectKey = useMemo(() => {
    const serialMap = new Map<string, number>();
    groupedSearchedRows.forEach((group, index) => {
      const projectKey =
        normalizeProjectName(group.projectName) || group.projectName;
      serialMap.set(projectKey, index + 1);
    });

    return serialMap;
  }, [groupedSearchedRows]);

  const openAnalyticsModal = useCallback(
    async (row: DashboardRow) => {
      if (!row.sessionToken) return;
      setAnalyticsModalRow(row);
      const cachedSession = analyticsSessionByToken.get(row.sessionToken);
      setAnalyticsModalSession(cachedSession || null);
      setAnalyticsModalTab("summary");

      if (cachedSession) return;

      setAnalyticsModalLoading(true);
      try {
        const res = await CustomerSessionLinkAPI.customerAnalytics(
          row.customerId,
        );
        const analytics = res.data || {};
        setAnalyticsByCustomer((prev) => ({
          ...prev,
          [row.customerId]: analytics,
        }));
        const session =
          (analytics.sessions || []).find(
            (item) => item.session_token === row.sessionToken,
          ) || null;
        setAnalyticsModalSession(session);
      } catch (e: unknown) {
        setError(
          (e as { message?: string }).message ||
            "Failed to load session analytics.",
        );
      } finally {
        setAnalyticsModalLoading(false);
      }
    },
    [analyticsSessionByToken],
  );

  const modalSummary = useMemo(() => {
    return extractSummaryRecord(analyticsModalSession?.summary);
  }, [analyticsModalSession]);

  const modalEvents = useMemo(
    () =>
      (analyticsModalSession?.events || []).map((event, index) => {
        const record = isRecord(event) ? event : {};
        return {
          id: `${record.created_at ?? record.type ?? index}`,
          index: index + 1,
          type: String(record.type ?? "-"),
          slide: String(record.slide ?? "-"),
          detail: extractEventDetail(record),
          duration:
            record.duration_seconds !== undefined
              ? String(record.duration_seconds)
              : "-",
          occurredAt: formatDateTimeValue(
            typeof record.created_at === "string" ? record.created_at : null,
          ),
        };
      }),
    [analyticsModalSession],
  );

  const modalFeedback = useMemo(
    () =>
      extractFeedbackSummaryRows(analyticsModalSession?.feedback_submissions),
    [analyticsModalSession],
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-main flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-600 mb-4"></div>
          <p style={{ color: "var(--navy-900)" }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;
  return (
    <div className="min-h-screen bg-main">
      <Header variant="app" />

      <main className="pt-24 px-2 sm:px-6 md:px-8 pb-8">
        <div className="max-w-7xl mx-auto">
          {error && (
            <div
              className="mb-6 p-4 rounded-lg border-l-4"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                borderColor: "var(--orange-600)",
              }}
            >
              <p style={{ color: "var(--navy-900)" }}>{error}</p>
            </div>
          )}

          <section className="glass-card p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
              <div>
                <h3
                  className="text-lg sm:text-xl font-bold"
                  style={{ color: "var(--navy-900)" }}
                >
                  Session Dashboard
                </h3>
                {insightsLoading && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Updating live and completed status...
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:flex items-end gap-2 sm:gap-3 w-full sm:w-auto">
                <div className="min-w-0">
                  <label className="label">From</label>
                  <input
                    type="date"
                    className="input-field"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    style={{
                      width: "100%",
                      minWidth: 0,
                      fontSize: "0.85rem",
                      paddingRight: "1rem",
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <label className="label">To</label>
                  <input
                    type="date"
                    className="input-field"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    disabled={selectedStatus === "live"}
                    style={{
                      width: "100%",
                      minWidth: 0,
                      fontSize: "0.85rem",
                      paddingRight: "1rem",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="mb-5 overflow-x-auto">
              <div className="flex sm:grid sm:grid-cols-2 xl:grid-cols-5 gap-2 sm:gap-3 min-w-max sm:min-w-0">
                {STATUS_BUTTONS.map((button) => {
                  const count = statusCounts[button.key] ?? 0;
                  const active = selectedStatus === button.key;
                  const countLoading = isStatusCountLoading(button.key);

                  return (
                    <button
                      key={button.key}
                      onClick={() => setSelectedStatus(button.key)}
                      className="text-left rounded-xl px-2.5 py-2.5 sm:px-4 sm:py-3 border transition-all shrink-0 basis-[calc((100vw-2.5rem)/3)] max-w-[160px] sm:max-w-none sm:basis-auto"
                      style={{
                        borderColor: button.border,
                        background: button.bg,
                        boxShadow: active
                          ? `0 0 0 1px ${button.color}44 inset`
                          : "0 1px 2px rgba(15,23,42,0.06)",
                      }}
                    >
                      <p
                        className="text-[11px] sm:text-xs font-semibold leading-tight"
                        style={{ color: button.color }}
                      >
                        <span className="sm:hidden">{button.mobileLabel}</span>
                        <span className="hidden sm:inline">{button.label}</span>
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        {button.key === "live" && count > 0 && !countLoading && (
                          <span
                            className="live-dot inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: button.color }}
                          />
                        )}
                        {countLoading ? (
                          <span
                            className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"
                            style={{ color: button.color }}
                            aria-label={`Loading ${button.label} count`}
                          />
                        ) : (
                          <p
                            className="text-base sm:text-lg font-extrabold"
                            style={{ color: button.color }}
                          >
                            {count}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #cbd5e1" }}>
                      <th className="px-3 py-2 text-left">Sr No</th>
                      <th className="px-3 py-2 text-left">Project</th>
                      <th className="px-3 py-2 text-left">
                        Customer Nicknames
                      </th>
                    </tr>
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <th className="px-3 py-2"></th>
                      <th className="px-3 py-2">
                        <input
                          className="input-field"
                          style={{ minWidth: 130, height: 34 }}
                          value={columnSearch.project}
                          onChange={(e) =>
                            setColumnSearch((prev) => ({
                              ...prev,
                              project: e.target.value,
                            }))
                          }
                          placeholder="Search project"
                        />
                      </th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedPagedRows.map((group) => {
                      const projectKey =
                        normalizeProjectName(group.projectName) ||
                        group.projectName;
                      const isExpanded =
                        expandedProjectKeys.includes(projectKey);
                      const tableSearch = expandedTableSearchByProject[
                        projectKey
                      ] || {
                        customer: "",
                        secretCode: "",
                      };
                      const expandedRows = group.rows.filter((row) => {
                        const customerQuery = tableSearch.customer
                          .trim()
                          .toLowerCase();
                        const codeQuery = tableSearch.secretCode
                          .trim()
                          .toLowerCase();

                        if (
                          customerQuery &&
                          !String(row.customerName)
                            .toLowerCase()
                            .includes(customerQuery)
                        ) {
                          return false;
                        }

                        if (
                          codeQuery &&
                          !String(row.secretCode)
                            .toLowerCase()
                            .includes(codeQuery)
                        ) {
                          return false;
                        }

                        return true;
                      });
                      const nestedTableColSpan =
                        selectedStatus === "sitevisit" ||
                        selectedStatus === "completed" ||
                        selectedStatus === "live"
                          ? 6
                          : 5;

                      return (
                        <React.Fragment key={projectKey}>
                          <tr style={{ borderBottom: "1px solid #cbd5e1" }}>
                            <td
                              className="px-3 py-2"
                              style={{ color: "var(--navy-700)", width: 72 }}
                            >
                              {serialByProjectKey.get(projectKey) || "-"}
                            </td>
                            <td className="px-3 py-2" style={{ minWidth: 180 }}>
                              <button
                                className="btn btn-ghost"
                                onClick={() =>
                                  setExpandedProjectKeys((prev) =>
                                    prev.includes(projectKey)
                                      ? prev.filter((key) => key !== projectKey)
                                      : [...prev, projectKey],
                                  )
                                }
                                style={{
                                  padding: "0.25rem 0.65rem",
                                  fontWeight: 700,
                                  border: "1px solid #cbd5e1",
                                  borderRadius: 999,
                                  color: "var(--navy-800)",
                                  background: "#fff",
                                }}
                              >
                                {isExpanded ? "▼" : "▶"} {group.projectName}
                              </button>
                            </td>
                            <td
                              className="px-3 py-2"
                              style={{ color: "var(--navy-700)" }}
                            >
                              {group.rows.length} customers
                            </td>
                          </tr>

                          {isExpanded &&
                            (() => {
                              return (
                                <tr
                                  style={{
                                    borderBottom: "1px solid #e2e8f0",
                                    background: "#f8fafc",
                                  }}
                                >
                                  <td className="px-3 py-2"></td>
                                  <td className="px-3 py-2" colSpan={2}>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr
                                            style={{
                                              borderBottom: "1px solid #dbe4ee",
                                            }}
                                          >
                                            <th className="px-2 py-2 text-left">
                                              Customer Nickname
                                            </th>
                                            <th className="px-2 py-2 text-left">
                                              Secret Code
                                            </th>
                                            <th className="px-2 py-2 text-left">
                                              Meeting
                                            </th>
                                            <th className="px-2 py-2 text-left">
                                              Status
                                            </th>
                                            <th className="px-2 py-2 text-left">
                                              Join State
                                            </th>
                                            {selectedStatus === "sitevisit" && (
                                              <th className="px-2 py-2 text-left">
                                                Site Visit
                                              </th>
                                            )}
                                            {(selectedStatus === "completed" ||
                                              selectedStatus === "live") && (
                                              <th className="px-2 py-2 text-left">
                                                Action
                                              </th>
                                            )}
                                          </tr>
                                          <tr
                                            style={{
                                              borderBottom: "1px solid #e5e7eb",
                                            }}
                                          >
                                            <th className="px-2 py-2">
                                              <input
                                                className="input-field"
                                                style={{ height: 32 }}
                                                value={tableSearch.customer}
                                                onChange={(e) =>
                                                  setExpandedTableSearchByProject(
                                                    (prev) => ({
                                                      ...prev,
                                                      [projectKey]: {
                                                        customer:
                                                          e.target.value,
                                                        secretCode:
                                                          prev[projectKey]
                                                            ?.secretCode || "",
                                                      },
                                                    }),
                                                  )
                                                }
                                                placeholder="Search customer nickname"
                                              />
                                            </th>
                                            <th className="px-2 py-2">
                                              <input
                                                className="input-field"
                                                style={{ height: 32 }}
                                                value={tableSearch.secretCode}
                                                onChange={(e) =>
                                                  setExpandedTableSearchByProject(
                                                    (prev) => ({
                                                      ...prev,
                                                      [projectKey]: {
                                                        customer:
                                                          prev[projectKey]
                                                            ?.customer || "",
                                                        secretCode:
                                                          e.target.value,
                                                      },
                                                    }),
                                                  )
                                                }
                                                placeholder="Search code"
                                              />
                                            </th>
                                            <th className="px-2 py-2"></th>
                                            <th className="px-2 py-2"></th>
                                            <th className="px-2 py-2"></th>
                                            {selectedStatus === "sitevisit" && (
                                              <th className="px-2 py-2"></th>
                                            )}
                                            {(selectedStatus === "completed" ||
                                              selectedStatus === "live") && (
                                              <th className="px-2 py-2"></th>
                                            )}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {expandedRows.map((row) => {
                                            const rowStatusColor =
                                              row.isSiteVisit
                                                ? {
                                                    bg: "rgba(34,197,94,0.16)",
                                                    color: "#166534",
                                                  }
                                                : row.status === "live"
                                                  ? {
                                                      bg: "rgba(239,68,68,0.16)",
                                                      color: "#b91c1c",
                                                    }
                                                  : row.status === "completed"
                                                    ? {
                                                        bg: "rgba(107,114,128,0.18)",
                                                        color: "#374151",
                                                      }
                                                    : {
                                                        bg: "rgba(59,130,246,0.16)",
                                                        color: "#1d4ed8",
                                                      };

                                            return (
                                              <tr
                                                key={row.key}
                                                style={{
                                                  borderBottom:
                                                    "1px solid #e2e8f0",
                                                }}
                                              >
                                                <td
                                                  className="px-2 py-2"
                                                  style={{
                                                    color: "var(--navy-700)",
                                                  }}
                                                >
                                                  {row.customerName}
                                                </td>
                                                <td
                                                  className="px-2 py-2"
                                                  style={{
                                                    color: "var(--navy-700)",
                                                  }}
                                                >
                                                  {row.secretCode}
                                                </td>
                                                <td
                                                  className="px-2 py-2"
                                                  style={{
                                                    color: "var(--navy-700)",
                                                    whiteSpace: "nowrap",
                                                  }}
                                                >
                                                  {row.meetingDate
                                                    ? formatDisplayMeeting(
                                                        row.meetingDate,
                                                        row.meetingTime,
                                                      )
                                                    : row.createdAt
                                                      ? new Date(
                                                          row.createdAt,
                                                        ).toLocaleString(
                                                          "en-IN",
                                                        )
                                                      : "-"}
                                                </td>
                                                <td className="px-2 py-2">
                                                  <span
                                                    className="inline-block px-2 py-1 rounded-full text-xs font-semibold"
                                                    style={{
                                                      background:
                                                        rowStatusColor.bg,
                                                      color:
                                                        rowStatusColor.color,
                                                    }}
                                                  >
                                                    {row.isSiteVisit
                                                      ? "Site Visit"
                                                      : row.status
                                                          .charAt(0)
                                                          .toUpperCase() +
                                                        row.status.slice(1)}
                                                  </span>
                                                </td>
                                                <td
                                                  className="px-2 py-2"
                                                  style={{
                                                    color:
                                                      (row.status === "live" ||
                                                        row.status ===
                                                          "completed") &&
                                                      row.joinees === 0
                                                        ? "#b91c1c"
                                                        : "var(--navy-700)",
                                                    minWidth: 190,
                                                  }}
                                                >
                                                  <div
                                                    style={{
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: "0.4rem",
                                                      flexWrap: "wrap",
                                                    }}
                                                  >
                                                    {row.status === "live" && (
                                                      <span
                                                        className="live-dot inline-block h-2 w-2 rounded-full"
                                                        style={{
                                                          background:
                                                            row.joinees > 0
                                                              ? "#16a34a"
                                                              : "#ef4444",
                                                        }}
                                                      />
                                                    )}
                                                    <span
                                                      style={{
                                                        fontWeight: 700,
                                                        fontSize: "0.78rem",
                                                      }}
                                                    >
                                                      {row.joinState}
                                                    </span>
                                                  </div>
                                                    {row.hasSessionLink && (
                                                      <p
                                                      className="text-xs mt-1"
                                                      style={{
                                                        color:
                                                          "var(--color-text-muted)",
                                                      }}
                                                      >
                                                        Viewers: {row.joinees} |
                                                        Events: {row.eventCount}
                                                      </p>
                                                    )}
                                                </td>
                                                {selectedStatus ===
                                                  "sitevisit" && (
                                                  <td
                                                    className="px-2 py-2"
                                                    style={{
                                                      color: "#166534",
                                                      fontWeight: 600,
                                                    }}
                                                  >
                                                    {row.meetingDate
                                                      ? formatDisplayMeeting(
                                                          row.meetingDate,
                                                          row.meetingTime,
                                                        )
                                                      : "-"}
                                                  </td>
                                                )}
                                                {selectedStatus === "live" && (
                                                  <td className="px-2 py-2">
                                                    <button
                                                      className="btn btn-primary"
                                                      disabled={
                                                        !row.presenterLink
                                                      }
                                                      onClick={() =>
                                                        row.presenterLink &&
                                                        window.open(
                                                          row.presenterLink,
                                                          "_blank",
                                                          "noopener,noreferrer",
                                                        )
                                                      }
                                                    >
                                                      Join
                                                    </button>
                                                  </td>
                                                )}
                                                {selectedStatus ===
                                                  "completed" && (
                                                  <td className="px-2 py-2">
                                                    <button
                                                      className="btn btn-ghost"
                                                      disabled={
                                                        !row.sessionToken
                                                      }
                                                      onClick={() =>
                                                        openAnalyticsModal(row)
                                                      }
                                                    >
                                                      View Analytics
                                                    </button>
                                                  </td>
                                                )}
                                              </tr>
                                            );
                                          })}
                                          {expandedRows.length === 0 && (
                                            <tr>
                                              <td
                                                className="px-2 py-3"
                                                colSpan={nestedTableColSpan}
                                                style={{
                                                  color: "var(--navy-600)",
                                                }}
                                              >
                                                No customer nickname rows found
                                                for search.
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })()}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!loading && searchedStatusRows.length === 0 && (
                <p
                  className="py-6 text-sm"
                  style={{ color: "var(--navy-700)" }}
                >
                  No records found for selected status/date/search.
                </p>
              )}

              {!loading && searchedStatusRows.length > 0 && (
                <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm" style={{ color: "var(--navy-700)" }}>
                    Showing {(currentPage - 1) * ROWS_PER_PAGE + 1} to{" "}
                    {Math.min(
                      currentPage * ROWS_PER_PAGE,
                      groupedSearchedRows.length,
                    )}{" "}
                    of {groupedSearchedRows.length}
                  </p>

                  <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1">
                    <button
                      className="btn btn-ghost"
                      disabled={currentPage === 1}
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                    >
                      Prev
                    </button>

                    {Array.from(
                      { length: totalPages },
                      (_, index) => index + 1,
                    ).map((pageNo) => (
                      <button
                        key={pageNo}
                        className="btn btn-ghost"
                        onClick={() => setCurrentPage(pageNo)}
                        style={{
                          minWidth: 40,
                          fontWeight: currentPage === pageNo ? 700 : 500,
                          border:
                            currentPage === pageNo
                              ? "1px solid var(--navy-700)"
                              : undefined,
                        }}
                      >
                        {pageNo}
                      </button>
                    ))}

                    <button
                      className="btn btn-ghost"
                      disabled={currentPage === totalPages}
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {analyticsModalRow && (
        <div className="modal-overlay">
          <div
            className="modal-box"
            style={{
              maxWidth: "68rem",
              width: "min(68rem, calc(100% - 1rem))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="modal-title">Customer Session Detail</p>
                <p className="modal-subtitle">
                  {analyticsModalSession?.presentation_title ||
                    analyticsModalSession?.presentation_id ||
                    analyticsModalRow.sessionToken}
                </p>
              </div>
              <button
                className="modal-close"
                onClick={() => {
                  setAnalyticsModalRow(null);
                  setAnalyticsModalSession(null);
                  setAnalyticsModalLoading(false);
                  setAnalyticsModalTab("summary");
                }}
              >
                ×
              </button>
            </div>

            <div className="modal-body" style={{ padding: "1rem 1.2rem" }}>
              {analyticsModalLoading && (
                <div
                  className="mb-3 p-3 rounded-lg text-sm font-semibold"
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#1d4ed8",
                  }}
                >
                  Loading analytics for this session...
                </div>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                }}
              >
                {[
                  {
                    label: "Status",
                    value: String(analyticsModalSession?.status || "-"),
                  },
                  {
                    label: "Presenter",
                    value: String(analyticsModalSession?.presenter_name || "-"),
                  },
                  {
                    label: "Viewer",
                    value: String(
                      analyticsModalSession?.viewer_name ||
                        analyticsModalRow.customerName ||
                        "-",
                    ),
                  },
                  {
                    label: "Events",
                    value: String(
                      analyticsModalRow.eventCount ||
                        analyticsModalSession?.event_count ||
                        analyticsModalSession?.events?.length ||
                        0,
                    ),
                  },
                  {
                    label: "Feedback",
                    value: String(modalFeedback.length),
                  },
                  {
                    label: "Started",
                    value: formatDateTimeValue(
                      analyticsModalRow.startedAt ||
                      analyticsModalSession?.started_at ||
                        analyticsModalSession?.created_at,
                    ),
                  },
                  {
                    label: "Ended",
                    value: formatDateTimeValue(
                      analyticsModalRow.endedAt ||
                        analyticsModalSession?.ended_at,
                    ),
                  },
                  {
                    label: "Join State",
                    value: analyticsModalRow.joinState,
                  },
                  {
                    label: "Viewers",
                    value: String(analyticsModalRow.joinees),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      background: "var(--slate-50)",
                      border: "1px solid var(--slate-200)",
                      borderRadius: "var(--radius-md)",
                      padding: "0.5rem 0.65rem",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "0.65rem",
                        color: "var(--color-text-muted)",
                        marginBottom: 2,
                      }}
                    >
                      {item.label}
                    </p>
                    <p
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        color: "var(--navy-900)",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                  borderBottom: "2px solid var(--slate-200)",
                }}
              >
                {(["summary", "events", "feedback"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setAnalyticsModalTab(tab)}
                    style={{
                      padding: "0.45rem 1rem",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      border: "none",
                      borderBottom:
                        analyticsModalTab === tab
                          ? "2.5px solid var(--navy-700)"
                          : "2.5px solid transparent",
                      background: "transparent",
                      color:
                        analyticsModalTab === tab
                          ? "var(--navy-700)"
                          : "var(--color-text-muted)",
                      cursor: "pointer",
                      marginBottom: "-2px",
                    }}
                  >
                    {tab === "summary"
                      ? "Summary"
                      : tab === "events"
                        ? `Events (${modalEvents.length})`
                        : `Feedback (${modalFeedback.length})`}
                  </button>
                ))}
              </div>

              {analyticsModalTab === "summary" &&
                (modalSummary ? (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        minWidth: 620,
                        borderCollapse: "collapse",
                        fontSize: "0.82rem",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#eff6ff" }}>
                          <th
                            style={{
                              padding: "0.55rem 0.75rem",
                              textAlign: "left",
                              fontWeight: 700,
                              color: "var(--navy-700)",
                              borderBottom: "2px solid #bfdbfe",
                              width: "24%",
                            }}
                          >
                            Field
                          </th>
                          <th
                            style={{
                              padding: "0.55rem 0.75rem",
                              textAlign: "left",
                              fontWeight: 700,
                              color: "var(--navy-700)",
                              borderBottom: "2px solid #bfdbfe",
                            }}
                          >
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(modalSummary).map(
                          ([key, value], index) => (
                            <tr
                              key={key}
                              style={{
                                background:
                                  index % 2 === 0 ? "#fff" : "#f8fafc",
                                borderBottom: "1px solid var(--slate-100)",
                                verticalAlign: "top",
                              }}
                            >
                              <td
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  fontWeight: 600,
                                  color: "var(--navy-800)",
                                  verticalAlign: "top",
                                }}
                              >
                                {prettifyKey(key)}
                              </td>
                              <td
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  color: "var(--color-text-secondary)",
                                  lineHeight: 1.5,
                                }}
                              >
                                {renderSummaryValue(value)}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="alert alert-info">
                    No customer-wise summary found for this session yet.
                  </div>
                ))}

              {analyticsModalTab === "events" &&
                (modalEvents.length > 0 ? (
                  <div
                    style={{
                      overflowX: "auto",
                      maxHeight: "26rem",
                      overflowY: "auto",
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.8rem",
                      }}
                    >
                      <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                        <tr style={{ background: "#f0fdf4" }}>
                          <th
                            style={{
                              padding: "0.5rem 0.65rem",
                              textAlign: "left",
                            }}
                          >
                            #
                          </th>
                          <th
                            style={{
                              padding: "0.5rem 0.65rem",
                              textAlign: "left",
                            }}
                          >
                            Type
                          </th>
                          <th
                            style={{
                              padding: "0.5rem 0.65rem",
                              textAlign: "left",
                            }}
                          >
                            Slide
                          </th>
                          <th
                            style={{
                              padding: "0.5rem 0.65rem",
                              textAlign: "left",
                            }}
                          >
                            Action
                          </th>
                          <th
                            style={{
                              padding: "0.5rem 0.65rem",
                              textAlign: "left",
                            }}
                          >
                            Duration (s)
                          </th>
                          <th
                            style={{
                              padding: "0.5rem 0.65rem",
                              textAlign: "left",
                            }}
                          >
                            At
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalEvents.map((row, index) => (
                          <tr
                            key={row.id}
                            style={{
                              background: index % 2 === 0 ? "#fff" : "#f8fafc",
                              borderBottom: "1px solid var(--slate-100)",
                            }}
                          >
                            <td style={{ padding: "0.42rem 0.65rem" }}>
                              {row.index}
                            </td>
                            <td
                              style={{
                                padding: "0.42rem 0.65rem",
                                fontWeight: 600,
                                color: "var(--navy-800)",
                              }}
                            >
                              {row.type}
                            </td>
                            <td
                              style={{
                                padding: "0.42rem 0.65rem",
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              {row.slide}
                            </td>
                            <td
                              style={{
                                padding: "0.42rem 0.65rem",
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              {row.detail}
                            </td>
                            <td
                              style={{
                                padding: "0.42rem 0.65rem",
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              {row.duration}
                            </td>
                            <td
                              style={{
                                padding: "0.42rem 0.65rem",
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              {row.occurredAt}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="alert alert-info">
                    No meaningful event data recorded for this session yet.
                  </div>
                ))}

              {analyticsModalTab === "feedback" &&
                (modalFeedback.length > 0 ? (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.8rem",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#fff7ed" }}>
                          <th
                            style={{
                              padding: "0.5rem 0.65rem",
                              textAlign: "left",
                            }}
                          >
                            Form
                          </th>
                          <th
                            style={{
                              padding: "0.5rem 0.65rem",
                              textAlign: "left",
                            }}
                          >
                            Status
                          </th>
                          <th
                            style={{
                              padding: "0.5rem 0.65rem",
                              textAlign: "left",
                            }}
                          >
                            Fields
                          </th>
                          <th
                            style={{
                              padding: "0.5rem 0.65rem",
                              textAlign: "left",
                            }}
                          >
                            Submitted
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalFeedback.map((row, index) => (
                          <tr
                            key={row.id}
                            style={{
                              background: index % 2 === 0 ? "#fff" : "#f8fafc",
                              borderBottom: "1px solid var(--slate-100)",
                            }}
                          >
                            <td
                              style={{
                                padding: "0.42rem 0.65rem",
                                fontWeight: 600,
                                color: "var(--navy-800)",
                              }}
                            >
                              {row.formName}
                            </td>
                            <td
                              style={{
                                padding: "0.42rem 0.65rem",
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              {row.status}
                            </td>
                            <td
                              style={{
                                padding: "0.42rem 0.65rem",
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              {row.responseCount}
                            </td>
                            <td
                              style={{
                                padding: "0.42rem 0.65rem",
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              {row.submittedAt}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="alert alert-info">
                    No feedback submissions found for this session.
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .live-dot {
          animation: livePulse 1s infinite;
        }
        @keyframes livePulse {
          0% { opacity: 0.25; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0.25; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
