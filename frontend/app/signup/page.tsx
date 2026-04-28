// app/signup/page.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  isStrongPassword,
  PASSWORD_POLICY_ERROR,
  PASSWORD_POLICY_HINT,
} from "@/lib/passwordPolicy";

interface FormData {
  name: string;
  companyName: string;
  companySize: string;
  reraNo: string;
  phone: string;
  city: string;
  email: string;
  address: string;
  password: string;
  confirmPassword: string;
  captcha: boolean;
}

const SIGNUP_PENDING_KEY = "signup:pending:v1";
const SIGNUP_PROCESSING_LOCK_KEY = "signup:processing:lock:v1";
const SIGNUP_PROCESSING_RESULT_KEY = "signup:processing:result:v1";

const INITIAL: FormData = {
  name: "",
  companyName: "",
  companySize: "",
  reraNo: "",
  phone: "",
  city: "",
  email: "",
  address: "",
  password: "",
  confirmPassword: "",
  captcha: false,
};

const GlassInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => {
  const cls = props.className
    ? `auth-form-input ${props.className}`
    : "auth-form-input";
  return <input {...props} className={cls} />;
};

const GlassTextarea = (
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) => {
  const cls = props.className
    ? `auth-form-input textarea ${props.className}`
    : "auth-form-input textarea";
  return <textarea {...props} className={cls} />;
};

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="auth-form-label">{children}</label>
);

const FieldError = ({ msg }: { msg?: string }) =>
  msg ? <p className="auth-field-error">{msg}</p> : null;

const companySizeOptions = [
  { label: "Individual", value: "individual" },
  { label: "1-2", value: "1-2" },
  { label: "5-10", value: "5-10" },
  { label: "10-20", value: "10-20" },
  { label: "20-50", value: "20-50" },
  { label: "50-100", value: "50-100" },
  { label: "100+", value: "100+" },
];

export default function SignupPage() {
  type FormErrors = Partial<Record<keyof FormData, string>>;
  const router = useRouter();
  const [form, setForm] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const set = (k: keyof FormData, v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.companySize) e.companySize = "Company size is required";
    if (!form.reraNo.trim()) e.reraNo = "RERA No is required";
    if (!form.phone.match(/^\d{10}$/)) e.phone = "Enter a valid 10-digit phone";
    if (!form.city.trim()) e.city = "City is required";
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
      e.email = "Enter a valid email";
    if (!form.address.trim()) e.address = "Address is required";
    if (!isStrongPassword(form.password)) e.password = PASSWORD_POLICY_ERROR;
    if (form.password !== form.confirmPassword)
      e.confirmPassword = "Passwords do not match";
    if (!form.captcha) e.captcha = "Please verify you are human";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;
    try {
      window.sessionStorage.removeItem(SIGNUP_PROCESSING_LOCK_KEY);
      window.sessionStorage.removeItem(SIGNUP_PROCESSING_RESULT_KEY);
      window.sessionStorage.setItem(
        SIGNUP_PENDING_KEY,
        JSON.stringify({
          name: form.name,
          company_name: form.companyName,
          company_size: form.companySize,
          rera_no: form.reraNo,
          phone: form.phone,
          city: form.city,
          email: form.email,
          address: form.address,
          password: form.password,
          password_confirmation: form.confirmPassword,
        }),
      );
      router.push("/signup/processing");
    } catch {
      setSubmitError("Could not continue signup. Please try again.");
    }
  };

  // ── Step 1: Form ───────────────────────────────────────────
  return (
    <div className="bg-main min-h-screen flex items-center justify-center px-4 py-8">
      <div className="glass-card w-full max-w-2xl px-6 py-7 sm:px-8 sm:py-8 animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="ChannelPartner.Network"
            style={{
              height: "48px",
              width: "auto",
              objectFit: "contain",
              margin: "0 auto 12px",
            }}
          />
          <h1
            className="text-xl font-bold mb-1"
            style={{
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            Create Your Account
          </h1>
          <p className="text-sm auth-text-muted">
            Join India's largest channel partner network
          </p>
        </div>

        {/* Submit Error */}
        {submitError && (
          <div className="alert alert-danger mb-5">
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
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Row 1: Name + Company */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel>
                Full Name <span style={{ color: "var(--orange-400)" }}>*</span>
              </FieldLabel>
              <GlassInput
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Rahul Sharma"
              />
              <FieldError msg={errors.name} />
            </div>
            <div>
              <FieldLabel>Company Name</FieldLabel>
              <GlassInput
                type="text"
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                placeholder="Sharma Realty Pvt Ltd"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel>
                Company Size{" "}
                <span style={{ color: "var(--orange-400)" }}>*</span>
              </FieldLabel>
              <select
                className="auth-form-input"
                value={form.companySize}
                onChange={(e) => set("companySize", e.target.value)}
              >
                <option value="">Select company size</option>
                {companySizeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <FieldError msg={errors.companySize} />
            </div>
            <div />
          </div>

          {/* Row 2: RERA + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel>
                RERA No <span style={{ color: "var(--orange-400)" }}>*</span>
              </FieldLabel>
              <GlassInput
                type="text"
                value={form.reraNo}
                onChange={(e) => set("reraNo", e.target.value)}
                placeholder="A51800001234"
              />
              <FieldError msg={errors.reraNo} />
            </div>
            <div>
              <FieldLabel>
                Phone Number{" "}
                <span style={{ color: "var(--orange-400)" }}>*</span>
              </FieldLabel>
              <GlassInput
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="9876543210"
              />
              <FieldError msg={errors.phone} />
            </div>
          </div>

          {/* Row 3: City + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel>
                City <span style={{ color: "var(--orange-400)" }}>*</span>
              </FieldLabel>
              <GlassInput
                type="text"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Pune"
              />
              <FieldError msg={errors.city} />
            </div>
            <div>
              <FieldLabel>
                Email ID <span style={{ color: "var(--orange-400)" }}>*</span>
              </FieldLabel>
              <GlassInput
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="you@example.com"
              />
              <FieldError msg={errors.email} />
            </div>
          </div>

          {/* Row 4: Address */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <FieldLabel>
                Address <span style={{ color: "var(--orange-400)" }}>*</span>
              </FieldLabel>
              <GlassTextarea
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="Office / Home address"
                rows={2}
              />
              <FieldError msg={errors.address} />
            </div>
          </div>

          {/* Row 5: Password + Confirm */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Password */}
            <div>
              <FieldLabel>
                Password <span style={{ color: "var(--orange-400)" }}>*</span>
              </FieldLabel>
              <div className="relative">
                <GlassInput
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="Min 8 characters"
                  className="pr-14"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "1rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
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
                    {showPw && (
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
              <p className="text-xs mt-1 auth-text-muted">
                {PASSWORD_POLICY_HINT}
              </p>
              <FieldError msg={errors.password} />
            </div>

            {/* Confirm Password */}
            <div>
              <FieldLabel>
                Confirm Password{" "}
                <span style={{ color: "var(--orange-400)" }}>*</span>
              </FieldLabel>
              <div className="relative">
                <GlassInput
                  type={showCPw ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={(e) => set("confirmPassword", e.target.value)}
                  placeholder="Repeat password"
                  className="pr-14"
                />
                <button
                  type="button"
                  onClick={() => setShowCPw(!showCPw)}
                  aria-label={
                    showCPw ? "Hide confirm password" : "Show confirm password"
                  }
                  style={{
                    position: "absolute",
                    right: "1rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
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
                    {showCPw && (
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
              <FieldError msg={errors.confirmPassword} />
            </div>
          </div>

          {/* CAPTCHA */}
          <div>
            <div
              className={`flex items-center gap-3 p-3 auth-captcha-box ${errors.captcha ? "error" : ""}`}
            >
              <input
                type="checkbox"
                id="captcha"
                checked={form.captcha}
                onChange={(e) => set("captcha", e.target.checked)}
                style={{
                  width: "18px",
                  height: "18px",
                  accentColor: "var(--orange-500)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              />
              <label
                htmlFor="captcha"
                style={{
                  fontSize: "0.875rem",
                  color: "var(--color-text-primary)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                I am not a robot
              </label>
              <div className="ml-auto flex flex-col items-center gap-0.5">
                <svg
                  viewBox="0 0 64 64"
                  fill="none"
                  style={{ width: "28px", height: "28px", opacity: 0.7 }}
                >
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="#4285f4"
                    strokeWidth="4"
                    fill="none"
                  />
                  <circle cx="32" cy="32" r="12" fill="#4285f4" opacity="0.2" />
                  <path
                    d="M20 32a12 12 0 0124 0"
                    stroke="#4285f4"
                    strokeWidth="3"
                    fill="none"
                  />
                </svg>
                <span
                  style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)" }}
                >
                  reCAPTCHA
                </span>
              </div>
            </div>
            <FieldError msg={errors.captcha} />
          </div>

          {/* Submit */}
          <button
            type="submit"
            style={{
              display: "block",
              width: "100%",
              padding: "0.9rem",
              borderRadius: "12px",
              border: "none",
              cursor: "pointer",
              background:
                "linear-gradient(135deg, var(--orange-500), var(--orange-600))",
              color: "#fff",
              fontWeight: 800,
              fontSize: "1rem",
              fontFamily: "var(--font-display)",
              boxShadow: "0 4px 18px rgba(249,115,22,0.45)",
              transition: "transform 0.15s, box-shadow 0.15s",
              opacity: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 6px 24px rgba(249,115,22,0.55)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 4px 18px rgba(249,115,22,0.45)";
            }}
          >
            Create Account →
          </button>

          {/* Trust badge */}
          <div className="flex items-center gap-2 justify-center pt-1">
            <span style={{ fontSize: "1rem" }}>✅</span>
            <p className="text-xs auth-text-main">
              Used by verified Channel Partners across multiple projects
            </p>
          </div>

          <p className="text-center text-sm auth-text-main">
            Already have an account?{" "}
            <Link
              href="/"
              className="font-bold hover:underline"
              style={{ color: "var(--orange-600)" }}
            >
              Log In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
