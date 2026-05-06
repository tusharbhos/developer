"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";

type HomeAction = {
  label: string;
  subtitle: string;
  icon: string;
  href: string;
  tone: "primary" | "gold";
};

const PRIMARY_ACTIONS: HomeAction[] = [
  {
    label: "View / Add Customer",
    subtitle: "Manage customer profiles and meetings",
    icon: "👥",
    href: "/customer",
    tone: "primary",
  },
  {
    label: "View Projects",
    subtitle: "Browse projects and schedule meetings",
    icon: "🏠",
    href: "/projects",
    tone: "gold",
  },
  {
    label: "View Calendar",
    subtitle: "Open calendar and track schedules",
    icon: "📅",
    href: "/calendar",
    tone: "primary",
  },
];

export default function HomePage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-main flex items-center justify-center">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen flex flex-col bg-main">
      <Header variant="app" />

      <main className="flex-1" style={{ paddingTop: "var(--header-height)" }}>
        <div
          className="px-4 md:px-8 py-5"
          style={{ background: "var(--gradient-header)" }}
        >
          <div className="max-w-7xl mx-auto">
            <p className="page-banner-sub">Welcome</p>
            <h2 className="page-banner-title">
              Hello {user?.name || "conectr"}, choose your workspace
            </h2>
          </div>
        </div>

        <section className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8">
          <div
            className="glass-card p-5 md:p-7"
            style={{
              backdropFilter: "blur(18px) saturate(1.2)",
              background: "rgba(255,255,255,0.13)",
              boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.18)",
              border: "1.5px solid rgba(255,255,255,0.22)",
            }}
          >
            <p
              className="text-sm md:text-base font-semibold mb-5"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Quick Access
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PRIMARY_ACTIONS.map((action) => (
                <button
                  key={action.href}
                  type="button"
                  onClick={() => router.push(action.href)}
                  className="transition-all duration-200 border border-black bg-white/10 hover:bg-white/20 shadow-none rounded-2xl flex flex-col items-start justify-center px-4 py-6 text-left backdrop-blur-md"
                  style={{
                    minHeight: "100px",
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                  }}
                >
                  <span style={{ fontSize: "1.5rem", marginBottom: 8 }}>
                    {action.icon}
                  </span>
                  <span
                    className="block text-base font-semibold mb-1"
                    style={{ lineHeight: 1.2 }}
                  >
                    {action.label}
                  </span>
                  <span
                    className="block text-xs opacity-80"
                    style={{ lineHeight: 1.2 }}
                  >
                    {action.subtitle}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="transition-all duration-200 border border-black bg-white/10 hover:bg-white/20 shadow-none rounded-2xl flex items-center gap-2 w-full mt-4 px-4 py-4 text-left backdrop-blur-md"
              style={{
                minHeight: "56px",
                fontWeight: 500,
                color: "var(--color-text-primary)",
              }}
            >
              <span style={{ fontSize: "1.25rem" }}>📊</span>
              <span className="font-semibold">View Dashboard</span>
            </button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
