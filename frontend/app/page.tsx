// app/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/home");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) router.push("/home");
    else setError(result.error || "Login failed. Please try again.");
  };

  return (
    <div className="bg-main min-h-screen flex items-center justify-center px-4 py-8">
      {/* Glass Card */}
      <div className="glass-card w-full max-w-sm px-7 py-8 animate-fade-in-up">
        {/* Headline */}
        <div className="text-center mb-5">
          <h1
            className="text-xl font-bold leading-snug mb-2"
            style={{
              color: "var(--navy-900)",
              fontFamily: "var(--font-display)",
            }}
          >
            A controlled network where serious Channel Partners drive real
            project sales.
          </h1>
          <p className="text-xs" style={{ color: "var(--slate-500)" }}>
            *Access is limited to verified Channel Partners
          </p>
        </div>

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img
            src="/logo.png"
            alt="ChannelPartner.Network"
            style={{ height: "52px", width: "auto", objectFit: "contain" }}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-danger mb-4 text-xs">
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
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Email */}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email ID"
            autoComplete="email"
            style={{
              display: "block",
              width: "100%",
              padding: "0.85rem 1rem",
              borderRadius: "12px",
              border: "1.5px solid black",
              background: "rgba(255,255,255,0.82)",
              backdropFilter: "blur(8px)",
              fontSize: "0.9375rem",
              color: "var(--navy-900)",
              outline: "none",
              fontFamily: "var(--font-body)",
            }}
            onFocus={(e) => {
              e.target.style.border = "1.5px solid var(--navy-400)";
              e.target.style.background = "rgba(255,255,255,0.95)";
            }}
            onBlur={(e) => {
              e.target.style.border = "1.5px solid black";
              e.target.style.background = "rgba(255,255,255,0.82)";
            }}
          />

          {/* Password */}
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              style={{
                display: "block",
                width: "100%",
                padding: "0.85rem 3.5rem 0.85rem 1rem",
                borderRadius: "12px",
                border: "1.5px solid black",
                background: "rgba(255,255,255,0.82)",
                backdropFilter: "blur(8px)",
                fontSize: "0.9375rem",
                color: "var(--navy-900)",
                outline: "none",
                fontFamily: "var(--font-body)",
              }}
              onFocus={(e) => {
                e.target.style.border = "1.5px solid var(--navy-400)";
                e.target.style.background = "rgba(255,255,255,0.95)";
              }}
              onBlur={(e) => {
                e.target.style.border = "1.5px solid black";
                e.target.style.background = "rgba(255,255,255,0.82)";
              }}
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
                color: "var(--slate-500)",
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

          {/* Forgot Password */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => router.push("/forgot-password")}
              className="text-xs font-semibold hover:underline"
              style={{
                color: "var(--orange-600)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              Forgot Password?
            </button>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              display: "block",
              width: "100%",
              padding: "0.9rem",
              borderRadius: "12px",
              background: loading
                ? "var(--orange-400)"
                : "linear-gradient(135deg, var(--orange-500) 0%, var(--orange-600) 100%)",
              color: "#fff",
              fontWeight: 800,
              fontSize: "1rem",
              fontFamily: "var(--font-display)",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 4px 18px rgba(249,115,22,0.45)",
              letterSpacing: "0.02em",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 24px rgba(249,115,22,0.55)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 4px 18px rgba(249,115,22,0.45)";
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span
                  className="spinner"
                  style={{
                    width: "1rem",
                    height: "1rem",
                    borderWidth: "2px",
                    borderTopColor: "#fff",
                    borderColor: "rgba(255,255,255,0.3)",
                  }}
                />
                Signing in…
              </span>
            ) : (
              "Login"
            )}
          </button>
        </form>

        {/* Trust Badge */}
        <div className="flex items-start gap-2 mt-5">
          <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>✅</span>
          <p
            className="text-xs leading-snug"
            style={{ color: "var(--slate-600)" }}
          >
            Used by verified Channel Partners across multiple projects
          </p>
        </div>

        {/* ══════════════════════════════════════════════════
           🔥 ACTIVATE YOUR PROJECT — Developer CTA
        ══════════════════════════════════════════════════ */}
        <div
          style={{
            marginTop: "1.5rem",
            padding: "1rem",
            borderRadius: "16px",
            background:
              "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(30,69,128,0.06))",
            border: "1.5px dashed rgba(249,115,22,0.35)",
            textAlign: "center",
          }}
        >
          <p className="text-sm mb-2" style={{ color: "var(--slate-700)" }}>
            Are you a developer?{" "}
            <Link
              href="/activate"
              className="font-bold"
              style={{ color: "var(--orange-600)", textDecoration: "none" }}
            >
              Activate Your Project
            </Link>
          </p>
        </div>

        {/* Bottom Buttons */}
        <div className="mt-4 flex gap-4 flex-wrap justify-center">
          <button
            onClick={() => window.open("/channelpartner.pdf", "_blank")}
            className="px-5 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-200"
          >
            Benefits for Channel Partner
          </button>
          <button
            onClick={() => window.open("/forDevelopers.pdf", "_blank")}
            className="px-5 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-semibold hover:bg-green-200"
          >
            Advantages for Developers
          </button>
        </div>
      </div>
    </div>
  );
}
