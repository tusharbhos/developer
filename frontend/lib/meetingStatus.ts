export type TimedMeetingStatus =
  | "requested"
  | "scheduled"
  | "live"
  | "completed";

export const DEFAULT_MEETING_DURATION_MINUTES = 90;

export function hasViewerActivity({
  joinees,
  eventCount,
}: {
  joinees?: number | string | null;
  eventCount?: number | string | null;
}) {
  return Number(joinees || 0) > 0 || Number(eventCount || 0) > 0;
}

export function hasCompletedSessionEvidence({
  status,
  startedAt,
  endedAt,
  joinees,
  eventCount,
}: {
  status?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  joinees?: number | string | null;
  eventCount?: number | string | null;
}) {
  const normalized = String(status || "").toLowerCase();
  const ended =
    Boolean(endedAt) ||
    normalized.includes("completed") ||
    normalized.includes("ended");

  return ended && Boolean(startedAt) && hasViewerActivity({ joinees, eventCount });
}

export function parseMeetingDateTime(
  meetingDate?: string | null,
  meetingTime?: string | null,
): Date | null {
  if (!meetingDate) return null;

  const time = (meetingTime || "00:00").slice(0, 5);
  const dateTime = new Date(`${meetingDate}T${time}:00`);
  return Number.isNaN(dateTime.getTime()) ? null : dateTime;
}

export function getTimedMeetingStatus({
  meetingDate,
  meetingTime,
  hasSession,
  hasViewerActivity,
  completedEvidence,
  now = new Date(),
  durationMinutes = DEFAULT_MEETING_DURATION_MINUTES,
}: {
  meetingDate?: string | null;
  meetingTime?: string | null;
  hasSession?: boolean;
  hasViewerActivity?: boolean;
  completedEvidence?: boolean;
  now?: Date;
  durationMinutes?: number;
}): TimedMeetingStatus {
  if (!meetingDate) return "requested";

  const startsAt = parseMeetingDateTime(meetingDate, meetingTime);
  if (!startsAt) return "scheduled";

  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

  if (now < startsAt) return "scheduled";
  if (now >= startsAt && now < endsAt) return "live";

  return hasSession && (completedEvidence || hasViewerActivity)
    ? "completed"
    : "scheduled";
}

export function timedMeetingStatusLabel(status: TimedMeetingStatus): string {
  switch (status) {
    case "requested":
      return "Requested";
    case "scheduled":
      return "Scheduled";
    case "live":
      return "Live";
    case "completed":
      return "Completed";
  }
}
