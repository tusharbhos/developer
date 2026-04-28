// Shared filter state contract for the API-driven home flow.

export interface FilterState {
  projectName: string[];
  categories: string[];
  tags: string[];
  developer: string[];
  location: string[];
  amenities: string[];
  developmentStatus: string;
  bestSuited: string;
  possessionDate: string;
  possessionWithinYears: number;
  unitTypes: string[];
  areaMin: number;
  areaMax: number;
  priceMin: number;
  priceMax: number;
  unitsAvailable: number;
}

export const DEFAULT_FILTERS: FilterState = {
  projectName: [],
  categories: [],
  tags: [],
  developer: [],
  location: [],
  amenities: [],
  developmentStatus: "",
  bestSuited: "",
  possessionDate: "",
  possessionWithinYears: 0,
  unitTypes: [],
  areaMin: 200,
  areaMax: 10000,
  priceMin: 2000000,
  priceMax: 50000000,
  unitsAvailable: 0,
};
