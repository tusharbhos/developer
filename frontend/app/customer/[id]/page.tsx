"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EditCustomerModal from "@/components/EditCustomerModal";
import { useAuth } from "@/context/AuthContext";
import {
  ConectrCustomerAnalyticsEvent,
  ConectrCustomerAnalyticsResponse,
  ConectrCustomerAnalyticsSession,
  Customer,
  CustomerAPI,
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

function safeProjects(projects: unknown): ProjectMeeting[] {
  return Array.isArray(projects) ? (projects as ProjectMeeting[]) : [];
}

function normalizeProjectName(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function fmt12(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
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

function normalizePhoneForWhatsApp(rawPhone: string): string {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0"))
    return `91${digits.slice(1)}`;
  return digits;
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

const CONECTR_BASE_URL =
  process.env.NEXT_PUBLIC_CONECTR_SESSION_BASE_URL?.replace(/\/+$/, "");

type ConectrAnalyticsResponse = {
  session?: {
    status?: string;
    presentation_title?: string;
    presenter_name?: string;
    viewer_name?: string;
    created_at?: string;
    started_at?: string;
    ended_at?: string;
    joinees?: number;
  };
  events?: Array<Record<string, unknown>>;
  summary?: {
    summary?: Record<string, unknown>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function prettifyAnalyticsKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCompactAnalyticsValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => formatCompactAnalyticsValue(item))
      .filter((item) => item && item !== "-");
    return parts.length > 0 ? parts.join(", ") : "-";
  }
  if (isRecord(value)) {
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const countryCode =
      typeof value.country_code === "string" ? value.country_code.trim() : "";
    const phoneLocal =
      typeof value.phone_local === "string" ? value.phone_local.trim() : "";
    const phoneE164 =
      typeof value.phone_e164 === "string" ? value.phone_e164.trim() : "";
    const phone = phoneLocal
      ? `${countryCode ? `${countryCode} ` : ""}${phoneLocal}`
      : phoneE164;

    if (name || phone) {
      return [name ? `Name: ${name}` : "", phone ? `Phone: ${phone}` : ""]
        .filter(Boolean)
        .join(", ");
    }

    const countValue =
      value.count ?? value.total ?? value.joinees ?? value.viewer_count;
    if (
      typeof countValue === "string" ||
      typeof countValue === "number" ||
      typeof countValue === "boolean"
    ) {
      return String(countValue);
    }

    const parts = Object.entries(value)
      .filter(([, item]) => item !== null && item !== undefined && item !== "")
      .map(
        ([key, item]) =>
          `${prettifyAnalyticsKey(key)}: ${formatCompactAnalyticsValue(item)}`,
      );
    return parts.length > 0 ? parts.join(", ") : "-";
  }
  return String(value);
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

function extractEventDetail(event: ConectrCustomerAnalyticsEvent): string {
  const detailParts = [event.label, event.action_type, event.option]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);

  if (detailParts.length > 0) {
    return detailParts.join(" • ");
  }

  if (isRecord(event.data)) {
    const compactPairs = Object.entries(event.data)
      .filter(([, val]) => val !== null && val !== undefined && val !== "")
      .slice(0, 3)
      .map(([key, val]) => `${key}: ${String(val)}`);

    if (compactPairs.length > 0) {
      return compactPairs.join(" • ");
    }
  }

  return "-";
}

function getEventDetailRows(event: Record<string, unknown>) {
  const directDetail = [event.label, event.action_type, event.option]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);

  if (directDetail.length > 0) {
    return [{ key: "Action", value: directDetail.join(" | ") }];
  }

  const data = isRecord(event.data) ? event.data : null;
  if (!data) return [];

  const nestedRecord = [
    data.answers,
    data.form_data,
    data.payload,
    data.response,
  ].find(isRecord);
  const detailRecord = nestedRecord || data;

  return Object.entries(detailRecord)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      key,
      value: formatCompactAnalyticsValue(value),
    }));
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

  const relaxedKeyCommaFix = normalizedQuotes.replace(
    /("[^"\\]*(?:\\.[^"\\]*)*"\s*:\s*(?:"[^"\\]*(?:\\.[^"\\]*)*"|\[[\s\S]*?\]|\{[\s\S]*?\}|-?\d+(?:\.\d+)?|true|false|null))\s*("[^"]+"\s*:)/g,
    "$1,\n$2",
  );

  const candidates = [
    trimmed,
    normalizedQuotes,
    singleToDoubleQuoteCandidate,
    relaxedKeyCommaFix,
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  return null;
};

function extractEmbeddedStructuredPart(raw: string): {
  before: string;
  structured: string;
  after: string;
} | null {
  const objectStart = raw.indexOf("{");
  const arrayStart = raw.indexOf("[");

  let start = -1;
  let end = -1;

  if (objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart)) {
    start = objectStart;
    end = raw.lastIndexOf("}");
  } else if (arrayStart >= 0) {
    start = arrayStart;
    end = raw.lastIndexOf("]");
  }

  if (start < 0 || end <= start) return null;

  return {
    before: raw.slice(0, start).trim(),
    structured: raw.slice(start, end + 1).trim(),
    after: raw.slice(end + 1).trim(),
  };
}

function parseLooseScalar(raw: string): unknown {
  const trimmed = raw.trim().replace(/,$/, "");
  if (!trimmed) return "";

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  const quotedMatch = trimmed.match(/^"([\s\S]*)"$/);
  if (quotedMatch) return quotedMatch[1];

  return trimmed.replace(/^['"`]+|['"`]+$/g, "").trim();
}

function parseLooseObjectString(raw: string): Record<string, unknown> | null {
  const normalized = raw
    .trim()
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  if (!normalized.startsWith("{") || !normalized.endsWith("}")) return null;

  const body = normalized.slice(1, -1);
  const keyRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*/g;
  const keyMatches: Array<{
    key: string;
    valueStart: number;
    keyStart: number;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = keyRegex.exec(body)) !== null) {
    keyMatches.push({
      key: match[1],
      keyStart: match.index,
      valueStart: keyRegex.lastIndex,
    });
  }

  if (keyMatches.length === 0) return null;

  const result: Record<string, unknown> = {};

  keyMatches.forEach((entry, index) => {
    const nextKeyStart =
      index < keyMatches.length - 1
        ? keyMatches[index + 1].keyStart
        : body.length;
    const rawValue = body
      .slice(entry.valueStart, nextKeyStart)
      .trim()
      .replace(/,$/, "")
      .trim();

    if (!rawValue) {
      result[entry.key] = "";
      return;
    }

    const parsedStructured = tryParseStructuredString(rawValue);
    if (parsedStructured !== null) {
      result[entry.key] = parsedStructured;
      return;
    }

    const maybeArray = rawValue.startsWith("[") && rawValue.endsWith("]");
    if (maybeArray) {
      const inner = rawValue.slice(1, -1).trim();
      if (!inner) {
        result[entry.key] = [];
        return;
      }
      const items = inner
        .split(/\n|,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
        .map((part) => parseLooseScalar(part))
        .filter((part) => String(part).trim() !== "");
      result[entry.key] = items;
      return;
    }

    result[entry.key] = parseLooseScalar(rawValue);
  });

  return Object.keys(result).length > 0 ? result : null;
}

const renderSummaryValue = (
  value: unknown,
  prettifyFn: (key: string) => string,
  isMobileView = false,
): React.ReactNode => {
  if (value === null || value === undefined) return "-";

  if (typeof value === "string") {
    const parsed = tryParseStructuredString(value);
    if (parsed !== null) {
      return renderSummaryValue(parsed, prettifyFn, isMobileView);
    }

    const looseParsed = parseLooseObjectString(value);
    if (looseParsed !== null) {
      return renderSummaryValue(looseParsed, prettifyFn, isMobileView);
    }

    const embedded = extractEmbeddedStructuredPart(value);
    if (embedded) {
      const parsedEmbedded = tryParseStructuredString(embedded.structured);
      if (parsedEmbedded !== null) {
        return (
          <div style={{ display: "grid", gap: "0.4rem" }}>
            {embedded.before && (
              <div
                style={{
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.4,
                }}
              >
                {embedded.before}
              </div>
            )}
            {renderSummaryValue(parsedEmbedded, prettifyFn, isMobileView)}
            {embedded.after && (
              <div
                style={{
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.4,
                }}
              >
                {embedded.after}
              </div>
            )}
          </div>
        );
      }

      const looseParsedEmbedded = parseLooseObjectString(embedded.structured);
      if (looseParsedEmbedded !== null) {
        return (
          <div style={{ display: "grid", gap: "0.4rem" }}>
            {embedded.before && (
              <div
                style={{
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.4,
                }}
              >
                {embedded.before}
              </div>
            )}
            {renderSummaryValue(looseParsedEmbedded, prettifyFn, isMobileView)}
            {embedded.after && (
              <div
                style={{
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.4,
                }}
              >
                {embedded.after}
              </div>
            )}
          </div>
        );
      }
    }

    return (
      <div
        style={{
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          lineHeight: 1.4,
        }}
      >
        {value}
      </div>
    );
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "-";

    const allRecords = value.every((item) => isRecord(item));

    if (allRecords) {
      if (isMobileView) {
        return (
          <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.3rem" }}>
            {value.map((item, rowIdx) => (
              <div
                key={rowIdx}
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  background: rowIdx % 2 === 0 ? "#f9fafb" : "#fff",
                  padding: "0.45rem 0.55rem",
                }}
              >
                {Object.entries(item).map(([key, val], idx) => (
                  <div
                    key={`${rowIdx}-${key}`}
                    style={{
                      paddingBottom:
                        idx < Object.keys(item).length - 1 ? "0.35rem" : 0,
                      marginBottom:
                        idx < Object.keys(item).length - 1 ? "0.35rem" : 0,
                      borderBottom:
                        idx < Object.keys(item).length - 1
                          ? "1px solid #e5e7eb"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: "#1f2937",
                        fontSize: "0.76rem",
                      }}
                    >
                      {prettifyFn(key)}
                    </div>
                    <div style={{ color: "#4b5563", fontSize: "0.78rem" }}>
                      {renderSummaryValue(val, prettifyFn, isMobileView)}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      }

      const headerSet = new Set<string>();
      value.forEach((item) => {
        Object.keys(item).forEach((key) => headerSet.add(key));
      });
      const headers = Array.from(headerSet);

      return (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.78rem",
            marginTop: "0.3rem",
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
                  {prettifyFn(header)}
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
                  verticalAlign: "top",
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
                    }}
                  >
                    {renderSummaryValue(item[header], prettifyFn, isMobileView)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (isMobileView) {
      return (
        <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.3rem" }}>
          {value.map((item, idx) => (
            <div
              key={idx}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                background: idx % 2 === 0 ? "#f9fafb" : "#fff",
                padding: "0.4rem 0.55rem",
                color: "#4b5563",
              }}
            >
              {renderSummaryValue(item, prettifyFn, isMobileView)}
            </div>
          ))}
        </div>
      );
    }

    return (
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.78rem",
          marginTop: "0.3rem",
          border: "1px solid #d1d5db",
        }}
      >
        <tbody>
          {value.map((item, idx) => (
            <tr
              key={idx}
              style={{
                background: idx % 2 === 0 ? "#f9fafb" : "#fff",
                borderBottom:
                  idx < value.length - 1 ? "1px solid #e5e7eb" : "none",
              }}
            >
              <td style={{ padding: "0.35rem 0.5rem", color: "#4b5563" }}>
                {renderSummaryValue(item, prettifyFn, isMobileView)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "-";

    if (isMobileView) {
      return (
        <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.45rem" }}>
          {entries.map(([key, val], idx) => (
            <div
              key={key}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                background: idx % 2 === 0 ? "#f9fafb" : "#fff",
                padding: "0.45rem 0.55rem",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  color: "#1f2937",
                  fontSize: "0.78rem",
                  marginBottom: "0.25rem",
                }}
              >
                {prettifyFn(key)}
              </div>
              <div style={{ color: "#6b7280", fontSize: "0.78rem" }}>
                {renderSummaryValue(val, prettifyFn, isMobileView)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div style={{ marginTop: "0.5rem", fontSize: "0.78rem" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            overflow: "hidden",
            tableLayout: "fixed",
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
                    width: "180px",
                    minWidth: "180px",
                    wordBreak: "normal",
                    overflowWrap: "anywhere",
                    whiteSpace: "normal",
                    borderRight: "1px solid #e5e7eb",
                  }}
                >
                  {prettifyFn(key)}
                </td>
                <td
                  style={{
                    padding: "0.35rem 0.5rem",
                    color: "#6b7280",
                  }}
                >
                  {renderSummaryValue(val, prettifyFn, isMobileView)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return String(value);
};

export default function CustomerDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const customerId = Number(params?.id);

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

  const filterLinkedProjects = useCallback(
    (projects: LinkedProjectCard[] | undefined) =>
      (projects || []).filter((project) => isAllowedProject(project.title)),
    [isAllowedProject],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [projectLinks, setProjectLinks] = useState<CustomerProjectLink[]>([]);
  const [sessionLinks, setSessionLinks] = useState<CustomerSessionLink[]>([]);
  const [meetings, setMeetings] = useState<ProjectMeeting[]>([]);

  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);

  const [addMeeting, setAddMeeting] = useState({
    project_name: "",
    meeting_date: "",
    meeting_time: "",
  });

  const [editingMeeting, setEditingMeeting] = useState<ProjectMeeting | null>(
    null,
  );

  const [schedulePopup, setSchedulePopup] = useState<{
    project: LinkedProjectCard;
    idx: number;
    meetingDate: string;
    meetingTime: string;
  } | null>(null);
  const [analyticsLoadingToken, setAnalyticsLoadingToken] = useState("");
  const [summaryLoadingToken, setSummaryLoadingToken] = useState("");
  const [endingLoadingToken, setEndingLoadingToken] = useState("");
  const [analyticsModal, setAnalyticsModal] = useState<{
    sessionLink: CustomerSessionLink;
    analytics: ConectrAnalyticsResponse;
  } | null>(null);
  const [customerAnalyticsLoading, setCustomerAnalyticsLoading] =
    useState(false);
  const [customerAnalytics, setCustomerAnalytics] =
    useState<ConectrCustomerAnalyticsResponse | null>(null);
  const [masterSummaryLoading, setMasterSummaryLoading] = useState(false);
  const [customerMasterSummary, setCustomerMasterSummary] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [customerAnalyticsSessionModal, setCustomerAnalyticsSessionModal] =
    useState<ConectrCustomerAnalyticsSession | null>(null);
  const [customerAnalyticsTab, setCustomerAnalyticsTab] = useState<
    "summary" | "events" | "feedback"
  >("summary");
  const [isMobileView, setIsMobileView] = useState(false);
  const [statusClock, setStatusClock] = useState(() => Date.now());

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobileView(media.matches);
    update();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setStatusClock(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const showSuccess = useCallback((msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 2800);
  }, []);

  const fetchAllData = useCallback(async () => {
    if (!Number.isFinite(customerId) || customerId <= 0) {
      setError("Invalid customer id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const customerRes = await CustomerAPI.get(customerId);

      const normalizedCustomer = {
        ...customerRes.data,
        projects: safeProjects(customerRes.data.projects).filter((project) =>
          isAllowedProject(project.project_name),
        ),
      };

      setCustomer(normalizedCustomer);
      setMeetings(safeProjects(normalizedCustomer.projects));
      setRecipientPhone((normalizedCustomer.phone || "").replace(/\D/g, ""));
      setRecipientEmail((normalizedCustomer.email || "").trim());
      setLoading(false);

      const [linksRes, sessionLinksRes] = await Promise.all([
        CustomerProjectLinkAPI.byCustomer(customerId),
        CustomerSessionLinkAPI.byCustomer(customerId),
      ]);

      const filteredProjectLinks = (linksRes.data || []).map((link) => ({
        ...link,
        selected_projects: filterLinkedProjects(link.selected_projects),
        liked_projects: filterLinkedProjects(link.liked_projects),
      }));

      setProjectLinks(filteredProjectLinks);
      setSessionLinks(sessionLinksRes.data || []);
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message ||
          "Failed to load customer details.",
      );
      setLoading(false);
    }
  }, [customerId, filterLinkedProjects, isAllowedProject]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const loadCustomerAnalytics = useCallback(async () => {
    if (!Number.isFinite(customerId) || customerId <= 0) return;

    setCustomerAnalyticsLoading(true);
    setError("");

    try {
      const res = await CustomerSessionLinkAPI.customerAnalytics(customerId);
      setCustomerAnalytics(res.data || null);
    } catch (e: unknown) {
      setCustomerAnalytics(null);
      setError(
        (e as { message?: string }).message ||
          "Failed to load customer analytics.",
      );
    } finally {
      setCustomerAnalyticsLoading(false);
    }
  }, [customerId]);

  const handleGenerateCustomerMasterSummary = useCallback(async () => {
    if (!Number.isFinite(customerId) || customerId <= 0) return;

    setMasterSummaryLoading(true);
    setError("");

    try {
      const res =
        await CustomerSessionLinkAPI.generateCustomerMasterSummary(customerId);
      setCustomerMasterSummary(res.data || null);
      showSuccess("Customer master summary generated.");
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message ||
          "Failed to generate customer master summary.",
      );
    } finally {
      setMasterSummaryLoading(false);
    }
  }, [customerId, showSuccess]);

  useEffect(() => {
    if (sessionLinks.length === 0) {
      setCustomerAnalytics(null);
      setCustomerMasterSummary(null);
    }
  }, [sessionLinks.length]);

  const latestLink = projectLinks[0] ?? null;
  const latestSessionLink = sessionLinks[0] ?? null;
  const publicLink = latestLink
    ? CustomerProjectLinkAPI.publicUrl(latestLink.public_token)
    : "";
  const getMeetingStatusLabel = (meeting?: ProjectMeeting | null) => {
    if (!meeting) return "";
    const status = getTimedMeetingStatus({
      meetingDate: meeting.meeting_date,
      meetingTime: meeting.meeting_time,
      hasSession:
        Boolean(meeting.has_session_link) ||
        (meeting.session_link_count || 0) > 0,
      hasViewerActivity: hasViewerActivity({
        joinees: meeting.latest_session_joinees,
        eventCount: meeting.latest_session_event_count,
      }),
      completedEvidence: hasCompletedSessionEvidence({
        status: meeting.latest_session_status,
        startedAt: meeting.latest_session_started_at,
        endedAt: meeting.latest_session_ended_at,
        joinees: meeting.latest_session_joinees,
        eventCount: meeting.latest_session_event_count,
      }),
    });
    return timedMeetingStatusLabel(status);
  };
  const getSessionLinkTimingLabel = (
    row: CustomerSessionLink,
    meeting?: ProjectMeeting | null,
  ) => {
    const meetingDate = meeting?.meeting_date || row.meeting_date;
    const meetingTime = meeting?.meeting_time || row.meeting_time;
    if (!meetingDate) return "";

    const status = getTimedMeetingStatus({
      meetingDate,
      meetingTime,
      hasSession: true,
      hasViewerActivity: hasViewerActivity({
        joinees: row.joinees,
        eventCount: row.event_count,
      }),
      completedEvidence: hasCompletedSessionEvidence({
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        joinees: row.joinees,
        eventCount: row.event_count,
      }),
    });
    return timedMeetingStatusLabel(status);
  };

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const upcomingMeetings = useMemo(
    () => {
      void statusClock;
      return meetings.filter((m) => {
        const status = getTimedMeetingStatus({
          meetingDate: m.meeting_date,
          meetingTime: m.meeting_time,
          hasSession: Boolean(m.has_session_link) || (m.session_link_count || 0) > 0,
          hasViewerActivity: hasViewerActivity({
            joinees: m.latest_session_joinees,
            eventCount: m.latest_session_event_count,
          }),
          completedEvidence: hasCompletedSessionEvidence({
            status: m.latest_session_status,
            startedAt: m.latest_session_started_at,
            endedAt: m.latest_session_ended_at,
            joinees: m.latest_session_joinees,
            eventCount: m.latest_session_event_count,
          }),
        });
        return status === "scheduled" || status === "live";
      });
    },
    [meetings, statusClock],
  );
  const doneMeetings = useMemo(
    () => {
      void statusClock;
      return meetings.filter((m) => {
        const status = getTimedMeetingStatus({
          meetingDate: m.meeting_date,
          meetingTime: m.meeting_time,
          hasSession: Boolean(m.has_session_link) || (m.session_link_count || 0) > 0,
          hasViewerActivity: hasViewerActivity({
            joinees: m.latest_session_joinees,
            eventCount: m.latest_session_event_count,
          }),
          completedEvidence: hasCompletedSessionEvidence({
            status: m.latest_session_status,
            startedAt: m.latest_session_started_at,
            endedAt: m.latest_session_ended_at,
            joinees: m.latest_session_joinees,
            eventCount: m.latest_session_event_count,
          }),
        });
        return status === "completed";
      });
    },
    [meetings, statusClock],
  );
  const orderedMeetings = useMemo(
    () =>
      [...meetings].sort((left, right) =>
        compareMeetingLikeItems(left, right, today),
      ),
    [meetings, today],
  );
  const orderedSelectedProjects = useMemo(
    () =>
      [...(latestLink?.selected_projects || [])].sort((left, right) =>
        compareMeetingLikeItems(left, right, today),
      ),
    [latestLink?.selected_projects, today],
  );
  const orderedLikedProjects = useMemo(
    () =>
      [...(latestLink?.liked_projects || [])].sort((left, right) =>
        compareMeetingLikeItems(left, right, today),
      ),
    [latestLink?.liked_projects, today],
  );
  const customerAnalyticsSessions = useMemo(
    () =>
      [...(customerAnalytics?.sessions || [])].sort((left, right) => {
        const leftValue =
          left.ended_at || left.started_at || left.created_at || "";
        const rightValue =
          right.ended_at || right.started_at || right.created_at || "";
        return rightValue.localeCompare(leftValue);
      }),
    [customerAnalytics?.sessions],
  );
  const customerAnalyticsSnapshot = useMemo(() => {
    const customerData = customerAnalytics?.customer || {};
    const totalSessions = Number(
      customerData.total_sessions ?? customerAnalyticsSessions.length ?? 0,
    );
    const totalEvents = Number(
      customerData.total_events ??
        customerAnalyticsSessions.reduce(
          (sum, session) =>
            sum + Number(session.event_count || session.events?.length || 0),
          0,
        ),
    );

    return {
      viewerId:
        String(customerData.viewer_id || customer?.secret_code || "") || "-",
      viewerName:
        String(
          customerData.viewer_name ||
            customer?.name ||
            customer?.nickname ||
            "",
        ) || "-",
      totalSessions,
      totalEvents,
      presentationsViewed: Array.isArray(customerData.presentations_viewed)
        ? customerData.presentations_viewed.filter(Boolean)
        : [],
      developersInteracted: Array.isArray(customerData.developers_interacted)
        ? customerData.developers_interacted.filter(Boolean)
        : [],
    };
  }, [customer, customerAnalytics?.customer, customerAnalyticsSessions]);
  const selectedCustomerAnalyticsSummary = useMemo(
    () => extractSummaryRecord(customerAnalyticsSessionModal?.summary),
    [customerAnalyticsSessionModal],
  );
  const selectedCustomerSessionEvents = useMemo(
    () =>
      (customerAnalyticsSessionModal?.events || []).map((event, index) => ({
        id: `${event.created_at ?? event.type ?? index}`,
        index: index + 1,
        type: String(event.type ?? "-"),
        slide: String(event.slide ?? "-"),
        detail: extractEventDetail(event),
        duration:
          event.duration_seconds !== undefined
            ? String(event.duration_seconds)
            : "-",
        occurredAt: formatDateTimeValue(
          typeof event.created_at === "string" ? event.created_at : null,
        ),
      })),
    [customerAnalyticsSessionModal],
  );
  const selectedCustomerSessionFeedback = useMemo(
    () =>
      extractFeedbackSummaryRows(
        customerAnalyticsSessionModal?.feedback_submissions,
      ),
    [customerAnalyticsSessionModal],
  );

  const projectSuggestions = useMemo(() => {
    const fromMeetings = meetings.map((m) => m.project_name || "");
    const fromSelected = (latestLink?.selected_projects || []).map(
      (p) => p.title || "",
    );
    const fromLiked = (latestLink?.liked_projects || []).map(
      (p) => p.title || "",
    );
    return Array.from(
      new Set(
        [...fromMeetings, ...fromSelected, ...fromLiked]
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    );
  }, [latestLink?.liked_projects, latestLink?.selected_projects, meetings]);

  const openWhatsApp = useCallback((phone: string, message: string) => {
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isAppleDevice = /iPad|iPhone|iPod|Macintosh/i.test(userAgent);

    if (isAppleDevice) {
      window.location.href = whatsappUrl;
      return;
    }

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }, []);

  const handleSendLinkWhatsApp = () => {
    if (!publicLink) {
      setError("No public link available.");
      return;
    }
    const phone = normalizePhoneForWhatsApp(recipientPhone);
    if (!phone) {
      setError("Please enter valid phone number.");
      return;
    }
    const shareText = `Hi ${customer?.name || customer?.nickname || "Customer"}, here is your project link:\n${publicLink}`;
    openWhatsApp(phone, shareText);
  };

  const handleSendLinkEmail = () => {
    if (!publicLink) {
      setError("No public link available.");
      return;
    }
    const email = recipientEmail.trim();
    if (!email) {
      setError("Please enter email address.");
      return;
    }
    const subject = "Your Project Link";
    const body = `Hi ${customer?.name || customer?.nickname || "Customer"},\n\n${publicLink}\n\nRegards`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleMeetingReminderWhatsApp = (proj: ProjectMeeting) => {
    if (!customer?.phone) return;
    const phone = normalizePhoneForWhatsApp(customer.phone);
    if (!phone) return;

    const msg = `Hello ${customer.name || customer.nickname},\n\nReminder: Your site visit for *${proj.project_name}* is scheduled on ${proj.meeting_date} at ${fmt12(proj.meeting_time)}.\n\nRegards,\nconectr.co`;
    openWhatsApp(phone, msg);
  };

  const handleAddMeeting = useCallback(async () => {
    if (!customer) return;
    setError("");

    if (
      !addMeeting.project_name ||
      !addMeeting.meeting_date ||
      !addMeeting.meeting_time
    ) {
      setError("Project name, date and time are required.");
      return;
    }

    if (!isAllowedProject(addMeeting.project_name)) {
      setError("You can schedule meetings only for your assigned projects.");
      return;
    }

    setSaving(true);
    try {
      const res = await CustomerAPI.scheduleMeeting(customer.id, addMeeting);
      const nextProjects = safeProjects(res.data.projects).filter((project) =>
        isAllowedProject(project.project_name),
      );
      setCustomer({ ...res.data, projects: nextProjects });
      setMeetings(nextProjects);
      setAddMeeting({ project_name: "", meeting_date: "", meeting_time: "" });
      showSuccess("Meeting scheduled.");
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message || "Failed to schedule meeting.",
      );
    } finally {
      setSaving(false);
    }
  }, [addMeeting, customer, isAllowedProject, showSuccess]);

  const handleUpdateMeeting = useCallback(async () => {
    if (!customer || !editingMeeting) return;
    setError("");

    if (!editingMeeting.meeting_date || !editingMeeting.meeting_time) {
      setError("Date and time are required.");
      return;
    }

    setSaving(true);
    try {
      const res = await CustomerAPI.updateProjectMeeting(
        customer.id,
        editingMeeting.project_name,
        {
          meeting_date: editingMeeting.meeting_date,
          meeting_time: editingMeeting.meeting_time,
        },
      );
      const nextProjects = safeProjects(res.data.projects).filter((project) =>
        isAllowedProject(project.project_name),
      );
      setCustomer({ ...res.data, projects: nextProjects });
      setMeetings(nextProjects);
      setEditingMeeting(null);
      showSuccess("Meeting updated.");
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message || "Failed to update meeting.",
      );
    } finally {
      setSaving(false);
    }
  }, [customer, editingMeeting, isAllowedProject, showSuccess]);

  const handleDeleteMeeting = useCallback(
    async (projectName: string) => {
      if (!customer) return;
      if (!confirm(`Remove meeting for ${projectName}?`)) return;

      setSaving(true);
      try {
        const res = await CustomerAPI.deleteProjectMeeting(
          customer.id,
          projectName,
        );
        const nextProjects = safeProjects(res.data.projects).filter((project) =>
          isAllowedProject(project.project_name),
        );
        setCustomer({ ...res.data, projects: nextProjects });
        setMeetings(nextProjects);
        showSuccess("Meeting removed.");
      } catch (e: unknown) {
        setError(
          (e as { message?: string }).message || "Failed to remove meeting.",
        );
      } finally {
        setSaving(false);
      }
    },
    [customer, isAllowedProject, showSuccess],
  );

  const openSchedulePopup = (project: LinkedProjectCard, idx: number) => {
    setSchedulePopup({
      project,
      idx,
      meetingDate: project.meeting_date || "",
      meetingTime: project.meeting_time || "",
    });
  };

  const submitScheduleFromLiked = useCallback(async () => {
    if (!customer || !schedulePopup) return;

    const projectName = (schedulePopup.project.title || "").trim();
    if (
      !projectName ||
      !schedulePopup.meetingDate ||
      !schedulePopup.meetingTime
    ) {
      setError("Project, date and time are required.");
      return;
    }

    if (!isAllowedProject(projectName)) {
      setError("You can schedule meetings only for your assigned projects.");
      return;
    }

    const existing = meetings.find(
      (m) =>
        (m.project_name || "").trim().toLowerCase() ===
        projectName.toLowerCase(),
    );

    setSaving(true);
    try {
      const res = existing
        ? await CustomerAPI.updateProjectMeeting(customer.id, projectName, {
            meeting_date: schedulePopup.meetingDate,
            meeting_time: schedulePopup.meetingTime,
          })
        : await CustomerAPI.scheduleMeeting(customer.id, {
            project_name: projectName,
            meeting_date: schedulePopup.meetingDate,
            meeting_time: schedulePopup.meetingTime,
          });

      const nextProjects = safeProjects(res.data.projects).filter((project) =>
        isAllowedProject(project.project_name),
      );
      setCustomer({ ...res.data, projects: nextProjects });
      setMeetings(nextProjects);
      setSchedulePopup(null);
      showSuccess(
        existing
          ? "Meeting updated from liked project."
          : "Meeting scheduled from liked project.",
      );
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message ||
          "Failed to schedule liked project.",
      );
    } finally {
      setSaving(false);
    }
  }, [customer, isAllowedProject, meetings, schedulePopup, showSuccess]);

  const handleArchiveCustomer = async () => {
    if (!customer) return;
    if (!confirm("Archive this customer?")) return;

    setSaving(true);
    try {
      await CustomerAPI.delete(customer.id);
      router.push("/customer");
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message || "Failed to archive customer.",
      );
    } finally {
      setSaving(false);
    }
  };

  const canArchiveCustomer = !restrictProjectsForRole;

  const [analyticsTab, setAnalyticsTab] = React.useState<"summary" | "events">(
    "summary",
  );

  const formatAnalyticsValue = (value: unknown): string => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean")
      return String(value);
    if (Array.isArray(value)) {
      return value
        .map((e) => {
          if (typeof e === "string" || typeof e === "number") return String(e);
          if (typeof e === "object" && e !== null) return JSON.stringify(e);
          return String(e);
        })
        .filter(Boolean)
        .join(" • ");
    }
    if (typeof value === "object") return JSON.stringify(value);
    return "-";
  };

  const prettifyKey = (key: string) =>
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const handleViewSessionAnalytics = async (
    sessionLink: CustomerSessionLink,
  ) => {
    if (!sessionLink.session_token) {
      setError("Session token missing for this link.");
      return;
    }

    setAnalyticsLoadingToken(sessionLink.session_token);
    setError("");
    try {
      const res = await fetch(
        `${CONECTR_BASE_URL}/api/session/${encodeURIComponent(sessionLink.session_token)}/analytics`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Analytics request failed (${res.status}).`);
      }

      const data = (await res.json()) as ConectrAnalyticsResponse;
      setAnalyticsModal({ sessionLink, analytics: data });
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message ||
          "Failed to load session analytics.",
      );
    } finally {
      setAnalyticsLoadingToken("");
    }
  };

  const handleGenerateSessionSummary = async (
    sessionLink: CustomerSessionLink,
  ) => {
    if (!sessionLink.session_token) {
      setError("Session token missing for this link.");
      return;
    }

    setSummaryLoadingToken(sessionLink.session_token);
    setError("");
    try {
      const res = await fetch(
        `${CONECTR_BASE_URL}/api/session/${encodeURIComponent(sessionLink.session_token)}/generate-summary`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Summary generation failed (${res.status}).`);
      }

      showSuccess("Summary generated. Opening latest analytics...");
      await handleViewSessionAnalytics(sessionLink);
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message ||
          "Failed to generate session summary.",
      );
    } finally {
      setSummaryLoadingToken("");
    }
  };

  const handleEndSessionAndShowSummary = async (
    sessionLink: CustomerSessionLink,
  ) => {
    if (!sessionLink.session_token) {
      setError("Session token missing for this link.");
      return;
    }

    setEndingLoadingToken(sessionLink.session_token);
    setError("");
    try {
      const endRes = await fetch(
        `${CONECTR_BASE_URL}/api/session/${encodeURIComponent(sessionLink.session_token)}/end`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );

      if (!endRes.ok && endRes.status !== 410) {
        const body = await endRes.text();
        throw new Error(body || `Failed to end session (${endRes.status}).`);
      }

      await handleGenerateSessionSummary(sessionLink);
      showSuccess("Session ended and latest summary loaded.");
    } catch (e: unknown) {
      setError((e as { message?: string }).message || "Failed to end session.");
    } finally {
      setEndingLoadingToken("");
    }
  };

  if (loading) {
    return (
      <div className="page-loader min-h-screen">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-main flex flex-col">
        <Header variant="app" />
        <main
          className="flex-1 max-w-4xl mx-auto px-4 py-8 w-full"
          style={{ paddingTop: "calc(var(--header-height) + 1.2rem)" }}
        >
          <div
            className="glass-card p-6 text-center"
            style={{ borderRadius: "var(--radius-xl)" }}
          >
            <h1
              className="text-2xl font-bold"
              style={{
                color: "var(--navy-900)",
                fontFamily: "var(--font-display)",
              }}
            >
              {error || "Customer not found"}
            </h1>
            <button
              className="btn btn-primary mt-4"
              onClick={() => router.push("/customer")}
            >
              Back To Customers
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-main flex flex-col">
      <Header variant="app" />
      <main
        className="flex-1 px-3 sm:px-4 md:px-8 py-4 md:py-6 max-w-7xl mx-auto w-full"
        style={{ paddingTop: "calc(var(--header-height) + 0.8rem)" }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <p
              className="text-xs font-bold"
              style={{ color: "var(--navy-600)" }}
            >
              Customer Detail Page
            </p>
            <h1
              className="text-2xl md:text-3xl font-bold"
              style={{
                color: "var(--navy-900)",
                fontFamily: "var(--font-display)",
              }}
            >
              {customer.name || customer.nickname} ({customer.secret_code})
            </h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="btn btn-ghost"
              onClick={() => router.push("/customer")}
            >
              Back
            </button>
            {!restrictProjectsForRole && (
              <button
                className="btn btn-primary"
                onClick={() => setEditCustomer(customer)}
              >
                Edit Customer
              </button>
            )}
            {canArchiveCustomer && (
              <button
                className="btn btn-danger"
                onClick={handleArchiveCustomer}
                disabled={saving}
              >
                Archive
              </button>
            )}
          </div>
        </div>

        {error && <div className="alert alert-danger mb-3">{error}</div>}
        {success && <div className="alert alert-success mb-3">{success}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div
            className="card p-4"
            style={{ borderRadius: "var(--radius-lg)" }}
          >
            <p
              className="text-xs font-bold"
              style={{ color: "var(--navy-700)" }}
            >
              Customer Profile
            </p>
            <p className="font-bold mt-2" style={{ color: "var(--navy-900)" }}>
              {customer.name || customer.nickname}
            </p>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Code: {customer.secret_code}
            </p>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Code: {customer.secret_code}
            </p>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Phone: {customer.phone || "-"}
            </p>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Email: {customer.email || "-"}
            </p>
            <p className="text-sm mt-2" style={{ color: "var(--navy-700)" }}>
              Status: <b>{customer.status}</b>
            </p>
          </div>

          <div
            className="card p-4 lg:col-span-2"
            style={{ borderRadius: "var(--radius-lg)" }}
          >
            <p
              className="text-xs font-bold"
              style={{ color: "var(--navy-700)" }}
            >
              Meeting Overview
            </p>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div
                className="p-2 rounded-lg"
                style={{ background: "var(--slate-50)" }}
              >
                <p
                  className="text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Total
                </p>
                <p className="font-bold" style={{ color: "var(--navy-900)" }}>
                  {meetings.length}
                </p>
              </div>
              <div
                className="p-2 rounded-lg"
                style={{ background: "var(--orange-50)" }}
              >
                <p className="text-xs" style={{ color: "var(--orange-700)" }}>
                  Upcoming
                </p>
                <p className="font-bold" style={{ color: "var(--orange-700)" }}>
                  {upcomingMeetings.length}
                </p>
              </div>
              <div
                className="p-2 rounded-lg"
                style={{ background: "var(--green-100)" }}
              >
                <p className="text-xs" style={{ color: "var(--green-600)" }}>
                  Done
                </p>
                <p className="font-bold" style={{ color: "var(--green-600)" }}>
                  {doneMeetings.length}
                </p>
              </div>
              <div
                className="p-2 rounded-lg"
                style={{ background: "var(--navy-50)" }}
              >
                <p className="text-xs" style={{ color: "var(--navy-700)" }}>
                  Links Sent
                </p>
                <p className="font-bold" style={{ color: "var(--navy-700)" }}>
                  {projectLinks.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {!restrictProjectsForRole && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div
              className="card p-4 lg:col-span-2"
              style={{ borderRadius: "var(--radius-lg)" }}
            >
              <p
                className="text-xs font-bold"
                style={{ color: "var(--navy-700)" }}
              >
                Public Link & Send
              </p>
              {!latestLink ? (
                <p
                  className="text-sm mt-2"
                  style={{ color: "var(--color-text-hint)" }}
                >
                  No link sent for this customer yet.
                </p>
              ) : (
                <>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <input
                      className="input-field"
                      readOnly
                      value={publicLink}
                      title="Public customer link"
                      aria-label="Public customer link"
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
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label
                        className="text-xs font-bold"
                        style={{ color: "var(--navy-700)" }}
                      >
                        WhatsApp Number
                      </label>
                      <input
                        className="input-field mt-1"
                        value={recipientPhone}
                        onChange={(e) => setRecipientPhone(e.target.value)}
                        placeholder="Enter phone"
                      />
                    </div>
                    <div>
                      <label
                        className="text-xs font-bold"
                        style={{ color: "var(--navy-700)" }}
                      >
                        Email
                      </label>
                      <input
                        className="input-field mt-1"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder="Enter email"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <button
                      className="btn btn-primary"
                      onClick={handleSendLinkWhatsApp}
                    >
                      Send WhatsApp Link
                    </button>
                    <button
                      className="btn btn-gold"
                      onClick={handleSendLinkEmail}
                    >
                      Send Email Link
                    </button>
                  </div>
                </>
              )}
            </div>

            <div
              className="card p-4"
              style={{ borderRadius: "var(--radius-lg)" }}
            >
              <p
                className="text-xs font-bold mb-2"
                style={{ color: "var(--navy-700)" }}
              >
                Add Meeting
              </p>
              <input
                className="input-field mb-2"
                list="project-suggestions"
                value={addMeeting.project_name}
                onChange={(e) =>
                  setAddMeeting((p) => ({ ...p, project_name: e.target.value }))
                }
                placeholder="Project name"
              />
              <datalist id="project-suggestions">
                {projectSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <select
                className="input-field mb-2"
                value={addMeeting.meeting_date}
                onChange={(e) =>
                  setAddMeeting((p) => ({ ...p, meeting_date: e.target.value }))
                }
              >
                <option value="">Select date</option>
                {DATE_OPTIONS.map((d) => (
                  <option key={d.val} value={d.val}>
                    {d.label}
                  </option>
                ))}
              </select>
              <select
                className="input-field mb-2"
                value={addMeeting.meeting_time}
                onChange={(e) =>
                  setAddMeeting((p) => ({ ...p, meeting_time: e.target.value }))
                }
              >
                <option value="">Select time</option>
                {TIME_SLOTS.map((t) => (
                  <option key={t.val} value={t.val}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary w-full"
                onClick={handleAddMeeting}
                disabled={saving}
              >
                Schedule Meeting
              </button>
            </div>
          </div>
        )}

        <section
          className="card p-4 mb-4"
          style={{ borderRadius: "var(--radius-lg)" }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p
                className="text-xs font-bold"
                style={{ color: "var(--navy-700)" }}
              >
                Customer Intelligence Overview
              </p>
              <p
                className="text-sm mt-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Customer-wise ConectR analytics, summaries, and useful event
                data in one place.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                className="btn btn-ghost"
                onClick={loadCustomerAnalytics}
                disabled={customerAnalyticsLoading || sessionLinks.length === 0}
              >
                {customerAnalyticsLoading
                  ? "Loading..."
                  : customerAnalytics
                    ? "Refresh Analytics"
                    : "Load Analytics"}
              </button>
              <button
                className="btn btn-gold"
                onClick={handleGenerateCustomerMasterSummary}
                disabled={masterSummaryLoading || sessionLinks.length === 0}
              >
                {masterSummaryLoading
                  ? "Generating..."
                  : "Generate Master Summary"}
              </button>
            </div>
          </div>

          {sessionLinks.length === 0 ? (
            <p
              className="text-sm mt-3"
              style={{ color: "var(--color-text-hint)" }}
            >
              Create a ConectR session link first. Customer analytics will
              appear here after the customer joins a session.
            </p>
          ) : customerAnalyticsLoading && !customerAnalytics ? (
            <div className="mt-3 flex items-center gap-2">
              <div className="spinner" />
              <span style={{ color: "var(--color-text-muted)" }}>
                Loading customer analytics...
              </span>
            </div>
          ) : customerAnalytics ? (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-2">
                {[
                  {
                    label: "Viewer ID",
                    value: customerAnalyticsSnapshot.viewerId,
                  },
                  {
                    label: "Viewer",
                    value: customerAnalyticsSnapshot.viewerName,
                  },
                  {
                    label: "Total Sessions",
                    value: String(customerAnalyticsSnapshot.totalSessions),
                  },
                  {
                    label: "Presentations Viewed",
                    value: String(
                      customerAnalyticsSnapshot.presentationsViewed.length,
                    ),
                  },
                  {
                    label: "Total Events",
                    value: String(customerAnalyticsSnapshot.totalEvents),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="p-3 rounded-lg"
                    style={{
                      background: "var(--slate-50)",
                      border: "1px solid var(--slate-200)",
                    }}
                  >
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {item.label}
                    </p>
                    <p
                      className="text-sm font-bold mt-1"
                      style={{
                        color: "var(--navy-900)",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.value || "-"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div
                  className="p-3 rounded-lg"
                  style={{
                    border: "1px solid var(--slate-200)",
                    background: "#fff",
                  }}
                >
                  <p
                    className="text-xs font-bold mb-2"
                    style={{ color: "var(--navy-700)" }}
                  >
                    Presentations Viewed
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {customerAnalyticsSnapshot.presentationsViewed.length >
                    0 ? (
                      customerAnalyticsSnapshot.presentationsViewed.map(
                        (item) => (
                          <span
                            key={item}
                            className="px-2 py-1 rounded-full text-xs font-semibold"
                            style={{
                              background: "var(--navy-50)",
                              color: "var(--navy-700)",
                            }}
                          >
                            {item}
                          </span>
                        ),
                      )
                    ) : (
                      <span style={{ color: "var(--color-text-hint)" }}>-</span>
                    )}
                  </div>
                </div>

                {!restrictProjectsForRole && (
                  <div
                    className="p-3 rounded-lg"
                    style={{
                      border: "1px solid var(--slate-200)",
                      background: "#fff",
                    }}
                  >
                    <p
                      className="text-xs font-bold mb-2"
                      style={{ color: "var(--navy-700)" }}
                    >
                      Developers Interacted
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {customerAnalyticsSnapshot.developersInteracted.length >
                      0 ? (
                        customerAnalyticsSnapshot.developersInteracted.map(
                          (item) => (
                            <span
                              key={item}
                              className="px-2 py-1 rounded-full text-xs font-semibold"
                              style={{
                                background: "var(--green-100)",
                                color: "var(--green-600)",
                              }}
                            >
                              {item}
                            </span>
                          ),
                        )
                      ) : (
                        <span style={{ color: "var(--color-text-hint)" }}>
                          -
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div
                className="p-3 rounded-lg"
                style={{
                  border: "1px solid var(--slate-200)",
                  background: "#fff",
                }}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <p
                    className="text-xs font-bold"
                    style={{ color: "var(--navy-700)" }}
                  >
                    Master Summary
                  </p>
                  {!customerMasterSummary && (
                    <span
                      className="text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Generate a fresh AI summary only when needed.
                    </span>
                  )}
                </div>

                {customerMasterSummary ? (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
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
                              width: "32%",
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
                        {Object.entries(customerMasterSummary).map(
                          ([key, value], index) => (
                            <tr
                              key={key}
                              style={{
                                background:
                                  index % 2 === 0 ? "#fff" : "#f8fafc",
                                borderBottom: "1px solid var(--slate-100)",
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
                                {formatAnalyticsValue(value)}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-hint)" }}
                  >
                    No master summary generated yet.
                  </p>
                )}
              </div>

              <div
                className="p-3 rounded-lg"
                style={{
                  border: "1px solid var(--slate-200)",
                  background: "#fff",
                }}
              >
                <p
                  className="text-xs font-bold mb-2"
                  style={{ color: "var(--navy-700)" }}
                >
                  Session Journey Table
                </p>
                {customerAnalyticsSessions.length === 0 ? (
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-hint)" }}
                  >
                    No customer analytics sessions available yet.
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.82rem",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th
                            style={{
                              padding: "0.55rem 0.75rem",
                              textAlign: "left",
                            }}
                          >
                            Project
                          </th>
                          <th
                            style={{
                              padding: "0.55rem 0.75rem",
                              textAlign: "left",
                            }}
                          >
                            Status
                          </th>
                          <th
                            style={{
                              padding: "0.55rem 0.75rem",
                              textAlign: "left",
                            }}
                          >
                            Events
                          </th>
                          <th
                            style={{
                              padding: "0.55rem 0.75rem",
                              textAlign: "left",
                            }}
                          >
                            Feedback
                          </th>
                          <th
                            style={{
                              padding: "0.55rem 0.75rem",
                              textAlign: "left",
                            }}
                          >
                            Started
                          </th>
                          <th
                            style={{
                              padding: "0.55rem 0.75rem",
                              textAlign: "left",
                            }}
                          >
                            Ended
                          </th>
                          <th
                            style={{
                              padding: "0.55rem 0.75rem",
                              textAlign: "left",
                            }}
                          >
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerAnalyticsSessions.map((session, index) => {
                          const feedbackRows = extractFeedbackSummaryRows(
                            session.feedback_submissions,
                          );

                          return (
                            <tr
                              key={`${session.session_token}-${index}`}
                              style={{
                                background:
                                  index % 2 === 0 ? "#fff" : "#f8fafc",
                                borderBottom: "1px solid var(--slate-100)",
                              }}
                            >
                              <td
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  fontWeight: 600,
                                  color: "var(--navy-800)",
                                }}
                              >
                                {String(
                                  session.presentation_title ||
                                    session.presentation_id ||
                                    "-",
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  color: "var(--color-text-secondary)",
                                }}
                              >
                                {String(session.status || "-")}
                              </td>
                              <td
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  color: "var(--color-text-secondary)",
                                }}
                              >
                                {String(
                                  session.event_count ||
                                    session.events?.length ||
                                    0,
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  color: "var(--color-text-secondary)",
                                }}
                              >
                                {String(feedbackRows.length)}
                              </td>
                              <td
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  color: "var(--color-text-secondary)",
                                }}
                              >
                                {formatDateTimeValue(
                                  session.started_at || session.created_at,
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  color: "var(--color-text-secondary)",
                                }}
                              >
                                {formatDateTimeValue(session.ended_at)}
                              </td>
                              <td style={{ padding: "0.5rem 0.75rem" }}>
                                <button
                                  className="btn btn-ghost"
                                  onClick={() => {
                                    setCustomerAnalyticsSessionModal(session);
                                    setCustomerAnalyticsTab("summary");
                                  }}
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p
              className="text-sm mt-3"
              style={{ color: "var(--color-text-hint)" }}
            >
              Customer analytics are not available yet.
            </p>
          )}
        </section>

        <div
          className="card p-4 mb-4"
          style={{ borderRadius: "var(--radius-lg)" }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p
              className="text-xs font-bold"
              style={{ color: "var(--navy-700)" }}
            >
              ConectR Session Analytics
            </p>
          </div>

          {sessionLinks.length === 0 ? (
            <p
              className="text-sm mt-2"
              style={{ color: "var(--color-text-hint)" }}
            >
              No ConectR session links available for this customer yet.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {sessionLinks.slice(0, 5).map((row) => {
                const analyticsBusy =
                  analyticsLoadingToken === row.session_token;
                const summaryBusy = summaryLoadingToken === row.session_token;
                const endingBusy = endingLoadingToken === row.session_token;
                const matchingMeeting = meetings.find(
                  (meeting) =>
                    normalizeProjectName(meeting.project_name) ===
                    normalizeProjectName(row.project_name),
                );
                const timingLabel = getSessionLinkTimingLabel(
                  row,
                  matchingMeeting,
                );
                const selfViewOnly =
                  Boolean(row.self_view_url) &&
                  (row.raw_response?.mode === "self_view" ||
                    row.self_view_url === row.viewer_link ||
                    row.self_view_url === row.presenter_link);
                const visibleViewerLink = selfViewOnly
                  ? ""
                  : row.viewer_link_with_phone || row.viewer_link;
                const visibleSelfViewLink =
                  row.self_view_url_with_phone ||
                  row.self_view_url ||
                  (selfViewOnly ? row.viewer_link || row.presenter_link : "");

                return (
                  <div
                    key={row.id}
                    className="p-3 rounded-lg"
                    style={{
                      border: "1px solid var(--slate-200)",
                      background: "#fff",
                    }}
                  >
                    <p
                      className="font-bold text-sm"
                      style={{ color: "var(--navy-900)" }}
                    >
                      {row.project_name ||
                        row.presentation_title ||
                        row.presentation_id}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Session Code: {row.session_code || row.join_code || "-"}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Viewer Link: {visibleViewerLink || "-"}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Self-View Link: {visibleSelfViewLink || "-"}
                    </p>
                    {timingLabel && (
                      <span
                        className="badge mt-2"
                        style={{
                          background:
                            timingLabel === "Live"
                              ? "rgba(124,58,237,0.14)"
                              : timingLabel === "Completed"
                                ? "rgba(107,114,128,0.14)"
                              : "#eff6ff",
                          color:
                            timingLabel === "Live"
                              ? "#5b21b6"
                              : timingLabel === "Completed"
                                ? "#374151"
                              : "#1d4ed8",
                          border: "1px solid rgba(148,163,184,0.35)",
                          fontSize: "0.7rem",
                        }}
                      >
                        {timingLabel}
                      </span>
                    )}
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <button
                        className="btn btn-primary"
                        disabled={analyticsBusy || summaryBusy || endingBusy}
                        onClick={() => handleViewSessionAnalytics(row)}
                      >
                        {analyticsBusy ? "Loading..." : "Show Analytics"}
                      </button>
                      <button
                        className="btn btn-gold"
                        disabled={analyticsBusy || summaryBusy || endingBusy}
                        onClick={() => handleGenerateSessionSummary(row)}
                      >
                        {summaryBusy ? "Generating..." : "Generate AI Summary"}
                      </button>
                      <button
                        className="btn btn-danger"
                        disabled={analyticsBusy || summaryBusy || endingBusy}
                        onClick={() => handleEndSessionAndShowSummary(row)}
                      >
                        {endingBusy ? "Ending..." : "End Session + Summary"}
                      </button>
                      {visibleViewerLink && (
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            window.open(visibleViewerLink, "_blank")
                          }
                        >
                          Open Viewer Link
                        </button>
                      )}
                      {visibleSelfViewLink && (
                        <>
                          <button
                            className="btn btn-ghost"
                            onClick={() =>
                              window.open(visibleSelfViewLink, "_blank")
                            }
                          >
                            Open Self-View Link
                          </button>
                          <button
                            className="btn btn-primary"
                            disabled={
                              analyticsBusy || summaryBusy || endingBusy
                            }
                            onClick={() => handleViewSessionAnalytics(row)}
                          >
                            {analyticsBusy
                              ? "Loading..."
                              : "Self-View Analytics"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!restrictProjectsForRole && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <section
              className="card p-4"
              style={{ borderRadius: "var(--radius-lg)" }}
            >
              <p
                className="text-xs font-bold mb-2"
                style={{ color: "var(--navy-700)" }}
              >
                All Meetings
              </p>
              <div className="space-y-2 max-h-112 overflow-y-auto pr-1">
                {meetings.length === 0 && (
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-hint)" }}
                  >
                    No meetings yet.
                  </p>
                )}
                {orderedMeetings.map((m) => {
                  const isEditing =
                    editingMeeting?.project_name === m.project_name;
                  const timingLabel = getMeetingStatusLabel(m);
                  return (
                    <div
                      key={m.project_name}
                      className="p-3 rounded-lg"
                      style={{
                        border: "1px solid var(--slate-200)",
                        background: "#fff",
                      }}
                    >
                      <p
                        className="font-bold text-sm"
                        style={{ color: "var(--navy-900)" }}
                      >
                        {m.project_name}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Meeting:{" "}
                        {formatDisplayMeeting(m.meeting_date, m.meeting_time)}
                      </p>
                      <span
                        className="badge mt-1"
                        style={{
                          background:
                            timingLabel === "Live"
                              ? "rgba(124,58,237,0.14)"
                              : timingLabel === "Completed"
                                ? "rgba(107,114,128,0.14)"
                              : "#eff6ff",
                          color:
                            timingLabel === "Live"
                              ? "#5b21b6"
                              : timingLabel === "Completed"
                                ? "#374151"
                              : "#1d4ed8",
                          border: "1px solid rgba(148,163,184,0.35)",
                          fontSize: "0.7rem",
                        }}
                      >
                        {timingLabel}
                      </span>
                      {(m.created_by_name || m.assigned_to_user_name) && (
                        <p
                          className="text-xs"
                          style={{ color: "var(--color-text-hint)" }}
                        >
                          {m.created_by_name ? `By: ${m.created_by_name}` : ""}
                          {m.created_by_name && m.assigned_to_user_name
                            ? " | "
                            : ""}
                          {m.assigned_to_user_name
                            ? `To: ${m.assigned_to_user_name}`
                            : ""}
                        </p>
                      )}

                      {isEditing ? (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select
                            className="input-field"
                            value={editingMeeting.meeting_date}
                            onChange={(e) =>
                              setEditingMeeting((p) =>
                                p ? { ...p, meeting_date: e.target.value } : p,
                              )
                            }
                          >
                            <option value="">Select date</option>
                            {DATE_OPTIONS.map((d) => (
                              <option key={d.val} value={d.val}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                          <select
                            className="input-field"
                            value={editingMeeting.meeting_time}
                            onChange={(e) =>
                              setEditingMeeting((p) =>
                                p ? { ...p, meeting_time: e.target.value } : p,
                              )
                            }
                          >
                            <option value="">Select time</option>
                            {TIME_SLOTS.map((t) => (
                              <option key={t.val} value={t.val}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <button
                            className="btn btn-primary"
                            onClick={handleUpdateMeeting}
                            disabled={saving}
                          >
                            Save
                          </button>
                          <button
                            className="btn btn-ghost"
                            onClick={() => setEditingMeeting(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2 flex gap-2 flex-wrap">
                          <button
                            className="btn btn-ghost"
                            onClick={() => setEditingMeeting(m)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => handleDeleteMeeting(m.project_name)}
                            disabled={saving}
                          >
                            Delete
                          </button>
                          <button
                            className="btn btn-gold"
                            onClick={() => handleMeetingReminderWhatsApp(m)}
                          >
                            WhatsApp Reminder
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section
              className="card p-4"
              style={{ borderRadius: "var(--radius-lg)" }}
            >
              <p
                className="text-xs font-bold mb-2"
                style={{ color: "var(--navy-700)" }}
              >
                Link Projects (Selected & Liked)
              </p>
              {!latestLink ? (
                <p
                  className="text-sm"
                  style={{ color: "var(--color-text-hint)" }}
                >
                  No link projects available.
                </p>
              ) : (
                <div className="space-y-3 max-h-112 overflow-y-auto pr-1">
                  <div>
                    <p
                      className="text-xs font-semibold mb-1"
                      style={{ color: "var(--navy-700)" }}
                    >
                      Selected Projects
                    </p>
                    <div className="space-y-2">
                      {orderedSelectedProjects.map((p, i) => (
                        <div
                          key={`s-${i}`}
                          className="p-2 rounded-lg"
                          style={{
                            background: "var(--slate-50)",
                            border: "1px solid var(--slate-200)",
                          }}
                        >
                          <p
                            className="text-sm font-bold"
                            style={{ color: "var(--navy-900)" }}
                          >
                            {p.title}
                          </p>
                          <p
                            className="text-xs"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {p.developer || "-"} | {p.location || "-"}
                          </p>
                          <p
                            className="text-xs"
                            style={{ color: "var(--orange-600)" }}
                          >
                            {p.price || "-"}
                          </p>
                          {(p.meeting_date || p.meeting_time) && (
                            <p
                              className="text-xs mt-1"
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              Visit:{" "}
                              {formatDisplayMeeting(
                                p.meeting_date,
                                p.meeting_time,
                              )}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p
                      className="text-xs font-semibold mb-1"
                      style={{ color: "var(--green-600)" }}
                    >
                      Liked Projects
                    </p>
                    <div className="space-y-2">
                      {orderedLikedProjects.length === 0 && (
                        <p
                          className="text-sm"
                          style={{ color: "var(--color-text-hint)" }}
                        >
                          No liked projects yet.
                        </p>
                      )}
                      {orderedLikedProjects.map((p, i) => {
                        const projectName = (p.title || "").trim();
                        const alreadyScheduled = meetings.some(
                          (m) =>
                            (m.project_name || "").trim().toLowerCase() ===
                            projectName.toLowerCase(),
                        );
                        const canSchedule =
                          Boolean(p.meeting_date && p.meeting_time) &&
                          !alreadyScheduled;

                        return (
                          <div
                            key={`l-${i}`}
                            className="p-2 rounded-lg"
                            style={{
                              background: "#f0fdf4",
                              border: "1px solid #86efac",
                            }}
                          >
                            <p
                              className="text-sm font-bold"
                              style={{ color: "#166534" }}
                            >
                              {p.title}
                            </p>
                            <p className="text-xs" style={{ color: "#15803d" }}>
                              {p.developer || "-"} | {p.location || "-"}
                            </p>
                            <p className="text-xs" style={{ color: "#166534" }}>
                              {p.price || "-"}
                            </p>
                            {(p.meeting_date || p.meeting_time) && (
                              <p
                                className="text-xs font-semibold mt-1"
                                style={{ color: "#166534" }}
                              >
                                Visit:{" "}
                                {formatDisplayMeeting(
                                  p.meeting_date,
                                  p.meeting_time,
                                )}
                              </p>
                            )}
                            <button
                              className="btn btn-primary mt-2 w-full"
                              disabled={!canSchedule}
                              style={{
                                opacity: canSchedule ? 1 : 0.65,
                                cursor: canSchedule ? "pointer" : "not-allowed",
                              }}
                              onClick={() => openSchedulePopup(p, i)}
                            >
                              {alreadyScheduled
                                ? "Meeting Scheduled"
                                : "Schedule Meeting"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <Footer />

      {editCustomer && (
        <EditCustomerModal
          customer={editCustomer}
          onClose={() => setEditCustomer(null)}
          onUpdated={(u) => {
            const normalized = { ...u, projects: safeProjects(u.projects) };
            setCustomer(normalized);
            setMeetings(safeProjects(normalized.projects));
            setEditCustomer(null);
            showSuccess("Customer updated.");
          }}
        />
      )}

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
                x
              </button>
            </div>
            <div className="modal-body">
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
                        setSchedulePopup((p) =>
                          p ? { ...p, meetingDate: e.target.value } : p,
                        )
                      }
                    >
                      <option value="">Select a date</option>
                      {DATE_OPTIONS.map((d) => (
                        <option key={d.val} value={d.val}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Meeting Time</label>
                    <select
                      className="input-field"
                      value={schedulePopup.meetingTime}
                      onChange={(e) =>
                        setSchedulePopup((p) =>
                          p ? { ...p, meetingTime: e.target.value } : p,
                        )
                      }
                    >
                      <option value="">Select a time</option>
                      {TIME_SLOTS.map((t) => (
                        <option key={t.val} value={t.val}>
                          {t.label}
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
                onClick={submitScheduleFromLiked}
                disabled={saving}
              >
                {saving ? "Scheduling..." : "Schedule Meeting"}
              </button>
            </div>
          </div>
        </div>
      )}

      {analyticsModal && (
        <div className="modal-overlay">
          <div
            className="modal-box"
            style={{
              maxWidth: "64rem",
              width: "min(64rem, calc(100% - 1rem))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="modal-header">
              <div>
                <p className="modal-title">
                  Session Analytics &amp; AI Summary
                </p>
                <p className="modal-subtitle">
                  {analyticsModal.sessionLink.project_name ||
                    analyticsModal.sessionLink.presentation_title ||
                    analyticsModal.sessionLink.presentation_id}{" "}
                  &mdash;{" "}
                  {analyticsModal.sessionLink.viewer_name ||
                    customer.name ||
                    customer.nickname}
                </p>
              </div>
              <button
                className="modal-close"
                onClick={() => {
                  setAnalyticsModal(null);
                  setAnalyticsTab("summary");
                }}
              >
                ×
              </button>
            </div>

            <div className="modal-body" style={{ padding: "1rem 1.2rem" }}>
              {/* ── Stats strip ── */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                }}
              >
                {[
                  {
                    label: "Status",
                    value: analyticsModal.analytics.session?.status || "-",
                  },
                  {
                    label: "Presenter",
                    value:
                      analyticsModal.analytics.session?.presenter_name ||
                      analyticsModal.sessionLink.presenter_name ||
                      "-",
                  },
                  {
                    label: "Viewer",
                    value:
                      analyticsModal.analytics.session?.viewer_name ||
                      analyticsModal.sessionLink.viewer_name ||
                      "-",
                  },
                  {
                    label: "Total Events",
                    value: String(analyticsModal.analytics.events?.length || 0),
                  },
                  {
                    label: "Joinees",
                    value: formatCompactAnalyticsValue(
                      analyticsModal.analytics.session?.joinees,
                    ),
                  },
                  {
                    label: "Created",
                    value: formatDateTimeValue(
                      analyticsModal.analytics.session?.created_at ||
                        analyticsModal.analytics.session?.started_at ||
                        analyticsModal.sessionLink.created_at,
                    ),
                  },
                  {
                    label: "Ended",
                    value: formatDateTimeValue(
                      analyticsModal.analytics.session?.ended_at ||
                        analyticsModal.sessionLink.ended_at,
                    ),
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

              {/* ── Tabs ── */}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                  borderBottom: "2px solid var(--slate-200)",
                }}
              >
                {(["summary", "events"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setAnalyticsTab(tab)}
                    style={{
                      padding: "0.45rem 1rem",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      border: "none",
                      borderBottom:
                        analyticsTab === tab
                          ? "2.5px solid var(--navy-700)"
                          : "2.5px solid transparent",
                      background: "transparent",
                      color:
                        analyticsTab === tab
                          ? "var(--navy-700)"
                          : "var(--color-text-muted)",
                      cursor: "pointer",
                      marginBottom: "-2px",
                    }}
                  >
                    {tab === "summary"
                      ? "🧠 AI Buyer Summary"
                      : `📊 Events (${analyticsModal.analytics.events?.length || 0})`}
                  </button>
                ))}
              </div>

              {/* ── Summary Tab ── */}
              {analyticsTab === "summary" && (
                <>
                  {analyticsModal.analytics.summary?.summary ? (
                    isMobileView ? (
                      <div style={{ display: "grid", gap: "0.55rem" }}>
                        {Object.entries(
                          analyticsModal.analytics.summary.summary,
                        ).map(([key, value], i) => (
                          <div
                            key={key}
                            style={{
                              border: "1px solid var(--slate-200)",
                              borderRadius: "8px",
                              background: i % 2 === 0 ? "#fff" : "#f8fafc",
                              padding: "0.55rem 0.65rem",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 700,
                                color: "var(--navy-800)",
                                marginBottom: "0.3rem",
                                fontSize: "0.8rem",
                              }}
                            >
                              {prettifyKey(key)}
                            </div>
                            <div
                              style={{
                                color: "var(--color-text-secondary)",
                                lineHeight: 1.45,
                              }}
                            >
                              {renderSummaryValue(value, prettifyKey, true)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>
                        <table
                          style={{
                            width: "100%",
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
                            {Object.entries(
                              analyticsModal.analytics.summary.summary,
                            ).map(([key, value], i) => (
                              <tr
                                key={key}
                                style={{
                                  background: i % 2 === 0 ? "#fff" : "#f8fafc",
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
                                    maxHeight: "200px",
                                    overflowY: "auto",
                                  }}
                                >
                                  {renderSummaryValue(
                                    value,
                                    prettifyKey,
                                    false,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : (
                    <div className="alert alert-info">
                      AI Summary not generated yet. Click &ldquo;Generate AI
                      Summary&rdquo; button below.
                    </div>
                  )}
                </>
              )}

              {/* ── Events Tab ── */}
              {analyticsTab === "events" && (
                <>
                  {analyticsModal.analytics.events &&
                  analyticsModal.analytics.events.length > 0 ? (
                    <div
                      style={{
                        overflowX: "auto",
                        maxHeight: "26rem",
                        overflowY: "auto",
                        border: "1px solid var(--slate-200)",
                        borderRadius: "10px",
                      }}
                    >
                      <table
                        style={{
                          width: "100%",
                          minWidth: "54rem",
                          borderCollapse: "collapse",
                          tableLayout: "fixed",
                          fontSize: "0.8rem",
                        }}
                      >
                        <thead
                          style={{ position: "sticky", top: 0, zIndex: 1 }}
                        >
                          <tr style={{ background: "#f0fdf4" }}>
                            <th
                              style={{
                                padding: "0.5rem 0.65rem",
                                textAlign: "left",
                                fontWeight: 700,
                                color: "#166534",
                                borderBottom: "2px solid #86efac",
                                whiteSpace: "nowrap",
                                width: "3rem",
                              }}
                            >
                              #
                            </th>
                            <th
                              style={{
                                padding: "0.5rem 0.65rem",
                                textAlign: "left",
                                fontWeight: 700,
                                color: "#166534",
                                borderBottom: "2px solid #86efac",
                                whiteSpace: "nowrap",
                                width: "10rem",
                              }}
                            >
                              Type
                            </th>
                            <th
                              style={{
                                padding: "0.5rem 0.65rem",
                                textAlign: "left",
                                fontWeight: 700,
                                color: "#166534",
                                borderBottom: "2px solid #86efac",
                                width: "11rem",
                              }}
                            >
                              Slide
                            </th>
                            <th
                              style={{
                                padding: "0.5rem 0.65rem",
                                textAlign: "left",
                                fontWeight: 700,
                                color: "#166534",
                                borderBottom: "2px solid #86efac",
                                width: "23rem",
                              }}
                            >
                              Label / Action
                            </th>
                            <th
                              style={{
                                padding: "0.5rem 0.65rem",
                                textAlign: "left",
                                fontWeight: 700,
                                color: "#166534",
                                borderBottom: "2px solid #86efac",
                                whiteSpace: "nowrap",
                                width: "7rem",
                              }}
                            >
                              Duration (s)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsModal.analytics.events.map((ev, i) => {
                            const detailRows = getEventDetailRows(ev);

                            return (
                              <tr
                                key={i}
                                style={{
                                  background: i % 2 === 0 ? "#fff" : "#f8fafc",
                                  borderBottom: "1px solid var(--slate-100)",
                                }}
                              >
                              <td
                                style={{
                                  padding: "0.42rem 0.65rem",
                                  color: "var(--color-text-muted)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {i + 1}
                              </td>
                              <td
                                style={{
                                  padding: "0.42rem 0.65rem",
                                  fontWeight: 600,
                                  color: "var(--navy-800)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {String(ev.type ?? "-")}
                              </td>
                              <td
                                style={{
                                  padding: "0.42rem 0.65rem",
                                  color: "var(--color-text-secondary)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {String(ev.slide ?? "-")}
                              </td>
                              <td
                                style={{
                                  padding: "0.42rem 0.65rem",
                                  color: "var(--color-text-secondary)",
                                  verticalAlign: "top",
                                }}
                              >
                                {detailRows.length > 0 ? (
                                  <div
                                    style={{
                                      display: "grid",
                                      gap: "0.35rem",
                                    }}
                                  >
                                    {detailRows.map((row, rowIndex) => (
                                      <div
                                        key={`${row.key}-${rowIndex}`}
                                        style={{
                                          display: "grid",
                                          gridTemplateColumns: "minmax(7rem, 42%) 1fr",
                                          gap: "0.45rem",
                                          alignItems: "start",
                                          padding: "0.35rem 0.45rem",
                                          border: "1px solid var(--slate-200)",
                                          borderRadius: "8px",
                                          background: "#fff",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: "0.68rem",
                                            fontWeight: 700,
                                            color: "var(--navy-700)",
                                            overflowWrap: "anywhere",
                                          }}
                                        >
                                          {prettifyKey(row.key)}
                                        </span>
                                        <span
                                          style={{
                                            fontSize: "0.75rem",
                                            color: "var(--color-text-secondary)",
                                            overflowWrap: "anywhere",
                                            lineHeight: 1.35,
                                          }}
                                        >
                                          {row.value}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "0.42rem 0.65rem",
                                  color: "var(--color-text-muted)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {ev.duration_seconds !== undefined
                                  ? String(ev.duration_seconds)
                                  : "-"}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="alert alert-info">
                      No events recorded for this session yet.
                    </div>
                  )}
                </>
              )}

              {/* ── Footer actions ── */}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  marginTop: "1rem",
                  paddingTop: "0.75rem",
                  borderTop: "1px solid var(--slate-200)",
                }}
              >
                <button
                  className="btn btn-gold"
                  onClick={() =>
                    handleGenerateSessionSummary(analyticsModal.sessionLink)
                  }
                  disabled={
                    summaryLoadingToken ===
                    analyticsModal.sessionLink.session_token
                  }
                >
                  {summaryLoadingToken ===
                  analyticsModal.sessionLink.session_token
                    ? "Generating..."
                    : "Generate / Refresh AI Summary"}
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setAnalyticsModal(null);
                    setAnalyticsTab("summary");
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {customerAnalyticsSessionModal && (
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
                  {customerAnalyticsSessionModal.presentation_title ||
                    customerAnalyticsSessionModal.presentation_id ||
                    customerAnalyticsSessionModal.session_token}
                </p>
              </div>
              <button
                className="modal-close"
                onClick={() => {
                  setCustomerAnalyticsSessionModal(null);
                  setCustomerAnalyticsTab("summary");
                }}
              >
                ×
              </button>
            </div>

            <div className="modal-body" style={{ padding: "1rem 1.2rem" }}>
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
                    value: String(customerAnalyticsSessionModal.status || "-"),
                  },
                  {
                    label: "Presenter",
                    value: String(
                      customerAnalyticsSessionModal.presenter_name || "-",
                    ),
                  },
                  {
                    label: "Viewer",
                    value: String(
                      customerAnalyticsSessionModal.viewer_name ||
                        customerAnalyticsSnapshot.viewerName ||
                        "-",
                    ),
                  },
                  {
                    label: "Events",
                    value: String(
                      customerAnalyticsSessionModal.event_count ||
                        customerAnalyticsSessionModal.events?.length ||
                        0,
                    ),
                  },
                  {
                    label: "Feedback",
                    value: String(selectedCustomerSessionFeedback.length),
                  },
                  {
                    label: "Started",
                    value: formatDateTimeValue(
                      customerAnalyticsSessionModal.started_at ||
                        customerAnalyticsSessionModal.created_at,
                    ),
                  },
                  {
                    label: "Ended",
                    value: formatDateTimeValue(
                      customerAnalyticsSessionModal.ended_at,
                    ),
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
                    onClick={() => setCustomerAnalyticsTab(tab)}
                    style={{
                      padding: "0.45rem 1rem",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      border: "none",
                      borderBottom:
                        customerAnalyticsTab === tab
                          ? "2.5px solid var(--navy-700)"
                          : "2.5px solid transparent",
                      background: "transparent",
                      color:
                        customerAnalyticsTab === tab
                          ? "var(--navy-700)"
                          : "var(--color-text-muted)",
                      cursor: "pointer",
                      marginBottom: "-2px",
                    }}
                  >
                    {tab === "summary"
                      ? "Summary"
                      : tab === "events"
                        ? `Events (${selectedCustomerSessionEvents.length})`
                        : `Feedback (${selectedCustomerSessionFeedback.length})`}
                  </button>
                ))}
              </div>

              {customerAnalyticsTab === "summary" && (
                <>
                  {selectedCustomerAnalyticsSummary ? (
                    isMobileView ? (
                      <div style={{ display: "grid", gap: "0.55rem" }}>
                        {Object.entries(selectedCustomerAnalyticsSummary).map(
                          ([key, value], index) => (
                            <div
                              key={key}
                              style={{
                                border: "1px solid var(--slate-200)",
                                borderRadius: "8px",
                                background:
                                  index % 2 === 0 ? "#fff" : "#f8fafc",
                                padding: "0.55rem 0.65rem",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 700,
                                  color: "var(--navy-800)",
                                  marginBottom: "0.3rem",
                                  fontSize: "0.8rem",
                                }}
                              >
                                {prettifyKey(key)}
                              </div>
                              <div
                                style={{
                                  color: "var(--color-text-secondary)",
                                  lineHeight: 1.45,
                                }}
                              >
                                {renderSummaryValue(value, prettifyKey, true)}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <div>
                        <table
                          style={{
                            width: "100%",
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
                            {Object.entries(
                              selectedCustomerAnalyticsSummary,
                            ).map(([key, value], index) => (
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
                                    maxHeight: "200px",
                                    overflowY: "auto",
                                  }}
                                >
                                  {renderSummaryValue(
                                    value,
                                    prettifyKey,
                                    false,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : (
                    <div className="alert alert-info">
                      No customer-wise summary found for this session yet.
                    </div>
                  )}
                </>
              )}

              {customerAnalyticsTab === "events" && (
                <>
                  {selectedCustomerSessionEvents.length > 0 ? (
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
                        <thead
                          style={{ position: "sticky", top: 0, zIndex: 1 }}
                        >
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
                          {selectedCustomerSessionEvents.map((row, index) => (
                            <tr
                              key={row.id}
                              style={{
                                background:
                                  index % 2 === 0 ? "#fff" : "#f8fafc",
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
                  )}
                </>
              )}

              {customerAnalyticsTab === "feedback" && (
                <>
                  {selectedCustomerSessionFeedback.length > 0 ? (
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
                          {selectedCustomerSessionFeedback.map((row, index) => (
                            <tr
                              key={row.id}
                              style={{
                                background:
                                  index % 2 === 0 ? "#fff" : "#f8fafc",
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
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
