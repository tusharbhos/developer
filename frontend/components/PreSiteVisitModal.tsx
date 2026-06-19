// components/PreSiteVisitModal.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiUser,
  Customer,
  CustomerAPI,
  CustomerSessionLink,
  CustomerSessionLinkAPI,
} from "@/lib/api";
import { format12HourTime, formatDisplayDate } from "@/lib/dateTime";
import { useAuth } from "@/context/AuthContext";
import {
  ApiProject,
  getProjectPresentationId,
  normalize,
} from "@/lib/conectr";
import AddCustomerModal from "./AddCustomerModal";

/* ── PRS mapping (same as CustomerSessionLinkModal)  ─────────────────────── */
function makePresenterId(user?: ApiUser | null): string {
  if (!user) return "";
  if (user.unique_key) return user.unique_key;
  return `SP-${String(user.id).padStart(3, "0")}`;
}

/* ── Time slots 7:00 AM – 10:00 PM every 30 min ─────────────────────────── */
const TIME_SLOTS = Array.from({ length: 31 }, (_, i) => {
  const mins = 7 * 60 + i * 30;
  const h = Math.floor(mins / 60),
    m = mins % 60;
  const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { val, label: format12HourTime(val) };
});

/* ── Date options – next 30 days ─────────────────────────────────────────── */
const DATE_OPTIONS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  const val = d.toISOString().split("T")[0];
  return { val, label: formatDisplayDate(val) };
});

type Step = "setup" | "generating" | "done";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  project?: ApiProject | null;
  projectOptions?: Array<string | ApiProject>;
  initialDate?: string;
  initialTime?: string;
  initialCustomer?: Customer;
  loadingProjectOptions?: boolean;
  onScheduled: () => void;
}

export default function PreSiteVisitModal({
  isOpen,
  onClose,
  projectName,
  project,
  projectOptions = [],
  initialDate,
  initialTime,
  initialCustomer,
  loadingProjectOptions = false,
  onScheduled,
}: Props) {
  const { user } = useAuth();
  const normalizedProjectOptions = useMemo(
    () =>
      Array.from(
        new Set(
          projectOptions
            .map((option) =>
              typeof option === "string" ? option.trim() : normalize(option.title),
            )
            .filter(Boolean),
        ),
      ),
    [projectOptions],
  );
  const projectByName = useMemo(() => {
    const map = new Map<string, ApiProject>();
    projectOptions.forEach((option) => {
      if (typeof option === "string") return;
      const key = normalize(option.title).toLowerCase();
      if (key) map.set(key, option);
    });
    if (project) {
      const key = normalize(project.title).toLowerCase();
      if (key) map.set(key, project);
    }
    return map;
  }, [projectOptions, project]);
  const dateOptions = useMemo(() => {
    const options = [...DATE_OPTIONS];
    if (initialDate && !options.some((option) => option.val === initialDate)) {
      options.unshift({
        val: initialDate,
        label: formatDisplayDate(initialDate),
      });
    }
    return options;
  }, [initialDate]);
  const fixedProjectName = projectName?.trim() ?? "";
  const allowProjectSelection = !fixedProjectName;
  const defaultTime = initialTime || TIME_SLOTS[4]?.val || "";

  /* ── Data ───────────────────────────────────────────────────────────────── */
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  /* ── Form ───────────────────────────────────────────────────────────────── */
  const [date, setDate] = useState(initialDate || DATE_OPTIONS[0]?.val || "");
  const [time, setTime] = useState(defaultTime);
  const [selectedProject, setSelectedProject] = useState(
    fixedProjectName || normalizedProjectOptions[0] || "",
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    initialCustomer ?? null,
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* ── Presenter ──────────────────────────────────────────────────────────── */
  const presenterName = user?.name ?? "";
  const presenterEmail = user?.email ?? "";
  const presenterPlatformId = makePresenterId(user);

  /* ── Step / result ──────────────────────────────────────────────────────── */
  const [step, setStep] = useState<Step>("setup");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [createdLink, setCreatedLink] = useState<CustomerSessionLink | null>(
    null,
  );

  /* ── Add Customer Modal ──────────────────────────────────────────────────── */
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  /* ── WhatsApp share sub-modal ───────────────────────────────────────────── */
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [waPhone, setWaPhone] = useState("");
  const [copied, setCopied] = useState<"presenter" | "viewer" | "self" | null>(
    null,
  );
  const resolvedProjectName = (fixedProjectName || selectedProject).trim();
  const resolvedProject =
    projectByName.get(normalize(resolvedProjectName).toLowerCase()) ||
    project ||
    null;
  const canGenerate = Boolean(
    selectedCustomer && date && time && resolvedProjectName,
  );

  /* ── Filtered customers ──────────────────────────────────────────────────── */
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.name || c.nickname || "").toLowerCase().includes(q) ||
        (c.secret_code || "").toLowerCase().includes(q),
    );
  }, [customers, customerSearch]);

  /* ── Load customers on open ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;
    setLoadingCustomers(true);
    CustomerAPI.list()
      .then((r) => setCustomers(r.data))
      .catch(() => setCustomers([]))
      .finally(() => setLoadingCustomers(false));
  }, [isOpen]);

  /* ── Reset on close ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (isOpen) return;
    setStep("setup");
    setError("");
    setWarning("");
    setCreatedLink(null);
    setDate(initialDate || DATE_OPTIONS[0]?.val || "");
    setTime(defaultTime);
    setSelectedProject(fixedProjectName || normalizedProjectOptions[0] || "");
    setSelectedCustomer(initialCustomer ?? null);
    setCustomerSearch("");
    setDropdownOpen(false);
    setShowAddCustomer(false);
    setShowWhatsApp(false);
    setWaPhone("");
    setCopied(null);
  }, [
    isOpen,
    defaultTime,
    fixedProjectName,
    initialDate,
    initialTime,
    normalizedProjectOptions,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    setDate(initialDate || DATE_OPTIONS[0]?.val || "");
  }, [initialDate, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setTime(defaultTime);
  }, [defaultTime, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedProject(fixedProjectName || normalizedProjectOptions[0] || "");
  }, [fixedProjectName, isOpen, normalizedProjectOptions]);

  /* ── Close dropdown on outside click ────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Handle customer added from AddCustomerModal ──────────────────────── */
  const handleCustomerAdded = (customer: Customer) => {
    setCustomers((prev) => [customer, ...prev]);
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name || customer.nickname);
    setDropdownOpen(false);
    setShowAddCustomer(false);
  };

  /* ── Generate session link ───────────────────────────────────────────────── */
  const handleGenerate = async () => {
    setError("");
    setWarning("");
    if (!selectedCustomer) {
      setError("Please select a customer.");
      return;
    }
    if (!resolvedProjectName) {
      setError("Please select a project.");
      return;
    }
    if (!date) {
      setError("Please select a date.");
      return;
    }
    if (!time) {
      setError("Please select a time.");
      return;
    }

    const todayStr = new Date().toISOString().split("T")[0];
    if (date < todayStr) {
      setError("Please select today or a future date.");
      return;
    }

    const presentationId = getProjectPresentationId(resolvedProject);
    if (!presentationId) {
      setError(
        `No ConectR presentation code found for "${resolvedProjectName}". Please add a conectr.co website showcase link in ConectR.`,
      );
      return;
    }

    setStep("generating");
    let nextCreatedLink: CustomerSessionLink | null = null;

    try {
      const linkRes = await CustomerSessionLinkAPI.create({
        customer_id: selectedCustomer.id,
        project_name: resolvedProjectName,
        presentation_id: presentationId,
        presenter_name: presenterName,
        presenter_email: presenterEmail || undefined,
        presenter_id: presenterPlatformId || undefined,
        viewer_name:
          selectedCustomer.name || selectedCustomer.nickname || "Viewer",
        viewer_email: selectedCustomer.email || undefined,
        viewer_phone: selectedCustomer.phone || undefined,
        viewer_id: selectedCustomer.secret_code || undefined,
        meeting_date: date,
        meeting_time: time,
      });
      nextCreatedLink = linkRes.data;
      setCreatedLink(linkRes.data);

      setStep("done");
      onScheduled();
    } catch (e: unknown) {
      const message =
        (e as { message?: string }).message ||
        "Failed to generate session link.";

      if (nextCreatedLink) {
        setCreatedLink(nextCreatedLink);
        setWarning(
          `Session link created, but calendar booking failed. ${message}`,
        );
        setStep("done");
        return;
      }

      setError(message);
      setStep("setup");
    }
  };

  /* ── Copy helper ─────────────────────────────────────────────────────────── */
  const copy = (text: string, which: "presenter" | "viewer" | "self") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    });
  };

  /* ── WhatsApp share ──────────────────────────────────────────────────────── */
  const sendWhatsApp = () => {
    if (!createdLink) return;
    const phone = waPhone.replace(/\D/g, "");
    const msg = encodeURIComponent(
      `Hi! Here is your Pre-Site Visit Matchmaking Session link for *${resolvedProjectName}*.\n\n` +
        `📅 Date: ${formatDisplayDate(date)}  ⏰ Time: ${format12HourTime(time)}\n\n` +
        `🔗 Your Viewer Link:\n${createdLink.viewer_link_with_phone || createdLink.viewer_link}\n\n` +
        `${createdLink.self_view_url || createdLink.self_view_url_with_phone ? `🧭 Self View Link:\n${createdLink.self_view_url_with_phone || createdLink.self_view_url}\n\n` : ""}` +
        `Click the link to join the session. See you there!`,
    );
    const url = phone
      ? `https://wa.me/${phone}?text=${msg}`
      : `https://wa.me?text=${msg}`;
    window.open(url, "_blank");
    setShowWhatsApp(false);
  };

  const sendEmail = () => {
    if (!createdLink) return;
    const subject = encodeURIComponent(
      `Pre-Site Visit Session Invitation – ${resolvedProjectName}`,
    );
    const body = encodeURIComponent(
      `Hi,\n\nYou are invited to a Pre-Site Visit Matchmaking Session for ${resolvedProjectName}.\n\n` +
        `Date: ${formatDisplayDate(date)}\nTime: ${format12HourTime(time)}\n\n` +
        `Your Viewer Link: ${createdLink.viewer_link_with_phone || createdLink.viewer_link}\n` +
        `${createdLink.self_view_url || createdLink.self_view_url_with_phone ? `Self View Link: ${createdLink.self_view_url_with_phone || createdLink.self_view_url}\n` : ""}` +
        `\nLooking forward to seeing you!`,
    );
    const email = selectedCustomer?.email ?? "";
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_self");
  };

  if (!isOpen) return null;

  return (
    <>
      {/* ── Main Modal ─────────────────────────────────────────────────────── */}
      <div className="modal-overlay" style={{ zIndex: 10000 }}>
        <div
          className="modal-box"
          style={{
            maxWidth: "42rem",
            width: "min(42rem, calc(100% - 1.2rem))",
            zIndex: 10001,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="modal-header">
            <div>
              <p className="modal-title">
                📍 Pre-Site Visit Matchmaking Session
              </p>
              <p className="modal-subtitle" style={{ fontWeight: 600 }}>
                {resolvedProjectName || "Choose project, customer, and time"}
              </p>
            </div>
            <button className="modal-close" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="modal-body">
            {error && <div className="alert alert-danger mb-3">{error}</div>}

            {/* ── STEP: SETUP ───────────────────────────────────────────── */}
            {step === "setup" && (
              <>
                {allowProjectSelection && (
                  <div
                    className="card p-3 mb-3"
                    style={{ borderRadius: "var(--radius-lg)" }}
                  >
                    <p
                      className="text-sm font-bold mb-2"
                      style={{ color: "var(--navy-700)" }}
                    >
                      🏠 Project / Presentation
                    </p>
                    <label className="label">Project *</label>
                    {loadingProjectOptions ? (
                      <div className="flex justify-center py-4">
                        <div className="spinner" />
                      </div>
                    ) : (
                      <select
                        className="input-field"
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                      >
                        <option value="">Select a project</option>
                        {normalizedProjectOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Date & Time */}
                <div
                  className="card p-3 mb-3"
                  style={{ borderRadius: "var(--radius-lg)" }}
                >
                  <p
                    className="text-sm font-bold mb-2"
                    style={{ color: "var(--navy-700)" }}
                  >
                    📅 Session Date & Time
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Date *</label>
                      <select
                        className="input-field"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      >
                        {dateOptions.map((d) => (
                          <option key={d.val} value={d.val}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Time *</label>
                      <select
                        className="input-field"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                      >
                        {TIME_SLOTS.map((t) => (
                          <option key={t.val} value={t.val}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Presenter info */}
                <div
                  className="card p-3 mb-3"
                  style={{ borderRadius: "var(--radius-lg)" }}
                >
                  <p
                    className="text-sm font-bold mb-2"
                    style={{ color: "var(--navy-700)" }}
                  >
                    🎤 Presenter (You)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="label">Name</label>
                      <input
                        className="input-field"
                        value={presenterName}
                        readOnly
                      />
                    </div>
                    <div>
                      <label className="label">ID</label>
                      <input
                        className="input-field"
                        value={presenterPlatformId}
                        readOnly
                      />
                    </div>
                    <div>
                      <label className="label">Email</label>
                      <input
                        className="input-field"
                        value={presenterEmail}
                        readOnly
                      />
                    </div>
                  </div>
                </div>

                {/* Customer selection */}
                <div
                  className="card p-3 mb-4"
                  style={{ borderRadius: "var(--radius-lg)" }}
                >
                  <p
                    className="text-sm font-bold mb-2"
                    style={{ color: "var(--green-700)" }}
                  >
                    👤 Viewer / Customer
                  </p>

                  {loadingCustomers ? (
                    <div className="flex justify-center py-4">
                      <div className="spinner" />
                    </div>
                  ) : (
                    <div ref={dropdownRef} style={{ position: "relative" }}>
                      <label className="label">Search Customer *</label>
                      <input
                        className="input-field"
                        placeholder="Type name or secret code..."
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setSelectedCustomer(null);
                          setDropdownOpen(true);
                        }}
                        onFocus={() => setDropdownOpen(true)}
                      />

                      {/* Dropdown */}
                      {dropdownOpen && (
                        <div
                          style={{
                            marginTop: "0.5rem",
                            background: "#fff",
                            border: "1px solid var(--slate-200)",
                            borderRadius: "var(--radius-md)",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                            maxHeight: "13rem",
                            overflowY: "auto",
                          }}
                        >
                          {filteredCustomers.length === 0 ? (
                            <div
                              className="p-3 text-sm"
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              No customers found.
                              <button
                                className="btn btn-primary mt-2 w-full"
                                style={{ fontSize: "0.78rem" }}
                                onClick={() => {
                                  setDropdownOpen(false);
                                  setShowAddCustomer(true);
                                }}
                              >
                                + Create New Customer
                              </button>
                            </div>
                          ) : (
                            <>
                              {filteredCustomers.map((c) => (
                                <button
                                  key={c.id}
                                  className="w-full text-left px-3 py-2"
                                  style={{
                                    borderBottom: "1px solid var(--slate-100)",
                                    background:
                                      selectedCustomer?.id === c.id
                                        ? "var(--navy-50)"
                                        : "transparent",
                                    cursor: "pointer",
                                    fontSize: "0.85rem",
                                  }}
                                  onClick={() => {
                                    setSelectedCustomer(c);
                                    setCustomerSearch(
                                      c.name ||
                                        c.nickname ||
                                        c.secret_code ||
                                        "",
                                    );
                                    setDropdownOpen(false);
                                  }}
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm">
                                      {c.name || c.nickname || "—"}
                                    </span>
                                    <span
                                      className="text-xs font-mono"
                                      style={{
                                        color: "var(--navy-700)",
                                        background: "var(--navy-50)",
                                        borderRadius: 4,
                                        padding: "1px 6px",
                                        border: "1px solid var(--navy-100)",
                                      }}
                                    >
                                      {c.secret_code}
                                    </span>
                                    {c.phone && (
                                      <span
                                        className="text-xs"
                                        style={{
                                          color: "var(--color-text-muted)",
                                        }}
                                      >
                                        {c.phone}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              ))}
                              {/* Create new at bottom */}
                              <button
                                className="w-full px-3 py-2 text-sm font-bold"
                                style={{
                                  color: "var(--navy-700)",
                                  borderTop: "2px solid var(--slate-200)",
                                }}
                                onClick={() => {
                                  setDropdownOpen(false);
                                  setShowAddCustomer(true);
                                }}
                              >
                                + Create New Customer
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected customer chip */}
                  {selectedCustomer && (
                    <div
                      className="mt-2 flex items-center gap-2 p-2 rounded-lg"
                      style={{
                        background: "rgba(22,163,74,0.08)",
                        border: "1px solid #bbf7d0",
                      }}
                    >
                      <span
                        className="text-sm font-semibold"
                        style={{ color: "var(--green-700)" }}
                      >
                        ✓ {selectedCustomer.name || selectedCustomer.nickname}
                      </span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: "#d1fae5", color: "#065f46" }}
                      >
                        {selectedCustomer.secret_code}
                      </span>
                      {selectedCustomer.phone && (
                        <span
                          className="text-xs"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          📞 {selectedCustomer.phone}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Summary before generate */}
                {selectedCustomer && date && time && (
                  <div
                    className="p-3 mb-3 rounded-xl text-sm"
                    style={{
                      background: "var(--navy-50)",
                      border: "1px solid var(--navy-100)",
                    }}
                  >
                    <p
                      className="font-bold mb-1"
                      style={{ color: "var(--navy-700)" }}
                    >
                      Session Summary
                    </p>
                    <p>
                      📋 Project: <strong>{resolvedProjectName}</strong>
                    </p>
                    <p>
                      📅 {formatDisplayDate(date)} at {format12HourTime(time)}
                    </p>
                    <p>
                      👤 Viewer:{" "}
                      <strong>
                        {selectedCustomer.name || selectedCustomer.nickname}
                      </strong>{" "}
                      ({selectedCustomer.secret_code})
                    </p>
                    <p>
                      🎤 Presenter: <strong>{presenterName}</strong>
                    </p>
                  </div>
                )}

                <button
                  className="btn btn-primary w-full mt-1"
                  style={{
                    background: "#020617",
                    color: "#fff",
                    fontSize: "0.95rem",
                    padding: "0.7rem",
                  }}
                  onClick={handleGenerate}
                  disabled={!canGenerate || loadingProjectOptions}
                >
                  🔗 Generate Session Links
                </button>
              </>
            )}

            {/* ── STEP: GENERATING ─────────────────────────────────────────── */}
            {step === "generating" && (
              <div className="flex flex-col items-center py-10 gap-3">
                <div className="spinner" style={{ width: 40, height: 40 }} />
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--navy-700)" }}
                >
                  Generating session links…
                </p>
              </div>
            )}

            {/* ── STEP: DONE ───────────────────────────────────────────────── */}
            {step === "done" && createdLink && (
              <>
                {/* Success banner */}
                <div
                  className="flex items-center gap-2 p-3 rounded-xl mb-4"
                  style={{
                    background: warning
                      ? "rgba(249,115,22,0.08)"
                      : "rgba(22,163,74,0.08)",
                    border: warning
                      ? "1px solid rgba(249,115,22,0.28)"
                      : "1px solid #bbf7d0",
                  }}
                >
                  <span style={{ fontSize: "1.4rem" }}>
                    {warning ? "⚠️" : "✅"}
                  </span>
                  <div>
                    <p
                      className="font-bold text-sm"
                      style={{ color: warning ? "#c2410c" : "#15803d" }}
                    >
                      {warning
                        ? "Session Link Created, Calendar Not Updated"
                        : "Session Created Successfully!"}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {warning
                        ? warning
                        : `${resolvedProjectName} · ${selectedCustomer?.name || selectedCustomer?.nickname} · ${formatDisplayDate(date)} ${format12HourTime(time)}`}
                    </p>
                  </div>
                </div>

                {/* Links */}
                <div className="space-y-3 mb-4">
                  {/* Presenter link */}
                  <div
                    className="card p-3"
                    style={{ borderRadius: "var(--radius-md)" }}
                  >
                    <p
                      className="text-xs font-bold mb-1"
                      style={{
                        color: "var(--navy-700)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      🎤 Presenter Link
                    </p>
                    <p
                      className="text-xs mb-2 break-all"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {createdLink.presenter_link}
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: "0.78rem" }}
                        onClick={() =>
                          copy(createdLink.presenter_link, "presenter")
                        }
                      >
                        {copied === "presenter" ? "✓ Copied!" : "📋 Copy"}
                      </button>
                      <button
                        className="btn btn-gold"
                        style={{ fontSize: "0.78rem" }}
                        onClick={() =>
                          window.open(createdLink.presenter_link, "_blank")
                        }
                      >
                        Open ↗
                      </button>
                    </div>
                  </div>

                  {/* Viewer link */}
                  <div
                    className="card p-3"
                    style={{
                      borderRadius: "var(--radius-md)",
                      border: "1px solid #bbf7d0",
                    }}
                  >
                    <p
                      className="text-xs font-bold mb-1"
                      style={{
                        color: "#15803d",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      👁 Viewer Link (Customer)
                    </p>
                    <p
                      className="text-xs mb-2 break-all"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {createdLink.viewer_link_with_phone ||
                        createdLink.viewer_link}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: "0.78rem" }}
                        onClick={() =>
                          copy(
                            createdLink.viewer_link_with_phone ||
                              createdLink.viewer_link,
                            "viewer",
                          )
                        }
                      >
                        {copied === "viewer" ? "✓ Copied!" : "📋 Copy"}
                      </button>
                      <button
                        className="btn btn-gold"
                        style={{ fontSize: "0.78rem" }}
                        onClick={() =>
                          window.open(
                            createdLink.viewer_link_with_phone ||
                              createdLink.viewer_link,
                            "_blank",
                          )
                        }
                      >
                        Open ↗
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{
                          fontSize: "0.78rem",
                          background: "#25D366",
                          border: "none",
                        }}
                        onClick={() => setShowWhatsApp(true)}
                      >
                        📲 Share via WhatsApp
                      </button>
                      {selectedCustomer?.email && (
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: "0.78rem" }}
                          onClick={sendEmail}
                        >
                          ✉ Send Email
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Self-view link */}
                  {(createdLink.self_view_url_with_phone ||
                    createdLink.self_view_url) && (
                    <div
                      className="card p-3"
                      style={{
                        borderRadius: "var(--radius-md)",
                        border: "1px solid #bfdbfe",
                      }}
                    >
                      <p
                        className="text-xs font-bold mb-1"
                        style={{
                          color: "#1d4ed8",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        🧭 Self-View Link (Auto Generated)
                      </p>
                      <p
                        className="text-xs mb-2 break-all"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {createdLink.self_view_url_with_phone ||
                          createdLink.self_view_url}
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: "0.78rem" }}
                          onClick={() =>
                            copy(
                              createdLink.self_view_url_with_phone ||
                                createdLink.self_view_url ||
                                "",
                              "self",
                            )
                          }
                        >
                          {copied === "self" ? "✓ Copied!" : "📋 Copy"}
                        </button>
                        <button
                          className="btn btn-gold"
                          style={{ fontSize: "0.78rem" }}
                          onClick={() =>
                            window.open(
                              createdLink.self_view_url_with_phone ||
                                createdLink.self_view_url,
                              "_blank",
                            )
                          }
                        >
                          Open ↗
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Calendar note */}
                <div
                  className="flex items-center gap-2 p-2 rounded-lg text-xs mb-2"
                  style={{
                    background: warning
                      ? "rgba(249,115,22,0.08)"
                      : "rgba(59,130,246,0.08)",
                    border: warning
                      ? "1px solid rgba(249,115,22,0.28)"
                      : "1px solid #bfdbfe",
                  }}
                >
                  <span>{warning ? "⚠️" : "🗓"}</span>
                  <span style={{ color: warning ? "#c2410c" : "#1e40af" }}>
                    {warning ? (
                      "Calendar booking did not complete, so this session is not marked in the calendar yet."
                    ) : (
                      <>
                        This session is added to your calendar on{" "}
                        <strong>{formatDisplayDate(date)}</strong> at{" "}
                        <strong>{format12HourTime(time)}</strong> (highlighted
                        in blue).
                      </>
                    )}
                  </span>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    className="btn btn-ghost flex-1"
                    onClick={() => {
                      setStep("setup");
                      setCreatedLink(null);
                      setSelectedProject(
                        fixedProjectName || normalizedProjectOptions[0] || "",
                      );
                      setSelectedCustomer(null);
                      setCustomerSearch("");
                    }}
                  >
                    Create Another
                  </button>
                  <button className="btn btn-primary flex-1" onClick={onClose}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Add Customer Modal ─────────────────────────────────────────────────── */}
      {showAddCustomer && (
        <AddCustomerModal
          zIndex={11000}
          onClose={() => setShowAddCustomer(false)}
          onAdded={handleCustomerAdded}
        />
      )}

      {/* ── WhatsApp Share Sub-Modal ──────────────────────────────────────────── */}
      {showWhatsApp && createdLink && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div
            className="modal-box"
            style={{ maxWidth: "22rem", zIndex: 1201 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <p className="modal-title">📲 Share via WhatsApp</p>
              <button
                className="modal-close"
                onClick={() => setShowWhatsApp(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <label className="label">Phone Number (with country code)</label>
              <input
                className="input-field mb-1"
                placeholder="+919876543210"
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
              />
              <p
                className="text-xs mb-3"
                style={{ color: "var(--color-text-muted)" }}
              >
                Leave blank to open WhatsApp without a contact.
              </p>
              <button
                className="btn btn-primary w-full"
                style={{ background: "#25D366", border: "none", color: "#fff" }}
                onClick={sendWhatsApp}
              >
                Open WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
