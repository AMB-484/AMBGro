// Age helpers. Growth references use decimal age in months, computed the same way
// as WHO Anthro / CDC: (visit - birth) in whole days, divided by 30.4375.

export const DAYS_PER_MONTH = 30.4375;
export const MONTHS_PER_YEAR = 12;

/** Whole days between two dates (date-only, timezone-safe). */
export function daysBetween(birth: Date, visit: Date): number {
  const b = Date.UTC(birth.getFullYear(), birth.getMonth(), birth.getDate());
  const v = Date.UTC(visit.getFullYear(), visit.getMonth(), visit.getDate());
  return Math.round((v - b) / 86_400_000);
}

export function ageMonthsFromDates(birth: Date, visit: Date): number {
  return daysBetween(birth, visit) / DAYS_PER_MONTH;
}

export function yearsToMonths(years: number): number {
  return years * MONTHS_PER_YEAR;
}

/** Human-readable age, e.g. "3 y 4 m" or "8 m". */
export function formatAge(ageMonths: number): string {
  if (!Number.isFinite(ageMonths) || ageMonths < 0) return '—';
  const totalMonths = Math.floor(ageMonths);
  const years = Math.floor(totalMonths / MONTHS_PER_YEAR);
  const months = totalMonths % MONTHS_PER_YEAR;
  if (years === 0) return `${months} m`;
  if (months === 0) return `${years} y`;
  return `${years} y ${months} m`;
}
