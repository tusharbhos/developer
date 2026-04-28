export function format12HourTime(value?: string | null) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function formatDisplayDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDisplayDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day} • ${time}`;
}

export function formatDisplayMeeting(
  date?: string | null,
  time?: string | null,
) {
  const formattedDate = formatDisplayDate(date);
  const formattedTime = time ? format12HourTime(time) : "-";
  if (!date && !time) return "-";
  if (!date) return formattedTime;
  if (!time) return formattedDate;
  return `${formattedDate} • ${formattedTime}`;
}

export function compareMeetingLikeItems(
  left: { meeting_date?: string; meeting_time?: string },
  right: { meeting_date?: string; meeting_time?: string },
  today: string,
) {
  const leftDate = left.meeting_date || "9999-99-99";
  const rightDate = right.meeting_date || "9999-99-99";
  const leftTime = left.meeting_time || "23:59";
  const rightTime = right.meeting_time || "23:59";

  const getTier = (dateValue?: string) => {
    if (!dateValue) return 3;
    if (dateValue === today) return 0;
    if (dateValue > today) return 1;
    return 2;
  };

  const leftTier = getTier(left.meeting_date);
  const rightTier = getTier(right.meeting_date);

  if (leftTier !== rightTier) return leftTier - rightTier;

  if (leftTier === 2) {
    if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
    return rightTime.localeCompare(leftTime);
  }

  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
  return leftTime.localeCompare(rightTime);
}
