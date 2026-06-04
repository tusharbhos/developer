export const PROJECT_PRESENTATION_ID_MAP: Record<string, string> = {
  samsara: "PRS-44673A56",
  nova: "PRS-149E2CAE",
  "palladio la viento": "PRS-29E21018",
  "1 presidential by sereno": "PRS-C84C75BF",
  "24k altura": "PRS-DB148E97",
  "spring shire": "PRS-2F1B5847",
  "24k manor": "PRS-23B7C2DD",
  "qrious by life republic": "PRS-C21ABB08",
  "rose paradise": "PRS-9D6DA952",
  "little earth": "PRS-5B111244",
  "balmora hillside": "PRS-2F39B888",
  "gagan myra": "PRS-6A12987E",
  "supreme towers": "PRS-6FC1D35C",
  "supreme villagio": "PRS-75735486",
  "ganga avanta": "PRS-40BCAA20",
  "ganga platinum": "PRS-4AC12033",
  "ganga imperia": "PRS-99BACD41",
  laviento: "PRS-29E21018",
  "gera joy on the tree tops": "PRS-5D1F5E0A",
  "nyati equinox": "PRS-40058D8F",
  "nyati evoque": "PRS-7CC7F801",
  "nyati esteban": "PRS-72ABC1A3",
  "jade skyline": "PRS-00208A4B",
  "citadel": "PRS-E2B1B10B",
  "ivylush": "PRS-D3258DC1",
  "the altius": "PRS-6896775B",
  "altius": "PRS-6896775B",
  "highgardens": "PRS-A4E50285",
  "cove": "PRS-C8B63587",
  "athashri": "PRS-6B962C8A",
  "verdant": "PRS-5104BA08",
  "golfland villas": "PRS-E85984DC",
  "velvet villas": "PRS-2AD12D56",
  "vtp cielo": "PRS-38D01A35",
  "vtp verve": "PRS-0628FB43",
  "vtp aurelia": "PRS-E5371EA8",
  "nova residency": "PRS-149E2CAE",
  "yana by austin realty": "PRS-57879080",
  "austin yana": "PRS-57879080",
  "yana": "PRS-57879080",
  "gera island of joy - child centric homes": "PRS-9BF9627E",
  "1 presidential by now realty": "PRS-C84C75BF",
  "gagan myra 02": "PRS-6A12987E",
  "avinea by vyom buildcon":"PRS-600DE22F"
};

export function normalizeProjectName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getPresentationIdForProject(projectName: string): string {
  const normalized = normalizeProjectName(projectName);
  if (!normalized) return "";

  if (PROJECT_PRESENTATION_ID_MAP[normalized]) {
    return PROJECT_PRESENTATION_ID_MAP[normalized];
  }

  const fuzzyKey = Object.keys(PROJECT_PRESENTATION_ID_MAP).find(
    (key) => normalized.includes(key) || key.includes(normalized),
  );

  return fuzzyKey ? PROJECT_PRESENTATION_ID_MAP[fuzzyKey] : "";
}
