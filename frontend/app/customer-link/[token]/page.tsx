"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CustomerSessionLink,
  CustomerSessionLinkAPI,
  CustomerProjectLinkAPI,
  LinkedProjectCard,
  PublicSelfViewLink,
  PublicCustomerProjectLink,
} from "@/lib/api";
import {
  ApiProject,
  fetchAllProjects,
  getProjectPresentationId,
  getProjectShowcaseVideo,
  getProjectShowcaseVideos,
  normalize,
} from "@/lib/conectr";
import {
  format12HourTime,
  formatDisplayDate,
  formatDisplayDateTime,
} from "@/lib/dateTime";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "under construction": { bg: "rgba(249,115,22,0.12)", text: "#b47a00" },
  ready: { bg: "rgba(22,163,74,0.12)", text: "#15803d" },
  "ready to move": { bg: "rgba(22,163,74,0.12)", text: "#15803d" },
};

function statusStyle(status?: string) {
  if (!status) return { bg: "rgba(30,69,128,0.1)", text: "#1e4580" };
  return (
    STATUS_COLORS[status.toLowerCase()] ?? {
      bg: "rgba(30,69,128,0.1)",
      text: "#1e4580",
    }
  );
}

function fmt12(t: string) {
  return format12HourTime(t);
}

function fmtExpiry(value?: string) {
  return formatDisplayDateTime(value);
}

function normalizeMeetingDateKey(value?: string) {
  if (!value || typeof value !== "string") return "__no_date__";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "__no_date__";
}

function getDateLabel(dateKey: string) {
  if (dateKey === "__no_date__") return "No Date";
  return formatDisplayDate(dateKey);
}

const TIME_SLOTS = Array.from({ length: 29 }, (_, i) => {
  const mins = 7 * 60 + i * 30;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { val, label: fmt12(val) };
});

function createGoogleCalendarUrl({
  projectName,
  customerName,
  date,
  time,
  selfViewUrl,
}: {
  projectName: string;
  customerName: string;
  date: string;
  time: string;
  selfViewUrl: string;
}) {
  const startsAt = new Date(`${date}T${time}:00`);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
  const fmt = (value: Date) =>
    value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Self View - ${projectName}`,
    dates: `${fmt(startsAt)}/${fmt(endsAt)}`,
    details: `Self-view presentation link for ${customerName}:\n${selfViewUrl}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function getDefaultSelfViewSlot() {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const roundedMinutes = Math.ceil(totalMinutes / 30) * 30;
  const clampedMinutes = Math.min(Math.max(roundedMinutes, 7 * 60), 21 * 60);
  const hours = Math.floor(clampedMinutes / 60);
  const minutes = clampedMinutes % 60;

  return {
    date,
    time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
  };
}

function LinkedProjectMedia({
  project,
  fallbackVideos,
}: {
  project: LinkedProjectCard;
  fallbackVideos?: string[];
}) {
  const showcaseVideos = useMemo(() => {
    const urls = [
      ...(project.showcase_urls ?? []),
      ...(fallbackVideos ?? []),
    ].filter(
      (url): url is string =>
        typeof url === "string" &&
        url.trim().length > 0 &&
        (url.startsWith("http://") || url.startsWith("https://")),
    );
    if (urls.length) return urls;
    if (
      typeof project.showcase_url === "string" &&
      project.showcase_url.trim().length > 0
    ) {
      return [project.showcase_url];
    }
    return [];
  }, [project.showcase_urls, project.showcase_url, fallbackVideos]);

  const [activeVideoIndex, setActiveVideoIndex] = useState(0);

  useEffect(() => {
    setActiveVideoIndex(0);
  }, [project.id, project.title, showcaseVideos.length]);

  const hasMultipleVideos = showcaseVideos.length > 1;
  const showcaseVideoUrl = showcaseVideos[activeVideoIndex] || "";

  const goNextVideo = useCallback(() => {
    if (!showcaseVideos.length) return;
    setActiveVideoIndex((prev) => (prev + 1) % showcaseVideos.length);
  }, [showcaseVideos.length]);

  if (showcaseVideoUrl) {
    return (
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
          height: "150px",
          objectFit: "cover",
          display: "block",
          background: "#020617",
        }}
      />
    );
  }

  if (project.image_url) {
    return (
      <img
        src={project.image_url}
        alt={project.title}
        style={{
          width: "100%",
          height: "150px",
          objectFit: "cover",
          display: "block",
        }}
      />
    );
  }

  return (
    <div
      style={{
        height: "90px",
        background:
          "linear-gradient(135deg,var(--navy-900) 0%,var(--navy-700) 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ fontSize: "2rem" }}>🏢</span>
    </div>
  );
}

export default function PublicCustomerLinkPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const today = new Date().toISOString().split("T")[0];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [linkData, setLinkData] = useState<PublicCustomerProjectLink | null>(
    null,
  );
  const [likedProjects, setLikedProjects] = useState<LinkedProjectCard[]>([]);
  const [likedKeys, setLikedKeys] = useState<string[]>([]);
  const [scheduleProject, setScheduleProject] = useState<{
    project: LinkedProjectCard;
    index: number;
  } | null>(null);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [visitMode, setVisitMode] = useState<"expert" | "self" | null>(null);
  const [selfViewLink, setSelfViewLink] = useState<
    CustomerSessionLink | PublicSelfViewLink | null
  >(null);
  const [selfViewCopied, setSelfViewCopied] = useState(false);
  const [cardCopiedSelfViewId, setCardCopiedSelfViewId] = useState<
    number | null
  >(null);
  const [selfViewCreating, setSelfViewCreating] = useState(false);
  const [showSelfCalendarPicker, setShowSelfCalendarPicker] = useState(false);
  const [fallbackProjectVideos, setFallbackProjectVideos] = useState<
    Record<number, string[]>
  >({});
  const [fallbackProjectVideosByTitle, setFallbackProjectVideosByTitle] =
    useState<Record<string, string[]>>({});
  const [apiProjectsByTitle, setApiProjectsByTitle] = useState<
    Record<string, ApiProject>
  >({});

  const getAttemptKey = (project: LinkedProjectCard) => {
    if (project.project_key) return project.project_key;
    if (project.id) return `id-${project.id}`;
    const title = (project.title || "").trim().toLowerCase();
    return title ? `title-${title}` : "";
  };

  const getProjectKey = (project: LinkedProjectCard) => getAttemptKey(project);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError("");

    CustomerProjectLinkAPI.publicShow(token)
      .then((res) => {
        if (!active) return;
        const data = res.data;
        setLinkData(data);
        const existingLiked = data.liked_projects || [];
        setLikedProjects(existingLiked);
        setLikedKeys(existingLiked.map((p) => getProjectKey(p)));
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(
          (e as { message?: string }).message || "Invalid or expired link.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const selectedProjects = linkData?.selected_projects || [];

  const sortedProjectsByMeetingDate = useMemo(() => {
    const rows = selectedProjects.map((project, originalIndex) => ({
      project,
      originalIndex,
      dateKey: normalizeMeetingDateKey(project.meeting_date),
    }));

    rows.sort((a, b) => {
      if (a.dateKey === b.dateKey) return a.originalIndex - b.originalIndex;
      if (a.dateKey === "__no_date__") return 1;
      if (b.dateKey === "__no_date__") return -1;
      return a.dateKey > b.dateKey ? -1 : 1;
    });

    return rows;
  }, [selectedProjects]);

  const groupedProjectSections = useMemo(() => {
    const sections: Array<{
      dateKey: string;
      dateLabel: string;
      items: Array<{ project: LinkedProjectCard; originalIndex: number }>;
    }> = [];

    sortedProjectsByMeetingDate.forEach((row) => {
      const lastSection = sections[sections.length - 1];
      if (lastSection && lastSection.dateKey === row.dateKey) {
        lastSection.items.push({
          project: row.project,
          originalIndex: row.originalIndex,
        });
        return;
      }

      sections.push({
        dateKey: row.dateKey,
        dateLabel: getDateLabel(row.dateKey),
        items: [{ project: row.project, originalIndex: row.originalIndex }],
      });
    });

    return sections;
  }, [sortedProjectsByMeetingDate]);

  const missingVideoProjectIds = useMemo(() => {
    const ids = selectedProjects
      .filter((project) => {
        if (typeof project.id !== "number") return false;
        const hasInlineVideos =
          Array.isArray(project.showcase_urls) && project.showcase_urls.length;
        const hasSingleVideo =
          typeof project.showcase_url === "string" &&
          project.showcase_url.trim().length > 0;
        return (
          !hasInlineVideos &&
          !hasSingleVideo &&
          !fallbackProjectVideos[project.id]
        );
      })
      .map((project) => project.id as number);

    return Array.from(new Set(ids));
  }, [selectedProjects, fallbackProjectVideos]);

  const missingVideoProjectTitles = useMemo(() => {
    const titles = selectedProjects
      .filter((project) => {
        const hasInlineVideos =
          Array.isArray(project.showcase_urls) && project.showcase_urls.length;
        const hasSingleVideo =
          typeof project.showcase_url === "string" &&
          project.showcase_url.trim().length > 0;
        const titleKey = normalize(project.title).toLowerCase();
        return !hasInlineVideos && !hasSingleVideo && titleKey.length > 0;
      })
      .map((project) => normalize(project.title).toLowerCase())
      .filter((titleKey) => !fallbackProjectVideosByTitle[titleKey]);

    return Array.from(new Set(titles));
  }, [selectedProjects, fallbackProjectVideosByTitle]);

  const missingPresentationProjectTitles = useMemo(
    () =>
      Array.from(
        new Set(
          selectedProjects
            .filter((project) => !project.presentation_id)
            .map((project) => normalize(project.title).toLowerCase())
            .filter(Boolean),
        ),
      ).filter((titleKey) => !apiProjectsByTitle[titleKey]),
    [selectedProjects, apiProjectsByTitle],
  );

  useEffect(() => {
    if (
      !missingVideoProjectIds.length &&
      !missingVideoProjectTitles.length &&
      !missingPresentationProjectTitles.length
    )
      return;

    let active = true;
    fetchAllProjects()
      .then(({ projects }) => {
        if (!active) return;
        const needed = new Set(missingVideoProjectIds);
        const neededTitles = new Set(missingVideoProjectTitles);
        const neededPresentationTitles = new Set(
          missingPresentationProjectTitles,
        );
        const fetched: Record<number, string[]> = {};
        const fetchedByTitle: Record<string, string[]> = {};

        projects.forEach((project) => {
          const videos = getProjectShowcaseVideos(project);
          const videoList = videos.length
            ? videos
            : (() => {
                const firstVideo = getProjectShowcaseVideo(project);
                return firstVideo ? [firstVideo] : [];
              })();

          if (!videoList.length) return;

          if (needed.has(project.id)) {
            fetched[project.id] = videoList;
          }

          const titleKey = normalize(project.title).toLowerCase();
          if (titleKey && neededPresentationTitles.has(titleKey)) {
            // Stored below in apiProjectsByTitle for presentation code lookup.
          }
          if (titleKey && neededTitles.has(titleKey)) {
            fetchedByTitle[titleKey] = videoList;
          }
        });

        if (Object.keys(fetched).length) {
          setFallbackProjectVideos((prev) => ({ ...prev, ...fetched }));
        }
        if (Object.keys(fetchedByTitle).length) {
          setFallbackProjectVideosByTitle((prev) => ({
            ...prev,
            ...fetchedByTitle,
          }));
        }
        setApiProjectsByTitle((prev) => {
          const next = { ...prev };
          projects.forEach((project) => {
            const titleKey = normalize(project.title).toLowerCase();
            if (titleKey) next[titleKey] = project;
          });
          return next;
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!active) return;
      });

    return () => {
      active = false;
    };
  }, [
    missingVideoProjectIds,
    missingVideoProjectTitles,
    missingPresentationProjectTitles,
  ]);

  const saveLikedProjects = async (
    nextLikedProjects: LinkedProjectCard[],
    attemptProjectKey?: string,
  ) => {
    if (!token) return;

    setSaving(true);
    try {
      const res = await CustomerProjectLinkAPI.publicLike(
        token,
        nextLikedProjects,
        attemptProjectKey,
      );
      const savedLikedProjects = res.data.liked_projects || [];
      setLikedProjects(savedLikedProjects);
      setLikedKeys(savedLikedProjects.map((p) => getProjectKey(p)));
      setLinkData((prev) =>
        prev
          ? {
              ...prev,
              selected_projects: (prev.selected_projects || []).map(
                (project) => {
                  const projectKey = getProjectKey(project);
                  const nextAttemptCount =
                    attemptProjectKey && projectKey === attemptProjectKey
                      ? (project.attempt_count || 0) + 1
                      : project.attempt_count || 0;
                  const maxAttempts =
                    res.data.max_attempts_per_card ||
                    prev.max_attempts_per_card ||
                    5;
                  const isLocked = (
                    res.data.locked_project_keys ||
                    prev.locked_project_keys ||
                    []
                  ).includes(projectKey);

                  return {
                    ...project,
                    attempt_count: nextAttemptCount,
                    attempts_left: Math.max(0, maxAttempts - nextAttemptCount),
                    is_locked: isLocked,
                  };
                },
              ),
              liked_projects: savedLikedProjects,
              status: res.data.status,
              expires_at: res.data.expires_at || prev.expires_at,
              is_disabled:
                typeof res.data.is_disabled === "boolean"
                  ? res.data.is_disabled
                  : prev.is_disabled,
              max_attempts_per_card:
                res.data.max_attempts_per_card || prev.max_attempts_per_card,
              locked_project_keys:
                res.data.locked_project_keys || prev.locked_project_keys,
            }
          : prev,
      );
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message ||
          "Failed to save liked project details.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openLikeForm = (project: LinkedProjectCard, index: number) => {
    const attemptKey = getAttemptKey(project);
    const isLocked =
      (project.is_locked ?? false) ||
      (attemptKey !== "" &&
        (linkData?.locked_project_keys || []).includes(attemptKey));
    if (isLocked) {
      setError(
        "This card is locked after maximum attempts. Editing is disabled.",
      );
      return;
    }

    const key = getProjectKey(project);
    const existingProject = likedProjects.find(
      (likedProject) => getProjectKey(likedProject) === key,
    );
    const existingSelfView = (linkData?.self_view_links || [])
      .filter((row) => !row.is_completed)
      .filter((row) => row.project_key === key)
      .sort((left, right) =>
        (right.created_at || "").localeCompare(left.created_at || ""),
      )[0];

    setScheduleProject({ project, index });
    setMeetingDate(
      existingProject?.meeting_date || existingSelfView?.meeting_date || today,
    );
    setMeetingTime(
      existingProject?.meeting_time || existingSelfView?.meeting_time || "",
    );
    setVisitMode(null);
    setSelfViewLink(existingSelfView || null);
    setSelfViewCopied(false);
    setShowSelfCalendarPicker(false);
    setScheduleError("");
  };

  const removeLikedProject = async (
    project: LinkedProjectCard,
    index: number,
  ) => {
    const key = getProjectKey(project);
    const nextLikedProjects = likedProjects.filter(
      (likedProject) => getProjectKey(likedProject) !== key,
    );

    await saveLikedProjects(nextLikedProjects);
  };

  const createSelfViewLink = async (
    date: string,
    time: string,
    calendarVisible = false,
  ) => {
    if (!scheduleProject) return null;
    if (!date || !time) {
      setScheduleError("Please select both date and time.");
      return null;
    }

    const projectName = scheduleProject.project.title || "";
    const projectTitleKey = normalize(projectName).toLowerCase();
    const presentationId =
      scheduleProject.project.presentation_id ||
      getProjectPresentationId(apiProjectsByTitle[projectTitleKey]);

    if (!presentationId) {
      setScheduleError(
        "ConectR presentation code is not configured for this project. Please contact your sales person.",
      );
      return null;
    }

    setSelfViewCreating(true);
    setScheduleError("");

    try {
      const customerName =
        linkData?.customer?.name || linkData?.customer?.nickname || "Viewer";
      const res = await CustomerSessionLinkAPI.publicCreateSelfView(token, {
        project_key: getProjectKey(scheduleProject.project),
        project_name: projectName,
        presentation_id: presentationId,
        viewer_name: customerName,
        viewer_id: linkData?.customer?.secret_code || undefined,
        viewer_phone: linkData?.customer?.phone || undefined,
        meeting_date: date,
        meeting_time: time,
        expires_in_hours: 72,
        calendar_visible: calendarVisible,
      });
      setSelfViewLink(res.data);
      setLinkData((prev) => {
        if (!prev) return prev;

        const selectedProjectKey = getProjectKey(scheduleProject.project);
        const maxAttempts = prev.max_attempts_per_card || 5;
        const nextSelfViewLink: PublicSelfViewLink = {
          id: res.data.id,
          project_key: selectedProjectKey,
          project_name: projectName,
          presentation_id: res.data.presentation_id,
          session_token: res.data.session_token,
          status: res.data.status,
          ended_at: res.data.ended_at,
          is_completed: false,
          self_view_url: res.data.self_view_url,
          self_view_url_with_phone: res.data.self_view_url_with_phone,
          self_view_expires_at: res.data.self_view_expires_at,
          viewer_link: res.data.viewer_link,
          meeting_date: date,
          meeting_time: time,
          created_at: res.data.created_at,
        };

        return {
          ...prev,
          selected_projects: res.already_exists
            ? prev.selected_projects || []
            : (prev.selected_projects || []).map((project) => {
                const currentKey = getProjectKey(project);
                if (currentKey !== selectedProjectKey) return project;

                const nextAttemptCount = (project.attempt_count || 0) + 1;
                return {
                  ...project,
                  attempt_count: nextAttemptCount,
                  attempts_left: Math.max(0, maxAttempts - nextAttemptCount),
                  is_locked: nextAttemptCount >= maxAttempts,
                };
              }),
          locked_project_keys:
            !res.already_exists &&
            (prev.selected_projects || []).find(
                (project) => getProjectKey(project) === selectedProjectKey,
              )?.attempt_count ===
              maxAttempts - 1
              ? Array.from(
                  new Set([
                    ...(prev.locked_project_keys || []),
                    selectedProjectKey,
                  ]),
                )
              : prev.locked_project_keys,
          self_view_links: [
            nextSelfViewLink,
            ...(prev.self_view_links || []).filter(
              (row) => row.project_key !== nextSelfViewLink.project_key,
            ),
          ],
        };
      });
      return res.data;
    } catch (e: unknown) {
      setScheduleError(
        (e as { message?: string }).message ||
          "Failed to create self-view link.",
      );
      return null;
    } finally {
      setSelfViewCreating(false);
    }
  };

  const selectVisitMode = (mode: "expert" | "self") => {
    setVisitMode(mode);
    setSelfViewCopied(false);
    setShowSelfCalendarPicker(false);
    setScheduleError("");

    if (mode === "expert") {
      setSelfViewLink(null);
      return;
    }

    const defaultSlot = getDefaultSelfViewSlot();
    setMeetingDate(meetingDate || defaultSlot.date);
    setMeetingTime(meetingTime || defaultSlot.time);

    setSelfViewLink(selfViewLink?.self_view_url ? selfViewLink : null);
  };

  const submitLikeSchedule = async () => {
    if (!scheduleProject) return;
    if (!meetingDate || !meetingTime) {
      setScheduleError("Please select both date and time.");
      return;
    }

    if (visitMode === "self") {
      await createSelfViewLink(meetingDate, meetingTime, true);
      return;
    }

    const projectKey = getProjectKey(scheduleProject.project);
    const scheduledProject: LinkedProjectCard = {
      ...scheduleProject.project,
      meeting_date: meetingDate,
      meeting_time: meetingTime,
    };
    const remainingLikedProjects = likedProjects.filter(
      (likedProject) => getProjectKey(likedProject) !== projectKey,
    );

    await saveLikedProjects(
      [...remainingLikedProjects, scheduledProject],
      getAttemptKey(scheduleProject.project),
    );
    setScheduleProject(null);
    setMeetingDate("");
    setMeetingTime("");
    setScheduleError("");
  };

  const copySelfViewLink = async () => {
    const link =
      selfViewLink?.self_view_url_with_phone || selfViewLink?.self_view_url;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setSelfViewCopied(true);
      setTimeout(() => setSelfViewCopied(false), 1600);
    } catch {
      setScheduleError("Copy failed. Please copy the link manually.");
    }
  };

  if (loading) {
    return (
      <div className="page-loader min-h-screen">
        <div className="spinner spinner-lg" />
        <p className="page-loader-text">Loading shared projects...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-main">
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div
          className="card p-5 mb-5"
          style={{ borderRadius: "var(--radius-xl)" }}
        >
          <p
            className="text-xs uppercase font-bold"
            style={{ color: "var(--orange-600)" }}
          >
            Shared Project Link
          </p>
          <h1
            className="text-2xl font-bold mt-1"
            style={{ color: "var(--navy-900)" }}
          >
            Hello{" "}
            {linkData?.customer?.name ||
              linkData?.customer?.name ||
              linkData?.customer?.nickname ||
              "Customer"}
          </h1>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-start",
              gap: "1rem",
              flexWrap: "wrap",
              marginTop: "0.5rem",
            }}
          >
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Tap like, choose date and time, then submit for that project.
              {saving && (
                <span
                  className="ml-2 text-xs"
                  style={{ color: "var(--color-text-hint)" }}
                >
                  Saving…
                </span>
              )}
            </p>
            {linkData?.expires_at && (
              <p
                className="text-sm"
                style={{ color: "var(--orange-700)", fontWeight: 700 }}
              >
                Link expires in 72 hours. Valid until{" "}
                {fmtExpiry(linkData.expires_at)}.
              </p>
            )}
          </div>
        </div>

        {error && <div className="alert alert-danger mb-4">{error}</div>}

        {/* Project cards */}
        <div className="space-y-5">
          {groupedProjectSections.map((section) => {
            const dateCount = section.items.length;

            return (
              <section
                key={section.dateKey}
                className="card glass-card project-card-glow p-3 sm:p-4"
                style={{
                  borderRadius: "var(--radius-xl)",
                  background: "rgba(255,255,255,0.2)",
                  border: "1px solid rgba(255,255,255,0.45)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(10px)",
                  boxShadow: "0 14px 40px rgba(15,23,42,0.08)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.6rem",
                    flexWrap: "wrap",
                    borderBottom: "1px solid rgba(148,163,184,0.22)",
                    paddingBottom: "0.55rem",
                    marginBottom: "0.8rem",
                  }}
                >
                  <p
                    className="text-sm font-bold"
                    style={{ color: "var(--navy-800)" }}
                  >
                    {section.dateLabel}
                  </p>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "0.18rem 0.6rem",
                      borderRadius: "999px",
                      background: "var(--orange-50)",
                      color: "var(--orange-700)",
                      border: "1px solid var(--orange-200)",
                    }}
                  >
                    {dateCount} project{dateCount !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {section.items.map(({ project, originalIndex }) => {
                    const projectKey = getProjectKey(project);

                    const safeTitle =
                      typeof project.title === "string" && project.title.trim()
                        ? project.title
                        : "*****";
                    const safeDeveloper =
                      typeof project.developer === "string" &&
                      project.developer.trim()
                        ? project.developer
                        : "*****";
                    const safeLocation =
                      typeof project.location === "string" &&
                      project.location.trim()
                        ? project.location
                        : "-";
                    const safePrice =
                      typeof project.price === "string" && project.price.trim()
                        ? project.price
                        : "-";
                    const safeType =
                      typeof project.unit_types === "string" &&
                      project.unit_types.trim()
                        ? project.unit_types
                        : "-";
                    const safeArea =
                      typeof project.area === "string" && project.area.trim()
                        ? project.area
                        : "-";
                    const safePossession =
                      typeof project.possession === "string" &&
                      project.possession.trim()
                        ? project.possession
                        : "-";
                    const safeUnits =
                      typeof project.units_left === "number"
                        ? String(project.units_left)
                        : "-";
                    const safeStatus =
                      typeof project.status === "string" &&
                      project.status.trim()
                        ? project.status
                        : "-";

                    const liked = likedKeys.includes(projectKey);
                    const sc = statusStyle(project.status);
                    const attemptKey = getAttemptKey(project);
                    const isLocked =
                      (project.is_locked ?? false) ||
                      (attemptKey !== "" &&
                        (linkData?.locked_project_keys || []).includes(
                          attemptKey,
                        ));
                    const maxAttempts = linkData?.max_attempts_per_card || 5;
                    const attemptCount = project.attempt_count || 0;
                    const attemptsLeft = Math.max(
                      0,
                      typeof project.attempts_left === "number"
                        ? project.attempts_left
                        : maxAttempts - attemptCount,
                    );
                    const scheduledLike = likedProjects.find(
                      (likedProject) =>
                        getProjectKey(likedProject) === projectKey,
                    );
                    const selfViewForCard = (linkData?.self_view_links || [])
                      .filter((row) => !row.is_completed)
                      .filter((row) => row.project_key === projectKey)
                      .sort((left, right) =>
                        (right.created_at || "").localeCompare(
                          left.created_at || "",
                        ),
                      )[0];

                    return (
                      <div
                        key={`${section.dateKey}-${project.title}-${projectKey}-${originalIndex}`}
                      >
                        <div
                          style={{
                            borderRadius: "var(--radius-lg)",
                            border: isLocked
                              ? "1.5px solid #dc2626"
                              : liked || selfViewForCard
                                ? "1.5px solid #16a34a"
                                : "1px solid var(--slate-200)",
                            background: isLocked
                              ? "#fef2f2"
                              : liked || selfViewForCard
                                ? "#f0fdf4"
                                : "#fff",
                            overflow: "hidden",
                            boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
                            transition: "border-color 0.2s, background 0.2s",
                            opacity: 1,
                          }}
                        >
                          {/* Media */}
                          <LinkedProjectMedia
                            project={project}
                            fallbackVideos={(() => {
                              if (typeof project.id === "number") {
                                return fallbackProjectVideos[project.id];
                              }
                              const titleKey = normalize(
                                project.title,
                              ).toLowerCase();
                              return titleKey
                                ? fallbackProjectVideosByTitle[titleKey]
                                : [];
                            })()}
                          />

                          <div style={{ padding: "0.9rem" }}>
                            {/* Always visible: project name + developer */}
                            <p
                              className="font-bold"
                              style={{
                                color: "var(--navy-900)",
                                fontSize: "0.97rem",
                                lineHeight: 1.35,
                                fontFamily: "var(--font-display)",
                              }}
                            >
                              {safeTitle}
                            </p>
                            <p
                              className="text-sm mt-0.5"
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              {safeDeveloper}
                            </p>
                            <div
                              style={{
                                marginTop: "0.45rem",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.45rem",
                                padding: "0.26rem 0.6rem",
                                borderRadius: "999px",
                                background: isLocked
                                  ? "#fee2e2"
                                  : "var(--navy-50)",
                                color: isLocked ? "#991b1b" : "var(--navy-700)",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                              }}
                            >
                              {isLocked
                                ? `Attempts used: ${maxAttempts}/${maxAttempts}`
                                : `Attempts left: ${attemptsLeft}/${maxAttempts}`}
                            </div>

                            <div
                              style={{
                                marginTop: "0.7rem",
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.45rem",
                              }}
                            >
                              {isLocked ? (
                                <div
                                  style={{
                                    borderRadius: "8px",
                                    border: "1px solid #fca5a5",
                                    background: "#fee2e2",
                                    padding: "0.55rem 0.7rem",
                                  }}
                                >
                                  <p
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 700,
                                      color: "#991b1b",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                    }}
                                  >
                                    Card Locked
                                  </p>
                                  <p
                                    className="text-sm font-semibold"
                                    style={{ color: "#7f1d1d" }}
                                  >
                                    Maximum 5 attempts reached. View only mode.
                                  </p>
                                </div>
                              ) : (
                                <>
                                  <p
                                    className="text-sm"
                                    style={{ color: "var(--color-text-muted)" }}
                                  >
                                    📍 {safeLocation}
                                  </p>
                                  <p
                                    className="font-bold"
                                    style={{
                                      color: "var(--orange-600)",
                                      fontSize: "0.97rem",
                                    }}
                                  >
                                    {safePrice}
                                  </p>

                                  {/* 2-col detail grid */}
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "1fr 1fr",
                                      gap: "0.35rem",
                                    }}
                                  >
                                    <div
                                      style={{
                                        background: "var(--slate-50)",
                                        border: "1px solid var(--slate-100)",
                                        borderRadius: "6px",
                                        padding: "0.4rem 0.5rem",
                                      }}
                                    >
                                      <p
                                        style={{
                                          fontSize: "9px",
                                          fontWeight: 700,
                                          color: "var(--color-text-hint)",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.04em",
                                          marginBottom: "2px",
                                        }}
                                      >
                                        Type
                                      </p>
                                      <p
                                        className="text-xs font-semibold"
                                        style={{
                                          color: "var(--color-text-primary)",
                                        }}
                                      >
                                        {safeType}
                                      </p>
                                    </div>
                                    <div
                                      style={{
                                        background: "var(--slate-50)",
                                        border: "1px solid var(--slate-100)",
                                        borderRadius: "6px",
                                        padding: "0.4rem 0.5rem",
                                      }}
                                    >
                                      <p
                                        style={{
                                          fontSize: "9px",
                                          fontWeight: 700,
                                          color: "var(--color-text-hint)",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.04em",
                                          marginBottom: "2px",
                                        }}
                                      >
                                        Area
                                      </p>
                                      <p
                                        className="text-xs font-semibold"
                                        style={{
                                          color: "var(--color-text-primary)",
                                        }}
                                      >
                                        {safeArea}
                                      </p>
                                    </div>
                                    <div
                                      style={{
                                        background: "var(--slate-50)",
                                        border: "1px solid var(--slate-100)",
                                        borderRadius: "6px",
                                        padding: "0.4rem 0.5rem",
                                      }}
                                    >
                                      <p
                                        style={{
                                          fontSize: "9px",
                                          fontWeight: 700,
                                          color: "var(--color-text-hint)",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.04em",
                                          marginBottom: "2px",
                                        }}
                                      >
                                        Possession
                                      </p>
                                      <p
                                        className="text-xs font-semibold"
                                        style={{
                                          color: "var(--color-text-primary)",
                                        }}
                                      >
                                        {safePossession}
                                      </p>
                                    </div>
                                    <div
                                      style={{
                                        background: "var(--slate-50)",
                                        border: "1px solid var(--slate-100)",
                                        borderRadius: "6px",
                                        padding: "0.4rem 0.5rem",
                                      }}
                                    >
                                      <p
                                        style={{
                                          fontSize: "9px",
                                          fontWeight: 700,
                                          color: "var(--color-text-hint)",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.04em",
                                          marginBottom: "2px",
                                        }}
                                      >
                                        Units Left
                                      </p>
                                      <p
                                        className="text-xs font-semibold"
                                        style={{
                                          color: "var(--color-text-primary)",
                                        }}
                                      >
                                        {safeUnits}
                                      </p>
                                    </div>
                                  </div>
                                </>
                              )}

                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "0.2rem 0.7rem",
                                  borderRadius: "999px",
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  background: sc.bg,
                                  color: sc.text,
                                  alignSelf: "flex-start",
                                }}
                              >
                                {safeStatus}
                              </span>

                              {!isLocked &&
                                scheduledLike?.meeting_date &&
                                scheduledLike?.meeting_time && (
                                  <div
                                    style={{
                                      background: liked
                                        ? "#dcfce7"
                                        : "var(--slate-50)",
                                      border: liked
                                        ? "1px solid #86efac"
                                        : "1px solid var(--slate-100)",
                                      borderRadius: "8px",
                                      padding: "0.55rem 0.7rem",
                                    }}
                                  >
                                    <p
                                      style={{
                                        fontSize: "10px",
                                        fontWeight: 700,
                                        color: liked
                                          ? "#166534"
                                          : "var(--color-text-hint)",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                      }}
                                    >
                                      Selected Visit Slot
                                    </p>
                                    <p
                                      className="text-sm font-semibold"
                                      style={{
                                        color: liked
                                          ? "#166534"
                                          : "var(--navy-900)",
                                      }}
                                    >
                                      {scheduledLike.meeting_date} at{" "}
                                      {scheduledLike.meeting_time}
                                    </p>
                                  </div>
                                )}

                              {!isLocked &&
                                (selfViewForCard?.self_view_url_with_phone ||
                                  selfViewForCard?.self_view_url) && (
                                <div
                                  style={{
                                    background: "#eff6ff",
                                    border: "1px solid #93c5fd",
                                    borderRadius: "8px",
                                    padding: "0.55rem 0.7rem",
                                  }}
                                >
                                  <p
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 700,
                                      color: "#1d4ed8",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                    }}
                                  >
                                    Self-View Link
                                  </p>
                                  {selfViewForCard.meeting_date &&
                                    selfViewForCard.meeting_time && (
                                      <p
                                        className="text-sm font-semibold"
                                        style={{ color: "#1e3a8a" }}
                                      >
                                        {selfViewForCard.meeting_date} at{" "}
                                        {selfViewForCard.meeting_time}
                                      </p>
                                    )}
                                  <p
                                    className="text-xs mt-1 break-all"
                                    style={{ color: "#475569" }}
                                  >
                                    {selfViewForCard.self_view_url_with_phone ||
                                      selfViewForCard.self_view_url}
                                  </p>
                                  <div className="flex gap-2 flex-wrap mt-2">
                                    <button
                                      className="btn btn-gold"
                                      style={{
                                        fontSize: "0.74rem",
                                        padding: "0.35rem 0.55rem",
                                      }}
                                      onClick={() =>
                                        window.open(
                                          selfViewForCard.self_view_url_with_phone ||
                                            selfViewForCard.self_view_url,
                                          "_blank",
                                        )
                                      }
                                    >
                                      View Now
                                    </button>
                                    <button
                                      className="btn btn-ghost"
                                      style={{
                                        fontSize: "0.74rem",
                                        padding: "0.35rem 0.55rem",
                                      }}
                                      onClick={async () => {
                                        try {
                                          await navigator.clipboard.writeText(
                                            selfViewForCard.self_view_url_with_phone ||
                                              selfViewForCard.self_view_url ||
                                              "",
                                          );
                                          setCardCopiedSelfViewId(
                                            selfViewForCard.id,
                                          );
                                          setTimeout(
                                            () =>
                                              setCardCopiedSelfViewId(null),
                                            1600,
                                          );
                                        } catch {
                                          setError(
                                            "Copy failed. Please copy the link manually.",
                                          );
                                        }
                                      }}
                                    >
                                      {cardCopiedSelfViewId ===
                                      selfViewForCard.id
                                        ? "Copied"
                                        : "Copy Link"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Like button — auto-saves, no separate submit */}
                            <button
                              onClick={() =>
                                openLikeForm(project, originalIndex)
                              }
                              disabled={isLocked}
                              style={{
                                marginTop: "0.9rem",
                                width: "100%",
                                padding: "0.52rem 0",
                                borderRadius: "var(--radius-md)",
                                border: "none",
                                fontWeight: 700,
                                fontSize: "0.87rem",
                                cursor: isLocked ? "not-allowed" : "pointer",
                                background: isLocked
                                  ? "#b91c1c"
                                  : liked || selfViewForCard
                                    ? "#16a34a"
                                    : "var(--navy-900)",
                                opacity: isLocked ? 0.85 : 1,
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "0.4rem",
                                transition: "background 0.2s",
                              }}
                            >
                              {isLocked
                                ? "Locked: View Only"
                                : selfViewForCard
                                  ? "Update Self-View Date & Time"
                                  : liked
                                    ? "🗓️ Update Visit Date & Time"
                                    : "🤍 Like this Project"}
                            </button>
                            {liked && !isLocked && (
                              <button
                                onClick={() =>
                                  removeLikedProject(project, originalIndex)
                                }
                                style={{
                                  marginTop: "0.55rem",
                                  width: "100%",
                                  padding: "0.5rem 0",
                                  borderRadius: "var(--radius-md)",
                                  border: "1px solid var(--slate-300)",
                                  fontWeight: 700,
                                  fontSize: "0.8rem",
                                  cursor: "pointer",
                                  background: "#fff",
                                  color: "var(--color-text-muted)",
                                }}
                              >
                                Remove Like
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* Footer: liked count, auto-saved */}
        {likedKeys.length > 0 && (
          <div
            className="mt-6 p-4 rounded-xl text-center"
            style={{ background: "#f0fdf4", border: "1px solid #86efac" }}
          >
            <p
              style={{ color: "#16a34a", fontWeight: 700, fontSize: "0.9rem" }}
            >
              ✅ You&apos;ve liked {likedKeys.length} project
              {likedKeys.length !== 1 ? "s" : ""} — saved automatically!
            </p>
          </div>
        )}

        {scheduleProject && (
          <div className="modal-overlay">
            <div
              className="modal-box"
              style={{
                maxWidth: "28rem",
                width: "min(28rem, calc(100% - 1.2rem))",
              }}
            >
              <div className="modal-header">
                <div>
                  <p className="modal-title">
                    Project Name:{" "}
                    {scheduleProject.project.title || "Selected Project"}{" "}
                  </p>
                  <p className="modal-title">
                    {" "}
                    Schedule Pre Site Visit Match Making
                  </p>

                  <p className="modal-subtitle" style={{ fontSize: "13px" }}>
                    Choose expert-guided matchmaking or create a self-view link
                    for this presentation.
                  </p>
                </div>
                <button
                  className="modal-close"
                  onClick={() => {
                    setScheduleProject(null);
                    setScheduleError("");
                    setSelfViewLink(null);
                  }}
                >
                  ×
                </button>
              </div>

              <div className="modal-body">
                {scheduleError && (
                  <div className="alert alert-danger mb-3">{scheduleError}</div>
                )}

                <div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3"
                  role="radiogroup"
                  aria-label="Visit mode"
                >
                  {[
                    {
                      value: "expert",
                      title: "Matchmaking with Expert",
                      body: "Schedule a matchmaking session with an expert.",
                    },
                    {
                      value: "self",
                      title: "DIY Self Match Making",
                      body: "I will explore the project myself.",
                    },
                  ].map((option) => {
                    const active = visitMode === option.value;

                    return (
                      <label
                        key={option.value}
                        style={{
                          cursor: "pointer",
                          border: active
                            ? "2px solid var(--navy-700)"
                            : "1px solid var(--slate-200)",
                          background: active ? "var(--navy-50)" : "#fff",
                          borderRadius: "8px",
                          padding: "0.7rem",
                          display: "flex",
                          gap: "0.55rem",
                          alignItems: "flex-start",
                        }}
                      >
                        <input
                          type="radio"
                          name="visit-mode"
                          value={option.value}
                          checked={active}
                          onChange={() =>
                            selectVisitMode(option.value as "expert" | "self")
                          }
                          style={{ marginTop: 3 }}
                        />
                        <span>
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.86rem",
                              fontWeight: 800,
                              color: "var(--navy-900)",
                            }}
                          >
                            {option.title}
                          </span>
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.75rem",
                              color: "var(--color-text-muted)",
                              marginTop: 2,
                            }}
                          >
                            {option.body}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                {visitMode === "expert" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Date</label>
                      <input
                        className="input-field"
                        type="date"
                        min={today}
                        value={meetingDate}
                        onChange={(e) => setMeetingDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Time</label>

                      <select
                        className="input-field"
                        value={meetingTime}
                        onChange={(e) => setMeetingTime(e.target.value)}
                      >
                        <option value="">Choose a time slot</option>
                        {TIME_SLOTS.map((slot) => (
                          <option key={slot.val} value={slot.val}>
                            {slot.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {visitMode === "self" && selfViewCreating && (
                  <div
                    className="mt-3 p-3 rounded-lg text-sm font-semibold"
                    style={{
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      color: "#1d4ed8",
                    }}
                  >
                    Generating self-view link...
                  </div>
                )}

                {visitMode === "self" &&
                  !selfViewCreating &&
                  !selfViewLink?.self_view_url && (
                    <div className="mt-3">
                      <button
                        className="btn btn-gold w-full"
                        onClick={() => {
                          const defaultSlot = getDefaultSelfViewSlot();
                          void createSelfViewLink(
                            meetingDate || defaultSlot.date,
                            meetingTime || defaultSlot.time,
                          );
                        }}
                      >
                        Get the Self-View Link
                      </button>
                    </div>
                  )}

                {(selfViewLink?.self_view_url_with_phone ||
                  selfViewLink?.self_view_url) &&
                  visitMode === "self" && (
                  <div
                    className="mt-3 p-3 rounded-lg"
                    style={{
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                    }}
                  >
                    <p
                      className="text-xs font-bold mb-1"
                      style={{ color: "#1d4ed8" }}
                    >
                      Self-View Link Created
                    </p>
                    <p
                      className="text-xs mb-2 break-all"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {selfViewLink.self_view_url_with_phone ||
                        selfViewLink.self_view_url}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        className="btn btn-primary"
                        onClick={() =>
                          window.open(
                            selfViewLink.self_view_url_with_phone ||
                              selfViewLink.self_view_url,
                            "_blank",
                          )
                        }
                      >
                        View Now
                      </button>
                      <button
                        className="btn btn-gold"
                        onClick={() => setShowSelfCalendarPicker(true)}
                      >
                        View Later
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={copySelfViewLink}
                      >
                        {selfViewCopied ? "Copied" : "Copy Link"}
                      </button>
                    </div>
                    {showSelfCalendarPicker && (
                      <div
                        className="mt-3 p-3 rounded-lg"
                        style={{
                          background: "#fff",
                          border: "1px solid #dbeafe",
                        }}
                      >
                        <p
                          className="text-xs font-bold mb-2"
                          style={{ color: "var(--navy-900)" }}
                        >
                          Pick a reminder time for Google Calendar
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="label">Date</label>
                            <input
                              className="input-field"
                              type="date"
                              min={today}
                              value={meetingDate}
                              onChange={(e) => setMeetingDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="label">Time</label>
                            <select
                              className="input-field"
                              value={meetingTime}
                              onChange={(e) => setMeetingTime(e.target.value)}
                            >
                              <option value="">Choose a time slot</option>
                              {TIME_SLOTS.map((slot) => (
                                <option key={slot.val} value={slot.val}>
                                  {slot.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <button
                          className="btn btn-primary"
                          onClick={async () => {
                            if (!meetingDate || !meetingTime) {
                              setScheduleError("Please select both date and time.");
                              return;
                            }
                            const scheduledSelfView = await createSelfViewLink(
                              meetingDate,
                              meetingTime,
                              true,
                            );
                            const selfViewUrl =
                              scheduledSelfView?.self_view_url_with_phone ||
                              scheduledSelfView?.self_view_url ||
                              selfViewLink.self_view_url_with_phone ||
                              selfViewLink.self_view_url ||
                              "";
                            if (!selfViewUrl) return;
                            const url = createGoogleCalendarUrl({
                              projectName:
                                scheduleProject.project.title ||
                                "Selected Project",
                              customerName:
                                linkData?.customer?.name ||
                                linkData?.customer?.nickname ||
                                "Customer",
                              date: meetingDate,
                              time: meetingTime,
                              selfViewUrl,
                            });
                            window.open(url, "_blank");
                          }}
                        >
                          Save to Calendar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {visitMode === "expert" && (
                <div className="modal-footer">
                {/* <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setScheduleProject(null);
                    setScheduleError("");
                  }}
                >
                  Cancel
                </button> */}
                <button
                  className="btn btn-gold"
                  onClick={submitLikeSchedule}
                  disabled={saving || selfViewCreating}
                >
                  {selfViewCreating
                    ? "Creating..."
                    : saving
                      ? "Saving..."
                      : "Schedule Pre Site Visit Match Making"}
                </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
