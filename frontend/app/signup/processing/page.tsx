"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

type PendingSignupPayload = {
  name: string;
  company_name: string;
  company_size: string;
  rera_no: string;
  phone: string;
  city: string;
  email: string;
  address: string;
  password: string;
  password_confirmation: string;
};

const SIGNUP_PENDING_KEY = "signup:pending:v1";
const SIGNUP_PROCESSING_LOCK_KEY = "signup:processing:lock:v1";
const SIGNUP_PROCESSING_RESULT_KEY = "signup:processing:result:v1";

type ProcessingResult = {
  status: "success" | "error";
  message: string;
  name: string;
  email: string;
};

export default function SignupProcessingPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState(
    "Creating your account and sending your verification email...",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;

    const applyResult = (result: ProcessingResult) => {
      setName(result.name || "Partner");
      setEmail(result.email || "");
      setStatus(result.status);
      setMessage(result.message);
    };

    const submitSignup = async () => {
      const existingResultRaw = window.sessionStorage.getItem(
        SIGNUP_PROCESSING_RESULT_KEY,
      );
      if (existingResultRaw) {
        try {
          const existingResult = JSON.parse(
            existingResultRaw,
          ) as ProcessingResult;
          applyResult(existingResult);
          return;
        } catch {
          window.sessionStorage.removeItem(SIGNUP_PROCESSING_RESULT_KEY);
        }
      }

      const processingLock = window.sessionStorage.getItem(
        SIGNUP_PROCESSING_LOCK_KEY,
      );
      if (processingLock) {
        pollTimer = window.setInterval(() => {
          const polled = window.sessionStorage.getItem(
            SIGNUP_PROCESSING_RESULT_KEY,
          );
          if (!polled) return;

          try {
            const parsed = JSON.parse(polled) as ProcessingResult;
            if (!cancelled) applyResult(parsed);
          } catch {
            // ignore malformed state and let polling continue
          }

          if (pollTimer !== null) {
            window.clearInterval(pollTimer);
            pollTimer = null;
          }
        }, 250);
        return;
      }

      const raw = window.sessionStorage.getItem(SIGNUP_PENDING_KEY);
      if (!raw) {
        router.replace("/signup");
        return;
      }

      let payload: PendingSignupPayload | null = null;
      try {
        payload = JSON.parse(raw) as PendingSignupPayload;
      } catch {
        window.sessionStorage.removeItem(SIGNUP_PENDING_KEY);
        router.replace("/signup");
        return;
      }

      setName(payload.name || "Partner");
      setEmail(payload.email || "");
      window.sessionStorage.setItem(
        SIGNUP_PROCESSING_LOCK_KEY,
        String(Date.now()),
      );

      const result = await register(payload);
      window.sessionStorage.removeItem(SIGNUP_PROCESSING_LOCK_KEY);

      if (result.success) {
        window.sessionStorage.removeItem(SIGNUP_PENDING_KEY);
        const next: ProcessingResult = {
          status: "success",
          message:
            "Registration successful. Verification mail has been sent. Please verify your email and then log in.",
          name: payload.name || "Partner",
          email: payload.email || "",
        };
        window.sessionStorage.setItem(
          SIGNUP_PROCESSING_RESULT_KEY,
          JSON.stringify(next),
        );
        if (!cancelled) applyResult(next);
        return;
      }

      const fail: ProcessingResult = {
        status: "error",
        message: result.error || "Registration failed. Please try again.",
        name: payload.name || "Partner",
        email: payload.email || "",
      };
      window.sessionStorage.setItem(
        SIGNUP_PROCESSING_RESULT_KEY,
        JSON.stringify(fail),
      );
      if (!cancelled) applyResult(fail);
    };

    submitSignup();

    return () => {
      cancelled = true;
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
    };
  }, [register, router]);

  return (
    <div className="bg-main min-h-screen flex items-center justify-center px-4 py-8">
      <div className="glass-card w-full max-w-md px-7 py-8 animate-fade-in-up text-center">
        <div className="flex justify-center mb-5">
          <img
            src="/logo.png"
            alt="ChannelPartner.Network"
            style={{ height: "52px", width: "auto", objectFit: "contain" }}
          />
        </div>

        {status === "loading" && (
          <>
            <div
              className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
              style={{
                width: 76,
                height: 76,
                background: "rgba(30,69,128,0.12)",
              }}
            >
              <div className="spinner spinner-lg" />
            </div>
            <h1
              className="text-2xl font-bold mb-2"
              style={{
                color: "var(--navy-900)",
                fontFamily: "var(--font-display)",
              }}
            >
              Setting Up Your Account
            </h1>
            <p
              className="text-sm mb-5"
              style={{ color: "var(--color-text-muted)" }}
            >
              {message}
            </p>
            <div
              className="rounded-2xl p-4 text-left"
              style={{ background: "rgba(30,69,128,0.06)" }}
            >
              <p
                className="text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {name ? `Hi ${name},` : "Hi,"} we are saving your profile and
                preparing your verification mail. This page will update
                automatically.
              </p>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <div
              className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
              style={{
                width: 76,
                height: 76,
                background: "rgba(22,163,74,0.12)",
                color: "var(--green-600)",
              }}
            >
              <svg
                width="34"
                height="34"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1
              className="text-2xl font-bold mb-2"
              style={{
                color: "var(--navy-900)",
                fontFamily: "var(--font-display)",
              }}
            >
              Registration Successful
            </h1>
            <p
              className="text-sm mb-5"
              style={{ color: "var(--color-text-muted)" }}
            >
              Welcome, <b>{name || "Partner"}</b>.
            </p>
            <div
              className="rounded-2xl p-4 mb-5 text-left"
              style={{
                background: "rgba(22,163,74,0.08)",
                border: "1px solid rgba(22,163,74,0.15)",
              }}
            >
              <p
                className="text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {message}
              </p>
            </div>
            <Link href="/" className="btn btn-gold w-full">
              Go to Login
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div
              className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
              style={{
                width: 76,
                height: 76,
                background: "rgba(220,38,38,0.12)",
                color: "var(--red-600)",
              }}
            >
              <svg
                width="34"
                height="34"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1
              className="text-2xl font-bold mb-2"
              style={{
                color: "var(--navy-900)",
                fontFamily: "var(--font-display)",
              }}
            >
              Signup Could Not Complete
            </h1>
            <div
              className="rounded-2xl p-4 mb-5 text-left"
              style={{
                background: "rgba(220,38,38,0.08)",
                border: "1px solid rgba(220,38,38,0.15)",
              }}
            >
              <p
                className="text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {message}
              </p>
            </div>
            <div className="flex gap-3 flex-col sm:flex-row">
              <button
                className="btn btn-primary flex-1"
                onClick={() => {
                  window.sessionStorage.removeItem(
                    SIGNUP_PROCESSING_RESULT_KEY,
                  );
                  window.sessionStorage.removeItem(SIGNUP_PROCESSING_LOCK_KEY);
                  router.replace("/signup");
                }}
              >
                Back to Signup
              </button>
              <Link href="/" className="btn btn-ghost flex-1">
                Go to Login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
