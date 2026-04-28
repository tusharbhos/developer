// components/Header.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";

interface HeaderProps {
  variant?: "landing" | "app" | "auth";
}

export default function Header({ variant = "landing" }: HeaderProps) {
  const { user, logout } = useAuth();
  const { cartCount } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const [dropOpen, setDropOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        setDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
    setDropOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile drawer open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    await logout();
    router.push("/");
    setMobileOpen(false);
    setDropOpen(false);
  };

  const navLinks = [
    { href: "/home", label: "Home", icon: "🏁" },
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/projects", label: "Projects", icon: "🏠" },
    { href: "/customer", label: "Customers", icon: "👥" },
    { href: "/calendar", label: "Calendar", icon: "📅" },
  ];

  const showAuthButtons = variant === "landing";
  const showAppNav = variant === "app" && user;
  const isAdmin = user?.role === "admin";
  const isDeveloperSuperAdmin = user?.role === "developer_super_admin";
  const isSourcingAdmin = user?.role === "sourcing_admin";
  const canManageCompanyUsers =
    (user?.is_company_owner || isAdmin) && !isDeveloperSuperAdmin;
  const companyLabel =
    user?.company_name?.trim() || user?.name?.trim() || user?.email || "User";
  const avatarInitial = companyLabel.charAt(0).toUpperCase();

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-3 sm:px-4 md:px-8"
        style={{
          background: "var(--gradient-header)",
          height: "var(--header-height)",
          boxShadow: "0 2px 20px rgba(6,14,26,0.35)",
        }}
      >
        {/* ── Logo ── */}
        <Link href={user ? "/home" : "/"} className="shrink-0">
          <div
            style={{
              height: "2rem",
              width: "clamp(130px,35vw,192px)",
              display: "flex",
              alignItems: "center",
              position: "relative",
            }}
          >
            {!logoError ? (
              <Image
                src="/logo.png"
                alt="ChannelPartner.Network"
                fill
                sizes="(max-width:640px) 130px, 192px"
                className="bg-white rounded-md"
                style={{
                  objectFit: "contain",
                  objectPosition: "center",
                  height: "100%",
                }}
                priority
                onError={() => setLogoError(true)}
              />
            ) : (
              <span
                className="text-white font-bold"
                style={{ fontSize: "clamp(0.85rem,3vw,1rem)" }}
              >
                ChannelPartner.Network
              </span>
            )}
          </div>
        </Link>

        {/* ── Desktop nav (app variant) ── */}
        {showAppNav && (
          <nav className="hidden md:flex items-center gap-0.5 ml-2 shrink-0">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link key={link.href} href={link.href}>
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: active
                        ? "rgba(255,255,255,0.18)"
                        : "transparent",
                      color: active ? "#fff" : "rgba(255,255,255,0.72)",
                      border: active
                        ? "1px solid rgba(255,255,255,0.25)"
                        : "1px solid transparent",
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{link.icon}</span>
                    {link.label}
                  </button>
                </Link>
              );
            })}
          </nav>
        )}

        <div style={{ flex: 1 }} />

        {/* ── Landing auth buttons ── */}
        {showAuthButtons && (
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <Link href="/">
              <button
                className="btn btn-outline-white"
                style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
              >
                Log In
              </button>
            </Link>
            <Link href="/signup">
              <button
                className="btn btn-gold"
                style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
              >
                Sign Up
              </button>
            </Link>
          </nav>
        )}

        {/* ── Auth page nav ── */}
        {variant === "auth" && (
          <nav className="flex items-center gap-1.5">
            <Link href="/">
              <button
                className="btn btn-outline-white"
                style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
              >
                Projects
              </button>
            </Link>
            {pathname === "/" ? (
              <Link href="/signup">
                <button
                  className="btn btn-gold"
                  style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
                >
                  Sign Up
                </button>
              </Link>
            ) : (
              <Link href="/">
                <button
                  className="btn btn-gold"
                  style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
                >
                  Log In
                </button>
              </Link>
            )}
          </nav>
        )}

        {/* ── App user menu ── */}
        {variant === "app" && user && (
          <div className="flex items-center gap-1.5" ref={dropRef}>
            {/* Mobile hamburger */}
            <button
              className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-white transition-colors"
              style={{
                background: mobileOpen
                  ? "rgba(255,255,255,0.18)"
                  : "transparent",
              }}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menu"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={
                    mobileOpen
                      ? "M6 18L18 6M6 6l12 12"
                      : "M4 6h16M4 12h16M4 18h16"
                  }
                />
              </svg>
            </button>

            {/* Cart button */}
            {cartCount > 0 && (
              <button
                onClick={() => router.push("/cart")}
                className="relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors hover:bg-white/12"
                style={{ background: "rgba(255,255,255,0.08)" }}
                title="Go to cart"
              >
                <span style={{ fontSize: "1.25rem" }}>🛒</span>
                <span
                  className="absolute flex items-center justify-center text-xs font-bold text-white"
                  style={{
                    width: "20px",
                    height: "20px",
                    background: "#ef4444",
                    borderRadius: "50%",
                    border: "2px solid white",
                    top: "-6px",
                    right: "-6px",
                  }}
                >
                  {cartCount}
                </span>
              </button>
            )}

            {/* Avatar button */}
            <button
              onClick={() => setDropOpen(!dropOpen)}
              className="flex items-center gap-2 px-2 py-1 rounded-xl transition-all hover:bg-white/12"
              style={{ border: "1px solid rgba(255,255,255,0.18)" }}
            >
              <div
                className="flex items-center justify-center shrink-0 font-bold text-sm rounded-full"
                style={{
                  width: "1.9rem",
                  height: "1.9rem",
                  background: "var(--gold-400)",
                  color: "var(--navy-900)",
                  overflow: "hidden",
                }}
              >
                {user.profile_image_url ? (
                  <img
                    src={user.profile_image_url}
                    alt={user.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  avatarInitial
                )}
              </div>
              <div
                className="hidden sm:block text-left"
                style={{ maxWidth: 110 }}
              >
                <p className="text-white text-xs font-bold leading-tight truncate">
                  {companyLabel}
                </p>
              </div>
              <svg
                className={`hidden sm:block w-3.5 h-3.5 transition-transform ${dropOpen ? "rotate-180" : ""}`}
                style={{ color: "rgba(255,255,255,0.6)" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Desktop dropdown */}
            {dropOpen && (
              <div
                className="absolute right-3 sm:right-4 md:right-8 w-56 rounded-2xl shadow-xl overflow-hidden z-50 animate-scale-in"
                style={{
                  top: "calc(var(--header-height) + 6px)",
                  background: "#fff",
                  border: "1px solid var(--slate-200)",
                }}
              >
                <div
                  className="px-4 py-3"
                  style={{
                    background: "var(--navy-50)",
                    borderBottom: "1px solid var(--slate-200)",
                  }}
                >
                  <p className="text-xs" style={{ color: "var(--slate-400)" }}>
                    Signed in as
                  </p>
                  <p
                    className="font-bold text-sm "
                    style={{ color: "var(--navy-900)" }}
                  >
                    Company : {companyLabel}
                  </p>
                  <p className="text-xs " style={{ color: "var(--slate-500)" }}>
                    <b>Name :</b> {user.name} <br /> <b>Email :</b> {user.email}
                  </p>
                </div>
                <div className="py-1">
                  {[
                    ...(user?.role === "user" ||
                    user?.role === "admin" ||
                    user?.role === "developer_super_admin" ||
                    user?.role === "sourcing_admin" ||
                    user?.role === "sales_user"
                      ? [
                          {
                            icon: "👤",
                            label: "My Profile",
                            action: () => router.push("/profile"),
                          },
                        ]
                      : []),
                    ...(canManageCompanyUsers
                      ? [
                          {
                            icon: "🏢",
                            label: "Channel Partner User Management",
                            action: () => router.push("/company-users"),
                          },
                        ]
                      : []),
                    ...(isAdmin
                      ? [
                          {
                            icon: "🏗️",
                            label: "Developer User Management",
                            action: () => router.push("/developer-users"),
                          },
                        ]
                      : []),
                    ...(isAdmin || isDeveloperSuperAdmin
                      ? [
                          {
                            icon: "👥",
                            label: "Sourcing Manager Management",
                            action: () => router.push("/sourcing-managers"),
                          },
                        ]
                      : []),
                    ...(isAdmin || isSourcingAdmin || isDeveloperSuperAdmin
                      ? [
                          {
                            icon: "💼",
                            label: "Sales User Management",
                            action: () => router.push("/sales-users"),
                          },
                        ]
                      : []),
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => {
                        setDropOpen(false);
                        item.action();
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium flex items-center gap-2.5 hover:bg-blue-50 transition-colors"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      <span>{item.icon}</span> {item.label}
                    </button>
                  ))}
                </div>
                <div
                  className="py-1 border-t"
                  style={{ borderColor: "var(--slate-100)" }}
                >
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-sm font-bold flex items-center gap-2.5 hover:bg-red-50 transition-colors"
                    style={{ color: "var(--red-600)" }}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    Log Out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* ── Mobile drawer ── */}
      {variant === "app" && user && (
        <>
          {/* Backdrop */}
          {mobileOpen && (
            <div
              className="fixed inset-0 z-40 md:hidden"
              style={{
                background: "rgba(6,14,26,0.55)",
                backdropFilter: "blur(2px)",
              }}
              onClick={() => setMobileOpen(false)}
            />
          )}

          {/* Drawer */}
          <aside
            className="fixed left-0 bottom-0 z-50 md:hidden flex flex-col"
            style={{
              top: "var(--header-height)",
              width: "min(72vw, 260px)",
              background: "#fff",
              boxShadow: "var(--shadow-sidebar)",
              transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 0.28s ease",
            }}
          >
            {/* User info */}
            <div
              className="px-4 py-3"
              style={{
                background: "var(--navy-50)",
                borderBottom: "1px solid var(--slate-200)",
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold mb-2"
                style={{
                  background: "var(--gradient-btn-blue)",
                  color: "#fff",
                }}
              >
                {avatarInitial}
              </div>
              <p
                className="font-bold text-sm"
                style={{ color: "var(--navy-900)" }}
              >
                {companyLabel}
              </p>
              <p className="text-xs" style={{ color: "var(--slate-500)" }}>
                {user.email}
              </p>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto p-2">
              {navLinks.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                  >
                    <button
                      className="w-full text-left px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all mb-0.5"
                      style={{
                        background: active ? "var(--navy-50)" : "transparent",
                        color: active
                          ? "var(--navy-700)"
                          : "var(--color-text-secondary)",
                        borderLeft: active
                          ? `3px solid var(--navy-600)`
                          : "3px solid transparent",
                      }}
                    >
                      <span className="text-lg">{link.icon}</span>
                      {link.label}
                    </button>
                  </Link>
                );
              })}
              {canManageCompanyUsers && (
                <Link
                  href="/company-users"
                  onClick={() => setMobileOpen(false)}
                >
                  <button
                    className="w-full text-left px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all mb-0.5"
                    style={{
                      background:
                        pathname === "/company-users"
                          ? "var(--navy-50)"
                          : "transparent",
                      color:
                        pathname === "/company-users"
                          ? "var(--navy-700)"
                          : "var(--color-text-secondary)",
                      borderLeft:
                        pathname === "/company-users"
                          ? "3px solid var(--navy-600)"
                          : "3px solid transparent",
                    }}
                  >
                    <span className="text-lg">🏢</span>
                    Channel Partner Users
                  </button>
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/developer-users"
                  onClick={() => setMobileOpen(false)}
                >
                  <button
                    className="w-full text-left px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all mb-0.5"
                    style={{
                      background:
                        pathname === "/developer-users"
                          ? "var(--navy-50)"
                          : "transparent",
                      color:
                        pathname === "/developer-users"
                          ? "var(--navy-700)"
                          : "var(--color-text-secondary)",
                      borderLeft:
                        pathname === "/developer-users"
                          ? "3px solid var(--navy-600)"
                          : "3px solid transparent",
                    }}
                  >
                    <span className="text-lg">🏗️</span>
                    Developer Users
                  </button>
                </Link>
              )}
              {(isAdmin || isDeveloperSuperAdmin) && (
                <Link
                  href="/sourcing-managers"
                  onClick={() => setMobileOpen(false)}
                >
                  <button
                    className="w-full text-left px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all mb-0.5"
                    style={{
                      background:
                        pathname === "/sourcing-managers"
                          ? "var(--navy-50)"
                          : "transparent",
                      color:
                        pathname === "/sourcing-managers"
                          ? "var(--navy-700)"
                          : "var(--color-text-secondary)",
                      borderLeft:
                        pathname === "/sourcing-managers"
                          ? "3px solid var(--navy-600)"
                          : "3px solid transparent",
                    }}
                  >
                    <span className="text-lg">👥</span>
                    Sourcing Managers
                  </button>
                </Link>
              )}
              {(isAdmin || isSourcingAdmin || isDeveloperSuperAdmin) && (
                <Link href="/sales-users" onClick={() => setMobileOpen(false)}>
                  <button
                    className="w-full text-left px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all mb-0.5"
                    style={{
                      background:
                        pathname === "/sales-users"
                          ? "var(--navy-50)"
                          : "transparent",
                      color:
                        pathname === "/sales-users"
                          ? "var(--navy-700)"
                          : "var(--color-text-secondary)",
                      borderLeft:
                        pathname === "/sales-users"
                          ? "3px solid var(--navy-600)"
                          : "3px solid transparent",
                    }}
                  >
                    <span className="text-lg">💼</span>
                    Sales Users
                  </button>
                </Link>
              )}
            </nav>

            {/* Logout */}
            <div
              className="p-3 border-t"
              style={{
                borderColor: "var(--slate-100)",
                paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
              }}
            >
              <button
                onClick={handleLogout}
                className="w-full text-left px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 hover:bg-red-50 transition-colors"
                style={{ color: "var(--red-600)" }}
              >
                <span className="text-lg">🚪</span> Log Out
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
