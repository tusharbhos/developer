"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScheduleMeetingModal from "@/components/ScheduleMeetingModal";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import {
  ApiProject,
  fetchProjectById,
  getProjectDetailPath,
  getProjectShowcaseVideos,
  mediaUrl,
  normalize,
  toCardPrice,
  toNumber,
  toProjectSlug,
  toStatusLabel,
} from "@/lib/conectr";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dateTime";

function formatDateTime(value?: string | null): string {
  const clean = normalize(value);
  if (!clean) return "-";
  return formatDisplayDateTime(clean);
}

function formatDateOnly(value?: string | null): string {
  const clean = normalize(value);
  if (!clean) return "-";
  return formatDisplayDate(clean);
}

function formatBooleanFlag(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value ? "Yes" : "No";
  return "-";
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "rgba(255,255,255,0.48)",
        border: "1px solid rgba(148,163,184,0.16)",
      }}
    >
      <p
        style={{
          fontSize: "0.68rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--color-text-hint)",
          marginBottom: "0.25rem",
        }}
      >
        {label}
      </p>
      <div
        className="text-sm font-semibold"
        style={{ color: "var(--navy-900)", wordBreak: "break-word" }}
      >
        {value}
      </div>
    </div>
  );
}

function BadgeList({ title, items }: { title: string; items: string[] }) {
  return (
    <section
      className="glass-card p-4"
      style={{ borderRadius: "var(--radius-xl)" }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2
          className="text-lg font-bold"
          style={{
            color: "var(--navy-900)",
            fontFamily: "var(--font-display)",
          }}
        >
          {title}
        </h2>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "var(--orange-700)",
          }}
        >
          {items.length} item{items.length !== 1 ? "s" : ""}
        </span>
      </div>
      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={`${title}-${item}`}
              style={{
                padding: "0.42rem 0.8rem",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(148,163,184,0.18)",
                color: "var(--navy-700)",
                fontSize: "0.82rem",
                fontWeight: 700,
              }}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No {title.toLowerCase()} available.
        </p>
      )}
    </section>
  );
}

export default function ProjectDetailsPage() {
  const params = useParams<{ id: string; slug: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { addToCart } = useCart();

  const projectId = Number(params?.id);
  const [project, setProject] = useState<ApiProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showMeetingModal, setShowMeetingModal] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!Number.isFinite(projectId) || projectId <= 0) {
      setError("Invalid project URL.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    fetchProjectById(projectId)
      .then((data) => {
        if (!active) return;
        if (!data) {
          setError("Project not found.");
          setProject(null);
          return;
        }
        setProject(data);
      })
      .catch((fetchError: unknown) => {
        if (!active) return;
        setError(
          (fetchError as { message?: string }).message ||
            "Failed to load project details.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!project) return;
    const expectedSlug = toProjectSlug(project);
    if (params?.slug !== expectedSlug) {
      router.replace(getProjectDetailPath(project));
    }
  }, [params?.slug, project, router]);

  const showcaseVideos = useMemo(
    () => (project ? getProjectShowcaseVideos(project) : []),
    [project],
  );
  const [activeShowcaseIndex, setActiveShowcaseIndex] = useState(0);

  useEffect(() => {
    setActiveShowcaseIndex(0);
  }, [project?.id, showcaseVideos.length]);

  const hasMultipleShowcaseVideos = showcaseVideos.length > 1;
  const activeShowcaseVideo = showcaseVideos[activeShowcaseIndex] || "";

  const goNextShowcaseVideo = useCallback(() => {
    if (!showcaseVideos.length) return;
    setActiveShowcaseIndex((prev) => (prev + 1) % showcaseVideos.length);
  }, [showcaseVideos.length]);

  const categoryNames = useMemo(
    () =>
      (project?.categories ?? [])
        .map((item) => normalize(item.name))
        .filter(Boolean),
    [project],
  );
  const amenityNames = useMemo(
    () =>
      (project?.amenities ?? [])
        .map((item) => normalize(item.name))
        .filter(Boolean),
    [project],
  );
  const tagNames = useMemo(
    () =>
      (project?.tags ?? []).map((item) => normalize(item.name)).filter(Boolean),
    [project],
  );

  if (loading || isLoading) {
    return (
      <div className="page-loader min-h-screen">
        <div className="spinner spinner-lg" />
        <p className="page-loader-text">Loading project details...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (!project || error) {
    return (
      <div className="min-h-screen bg-main flex flex-col">
        <Header variant="app" />
        <main
          className="flex-1 max-w-4xl mx-auto px-4 py-8 w-full"
          style={{ paddingTop: "calc(var(--header-height) + 1.5rem)" }}
        >
          <div
            className="glass-card p-6 text-center"
            style={{ borderRadius: "var(--radius-xl)" }}
          >
            <h1
              className="text-2xl font-bold"
              style={{
                color: "var(--navy-900)",
                fontFamily: "var(--font-display)",
              }}
            >
              {error || "Project not found"}
            </h1>
            <button
              className="btn btn-primary mt-4"
              onClick={() => router.push("/projects")}
            >
              Back To Projects
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const title = normalize(project.title) || `Project ${project.id}`;
  const subtitle =
    normalize(project.subtitle) || "Premium real estate presentation";
  const description = normalize(project.description);
  const developer = normalize(project.developer) || "-";
  const location = normalize(project.location) || "-";
  const status = toStatusLabel(normalize(project.development_status)) || "-";
  const bestSuited = normalize(project.best_suited) || "-";
  const possession = formatDateOnly(project.possession_date);
  const availableUnits = toNumber(project.available_units);
  const heroImage =
    mediaUrl(project.background_image_desktop) ||
    mediaUrl(project.background_image_mobile) ||
    mediaUrl(project.main_logo) ||
    mediaUrl(project.side_logo);
  const mobileImage = mediaUrl(project.background_image_mobile);
  const desktopImage = mediaUrl(project.background_image_desktop);
  const mainLogo = mediaUrl(project.main_logo);
  const sideLogo = mediaUrl(project.side_logo);
  const hideCustomerActions = false;

  const handleAddToCart = () => {
    addToCart({
      id: project.id,
      title,
      image_url: mobileImage || desktopImage || mainLogo || "",
    });
  };

  return (
    <div className="min-h-screen bg-main flex flex-col">
      <Header variant="app" />
      <main
        className="flex-1 max-w-7xl mx-auto px-4 py-6 sm:py-8 w-full"
        style={{ paddingTop: "calc(var(--header-height) + 1.2rem)" }}
      >
        <section
          className="card overflow-hidden"
          style={{
            borderRadius: "var(--radius-2xl)",
            background: "rgba(255,255,255,0.94)",
            border: "1px solid rgba(148,163,184,0.16)",
            boxShadow: "0 18px 45px rgba(15,23,42,0.08)",
          }}
        >
          {heroImage ? (
            <div
              style={{
                minHeight: "clamp(240px, 38vw, 400px)",
                position: "relative",
                overflow: "hidden",
                padding: "clamp(1rem, 3vw, 2rem)",
                display: "flex",
                alignItems: "end",
              }}
            >
              {activeShowcaseVideo ? (
                <video
                  src={activeShowcaseVideo}
                  autoPlay
                  muted
                  loop={!hasMultipleShowcaseVideos}
                  playsInline
                  preload="auto"
                  onEnded={
                    hasMultipleShowcaseVideos ? goNextShowcaseVideo : undefined
                  }
                  poster={heroImage}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    background: "#020617",
                  }}
                />
              ) : (
                <img
                  src={heroImage}
                  alt={title}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              )}

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, rgba(10,22,40,0.15), rgba(10,22,40,0.55))",
                }}
              />

              <div
                style={{
                  position: "relative",
                  zIndex: 1,
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    maxWidth: "52rem",
                    padding: "0.42rem 0.8rem",
                    borderRadius: "9px",
                    background: "rgba(0,0,0,0.32)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "#fff",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                  }}
                >
                  <p
                    className="text-xs uppercase font-bold"
                    style={{
                      color: project.title_color || "#ffb74b",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {developer}
                  </p>
                  <h1
                    style={{
                      marginTop: "0.45rem",
                      fontSize: "clamp(1.85rem, 4.8vw, 3.25rem)",
                      lineHeight: 1.05,
                      fontWeight: 800,
                      fontFamily: "var(--font-display)",
                      color: "#ffffff",
                    }}
                  >
                    {title}
                  </h1>
                  <p
                    className="mt-3 text-sm sm:text-base"
                    style={{
                      color: "rgba(255,215,0,0.88)",
                      maxWidth: "44rem",
                    }}
                  >
                    {subtitle}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-4 sm:gap-5">
              <div className="space-y-4">
                <div
                  className="glass-card p-4"
                  style={{ borderRadius: "var(--radius-xl)" }}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                    <h2
                      className="text-lg font-bold"
                      style={{
                        color: "var(--navy-900)",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      Overview
                    </h2>
                    {!hideCustomerActions && (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          className="btn btn-primary"
                          onClick={handleAddToCart}
                        >
                          Add To Cart
                        </button>
                        <button
                          className="btn btn-gold"
                          onClick={() => setShowMeetingModal(true)}
                        >
                          Schedule Pre-Site visit Matchmaking Session
                        </button>
                      </div>
                    )}
                  </div>
                  {description && (
                    <p
                      className="text-sm leading-7"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  <DetailRow label="Developer" value={developer} />
                  <DetailRow label="Location" value={location} />
                  <DetailRow label="Status" value={status} />
                  <DetailRow label="Best Suited" value={bestSuited} />
                  <DetailRow
                    label="Intent"
                    value={normalize(project.intent) || "-"}
                  />
                  <DetailRow label="Possession Date" value={possession} />
                  <DetailRow label="Price Range" value={toCardPrice(project)} />
                  <DetailRow
                    label="Available Units"
                    value={availableUnits || "-"}
                  />
                  <DetailRow
                    label="Active"
                    value={formatBooleanFlag(project.active)}
                  />
                  <DetailRow
                    label="Creator ID"
                    value={project.creator_id ?? "-"}
                  />
                  <DetailRow
                    label="Created At"
                    value={formatDateTime(project.created_at)}
                  />
                  <DetailRow
                    label="Updated At"
                    value={formatDateTime(project.updated_at)}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {(project.units ?? []).length > 0 && (
          <div className="grid grid-cols-1 gap-5 mt-5">
            <section
              className="glass-card p-4 sm:p-5"
              style={{ borderRadius: "var(--radius-xl)" }}
            >
              <h2
                className="text-lg font-bold mb-4"
                style={{
                  color: "var(--navy-900)",
                  fontFamily: "var(--font-display)",
                }}
              >
                Unit Configurations
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(project.units ?? []).map((unit, index) => (
                  <div
                    key={`${project.id}-unit-${unit.id ?? index}`}
                    className="rounded-xl p-4"
                    style={{
                      background: "rgba(255,255,255,0.48)",
                      border: "1px solid rgba(148,163,184,0.16)",
                    }}
                  >
                    <p
                      className="text-base font-bold"
                      style={{ color: "var(--navy-900)" }}
                    >
                      {normalize(unit.unit_type) || `Unit ${index + 1}`}
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <DetailRow
                        label="Area Min"
                        value={
                          toNumber(unit.area_min).toLocaleString("en-IN") || "-"
                        }
                      />
                      <DetailRow
                        label="Area Max"
                        value={
                          toNumber(unit.area_max).toLocaleString("en-IN") || "-"
                        }
                      />
                      <DetailRow
                        label="Price Min"
                        value={
                          toNumber(unit.price_min)
                            ? `Rs ${toNumber(unit.price_min).toLocaleString("en-IN")}`
                            : "-"
                        }
                      />
                      <DetailRow
                        label="Price Max"
                        value={
                          toNumber(unit.price_max)
                            ? `Rs ${toNumber(unit.price_max).toLocaleString("en-IN")}`
                            : "-"
                        }
                      />
                      <DetailRow
                        label="Available"
                        value={toNumber(unit.available_units) || "-"}
                      />
                      <DetailRow
                        label="Updated"
                        value={formatDateTime(unit.updated_at)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {(categoryNames.length > 0 ||
          amenityNames.length > 0 ||
          tagNames.length > 0) && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-5">
            {categoryNames.length > 0 && (
              <BadgeList title="Categories" items={categoryNames} />
            )}
            {amenityNames.length > 0 && (
              <BadgeList title="Amenities" items={amenityNames} />
            )}
            {tagNames.length > 0 && <BadgeList title="Tags" items={tagNames} />}
          </div>
        )}

        {(normalize(project.common_css) || normalize(project.common_js)) && (
          <section
            className="glass-card p-4 sm:p-5 mt-5"
            style={{ borderRadius: "var(--radius-xl)" }}
          >
            <h2
              className="text-lg font-bold mb-4"
              style={{
                color: "var(--navy-900)",
                fontFamily: "var(--font-display)",
              }}
            >
              Embedded Presentation Code
            </h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {normalize(project.common_css) && (
                <div>
                  <p
                    className="text-xs font-bold uppercase mb-2"
                    style={{
                      color: "var(--color-text-hint)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Common CSS
                  </p>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      padding: "1rem",
                      borderRadius: 18,
                      background: "rgba(10,22,40,0.9)",
                      color: "#e2e8f0",
                      fontSize: "0.78rem",
                      overflowX: "auto",
                    }}
                  >
                    {project.common_css}
                  </pre>
                </div>
              )}
              {normalize(project.common_js) && (
                <div>
                  <p
                    className="text-xs font-bold uppercase mb-2"
                    style={{
                      color: "var(--color-text-hint)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Common JS
                  </p>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      padding: "1rem",
                      borderRadius: 18,
                      background: "rgba(10,22,40,0.9)",
                      color: "#e2e8f0",
                      fontSize: "0.78rem",
                      overflowX: "auto",
                    }}
                  >
                    {project.common_js}
                  </pre>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
      <Footer />
      {!hideCustomerActions && (
        <ScheduleMeetingModal
          isOpen={showMeetingModal}
          onClose={() => setShowMeetingModal(false)}
          projectName={title}
          onScheduled={() => setShowMeetingModal(false)}
        />
      )}
    </div>
  );
}
