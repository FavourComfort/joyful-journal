/**
 * Canonical category definitions for the NINJAWO platform.
 *
 * Every part of the app — provider signup, onboarding, dashboard service
 * creation, customer request inference, and the matching engine — must use
 * these canonical values. A `normalizeCategory()` helper maps any known alias
 * (legacy values, display-name lookups, close-but-different strings) to the
 * canonical form so matching never fails due to naming drift.
 */

export const CANONICAL_CATEGORIES = {
  maintenance: "Home Maintenance & Repairs",
  "business-consulting": "Business Consulting",
  "creative-design": "Creative Design",
  "health-wellness": "Health & Wellness",
  "beauty-hair": "Beauty & Hair",
  education: "Education",
  "technology-it": "Technology & IT",
  events: "Events & Dining",
  other: "Other",
} as const;

export type CanonicalCategory = keyof typeof CANONICAL_CATEGORIES;

export const CANONICAL_CATEGORY_VALUES = Object.keys(
  CANONICAL_CATEGORIES
) as CanonicalCategory[];

/**
 * Maps every known alias / legacy value / display label to its canonical key.
 *
 * When adding a new form or onboarding flow, register its category values here
 * so that data already stored under older names still matches correctly.
 */
const ALIAS_MAP: Record<string, CanonicalCategory> = {
  // Canonical values (identity mapping so normalize is idempotent)
  maintenance: "maintenance",
  "business-consulting": "business-consulting",
  "creative-design": "creative-design",
  "health-wellness": "health-wellness",
  "beauty-hair": "beauty-hair",
  education: "education",
  "technology-it": "technology-it",
  events: "events",
  other: "other",

  // Legacy / alias values from older forms
  consulting: "business-consulting",
  design: "creative-design",
  health: "health-wellness",
  "health-and-wellness": "health-wellness",
  "beauty-and-hair": "beauty-hair",
  "technology-and-it": "technology-it",
  "creative-and-design": "creative-design",

  // Display label lookups (lowercased) — useful when a form stores the label
  // instead of the value by mistake
  "home maintenance & repairs": "maintenance",
  "business consulting": "business-consulting",
  "creative design": "creative-design",
  "health & wellness": "health-wellness",
  "beauty & hair": "beauty-hair",
  "technology & it": "technology-it",
  "events & dining": "events",
};

/**
 * Normalize any category value to its canonical form.
 *
 * - Trims whitespace and lowercases before lookup.
 * - Returns the canonical key if a match is found.
 * - Falls back to "other" for anything unrecognized so that matching never
 *   silently drops a provider due to a typo or unknown value.
 */
export function normalizeCategory(value: string | null | undefined): CanonicalCategory {
  if (!value || !value.trim()) {
    return "other";
  }

  const trimmed = value.trim().toLowerCase();

  // Direct alias lookup
  if (ALIAS_MAP[trimmed]) {
    return ALIAS_MAP[trimmed];
  }

  // Fuzzy: check if any canonical value is a substring of the input or vice versa
  for (const canonical of CANONICAL_CATEGORY_VALUES) {
    if (trimmed.includes(canonical) || canonical.includes(trimmed)) {
      return canonical;
    }
  }

  // Fuzzy: check display labels
  for (const [key, label] of Object.entries(CANONICAL_CATEGORIES)) {
    if (label.toLowerCase() === trimmed) {
      return key as CanonicalCategory;
    }
  }

  return "other";
}

/**
 * Normalize an array of category values, deduplicating the result.
 */
export function normalizeCategories(values: (string | null | undefined)[]): CanonicalCategory[] {
  const set = new Set<CanonicalCategory>();
  for (const v of values) {
    set.add(normalizeCategory(v));
  }
  return Array.from(set);
}

/**
 * Get the human-readable display label for a canonical category.
 */
export function categoryLabel(category: string | null | undefined): string {
  const canonical = normalizeCategory(category);
  return CANONICAL_CATEGORIES[canonical];
}
