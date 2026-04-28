// app/projects/page.tsx
"use client";

import React, {
  JSX,
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchBar from "@/components/SearchBar";
import SidebarFilter, { SidebarOptions } from "@/components/SidebarFilter";
import PreSiteVisitModal from "@/components/PreSiteVisitModal";
import AddProjectModal from "@/components/AddProjectModal";
import AdminProjectLinkModal from "@/components/AdminProjectLinkModal";
import { DEFAULT_FILTERS, FilterState } from "@/lib/mockData";
import { ActivationApprovalProject, ActivationRequestAPI } from "@/lib/api";
import { getToken } from "@/lib/api";
import {
  ApiProject,
  fetchAllProjects,
  fetchMeta,
  getProjectDetailPath,
  getProjectShowcaseVideo,
  getProjectShowcaseVideos,
  mediaUrl,
  normalize,
  toCardPrice,
  toNumber,
  toStatusLabel,
} from "@/lib/conectr";

/* ── how many cards per "page" load ── */
const PAGE_SIZE = 12;
const PROJECTS_CACHE_KEY = "projects:list:v1";

function valueInString(selected: string[], actual: string): boolean {
  if (!selected.length) return true;
  const target = actual.toLowerCase();
  return selected.some((e) => target.includes(e.toLowerCase()));
}
function intersects(selected: string[], actual: string[]): boolean {
  if (!selected.length) return true;
  const bag = new Set(actual.map((v) => v.toLowerCase()));
  return selected.some((e) => bag.has(e.toLowerCase()));
}

function uniqueNormalized(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  values.forEach((value) => {
    const clean = normalize(value);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(clean);
  });

  return output;
}

function uniqueOptionPairs(
  options: Array<{ label: string; value: string }>,
): Array<{ label: string; value: string }> {
  const seen = new Set<string>();
  const output: Array<{ label: string; value: string }> = [];

  options.forEach((item) => {
    const label = normalize(item.label);
    const value = normalize(item.value).toLowerCase();
    if (!label || !value || seen.has(value)) return;
    seen.add(value);
    output.push({ label, value });
  });

  return output;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  "under construction": { bg: "rgba(249,115,22,0.12)", color: "#b47a00" },
  ready: { bg: "rgba(22,163,74,0.12)", color: "#15803d" },
  "ready to move": { bg: "rgba(22,163,74,0.12)", color: "#15803d" },
  default: { bg: "rgba(30,69,128,0.1)", color: "#1e4580" },
};

function getApprovalPromptDismissKey(token: string | null): string | null {
  if (!token) return null;
  return `approval_prompt_closed:${token}`;
}

function getWelcomePromptDismissKey(token: string | null): string | null {
  if (!token) return null;
  return `welcome_prompt_closed:${token}`;
}

function statusStyle(label: string) {
  const key = label.toLowerCase();
  return STATUS_COLORS[key] ?? STATUS_COLORS["default"];
}

function InfoIcon({
  type,
}: {
  type: "type" | "area" | "possession" | "units";
}) {
  const icons: Record<string, JSX.Element> = {
    type: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    ),
    area: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
      />
    ),
    possession: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    ),
    units: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
      />
    ),
  };
  return (
    <svg
      className="w-3 h-3 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      {icons[type]}
    </svg>
  );
}

function PageLoader() {
  return (
    <div className="page-loader">
      <div className="spinner spinner-lg" />
      <p className="page-loader-text">Loading projects…</p>
    </div>
  );
}

function AddProjectBanner({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 md:p-5 rounded-2xl"
      style={{
        background:
          "linear-gradient(135deg,rgba(30,69,128,0.06) 0%,rgba(249,115,22,0.08) 100%)",
        border: "1.5px dashed rgba(30,69,128,0.25)",
      }}
    >
      <div className="flex items-center gap-3 md:gap-4">
        <div
          className="w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "var(--navy-50)",
            border: "1.5px solid var(--navy-100)",
          }}
        >
          <span className="text-xl md:text-2xl">🏗️</span>
        </div>
        <div>
          <p
            className="font-bold text-sm"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--navy-900)",
            }}
          >
            Don't find your project?
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            Request to activate any project on ChannelPartner.Network
          </p>
        </div>
      </div>
      <button
        onClick={onAdd}
        className="btn btn-primary shrink-0 w-full sm:w-auto gap-2"
        style={{ whiteSpace: "nowrap" }}
      >
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
            d="M12 4v16m8-8H4"
          />
        </svg>
        Add New Project
      </button>
    </div>
  );
}

/* ── Skeleton card shown while loading more ── */
function SkeletonCard() {
  return (
    <article
      className="card flex flex-col"
      style={{
        borderRadius: "var(--radius-xl)",
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <div
        className="skeleton"
        style={{ height: "clamp(120px,22vw,152px)", borderRadius: 0 }}
      />
      <div className="p-3.5 md:p-4 flex flex-col gap-3">
        <div>
          <div
            className="skeleton"
            style={{
              height: 14,
              width: "70%",
              borderRadius: 4,
              marginBottom: 6,
            }}
          />
          <div
            className="skeleton"
            style={{ height: 10, width: "45%", borderRadius: 4 }}
          />
        </div>
        <div
          className="skeleton"
          style={{ height: 10, width: "85%", borderRadius: 4 }}
        />
        <div
          className="skeleton"
          style={{ height: 16, width: "40%", borderRadius: 4 }}
        />
        <div className="grid grid-cols-2 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 44, borderRadius: 8 }}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            className="skeleton"
            style={{ height: 22, width: 80, borderRadius: 999 }}
          />
          <div
            className="skeleton"
            style={{ height: 30, width: 80, borderRadius: 8 }}
          />
        </div>
      </div>
    </article>
  );
}

function AutoPlayVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => {});
  }, [src]);
  return (
    <video
      ref={videoRef}
      src={src}
      loop
      muted
      playsInline
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        pointerEvents: "none",
      }}
    />
  );
}

function ProjectCardUI({
  project,
  onSchedule,
  onAddToCart,
  onViewDetails,
  isInCart,
  hideCustomerActions,
}: {
  project: ApiProject;
  onSchedule: (name: string) => void;
  onAddToCart: (project: ApiProject) => void;
  onViewDetails: (project: ApiProject) => void;
  isInCart: boolean;
  hideCustomerActions: boolean;
}) {
  const title = normalize(project.title) || "Untitled Project";
  const developer = normalize(project.developer) || "Developer not available";
  const location = normalize(project.location) || "Location not available";
  const image =
    mediaUrl(project.background_image_mobile) ??
    mediaUrl(project.background_image_desktop) ??
    mediaUrl(project.main_logo);
  const showcaseVideos = useMemo(
    () => getProjectShowcaseVideos(project),
    [project],
  );
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);

  useEffect(() => {
    setActiveVideoIndex(0);
  }, [project.id, showcaseVideos.length]);

  const hasMultipleVideos = showcaseVideos.length > 1;
  const showcaseVideoUrl =
    showcaseVideos[activeVideoIndex] ?? getProjectShowcaseVideo(project);

  const goNextVideo = useCallback(() => {
    if (!showcaseVideos.length) return;
    setActiveVideoIndex((prev) => (prev + 1) % showcaseVideos.length);
  }, [showcaseVideos.length]);

  const units = project.units ?? [];
  const areaMin = units.map((u) => toNumber(u.area_min)).filter((v) => v > 0);
  const areaMax = units.map((u) => toNumber(u.area_max)).filter((v) => v > 0);
  const unitTypes = Array.from(
    new Set(units.map((u) => normalize(u.unit_type)).filter(Boolean)),
  );

  const areaText =
    areaMin.length || areaMax.length
      ? `${Math.min(...(areaMin.length ? areaMin : areaMax)).toLocaleString("en-IN")} – ${Math.max(...(areaMax.length ? areaMax : areaMin)).toLocaleString("en-IN")} sq.ft`
      : "—";

  const typeText = unitTypes.length ? unitTypes.join(" / ") : "—";
  const possession = normalize(project.possession_date) || "—";
  const status = toStatusLabel(normalize(project.development_status));
  const sc = statusStyle(status);

  return (
    <article
      className="card glass-card project-card-glow flex flex-col"
      style={{
        borderRadius: "var(--radius-xl)",
        overflow: "hidden",
        background: "rgba(255,255,255,0.2)",
        border: "1px solid rgba(255,255,255,0.45)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {showcaseVideoUrl ? (
        <div
          style={{
            height: "clamp(120px,22vw,152px)",
            overflow: "hidden",
            background: "#020617",
          }}
        >
          <video
            src={showcaseVideoUrl}
            autoPlay
            loop={!hasMultipleVideos}
            muted
            playsInline
            preload="auto"
            onEnded={hasMultipleVideos ? goNextVideo : undefined}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        </div>
      ) : image ? (
        <div
          style={{
            height: "clamp(120px,22vw,152px)",
            overflow: "hidden",
            background: "#f1f5f9",
          }}
        >
          <img
            src={image}
            alt={title}
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transition: "transform 0.4s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLImageElement).style.transform =
                "scale(1.04)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLImageElement).style.transform =
                "scale(1)";
            }}
          />
        </div>
      ) : (
        <div
          style={{
            height: "clamp(120px,22vw,152px)",
            background:
              "linear-gradient(135deg,var(--navy-900) 0%,var(--navy-700) 100%)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            className="skeleton"
            style={{ position: "absolute", inset: 0, borderRadius: 0 }}
          />
          <div
            style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}
          >
            <div
              className="skeleton"
              style={{
                height: 10,
                width: "55%",
                marginBottom: 6,
                borderRadius: 4,
              }}
            />
            <div
              className="skeleton"
              style={{ height: 8, width: "38%", borderRadius: 4 }}
            />
          </div>
        </div>
      )}

      <div
        className="p-3.5 md:p-4 flex flex-col flex-1"
        style={{ gap: "0.6rem" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3
              className="font-bold leading-snug truncate"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--navy-900)",
                fontSize: "clamp(0.82rem,2vw,0.9rem)",
              }}
            >
              {title}
            </h3>
            <p
              className="text-xs truncate mt-0.5"
              style={{ color: "var(--color-text-muted)" }}
            >
              {developer}
            </p>
          </div>
          <button
            onClick={() => onViewDetails(project)}
            className="btn btn-ghost shrink-0"
            style={{
              fontSize: "0.72rem",
              padding: "0.38rem 0.72rem",
              border: "1px solid rgba(30,69,128,0.18)",
              color: "var(--navy-700)",
              background: "rgba(255,255,255,0.55)",
              whiteSpace: "nowrap",
            }}
            title="Open full project details"
          >
            View Details
          </button>
        </div>
        <p
          className="text-xs"
          style={{
            color: "var(--color-text-muted)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          📍 {location}
        </p>
        <p
          className="font-bold"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--orange-600)",
            fontSize: "clamp(0.9rem,2.5vw,1.05rem)",
          }}
        >
          {toCardPrice(project)}
        </p>

        <div className="grid grid-cols-2 gap-1.5 flex-1">
          {[
            {
              key: "type",
              label: "Type",
              val: typeText,
              icon: "type" as const,
            },
            {
              key: "area",
              label: "Area",
              val: areaText,
              icon: "area" as const,
            },
            {
              key: "possession",
              label: "Possession",
              val: possession,
              icon: "possession" as const,
            },
            {
              key: "units",
              label: "Units Left",
              val: `${toNumber(project.available_units) || 0}`,
              icon: "units" as const,
            },
          ].map((info) => (
            <div
              key={info.key}
              className="px-2 py-1.5 rounded-lg"
              style={{
                background: "var(--slate-50)",
                border: "1px solid var(--slate-100)",
              }}
            >
              <div
                className="flex items-center gap-1 mb-0.5"
                style={{ color: "var(--color-text-hint)" }}
              >
                <InfoIcon type={info.icon} />
                <p
                  style={{
                    fontSize: "9px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {info.label}
                </p>
              </div>
              <p
                className="text-xs font-semibold truncate"
                style={{ color: "var(--color-text-primary)" }}
              >
                {info.val}
              </p>
            </div>
          ))}
        </div>

        <div className="flex items-center w-full mt-auto pt-1 gap-2 min-w-0">
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full truncate min-w-0"
            style={{ background: sc.bg, color: sc.color }}
            title={status}
          >
            {status}
          </span>
          {!hideCustomerActions && (
            <button
              onClick={() => onAddToCart(project)}
              className={isInCart ? "btn btn-ghost" : "btn btn-primary"}
              disabled={isInCart}
              style={{
                fontSize: "0.7rem",
                padding: "0.34rem 0.55rem",
                whiteSpace: "nowrap",
                flexShrink: 0,
                marginLeft: "auto",
              }}
              title={
                isInCart
                  ? "Project is already in cart"
                  : "Add this project to customer cart"
              }
            >
              {isInCart ? "Added To Cart" : "Add To Cart"}
            </button>
          )}
        </div>
        {!hideCustomerActions && (
          <div className="flex items-center w-full mt-auto pt-1 gap-2">
            <button
              onClick={() => onSchedule(title)}
              className="btn btn-gold w-full"
              style={{
                fontSize: "0.7rem",
                padding: "0.34rem 0.72rem",
                flexShrink: 0,
              }}
              title="Schedule Pre-Site visit Matchmaking Session"
            >
              Schedule Pre-Site visit Matchmaking Session
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/* ══════════════════════════════════════════════════
   WELCOME PROFILE POPUP
══════════════════════════════════════════════════ */
function WelcomeProfilePopup({
  userName,
  onLater,
  onStartNow,
}: {
  userName: string;
  onLater: () => void;
  onStartNow: () => void;
}) {
  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div
        className="glass-card animate-fade-in-up"
        style={{
          maxWidth: "420px",
          background: "var(--navy-50)",
          width: "calc(100% - 2rem)",
          padding: "2rem 1.75rem",
          borderRadius: "var(--radius-2xl)",
          textAlign: "center",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--gradient-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1rem",
            fontSize: "1.75rem",
          }}
        >
          🎯
        </div>

        {/* Heading */}
        <h2
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--navy-900)",
            fontSize: "1.25rem",
            fontWeight: 800,
            marginBottom: "0.5rem",
            lineHeight: 1.3,
          }}
        >
          Welcome, {userName}! 👋
        </h2>

        {/* Sub-heading */}
        <p
          style={{
            color: "var(--orange-600)",
            fontWeight: 700,
            fontSize: "0.85rem",
            marginBottom: "0.75rem",
          }}
        >
          Complete Your Partner Profile
        </p>

        {/* Body text */}
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "0.9rem",
            lineHeight: 1.6,
            marginBottom: "1.5rem",
          }}
        >
          This form will help us to show you projects that are most suited for
          you!
        </p>

        {/* Buttons */}
        <div
          style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}
        >
          <button
            onClick={onLater}
            className="btn btn-ghost"
            style={{ flex: 1, maxWidth: "160px", fontSize: "0.875rem" }}
          >
            Do It Later
          </button>
          <button
            onClick={onStartNow}
            className="btn btn-gold"
            style={{ flex: 1, maxWidth: "160px", fontSize: "0.875rem" }}
          >
            Start Now →
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectApprovalHubModal({
  isOpen,
  projects,
  loading,
  approvingId,
  onClose,
  onApprove,
}: {
  isOpen: boolean;
  projects: ActivationApprovalProject[];
  loading: boolean;
  approvingId: number | null;
  onClose: () => void;
  onApprove: (id: number) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div
        className="glass-card"
        style={{
          width: "min(960px, calc(100% - 1.25rem))",
          maxHeight: "calc(100dvh - env(safe-area-inset-bottom) - 4rem)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "1rem 1.1rem",
            borderBottom: "1px solid var(--slate-200)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.7rem",
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "1rem",
                fontFamily: "var(--font-display)",
                color: "var(--navy-900)",
                fontWeight: 800,
              }}
            >
              Project Approval - Channel Partner Approval
            </h3>
            <p
              style={{
                margin: "0.25rem 0 0",
                fontSize: "0.78rem",
                color: "var(--color-text-muted)",
              }}
            >
              Onboarding Projects
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ padding: "0.9rem", overflowY: "auto" }}>
          {loading ? (
            <div className="page-loader" style={{ minHeight: "180px" }}>
              <div className="spinner spinner-lg" />
              <p className="page-loader-text">Loading onboarding projects…</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-4xl mb-2">📭</p>
              <p
                style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}
              >
                No activation projects found.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="card"
                  style={{
                    borderRadius: "var(--radius-xl)",
                    padding: "0.95rem",
                    border: "1px solid var(--slate-200)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.95rem",
                      color: "var(--navy-900)",
                      fontWeight: 800,
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {p.project_name}
                  </p>

                  <div
                    style={{
                      marginTop: "0.55rem",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.4rem",
                      fontSize: "0.76rem",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <div>Developer: {p.developer_name || "-"}</div>
                    <div>Location: {p.city || "-"}</div>
                    <div>Type of Units: {p.unit_structure || "-"}</div>
                    <div>Price Range: {p.price_range || "-"}</div>
                    <div>Units Available: {p.units_left ?? 0}</div>
                    <div>Status: {p.status}</div>
                  </div>

                  <div
                    style={{
                      marginTop: "0.7rem",
                      padding: "0.55rem 0.65rem",
                      borderRadius: "var(--radius-md)",
                      background: "var(--slate-50)",
                      border: "1px solid var(--slate-200)",
                      fontSize: "0.74rem",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Total Approvals: {p.approval_count ?? 0}
                  </div>

                  <button
                    className="btn btn-gold"
                    style={{ marginTop: "0.65rem", width: "100%" }}
                    onClick={() => onApprove(p.id)}
                    disabled={
                      approvingId === p.id || (p.my_approval_attempts ?? 0) > 0
                    }
                  >
                    {approvingId === p.id
                      ? "Submitting Approval..."
                      : (p.my_approval_attempts ?? 0) > 0
                        ? "Already Approved"
                        : "Give Approval"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════ */
export default function ProjectsPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { addToCart, cartCount, cartItems } = useCart();
  const router = useRouter();

  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const [showApprovalHub, setShowApprovalHub] = useState(false);
  const [showApprovalPrompt, setShowApprovalPrompt] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [toast, setToast] = useState("");
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [adminLinkOpen, setAdminLinkOpen] = useState(false);

  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [approvalProjects, setApprovalProjects] = useState<
    ActivationApprovalProject[]
  >([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  /* ── pagination state ── */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [filterOptions, setFilterOptions] = useState<SidebarOptions>({
    projects: [],
    categories: [],
    tags: [],
    amenities: [],
    developers: [],
    locations: [],
    developmentStatus: [],
    bestSuited: [],
    unitTypes: [],
    areaRange: { min: 200, max: 10000 },
    priceRange: { min: 100000, max: 50000000 },
  });
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const cartProjectIds = useMemo(
    () => new Set(cartItems.map((item) => item.id)),
    [cartItems],
  );

  const isAdmin = user?.role === "admin";
  const isOwner = Boolean(user?.is_company_owner);
  const isRegularCompanyUser = Boolean(user?.company_id) && !isOwner;
  const isRestrictedProjectRole = Boolean(
    user?.role &&
    ["developer_super_admin", "sourcing_admin", "sales_user"].includes(
      user.role,
    ),
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/");
  }, [isAuthenticated, isLoading, router]);

  /* ── Show welcome popup only for user/admin role when profile is incomplete ── */
  useEffect(() => {
    if (!user) return;

    // Only show for role "user" or "admin"
    if (user.role !== "user" && user.role !== "admin") {
      setShowWelcomePopup(false);
      return;
    }

    // DB-backed profile completeness checks from /auth/me payload.
    const hasBasicProfile = Boolean(
      user.name?.trim() &&
      user.phone?.trim() &&
      user.city?.trim() &&
      user.company_name?.trim() &&
      user.rera_no?.trim() &&
      user.address?.trim(),
    );
    const hasPreferenceProfile = Boolean(
      user.primary_market ||
      (user.budget_segments && user.budget_segments.length > 0) ||
      (user.buyer_types && user.buyer_types.length > 0) ||
      user.activation_intent ||
      (user.channels_used && user.channels_used.length > 0),
    );
    const profileCompleted =
      Boolean(user.onboarding_step && user.onboarding_step >= 3) &&
      hasBasicProfile &&
      hasPreferenceProfile;

    if (profileCompleted) {
      setShowWelcomePopup(false);
      return;
    }

    const dismissKey = getWelcomePromptDismissKey(getToken());
    if (!dismissKey || typeof window === "undefined") {
      setShowWelcomePopup(true);
      return;
    }

    const isDismissed = window.sessionStorage.getItem(dismissKey) === "1";
    setShowWelcomePopup(!isDismissed);
  }, [user]);

  const dismissWelcome = () => {
    const dismissKey = getWelcomePromptDismissKey(getToken());
    if (dismissKey && typeof window !== "undefined") {
      window.sessionStorage.setItem(dismissKey, "1");
    }
    setShowWelcomePopup(false);
  };

  const goProfile = () => {
    dismissWelcome();
    router.push("/profile");
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;

    const loadProjects = async () => {
      let usedCache = false;
      if (typeof window !== "undefined") {
        const cachedProjects =
          window.sessionStorage.getItem(PROJECTS_CACHE_KEY);
        if (cachedProjects) {
          try {
            const parsedProjects = JSON.parse(cachedProjects) as ApiProject[];
            if (Array.isArray(parsedProjects) && parsedProjects.length > 0) {
              if (active) {
                setProjects(parsedProjects);
                setProjectsLoading(false);
              }
              usedCache = true;
            }
          } catch {
            // ignore stale cache
          }
        }
      }

      try {
        if (!usedCache) setProjectsLoading(true);
        const { projects: all } = await fetchAllProjects();
        if (active) {
          setProjects(all);
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(
              PROJECTS_CACHE_KEY,
              JSON.stringify(all),
            );
          }
        }
      } catch {
        if (active && !usedCache) setProjects([]);
      } finally {
        if (active) setProjectsLoading(false);
      }
    };

    const loadMeta = async () => {
      try {
        setMetaLoading(true);
        const data = await fetchMeta();
        const filtersMap = new Map(
          (data.filters ?? []).map((item) => [item.key, item]),
        );

        const categories = (filtersMap.get("categories")?.options ?? [])
          .map((o) => normalize(o.name))
          .filter(Boolean);
        const tags = (filtersMap.get("tags")?.options ?? [])
          .map((o) => normalize(o.name))
          .filter(Boolean);
        const amenities = (filtersMap.get("amenities")?.options ?? [])
          .map((o) => normalize(o.name))
          .filter(Boolean);
        const developers = (filtersMap.get("developer")?.options ?? [])
          .map((o) => normalize(o.name))
          .filter(Boolean);
        const locations = (filtersMap.get("location")?.options ?? [])
          .map((o) => normalize(o.name))
          .filter(Boolean);
        const developmentStatus = (
          filtersMap.get("development_status")?.options ?? []
        )
          .map((o) => ({
            label: normalize(o.name),
            value: normalize(o.value ?? o.name).toLowerCase(),
          }))
          .filter((o) => o.label && o.value);
        const bestSuited = (filtersMap.get("best_suited")?.options ?? [])
          .map((o) => ({
            label: normalize(o.name),
            value: normalize(o.value ?? o.name).toLowerCase(),
          }))
          .filter((o) => o.label && o.value);
        const unitTypes = (filtersMap.get("unit_type")?.options ?? [])
          .map((o) => normalize(o.name))
          .filter(Boolean);
        const areaFilter = filtersMap.get("area");
        const priceFilter = filtersMap.get("price");
        const areaRange = {
          min: Math.max(0, toNumber(areaFilter?.min) || 200),
          max: Math.max(
            toNumber(areaFilter?.max) || 10000,
            toNumber(areaFilter?.min) || 200,
          ),
        };
        const priceRange = {
          min: Math.max(0, toNumber(priceFilter?.min) || 100000),
          max: Math.max(
            toNumber(priceFilter?.max) || 50000000,
            toNumber(priceFilter?.min) || 100000,
          ),
        };

        if (!active) return;
        setFilterOptions((prev) => ({
          ...prev,
          categories,
          tags,
          amenities,
          developers,
          locations,
          developmentStatus,
          bestSuited,
          unitTypes,
          areaRange,
          priceRange,
        }));
        setFilters((prev) => ({
          ...prev,
          areaMin: areaRange.min,
          areaMax: areaRange.max,
          priceMin: priceRange.min,
          priceMax: priceRange.max,
        }));
      } catch {
      } finally {
        if (active) setMetaLoading(false);
      }
    };

    loadProjects();
    loadMeta();
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const projectNames = Array.from(
      new Set(projects.map((p) => normalize(p.title)).filter(Boolean)),
    );
    setFilterOptions((prev) => ({
      ...prev,
      projects: projectNames,
      developers: prev.developers.length
        ? prev.developers
        : Array.from(
            new Set(
              projects.map((p) => normalize(p.developer)).filter(Boolean),
            ),
          ),
      locations: prev.locations.length
        ? prev.locations
        : Array.from(
            new Set(projects.map((p) => normalize(p.location)).filter(Boolean)),
          ),
    }));
  }, [projects]);

  /* ── filtered list (all matches) ── */
  const filteredProjects = useMemo(() => {
    const query = search.toLowerCase().trim();
    const isDeveloperSuperAdmin = user?.role === "developer_super_admin";
    const isSourcingAdmin = user?.role === "sourcing_admin";
    const isSalesUser = user?.role === "sales_user";
    const actorDeveloperName = normalize(user?.developer_name);
    const assignedProjectSet = new Set(
      (user?.assigned_projects ?? []).map((name) => normalize(name)),
    );

    return projects.filter((project) => {
      const title = normalize(project.title);
      const developer = normalize(project.developer);
      const location = normalize(project.location);

      if (isDeveloperSuperAdmin) {
        // Developer super admin can see only projects mapped to their developer name.
        if (!actorDeveloperName || !developer) return false;
        if (developer.toLowerCase() !== actorDeveloperName.toLowerCase()) {
          return false;
        }
      }

      if (isSourcingAdmin || isSalesUser) {
        // Sourcing admin and sales user can see only explicitly assigned projects.
        if (assignedProjectSet.size === 0) return false;
        if (!title || !assignedProjectSet.has(title)) return false;
      }

      const status = normalize(project.development_status).toLowerCase();
      const suited = normalize(project.best_suited).toLowerCase();
      const categories = (project.categories ?? []).map((item) =>
        normalize(item.name),
      );
      const tags = (project.tags ?? []).map((item) => normalize(item.name));
      const amenities = (project.amenities ?? []).map((item) =>
        normalize(item.name),
      );
      const unitTypes = (project.units ?? []).map((unit) =>
        normalize(unit.unit_type),
      );

      const projectMinArea = Math.min(
        ...(project.units ?? [])
          .map((u) => toNumber(u.area_min))
          .filter((v) => v > 0),
      );
      const projectMaxArea = Math.max(
        ...(project.units ?? [])
          .map((u) => toNumber(u.area_max))
          .filter((v) => v > 0),
      );
      const projectMinPrice = Math.min(
        ...(project.units ?? [])
          .map((u) => toNumber(u.price_min))
          .filter((v) => v > 0),
      );
      const projectMaxPrice = Math.max(
        ...(project.units ?? [])
          .map((u) => toNumber(u.price_max))
          .filter((v) => v > 0),
      );
      const availableUnits = Math.max(
        toNumber(project.available_units),
        ...(project.units ?? []).map((u) => toNumber(u.available_units)),
      );

      const matchSearch =
        !query ||
        title.toLowerCase().includes(query) ||
        developer.toLowerCase().includes(query) ||
        location.toLowerCase().includes(query);
      const matchProject =
        !filters.projectName.length || filters.projectName.includes(title);
      const matchDeveloper = valueInString(filters.developer, developer);
      const matchLocation = valueInString(filters.location, location);
      const matchCategories = intersects(filters.categories, categories);
      const matchTags = intersects(filters.tags, tags);
      const matchAmenities = intersects(filters.amenities, amenities);
      const matchStatus =
        !filters.developmentStatus || filters.developmentStatus === status;
      const matchBestSuited =
        !filters.bestSuited || filters.bestSuited === suited;
      const matchUnitType = intersects(filters.unitTypes, unitTypes);
      const matchArea =
        (!Number.isFinite(projectMinArea) ||
          projectMinArea <= filters.areaMax) &&
        (!Number.isFinite(projectMaxArea) || projectMaxArea >= filters.areaMin);
      const matchPrice =
        (!Number.isFinite(projectMinPrice) ||
          projectMinPrice <= filters.priceMax) &&
        (!Number.isFinite(projectMaxPrice) ||
          projectMaxPrice >= filters.priceMin);
      const matchUnits = availableUnits >= filters.unitsAvailable;
      const possessionDate = project.possession_date
        ? new Date(project.possession_date)
        : null;
      const matchPossessionExact =
        !filters.possessionDate ||
        (project.possession_date ?? "").startsWith(filters.possessionDate);
      const matchPossessionWithinYears =
        !filters.possessionWithinYears ||
        (possessionDate !== null &&
          possessionDate.getTime() <=
            new Date(
              new Date().setFullYear(
                new Date().getFullYear() + filters.possessionWithinYears,
              ),
            ).getTime());

      return (
        matchSearch &&
        matchProject &&
        matchDeveloper &&
        matchLocation &&
        matchCategories &&
        matchTags &&
        matchAmenities &&
        matchStatus &&
        matchBestSuited &&
        matchUnitType &&
        matchArea &&
        matchPrice &&
        matchUnits &&
        matchPossessionExact &&
        matchPossessionWithinYears
      );
    });
  }, [
    projects,
    search,
    filters,
    user?.role,
    user?.developer_name,
    user?.assigned_projects,
  ]);

  /* ── reset visible count when filter/search changes ── */
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, filters]);

  /* ── visible slice ── */
  const visibleProjects = useMemo(
    () => filteredProjects.slice(0, visibleCount),
    [filteredProjects, visibleCount],
  );

  const hasMore = visibleCount < filteredProjects.length;

  /* ── IntersectionObserver — load more when sentinel enters viewport ── */
  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    setVisibleCount((prev) =>
      Math.min(prev + PAGE_SIZE, filteredProjects.length),
    );
    setLoadingMore(false);
  }, [hasMore, loadingMore, filteredProjects.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" }, // trigger 200px before sentinel is visible
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const activeFilterCount = [
    filters.projectName.length,
    filters.categories.length,
    filters.tags.length,
    filters.developer.length,
    filters.location.length,
    filters.amenities.length,
    filters.unitTypes.length,
    filters.developmentStatus ? 1 : 0,
    filters.bestSuited ? 1 : 0,
    filters.possessionDate ? 1 : 0,
    filters.possessionWithinYears ? 1 : 0,
    filters.unitsAvailable ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const handleSchedule = (name: string) => {
    setSelectedProject(name);
    setScheduleOpen(true);
  };
  const handleScheduled = () => {
    setToast(`Meeting scheduled for "${selectedProject}".`);
    setTimeout(() => setToast(""), 3500);
  };

  const handleAddToCart = (project: ApiProject) => {
    const title = normalize(project.title) || "Untitled Project";
    const image_url =
      mediaUrl(project.background_image_mobile) ||
      mediaUrl(project.background_image_desktop) ||
      mediaUrl(project.main_logo) ||
      "";

    addToCart({
      id: project.id,
      title,
      image_url,
    });

    setToast(`"${title}" added to cart! 🛒`);
    setTimeout(() => setToast(""), 3000);
  };

  const handleViewDetails = (project: ApiProject) => {
    router.push(getProjectDetailPath(project));
  };

  const loadApprovalProjects = useCallback(async () => {
    try {
      setApprovalLoading(true);
      const res = await ActivationRequestAPI.getMyProjects();
      setApprovalProjects(res.data ?? []);
    } catch (e: unknown) {
      const msg =
        (e as { message?: string }).message ??
        "Unable to load onboarding projects.";
      setToast(msg);
      setTimeout(() => setToast(""), 3000);
    } finally {
      setApprovalLoading(false);
    }
  }, []);

  const openApprovalHub = async () => {
    setShowApprovalHub(true);
    await loadApprovalProjects();
  };

  const handleGiveApproval = async (id: number) => {
    try {
      setApprovingId(id);
      await ActivationRequestAPI.approve(id);
      setApprovalProjects((prev) => prev.filter((row) => row.id !== id));
      setToast("Approval submitted successfully.");
      setTimeout(() => setToast(""), 2200);
    } catch (e: unknown) {
      const msg =
        (e as { message?: string }).message ?? "Approval submission failed.";
      setToast(msg);
      setTimeout(() => setToast(""), 3000);
    } finally {
      setApprovingId(null);
    }
  };

  useEffect(() => {
    if (isAuthenticated && (!isRegularCompanyUser || isRestrictedProjectRole)) {
      loadApprovalProjects();
    }
  }, [
    isAuthenticated,
    isRegularCompanyUser,
    isRestrictedProjectRole,
    loadApprovalProjects,
  ]);

  const pendingApprovalProjects = useMemo(
    () => approvalProjects.filter((p) => (p.my_approval_attempts ?? 0) === 0),
    [approvalProjects],
  );
  const hideCustomerActions =
    user?.role === "developer_super_admin" ||
    user?.role === "sourcing_admin" ||
    user?.role === "sales_user";
  const approvalLeadCount = pendingApprovalProjects.length;

  useEffect(() => {
    if (approvalLeadCount === 0) {
      setShowApprovalPrompt(false);
      return;
    }

    const dismissKey = getApprovalPromptDismissKey(getToken());
    if (!dismissKey || typeof window === "undefined") {
      setShowApprovalPrompt(true);
      return;
    }

    const isDismissed = window.sessionStorage.getItem(dismissKey) === "1";
    setShowApprovalPrompt(!isDismissed);
  }, [approvalLeadCount]);

  const closeApprovalPrompt = useCallback(() => {
    const dismissKey = getApprovalPromptDismissKey(getToken());
    if (dismissKey && typeof window !== "undefined") {
      window.sessionStorage.setItem(dismissKey, "1");
    }
    setShowApprovalPrompt(false);
  }, []);

  if (isLoading || projectsLoading) return <PageLoader />;
  if (!isAuthenticated) return null;

  return (
    <div className="bg-main min-h-screen flex flex-col">
      {/* ── Welcome Profile Popup ── */}
      {showWelcomePopup && user && (
        <WelcomeProfilePopup
          userName={user.name}
          onLater={dismissWelcome}
          onStartNow={goProfile}
        />
      )}

      <Header variant="app" />

      <SidebarFilter
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        filters={filters}
        onFiltersChange={setFilters}
        options={filterOptions}
      />

      <PreSiteVisitModal
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        projectName={selectedProject}
        onScheduled={handleScheduled}
      />

      <AddProjectModal
        isOpen={addProjectOpen}
        onClose={() => setAddProjectOpen(false)}
        userName={user?.name ?? "Channel Partner"}
        company_name={user?.company_name ?? ""}
        onSuccess={() => {
          setToast("Project request submitted successfully.");
          setTimeout(() => setToast(""), 3500);
        }}
      />

      {isAdmin && (
        <AdminProjectLinkModal
          isOpen={adminLinkOpen}
          onClose={() => setAdminLinkOpen(false)}
          onSuccess={() => {
            setToast("Project link saved successfully.");
            setTimeout(() => setToast(""), 3500);
          }}
        />
      )}

      <ProjectApprovalHubModal
        isOpen={showApprovalHub}
        projects={pendingApprovalProjects}
        loading={approvalLoading}
        approvingId={approvingId}
        onClose={() => setShowApprovalHub(false)}
        onApprove={handleGiveApproval}
      />

      {/* Toast */}
      {toast && (
        <div
          className="fixed z-50 animate-fade-in-up"
          style={{
            bottom: "1.25rem",
            right: "1rem",
            left: "1rem",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg max-w-sm w-full"
            style={{ background: "var(--navy-900)", color: "#fff" }}
          >
            <p className="text-sm font-medium flex-1">{toast}</p>
            <button
              onClick={() => setToast("")}
              style={{
                opacity: 0.6,
                color: "#fff",
                fontSize: "1.1rem",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {(!isRegularCompanyUser || isRestrictedProjectRole) &&
        approvalLeadCount > 0 &&
        showApprovalPrompt && (
          <div
            style={{
              position: "fixed",
              right: "clamp(0.55rem, 2.5vw, 1rem)",
              bottom:
                "calc(clamp(0.6rem, 2.5vw, 1.05rem) + env(safe-area-inset-bottom) + 1rem)",
              zIndex: 9998,
              width: "clamp(210px, 64vw, 236px)",
              maxWidth: "calc(100vw - 1rem)",
            }}
          >
            <div
              style={{
                background: "#fff",
                border: "1px solid var(--slate-200)",
                borderRadius: "14px",
                boxShadow: "0 12px 30px rgba(15,23,42,0.14)",
                padding:
                  "clamp(0.62rem, 2.2vw, 0.78rem) clamp(0.68rem, 2.4vw, 0.85rem)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "0.55rem",
                }}
              >
                <button
                  onClick={openApprovalHub}
                  title="Open pending approval projects"
                  style={{
                    border: "none",
                    background: "transparent",
                    textAlign: "left",
                    padding: 0,
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "clamp(0.72rem, 2.1vw, 0.8rem)",
                      fontWeight: 800,
                      color: "var(--navy-900)",
                      lineHeight: 1.35,
                    }}
                  >
                    Projects Pending Channel Partner Approval
                  </p>
                  <p
                    style={{
                      margin: "0.3rem 0 0",
                      fontSize: "clamp(0.66rem, 1.9vw, 0.72rem)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Click to review {approvalLeadCount} pending project
                    {approvalLeadCount !== 1 ? "s" : ""}
                  </p>
                </button>

                <button
                  onClick={closeApprovalPrompt}
                  title="Close"
                  aria-label="Close pending approval popup"
                  style={{
                    width: "1.45rem",
                    height: "1.45rem",
                    borderRadius: "999px",
                    border: "1px solid var(--slate-200)",
                    background: "#fff",
                    color: "var(--color-text-muted)",
                    lineHeight: 1,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "0.6rem",
                  gap: "0.55rem",
                }}
              >
                <span
                  style={{
                    minWidth: "1.35rem",
                    height: "1.35rem",
                    borderRadius: "999px",
                    background: "#ef4444",
                    color: "#fff",
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    lineHeight: "1.35rem",
                    textAlign: "center",
                    padding: "0 0.25rem",
                  }}
                >
                  {approvalLeadCount}
                </span>

                <button
                  onClick={openApprovalHub}
                  className="btn btn-gold"
                  style={{
                    fontSize: "0.72rem",
                    padding: "0.4rem 0.7rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  Give Approval
                </button>
              </div>
            </div>
          </div>
        )}

      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: "var(--header-height)" }}
      >
        {/* Search Bar Banner */}
        <div
          className="px-3 sm:px-4 md:px-8 py-3 md:py-4"
          style={{ background: "var(--gradient-header)" }}
        >
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <SearchBar
                value={search}
                onChange={setSearch}
                onFilterClick={() => setSidebarOpen(true)}
                activeFilterCount={activeFilterCount}
              />
            </div>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-gold shrink-0 gap-2 text-sm"
                onClick={() => setAdminLinkOpen(true)}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Project Link
              </button>
            )}
          </div>
        </div>

        {/* Results summary bar */}
        {filteredProjects.length > 0 && (
          <div
            className="px-3 sm:px-4 md:px-8 py-2"
            style={{
              background: "rgba(255,255,255,0.92)",
              borderBottom: "1px solid var(--slate-100)",
            }}
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <p
                className="text-xs font-semibold"
                style={{ color: "var(--color-text-muted)" }}
              >
                {/* show how many are visible vs total */}
                Showing {visibleProjects.length} of {filteredProjects.length}{" "}
                project{filteredProjects.length !== 1 ? "s" : ""}
                {activeFilterCount > 0 &&
                  ` · ${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""} active`}
              </p>
              {activeFilterCount > 0 && (
                <button
                  onClick={() =>
                    setFilters({
                      ...DEFAULT_FILTERS,
                      areaMin: filterOptions.areaRange.min,
                      areaMax: filterOptions.areaRange.max,
                      priceMin: filterOptions.priceRange.min,
                      priceMax: filterOptions.priceRange.max,
                    })
                  }
                  className="text-xs font-bold"
                  style={{ color: "var(--red-600)" }}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="px-3 sm:px-4 md:px-8 py-4 md:py-6 max-w-7xl mx-auto">
          {filteredProjects.length === 0 ? (
            <div className="text-center py-14">
              <p className="text-5xl mb-3">🔍</p>
              <h3
                className="text-lg font-bold mb-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                No projects found
              </h3>
              <p
                className="text-sm mb-5"
                style={{ color: "var(--color-text-hint)" }}
              >
                Try adjusting your search or filters
              </p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setFilters({
                    ...DEFAULT_FILTERS,
                    areaMin: filterOptions.areaRange.min,
                    areaMax: filterOptions.areaRange.max,
                    priceMin: filterOptions.priceRange.min,
                    priceMax: filterOptions.priceRange.max,
                  });
                  setSearch("");
                }}
              >
                Reset All
              </button>
              <AddProjectBanner onAdd={() => setAddProjectOpen(true)} />
            </div>
          ) : (
            <>
              {/* ── Visible cards ── */}
              <div className="grid-auto-fill-280 stagger">
                {visibleProjects.map((project) => (
                  <ProjectCardUI
                    key={project.id}
                    project={project}
                    onSchedule={handleSchedule}
                    onAddToCart={handleAddToCart}
                    onViewDetails={handleViewDetails}
                    isInCart={cartProjectIds.has(project.id)}
                    hideCustomerActions={hideCustomerActions}
                  />
                ))}

                {/* Skeleton placeholders while loading more */}
                {loadingMore &&
                  Array.from({
                    length: Math.min(
                      PAGE_SIZE,
                      filteredProjects.length - visibleCount,
                    ),
                  }).map((_, i) => <SkeletonCard key={`sk-${i}`} />)}
              </div>

              {/* ── Sentinel div — IntersectionObserver watches this ── */}
              <div ref={sentinelRef} style={{ height: 1 }} />

              {/* ── End-of-list message ── */}
              {!hasMore &&
                !loadingMore &&
                filteredProjects.length > PAGE_SIZE && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "2rem 0 1rem",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "0.5rem 1.2rem",
                        borderRadius: 999,
                        background: "var(--navy-50)",
                        border: "1px solid var(--navy-100)",
                      }}
                    >
                      <span style={{ fontSize: "0.8rem" }}>✅</span>
                      <span
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: "var(--navy-600)",
                        }}
                      >
                        All {filteredProjects.length} projects loaded
                      </span>
                    </div>
                  </div>
                )}

              {/* ── Manual "Load More" button fallback (if IntersectionObserver missed) ── */}
              {hasMore && !loadingMore && (
                <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
                  <button
                    onClick={loadMore}
                    className="btn btn-ghost"
                    style={{
                      fontSize: "0.82rem",
                      padding: "0.55rem 1.5rem",
                      gap: 6,
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
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                    Load more projects
                    <span
                      style={{
                        marginLeft: 4,
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "1px 7px",
                        borderRadius: 999,
                        background: "var(--navy-50)",
                        color: "var(--navy-600)",
                      }}
                    >
                      {filteredProjects.length - visibleCount} left
                    </span>
                  </button>
                </div>
              )}

              <AddProjectBanner onAdd={() => setAddProjectOpen(true)} />
            </>
          )}
        </div>

        <Footer />
      </main>

      {/* Floating Cart Button */}
      {cartCount > 0 && (
        <button
          onClick={() => router.push("/cart")}
          title="Go to shopping cart"
          style={{
            position: "fixed",
            bottom:
              cartCount > 0 && showApprovalPrompt
                ? "calc(220px + env(safe-area-inset-bottom) + 1rem)"
                : "calc(1.5rem + env(safe-area-inset-bottom) + 1rem)",
            right: "1.5rem",
            zIndex: 9997,
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "var(--gradient-primary)",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform =
              "scale(1.1)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 6px 20px rgba(0,0,0,0.2)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 4px 12px rgba(0,0,0,0.15)";
          }}
        >
          <div style={{ position: "relative" }}>
            <span style={{ fontSize: "1.5rem" }}>🛒</span>
            {cartCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "-8px",
                  right: "-8px",
                  background: "#ef4444",
                  color: "#fff",
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  border: "2px solid #fff",
                }}
              >
                {cartCount}
              </span>
            )}
          </div>
        </button>
      )}
    </div>
  );
}
