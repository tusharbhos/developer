// components/MeetingModal.tsx
"use client";

import React from "react";
import {
  Customer,
  CustomerSessionLink,
  CustomerSessionLinkAPI,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { format12HourTime, formatDisplayDate } from "@/lib/dateTime";
import PreSiteVisitModal from "@/components/PreSiteVisitModal";

export interface MeetingEntry {
  customer: Customer;
  meeting_date: string;
  meeting_time: string;
  project_name: string;
  created_by_name?: string;
  assigned_to_user_name?: string;
  updated_by_name?: string;
}

function fmt12(t: string) {
  return format12HourTime(t);
}

function InfoRow({
  icon,
  label,
  val,
}: {
  icon: string;
  label: string;
  val: string;
}) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
      <span style={{ fontSize: "0.9rem", flexShrink: 0, marginTop: 1 }}>
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: "0.68rem",
            color: "var(--color-text-muted)",
            fontWeight: 600,
            margin: 0,
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontSize: "0.85rem",
            fontWeight: 500,
            margin: 0,
            wordBreak: "break-word",
          }}
        >
          {val}
        </p>
      </div>
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

export default function MeetingModal({
  entry,
  onClose,
}: {
  entry: MeetingEntry;
  onClose: () => void;
}) {
  const { customer } = entry;
  const { user } = useAuth();
  const restrictedRoles = new Set<string>([]);
  const isRestrictedRole = Boolean(
    user?.role && restrictedRoles.has(user.role),
  );
  const [manualPhone, setManualPhone] = React.useState(customer.phone ?? "");
  const [manualEmail, setManualEmail] = React.useState(customer.email ?? "");
  const [showPhoneInput, setShowPhoneInput] = React.useState(false);
  const [showEmailInput, setShowEmailInput] = React.useState(false);
  const [actionMsg, setActionMsg] = React.useState("");
  const [sessionLink, setSessionLink] =
    React.useState<CustomerSessionLink | null>(null);
  const [sessionLinkLoading, setSessionLinkLoading] = React.useState(false);
  const [copied, setCopied] = React.useState<
    "presenter" | "viewer" | "self" | null
  >(null);
  const [showCreateSession, setShowCreateSession] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setSessionLink(null);
    setSessionLinkLoading(true);

    CustomerSessionLinkAPI.byCustomer(
      customer.id,
      entry.project_name || undefined,
    )
      .then((res) => {
        if (!active) return;
        const latest = (res.data || [])[0];
        setSessionLink(latest || null);
      })
      .catch(() => {
        if (!active) return;
        setSessionLink(null);
      })
      .finally(() => {
        if (active) setSessionLinkLoading(false);
      });

    return () => {
      active = false;
    };
  }, [customer.id, entry.project_name]);

  const viewerLink = sessionLink?.viewer_link || "";
  const presenterLink = sessionLink?.presenter_link || "";
  const selfViewLink = sessionLink?.self_view_url || "";

  /* ── sender signature from logged-in user ── */
  const senderName = user?.name ?? "";
  const companyName = user?.company_name ?? "";

  /* signature lines:
     - if both exist  → "Rahul Sharma\nChannelPartner.Network"
     - if only name   → "Rahul Sharma"
     - if only company→ "ChannelPartner.Network"
     - if neither     → "ChannelPartner.Network"  (fallback)            */
  const signatureLines =
    [senderName, companyName].filter(Boolean).join("\n") ||
    "ChannelPartner.Network";

  const STATUS_STYLE: Record<
    string,
    { bg: string; text: string; dot: string }
  > = {
    active: { bg: "#dcfce7", text: "#16a34a", dot: "#16a34a" },
    inactive: { bg: "#f1f5f9", text: "#64748b", dot: "#94a3b8" },
    Booked: { bg: "#f3e8ff", text: "#9333ea", dot: "#9333ea" },
  };
  const sc = STATUS_STYLE[customer.status] ?? STATUS_STYLE.active;

  const formattedDate = formatDisplayDate(entry.meeting_date);
  const formattedTime = fmt12(entry.meeting_time);

  /* ── email subject + body ── */
  const emailSubject = `Meeting Confirmation — ${entry.project_name || "Your Project"}`;
  const emailBody = [
    `Dear ${customer.name || customer.nickname},`,
    ``,
    `Your meeting has been scheduled:`,
    ``,
    `Project : ${entry.project_name || "—"}`,
    `Date    : ${formattedDate}`,
    `Time    : ${formattedTime || "—"}`,
    ...(viewerLink ? [`👁 Viewer Link: ${viewerLink}`, ``] : []),
    ``,
    `Please feel free to reach out if you have any questions.`,
    ``,
    `Regards,`,
    signatureLines,
  ].join("\n");

  /* ── WhatsApp message ── */
  const waMsg = [
    `Hello ${customer.name || customer.nickname},`,
    ``,
    `Your meeting has been scheduled:`,
    `📋 Project : ${entry.project_name || "—"}`,
    `📅 Date    : ${formattedDate}`,
    `🕐 Time    : ${formattedTime || "—"}`,
    ...(viewerLink ? [`🔗 Session Link: ${viewerLink}`] : []),
    ``,
    `Regards,`,
    signatureLines,
  ].join("\n");

  const normalizePhone = (v: string): string => {
    const d = v.replace(/\D/g, "");
    if (d.length === 10) return `91${d}`;
    if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
    return d;
  };

  const currentPhone = normalizePhone(manualPhone || customer.phone || "");
  const currentEmail = (manualEmail || customer.email || "").trim();
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentEmail);

  /* ── handlers ── */
  const handleWhatsApp = () => {
    if (currentPhone.length >= 10) {
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${currentPhone}&text=${encodeURIComponent(waMsg)}`;
      const isAppleDevice = /iPad|iPhone|iPod|Macintosh/i.test(
        typeof navigator !== "undefined" ? navigator.userAgent : "",
      );

      if (isAppleDevice) {
        window.location.href = whatsappUrl;
      } else {
        window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    setShowPhoneInput(true);
    setActionMsg("Add 10-digit mobile number to send WhatsApp message.");
    setTimeout(() => setActionMsg(""), 2200);
  };

  const handleEmail = () => {
    if (!emailIsValid) {
      setShowEmailInput(true);
      setActionMsg("Add valid email to open Gmail compose.");
      setTimeout(() => setActionMsg(""), 2200);
      return;
    }

    const params = new URLSearchParams({
      view: "cm",
      fs: "1",
      su: emailSubject,
      body: emailBody,
    });
    params.set("to", currentEmail);

    window.open(`https://mail.google.com/mail/?${params.toString()}`, "_blank");
  };

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          background: "rgba(6,14,26,0.72)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          animation: "mmFadeIn 0.2s ease-out",
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
            animation: "mmSlideUp 0.3s cubic-bezier(0.32,0.72,0,1)",
          }}
        >
          {/* drag handle */}
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

          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.85rem 1.2rem",
              background: "linear-gradient(135deg,#0a1628,#163258,#1e4580)",
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
                {customer.nickname}
              </p>
              <span
                className="secret-code"
                style={{
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  borderColor: "rgba(255,255,255,0.2)",
                }}
              >
                {customer.secret_code}
              </span>
            </div>
            <CloseBtn onClose={onClose} />
          </div>

          {/* Body */}
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
            {/* Status */}
            <span
              className="badge"
              style={{ background: sc.bg, color: sc.text }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: sc.dot,
                }}
              />
              {customer.status.charAt(0).toUpperCase() +
                customer.status.slice(1)}
            </span>

            {/* Meeting card */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.85rem",
                borderRadius: "var(--radius-lg)",
                background:
                  "linear-gradient(135deg,rgba(30,69,128,0.07),rgba(249,115,22,0.05))",
                border: "1px solid rgba(30,69,128,0.14)",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: "var(--radius-lg)",
                  flexShrink: 0,
                  background: "linear-gradient(135deg,#1e4580,#0f2240)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="white"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
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
                  Meeting
                </p>
                <p
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: "var(--navy-900)",
                    margin: 0,
                  }}
                >
                  {formattedDate}
                </p>
                {entry.meeting_time && (
                  <p
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "var(--orange-600)",
                      margin: 0,
                    }}
                  >
                    🕐 {formattedTime}
                  </p>
                )}
              </div>
            </div>

            {/* Info rows */}
            {entry.project_name && (
              <InfoRow icon="🏠" label="Project" val={entry.project_name} />
            )}
            {entry.created_by_name && (
              <InfoRow
                icon="🧑"
                label="Created By"
                val={entry.created_by_name}
              />
            )}
            {entry.assigned_to_user_name && (
              <InfoRow
                icon="🎯"
                label="Assigned To"
                val={entry.assigned_to_user_name}
              />
            )}
            {entry.updated_by_name && (
              <InfoRow
                icon="✏️"
                label="Last Updated By"
                val={entry.updated_by_name}
              />
            )}
            {customer.name && (
              <InfoRow icon="👤" label="Name" val={customer.name} />
            )}
            {customer.phone && (
              <InfoRow icon="📞" label="Phone" val={customer.phone} />
            )}
            {customer.email && (
              <InfoRow icon="✉️" label="Email" val={customer.email} />
            )}
            {customer.address && (
              <InfoRow icon="📍" label="Address" val={customer.address} />
            )}
            {customer.notes && (
              <div
                style={{
                  padding: "0.75rem",
                  borderRadius: "var(--radius-md)",
                  background: "var(--slate-50)",
                  border: "1px solid var(--slate-200)",
                  fontSize: "0.8rem",
                  fontStyle: "italic",
                  color: "var(--color-text-secondary)",
                }}
              >
                📝 "{customer.notes}"
              </div>
            )}

            {sessionLink && (presenterLink || viewerLink || selfViewLink) ? (
              <div
                style={{
                  padding: "0.95rem",
                  borderRadius: "var(--radius-lg)",
                  background:
                    "linear-gradient(135deg,rgba(59,130,246,0.08),rgba(30,144,255,0.05))",
                  border: "2px solid rgba(59,130,246,0.28)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: "#1e40af",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "0.6rem",
                  }}
                >
                  📍 Session Links (Blue Box)
                </p>

                {presenterLink && (
                  <div style={{ marginBottom: "0.75rem" }}>
                    <p
                      style={{
                        margin: "0 0 4px",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        color: "#1e40af",
                      }}
                    >
                      🎤 Presenter Link
                    </p>
                    <p
                      style={{
                        margin: "0 0 6px",
                        fontSize: "0.75rem",
                        color: "#475569",
                        wordBreak: "break-all",
                        fontFamily: "monospace",
                      }}
                    >
                      {presenterLink.slice(0, 50)}...
                    </p>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button
                        className="btn btn-ghost"
                        style={{
                          padding: "0.3rem 0.5rem",
                          fontSize: "0.68rem",
                        }}
                        onClick={() => {
                          navigator.clipboard.writeText(presenterLink);
                          setCopied("presenter");
                          setTimeout(() => setCopied(null), 1600);
                        }}
                      >
                        {copied === "presenter" ? "✓ Copied!" : "Copy"}
                      </button>
                      <button
                        className="btn btn-gold"
                        style={{
                          padding: "0.3rem 0.5rem",
                          fontSize: "0.68rem",
                        }}
                        onClick={() => window.open(presenterLink, "_blank")}
                      >
                        Open ↗
                      </button>
                    </div>
                  </div>
                )}

                {viewerLink && (
                  <div>
                    <p
                      style={{
                        margin: "0 0 4px",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        color: "#15803d",
                      }}
                    >
                      👁 Viewer Link (for Customer)
                    </p>
                    <p
                      style={{
                        margin: "0 0 6px",
                        fontSize: "0.75rem",
                        color: "#475569",
                        wordBreak: "break-all",
                        fontFamily: "monospace",
                        padding: "0.5rem",
                        background: "rgba(22,163,74,0.08)",
                        borderRadius: "4px",
                        border: "1px solid rgba(22,163,74,0.2)",
                      }}
                    >
                      {viewerLink}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.4rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        className="btn btn-ghost"
                        style={{
                          padding: "0.3rem 0.5rem",
                          fontSize: "0.68rem",
                        }}
                        onClick={() => {
                          navigator.clipboard.writeText(viewerLink);
                          setCopied("viewer");
                          setTimeout(() => setCopied(null), 1600);
                        }}
                      >
                        {copied === "viewer" ? "✓ Copied!" : "📋 Copy"}
                      </button>
                      <button
                        className="btn btn-gold"
                        style={{
                          padding: "0.3rem 0.5rem",
                          fontSize: "0.68rem",
                        }}
                        onClick={() => window.open(viewerLink, "_blank")}
                      >
                        Open ↗
                      </button>
                    </div>
                  </div>
                )}

                {selfViewLink && (
                  <div style={{ marginTop: "0.75rem" }}>
                    <p
                      style={{
                        margin: "0 0 4px",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        color: "#1d4ed8",
                      }}
                    >
                      🧭 Self-View Link
                    </p>
                    <p
                      style={{
                        margin: "0 0 6px",
                        fontSize: "0.75rem",
                        color: "#475569",
                        wordBreak: "break-all",
                        fontFamily: "monospace",
                        padding: "0.5rem",
                        background: "rgba(59,130,246,0.08)",
                        borderRadius: "4px",
                        border: "1px solid rgba(59,130,246,0.2)",
                      }}
                    >
                      {selfViewLink}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.4rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        className="btn btn-ghost"
                        style={{
                          padding: "0.3rem 0.5rem",
                          fontSize: "0.68rem",
                        }}
                        onClick={() => {
                          navigator.clipboard.writeText(selfViewLink);
                          setCopied("self");
                          setTimeout(() => setCopied(null), 1600);
                        }}
                      >
                        {copied === "self" ? "✓ Copied!" : "📋 Copy"}
                      </button>
                      <button
                        className="btn btn-gold"
                        style={{
                          padding: "0.3rem 0.5rem",
                          fontSize: "0.68rem",
                        }}
                        onClick={() => window.open(selfViewLink, "_blank")}
                      >
                        Open ↗
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : sessionLinkLoading ? (
              <div
                style={{
                  padding: "0.75rem",
                  textAlign: "center",
                  fontSize: "0.8rem",
                  color: "var(--color-text-muted)",
                }}
              >
                Loading session links...
              </div>
            ) : (
              <div
                style={{
                  padding: "0.75rem",
                  borderRadius: "var(--radius-md)",
                  background: "var(--slate-50)",
                  border: "1px solid var(--slate-200)",
                  fontSize: "0.8rem",
                  color: "var(--color-text-muted)",
                  textAlign: "center",
                }}
              >
                <p style={{ margin: "0 0 0.6rem" }}>
                  🔗 No session links created yet.
                </p>
                {!isRestrictedRole && (
                  <button
                    className="btn btn-primary"
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      fontSize: "0.74rem",
                      lineHeight: 1.3,
                      padding: "0.5rem 0.7rem",
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                      textAlign: "center",
                    }}
                    onClick={() => setShowCreateSession(true)}
                  >
                    + Schedule Pre-Site Visit Matchmaking Session
                  </button>
                )}
              </div>
            )}

            {/* Action buttons */}
            {!isRestrictedRole && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.6rem",
                }}
              >
                {/* WhatsApp */}
                <button
                  onClick={handleWhatsApp}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                    background: "#25d366",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    padding: "0.7rem 0.5rem",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(37,211,102,0.28)",
                    transition: "opacity 0.15s, transform 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "0.88";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <svg
                      width="16"
                      height="16"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 2C6.48 2 2 6.48 2 12c0 2.108.576 4.082 1.579 5.79L2 22l4.21-1.579A9.93 9.93 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" />
                    </svg>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                      WhatsApp
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.62rem",
                      opacity: 0.85,
                      textAlign: "center",
                      lineHeight: 1.3,
                    }}
                  >
                    {currentPhone.length === 10
                      ? currentPhone
                      : "Add mobile number first"}
                  </span>
                </button>

                {/* Gmail */}
                <button
                  onClick={handleEmail}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                    background: "#ea4335",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    padding: "0.7rem 0.5rem",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(234,67,53,0.28)",
                    transition: "opacity 0.15s, transform 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "0.88";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
                    </svg>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                      Gmail
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.62rem",
                      opacity: 0.85,
                      textAlign: "center",
                      lineHeight: 1.3,
                    }}
                  >
                    {emailIsValid ? currentEmail : "Add email first"}
                  </span>
                </button>
              </div>
            )}

            {!isRestrictedRole && (showPhoneInput || !customer.phone) && (
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                }}
              >
                <input
                  value={manualPhone}
                  onChange={(e) =>
                    setManualPhone(
                      e.target.value.replace(/\D/g, "").slice(0, 12),
                    )
                  }
                  placeholder="Add mobile no (10 digits)"
                  style={{
                    flex: 1,
                    border: "1px solid var(--slate-200)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.55rem 0.65rem",
                    fontSize: "0.8rem",
                  }}
                />
                <button
                  onClick={handleWhatsApp}
                  className="btn btn-primary"
                  style={{ padding: "0.5rem 0.7rem", fontSize: "0.74rem" }}
                >
                  Send
                </button>
              </div>
            )}

            {!isRestrictedRole && (showEmailInput || !customer.email) && (
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                }}
              >
                <input
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="Add email"
                  style={{
                    flex: 1,
                    border: "1px solid var(--slate-200)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.55rem 0.65rem",
                    fontSize: "0.8rem",
                  }}
                />
                <button
                  onClick={handleEmail}
                  className="btn btn-primary"
                  style={{ padding: "0.5rem 0.7rem", fontSize: "0.74rem" }}
                >
                  Send
                </button>
              </div>
            )}

            {!isRestrictedRole && actionMsg && (
              <div
                style={{
                  padding: "0.52rem 0.65rem",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(30,69,128,0.08)",
                  border: "1px solid rgba(30,69,128,0.2)",
                  fontSize: "0.74rem",
                  color: "var(--navy-700)",
                }}
              >
                {actionMsg}
              </div>
            )}

            {/* hint when no contact saved */}
            {!isRestrictedRole && !customer.phone && !customer.email && (
              <div
                style={{
                  padding: "0.6rem 0.85rem",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(249,115,22,0.08)",
                  border: "1px solid rgba(249,115,22,0.22)",
                  fontSize: "0.74rem",
                  color: "var(--orange-700)",
                  display: "flex",
                  gap: 6,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: "0.85rem", flexShrink: 0 }}>💡</span>
                <span>
                  No phone or email saved. Add mobile or email first, then send
                  directly.
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
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
        </div>
      </div>

      <style>{`
        @keyframes mmSlideUp { from { transform: translateY(100%); opacity: 0.6; } to { transform: translateY(0); opacity: 1; } }
        @keyframes mmFadeIn  { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {showCreateSession && (
        <PreSiteVisitModal
          isOpen={showCreateSession}
          onClose={() => setShowCreateSession(false)}
          projectName={entry.project_name || undefined}
          initialDate={entry.meeting_date}
          initialTime={entry.meeting_time || undefined}
          initialCustomer={customer}
          onScheduled={() => {
            setShowCreateSession(false);
            // re-fetch session link
            setSessionLinkLoading(true);
            CustomerSessionLinkAPI.byCustomer(
              customer.id,
              entry.project_name || undefined,
            )
              .then((res) => setSessionLink((res.data || [])[0] || null))
              .catch(() => setSessionLink(null))
              .finally(() => setSessionLinkLoading(false));
          }}
        />
      )}
    </>
  );
}
