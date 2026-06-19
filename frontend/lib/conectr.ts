import { getApiBaseUrl } from "@/lib/api";

export const STORAGE_URL =
  process.env.NEXT_PUBLIC_STORAGE_URL ?? "https://conectr.biz/storage";

export type NamedOption = { id?: number; name: string; value?: string };

export type ApiUnit = {
  id?: number;
  presentation_id?: number;
  unit_type?: string | null;
  area_min?: number | null;
  area_max?: number | null;
  price_min?: string | number | null;
  price_max?: string | number | null;
  available_units?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ApiEntity = {
  id?: number;
  name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  pivot?: Record<string, number | string | null>;
};

export type ApiShowcaseLink = {
  id?: number;
  presentation_id?: number;
  title?: string | null;
  url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ApiWebsiteShowcaseLink = {
  link?: string | null;
  presentation_id?: string | null;
  website_showcase_link_id?: number | null;
};

export type ApiProjectMetadata = {
  real_estate_categories?: ApiEntity[];
  website_showcase_links?: ApiWebsiteShowcaseLink[];
};

export type ApiProject = {
  id: number;
  active?: boolean;
  title?: string | null;
  developer?: string | null;
  location?: string | null;
  subtitle?: string | null;
  description?: string | null;
  side_logo?: string | null;
  animation_image?: string | null;
  common_css?: string | null;
  common_js?: string | null;
  title_color?: string | null;
  font_size_desktop?: number | null;
  font_size_mobile?: number | null;
  enable_title_gradient?: number | boolean | null;
  title_gradient_color_1?: string | null;
  title_gradient_color_2?: string | null;
  font_color?: string | null;
  button_primary_color?: string | null;
  button_secondary_color?: string | null;
  border_color?: string | null;
  thank_you_text?: string | null;
  creator_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  background_image_mobile?: string | null;
  background_image_desktop?: string | null;
  main_logo?: string | null;
  development_status?: string | null;
  best_suited?: string | null;
  intent?: string | null;
  possession_date?: string | null;
  available_units?: number | null;
  metadata?: ApiProjectMetadata | null;
  categories?: ApiEntity[];
  tags?: ApiEntity[];
  amenities?: ApiEntity[];
  units?: ApiUnit[];
  showcase_links?: ApiShowcaseLink[];
};

export type MetaFilter = {
  key: string;
  label?: string;
  type?: string;
  options?: NamedOption[];
  min?: number | string;
  max?: number | string;
};

export type MetaResponse = {
  filters?: MetaFilter[];
};

export type PaginatedProjectsResponse = {
  data?: ApiProject[];
  current_page?: number;
  last_page?: number;
  per_page?: number;
  next_page_url?: string | null;
  total?: number;
};

function conectrProxyUrl(
  endpoint: "/presentations/search" | "/meta",
  providerUrl?: string,
): string {
  const url = new URL(`${getApiBaseUrl()}/conectr${endpoint}`);

  if (providerUrl) {
    const provider = new URL(providerUrl, "https://conectr.biz");
    provider.searchParams.forEach((value, key) => {
      url.searchParams.append(key, value);
    });
  }

  return url.toString();
}

async function conectrFetch<T>(
  endpoint: "/presentations/search" | "/meta",
  providerUrl?: string,
): Promise<T> {
  const response = await fetch(conectrProxyUrl(endpoint, providerUrl), {
    headers: { Accept: "application/json" },
  });
  const data = (await response.json()) as T & { message?: string };

  if (!response.ok) {
    throw new Error(data.message || `ConectR request failed (${response.status})`);
  }

  return data;
}

export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const cleaned =
    typeof value === "string" ? value.replace(/,/g, "").trim() : value;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalize(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeWebsite(value: string | null | undefined): string {
  const raw = normalize(value).toLowerCase();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.hostname}`.replace(/\/+$/, "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

export function getConectrWebsiteUrl(): string {
  if (process.env.NEXT_PUBLIC_CONECTR_WEBSITE_URL) {
    return process.env.NEXT_PUBLIC_CONECTR_WEBSITE_URL;
  }

  return "https://conectr.co";
}

export function getProjectPresentationId(
  project: ApiProject | null | undefined,
  websiteUrl = getConectrWebsiteUrl(),
): string {
  const showcaseLinks = project?.metadata?.website_showcase_links ?? [];
  const target = normalizeWebsite(websiteUrl);
  const matched =
    showcaseLinks.find((item) => normalizeWebsite(item.link) === target) ??
    showcaseLinks.find((item) => normalize(item.presentation_id));

  return normalize(matched?.presentation_id).toUpperCase();
}

export function getProjectRealEstateCategories(project: ApiProject): string[] {
  return (project.metadata?.real_estate_categories ?? [])
    .map((item) => normalize(item.name))
    .filter(Boolean);
}

export function mediaUrl(path: string | null | undefined): string | null {
  const cleaned = normalize(path);
  if (!cleaned) return null;
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
    return cleaned;
  }
  return `${STORAGE_URL}/${cleaned}`;
}

export function toCardPrice(project: ApiProject): string {
  const units = project.units ?? [];
  const mins = units
    .map((unit) => toNumber(unit.price_min))
    .filter((value) => value > 0);
  const maxs = units
    .map((unit) => toNumber(unit.price_max))
    .filter((value) => value > 0);

  if (!mins.length && !maxs.length) return "Price on request";
  const min = mins.length ? Math.min(...mins) : Math.min(...maxs);
  const max = maxs.length ? Math.max(...maxs) : min;

  const format = (value: number) => {
    if (value >= 10000000) return `Rs ${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `Rs ${(value / 100000).toFixed(1)} L`;
    return `Rs ${Math.round(value).toLocaleString("en-IN")}`;
  };

  return min === max ? format(min) : `${format(min)} - ${format(max)}`;
}

export function toStatusLabel(status: string): string {
  const lowered = status.toLowerCase();
  if (lowered === "under_construction") return "Under Construction";
  if (lowered === "ready") return "Ready";
  return status || "Unknown";
}

export function getProjectShowcaseVideos(project: ApiProject): string[] {
  const links = project.showcase_links ?? [];
  const seen = new Set<string>();
  const videos: string[] = [];

  for (const link of links) {
    const url = normalize(link.url);
    if (!url) continue;
    if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    videos.push(url);
  }

  return videos;
}

export function getProjectShowcaseVideo(project: ApiProject): string | null {
  return getProjectShowcaseVideos(project)[0] ?? null;
}

export function toProjectSlug(projectOrTitle: ApiProject | string): string {
  const title =
    typeof projectOrTitle === "string"
      ? projectOrTitle
      : normalize(projectOrTitle.title) || `project-${projectOrTitle.id}`;

  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

export function getProjectDetailPath(project: ApiProject): string {
  return `/projects/${project.id}/${toProjectSlug(project)}`;
}

export async function fetchAllProjects(): Promise<{
  projects: ApiProject[];
  total: number;
}> {
  let url: string | null = null;
  let expectedTotal = 0;
  const seen = new Set<number>();
  const all: ApiProject[] = [];

  do {
    const data: PaginatedProjectsResponse =
      await conectrFetch<PaginatedProjectsResponse>(
        "/presentations/search",
        url ?? undefined,
      );
    if (!expectedTotal) expectedTotal = toNumber(data.total);

    const list = data.data ?? [];
    list.forEach((item) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      all.push(item);
    });

    url = data.next_page_url ?? null;
  } while (url);

  return { projects: all, total: expectedTotal || all.length };
}

export async function fetchProjectsPage(
  providerUrl?: string,
  perPage = 12,
): Promise<{
  projects: ApiProject[];
  nextPageUrl: string | null;
  total: number;
}> {
  const url =
    providerUrl ??
    `https://conectr.biz/api/presentations/search?page=1&per_page=${perPage}`;
  const data = await conectrFetch<PaginatedProjectsResponse>(
    "/presentations/search",
    url,
  );

  return {
    projects: data.data ?? [],
    nextPageUrl: data.next_page_url ?? null,
    total: toNumber(data.total) || (data.data ?? []).length,
  };
}

export async function fetchProjectById(
  projectId: number,
): Promise<ApiProject | null> {
  if (!Number.isFinite(projectId) || projectId <= 0) return null;

  let url: string | null = null;

  do {
    const data: PaginatedProjectsResponse =
      await conectrFetch<PaginatedProjectsResponse>(
        "/presentations/search",
        url ?? undefined,
      );
    const found = (data.data ?? []).find((item) => item.id === projectId);
    if (found) return found;
    url = data.next_page_url ?? null;
  } while (url);

  return null;
}

export async function fetchMeta(): Promise<MetaResponse> {
  return conectrFetch<MetaResponse>("/meta");
}
