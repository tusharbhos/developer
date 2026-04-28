// components/AddProjectModal.tsx

"use client";

import React, { useState } from "react";
import { ProjectRequestAPI } from "@/lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  company_name: string;
  onSuccess?: () => void;
}

interface FormData {
  developerName: string;
  managerName: string;
  managerPhone: string;
  managerEmail: string;
}

const INITIAL: FormData = {
  developerName: "",
  managerName: "",
  managerPhone: "",
  managerEmail: "",
};

type FormErrors = Partial<Record<keyof FormData, string>>;

export default function AddProjectModal({
  isOpen,
  onClose,
  userName,
  company_name,
  onSuccess,
}: Props) {
  const [form, setForm] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<FormErrors>({});
  const [sent, setSent] = useState<{ whatsapp: boolean; email: boolean }>({
    whatsapp: false,
    email: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  const set = (k: keyof FormData, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.developerName.trim())
      e.developerName = "Developer name is required";
    if (!form.managerName.trim()) e.managerName = "Manager name is required";
    if (!form.managerPhone.match(/^\d{10}$/))
      e.managerPhone = "Enter a valid 10-digit phone number";
    if (!form.managerEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
      e.managerEmail = "Enter a valid email address";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Send data to backend API
  const sendToBackend = async () => {
    try {
      const response = await ProjectRequestAPI.create({
        developer_name: form.developerName,
        manager_name: form.managerName,
        manager_phone: form.managerPhone,
        manager_email: form.managerEmail,
      });

      console.log("Project request saved:", response);
      return true;
    } catch (error: any) {
      console.error("Failed to save project request:", error);
      setApiError(
        error.message || "Failed to submit request. Please try again.",
      );
      return false;
    }
  };

  // WhatsApp message with proper link formatting (plain text, no HTML)
  const buildWhatsAppMessage = () => {
    const websiteUrl = "https://channelpartner.network";
    const displayCompany =
      company_name && company_name.trim() !== ""
        ? company_name
        : "Channel Partner Company";
    const displayUserName =
      userName && userName.trim() !== "" ? userName : "Channel Partner";

    return `Hello *${form.managerName}*,

I recently saw a network designed for *Channel Partners* that allows us to sell your project in a better way. I would like to suggest that you *Activate* your Projects on this network so that it helps me, my team, as well as other Channel Partners like me to sale your Projects in a better way.

I have shared your phone no with channel partner network team, they shall connect with you. Or you, can visit: ${websiteUrl} or call them at +91-9767176377

-- ${displayUserName},
-- ${displayCompany}`;
  };

  // Email message with proper link formatting (plain text, mailto will handle it)
  const buildEmailBodyPlain = () => {
    const websiteUrl = "https://channelpartner.network/";
    const displayCompany =
      company_name && company_name.trim() !== ""
        ? company_name
        : "[Your Company]";
    const displayUserName =
      userName && userName.trim() !== "" ? userName : "Channel Partner";

    return `Hello ${form.managerName},

I recently saw a network designed for Channel Partners that allows us to sell your project in a better way. I would like to suggest that you Activate your Projects on this network so that it helps me, my team, as well as other Channel Partners like me to sale your Projects in a better way.

I have shared your phone no with channelpartner.network team, they shall connect with you. Or you, can visit: ${websiteUrl} or call them at +91-9767176377

-- ${displayUserName},
-- ${displayCompany}`;
  };

  const handleWhatsApp = async () => {
    // First save to database
    if (!(await sendToBackend())) return;

    const digits = form.managerPhone.replace(/\D/g, "");
    const phone =
      digits.length === 10
        ? `91${digits}`
        : digits.length === 11 && digits.startsWith("0")
          ? `91${digits.slice(1)}`
          : digits;

    if (!phone) return;

    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(
      buildWhatsAppMessage(),
    )}`;
    const isAppleDevice = /iPad|iPhone|iPod|Macintosh/i.test(
      typeof navigator !== "undefined" ? navigator.userAgent : "",
    );

    if (isAppleDevice) {
      window.location.href = whatsappUrl;
    } else {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }
    setSent((p) => ({ ...p, whatsapp: true }));
  };

  const handleEmail = async () => {
    // First save to database
    if (!(await sendToBackend())) return;

    const subject = `Project Activation Request — ${form.developerName || "Developer"}`;
    window.location.href = `mailto:${form.managerEmail}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(buildEmailBodyPlain())}`;
    setSent((p) => ({ ...p, email: true }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError("");

    if (!validate()) return;

    setSubmitting(true);

    // Save to database first
    const success = await sendToBackend();

    if (success) {
      setSubmitted(true);
      if (onSuccess) onSuccess();
    }

    setSubmitting(false);
  };

  const handleClose = () => {
    setForm(INITIAL);
    setErrors({});
    setSent({ whatsapp: false, email: false });
    setSubmitted(false);
    setApiError("");
    onClose();
  };

  // Get display values for preview
  const getDisplayCompany = () => {
    return company_name && company_name.trim() !== ""
      ? company_name
      : "[Your Company]";
  };

  const getDisplayUserName = () => {
    return userName && userName.trim() !== "" ? userName : "Channel Partner";
  };

  // Message Preview component with clickable link
  const MessagePreview = () => {
    const displayCompany = getDisplayCompany();
    const displayUserName = getDisplayUserName();
    const websiteUrl = "https://channelpartner.network/";

    return (
      <div
        className="text-xs leading-relaxed space-y-2"
        style={{ color: "var(--navy-800)" }}
      >
        <p>
          Hello <strong>{form.managerName || "[Manager Name]"}</strong>,
        </p>
        <p>
          I recently saw a network designed for{" "}
          <strong>Channel Partners</strong> that allows us to sell your project
          in a better way. I would like to suggest that you{" "}
          <strong>Activate</strong> your Projects on this network so that it
          helps me, my team, as well as other Channel Partners like me to sale
          your Projects in a better way.
        </p>
        <p>
          I have shared your phone no with{" "}
          <strong>
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--navy-600)", textDecoration: "underline" }}
            >
              channelpartner.network
            </a>
          </strong>{" "}
          team, they shall connect with you. Or you, can visit:{" "}
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--navy-600)", textDecoration: "underline" }}
          >
            {websiteUrl}
          </a>{" "}
          or call them at <strong>+91-9767176377</strong>
        </p>
        <p style={{ color: "var(--color-text-muted)" }}>
          -- {displayUserName},<br />
          -- {displayCompany}
        </p>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div
        className="modal-box"
        style={{ maxWidth: "32rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="modal-title">🏗️ Add New Project</p>
            <p className="modal-subtitle">
              Request project activation on the network
            </p>
          </div>
          <button className="modal-close" onClick={handleClose}>
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

        {/* Body */}
        <div className="modal-body">
          {!submitted ? (
            /* ── Step 1: Form ── */
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* API Error */}
              {apiError && <div className="alert alert-danger">{apiError}</div>}

              {/* Developer Name */}
              <div>
                <label className="label">
                  Developer Name{" "}
                  <span style={{ color: "var(--red-600)" }}>*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.developerName}
                    onChange={(e) => set("developerName", e.target.value)}
                    placeholder="e.g. Lodha Group"
                    className="input-field pl-9"
                    autoFocus
                  />
                </div>
                {errors.developerName && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--red-600)" }}
                  >
                    {errors.developerName}
                  </p>
                )}
              </div>

              <hr className="section-divider" />

              <p
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: "var(--navy-600)" }}
              >
                Sourcing Manager Details
              </p>

              {/* Manager Name */}
              <div>
                <label className="label">
                  Manager Name{" "}
                  <span style={{ color: "var(--red-600)" }}>*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.managerName}
                    onChange={(e) => set("managerName", e.target.value)}
                    placeholder="Sourcing manager's full name"
                    className="input-field pl-9"
                  />
                </div>
                {errors.managerName && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--red-600)" }}
                  >
                    {errors.managerName}
                  </p>
                )}
              </div>

              {/* Phone + Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">
                    Phone No <span style={{ color: "var(--red-600)" }}>*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={form.managerPhone}
                      onChange={(e) =>
                        set(
                          "managerPhone",
                          e.target.value.replace(/\D/g, "").slice(0, 10),
                        )
                      }
                      placeholder="10-digit number"
                      className="input-field pl-9"
                    />
                  </div>
                  {errors.managerPhone && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--red-600)" }}
                    >
                      {errors.managerPhone}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">
                    Email ID <span style={{ color: "var(--red-600)" }}>*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={form.managerEmail}
                      onChange={(e) => set("managerEmail", e.target.value)}
                      placeholder="manager@company.com"
                      className="input-field pl-9"
                    />
                  </div>
                  {errors.managerEmail && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--red-600)" }}
                    >
                      {errors.managerEmail}
                    </p>
                  )}
                </div>
              </div>

              <div
                className="modal-footer"
                style={{ margin: "0 -1.4rem -1.25rem", padding: "1rem 1.4rem" }}
              >
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn btn-ghost flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary flex-1"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span
                        className="spinner"
                        style={{
                          width: "0.9rem",
                          height: "0.9rem",
                          borderWidth: "2px",
                        }}
                      />
                      Saving...
                    </span>
                  ) : (
                    "Continue →"
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* ── Step 2: Send ── */
            <div className="space-y-4">
              <p
                className="text-xs font-semibold"
                style={{ color: "var(--color-text-muted)" }}
              >
                Send this message to{" "}
                <strong style={{ color: "var(--navy-800)" }}>
                  {form.managerName}
                </strong>{" "}
                via:
              </p>

              <div className="grid grid-cols-2 gap-3">
                {/* WhatsApp */}
                <button
                  onClick={handleWhatsApp}
                  className="btn flex flex-col items-center gap-2 py-4"
                  style={{
                    background: sent.whatsapp ? "#dcfce7" : "#25d366",
                    color: sent.whatsapp ? "#16a34a" : "#fff",
                    border: sent.whatsapp ? "1.5px solid #16a34a" : "none",
                    fontSize: "0.8rem",
                  }}
                >
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 2C6.48 2 2 6.48 2 12c0 2.108.576 4.082 1.579 5.79L2 22l4.21-1.579A9.93 9.93 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" />
                  </svg>
                  {sent.whatsapp ? "✓ Opened WhatsApp" : "Send via WhatsApp"}
                </button>

                {/* Email */}
                <button
                  onClick={handleEmail}
                  className="btn flex flex-col items-center gap-2 py-4"
                  style={{
                    background: sent.email ? "#dcfce7" : "#ea4335",
                    color: sent.email ? "#16a34a" : "#fff",
                    border: sent.email ? "1.5px solid #16a34a" : "none",
                    fontSize: "0.8rem",
                  }}
                >
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                  </svg>
                  {sent.email ? "✓ Opened Email" : "Send via Email"}
                </button>
              </div>

              {(sent.whatsapp || sent.email) && (
                <div className="alert alert-success">
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
                  Request submitted! The network team will connect with{" "}
                  {form.managerName} soon.
                </div>
              )}

              <div
                className="modal-footer"
                style={{ margin: "0 -1.4rem -1.25rem", padding: "1rem 1.4rem" }}
              >
                <button
                  onClick={() => setSubmitted(false)}
                  className="btn btn-ghost flex-1"
                >
                  ← Edit
                </button>
                <button
                  onClick={handleClose}
                  className="btn btn-primary flex-1"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
