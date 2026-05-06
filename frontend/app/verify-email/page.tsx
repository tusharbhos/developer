// app/verify-email/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/api";

function normalizeApiBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/api")) return trimmed;
  return `${trimmed}/api`;
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [redirectSeconds, setRedirectSeconds] = useState(4);

  useEffect(() => {
    if (status !== "success") return;

    setRedirectSeconds(4);
    const interval = window.setInterval(() => {
      setRedirectSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          router.replace("/");
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [router, status]);

  useEffect(() => {
    const verify = async () => {
      const id = searchParams.get("id");
      const hash = searchParams.get("hash");
      const expires = searchParams.get("expires");
      const signature = searchParams.get("signature");
      const apiBaseFromUrl = searchParams.get("api_base");

      if (!id || !hash) {
        setStatus("error");
        setMessage("Invalid verification link.");
        return;
      }

      try {
        const apiBase = apiBaseFromUrl
          ? normalizeApiBaseUrl(apiBaseFromUrl)
          : getApiBaseUrl();
        const response = await fetch(
          `${apiBase}/email/verify/${id}/${hash}?expires=${expires}&signature=${signature}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
          },
        );

        const contentType = response.headers.get("content-type") || "";
        const data = contentType.includes("application/json")
          ? await response.json()
          : { message: "Invalid verification response from server." };

        if (response.ok) {
          setStatus("success");
          setMessage(data.message || "Email verified successfully!");
        } else {
          setStatus("error");
          setMessage(data.message || "Invalid or expired verification link.");
        }
      } catch {
        setStatus("error");
        setMessage("Failed to verify email. Please try again.");
      }
    };

    verify();
  }, [searchParams]);

  const cardTone =
    status === "success"
      ? {
          accent: "var(--green-600)",
          soft: "rgba(22,163,74,0.12)",
          border: "rgba(22,163,74,0.2)",
          title: "Email Verified",
          subtitle: "Your account is ready. Redirecting you to login.",
        }
      : status === "error"
        ? {
            accent: "var(--red-600)",
            soft: "rgba(220,38,38,0.12)",
            border: "rgba(220,38,38,0.2)",
            title: "Verification Failed",
            subtitle: "This verification link is invalid or has expired.",
          }
        : {
            accent: "var(--navy-600)",
            soft: "rgba(30,69,128,0.1)",
            border: "rgba(30,69,128,0.16)",
            title: "Verifying Email",
            subtitle: "Please wait while we confirm your email address.",
          };

  return (
    <div className="bg-main min-h-screen flex items-center justify-center px-4 py-8">
      <div
        className="glass-card w-full max-w-md px-7 py-8 text-center animate-fade-in-up"
        style={{
          background: "rgba(255,255,255,0.94)",
          border: `1px solid ${cardTone.border}`,
        }}
      >
        <div className="flex justify-center mb-5">
          <img
            src="/logo.png"
            alt="conectr.co"
            style={{ height: "52px", width: "auto", objectFit: "contain" }}
          />
        </div>

        <div
          className="mx-auto mb-5 flex items-center justify-center rounded-2xl"
          style={{
            width: 76,
            height: 76,
            background: cardTone.soft,
            color: cardTone.accent,
          }}
        >
          {status === "loading" ? (
            <div className="spinner spinner-lg" />
          ) : status === "success" ? (
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
          ) : (
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
          )}
        </div>

        <p
          className="text-xs font-bold uppercase tracking-[0.22em] mb-2"
          style={{ color: cardTone.accent }}
        >
          conectr.co
        </p>
        <h1
          className="text-2xl font-bold mb-2"
          style={{
            color: "var(--navy-900)",
            fontFamily: "var(--font-display)",
          }}
        >
          {cardTone.title}
        </h1>
        <p
          className="text-sm mb-5"
          style={{ color: "var(--color-text-muted)" }}
        >
          {cardTone.subtitle}
        </p>

        {status === "loading" && (
          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(30,69,128,0.06)" }}
          >
            <p
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              We are validating your signed verification link and activating
              your login access.
            </p>
          </div>
        )}

        {status === "success" && (
          <div>
            <div
              className="rounded-2xl p-4 mb-5"
              style={{
                background: "rgba(22,163,74,0.08)",
                border: "1px solid rgba(22,163,74,0.15)",
              }}
            >
              <p
                className="text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {message || "Email verified successfully!"}
              </p>
              <p className="text-xs mt-2" style={{ color: "var(--green-600)" }}>
                Redirecting to login in {redirectSeconds}s
              </p>
            </div>
            <Link href="/" className="btn btn-gold w-full">
              Go to Login
            </Link>
          </div>
        )}

        {status === "error" && (
          <div>
            <div
              className="rounded-2xl p-4 mb-5"
              style={{
                background: "rgba(220,38,38,0.08)",
                border: "1px solid rgba(220,38,38,0.15)",
              }}
            >
              <p
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                You can request a fresh verification email after logging in.
              </p>
            </div>
            <Link href="/" className="btn btn-primary w-full">
              Back to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-main min-h-screen flex items-center justify-center px-4 py-8">
          <div className="glass-card w-full max-w-md px-7 py-8 text-center">
            <div className="spinner spinner-lg mx-auto" />
            <p
              className="mt-4 text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              Loading verification page...
            </p>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
