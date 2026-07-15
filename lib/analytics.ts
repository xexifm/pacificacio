// Pure analytics helpers, extracted so they can be unit-tested and shared between
// the dashboard page and the coverage table (previously duplicated in both).

import { getDayType } from "@/lib/holidays";
import type { BollardSettings, TrafficData, DataCoverageDetail } from "@/lib/types";

export type DayCategory = "working" | "holiday_down" | "holiday_up";

export const DAY_CATEGORY_COLORS: Record<DayCategory, string> = {
  working: "#3b82f6",
  holiday_down: "#22c55e",
  holiday_up: "#ef4444",
};

/** Anchor a date at 12:00 UTC on its own calendar day (avoids DST/tz edge cases). */
export function normalizeToDateOnly(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
}

export function getUTCDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Classifies a day as a working day, or — for holidays/weekends — whether the
 * bollards were down (natural) or up (raised) for the given neighbourhood, based
 * on that neighbourhood's bollard activation date.
 */
export function getDayCategory(
  date: Date,
  neighbourhood: string | undefined,
  bollardSettings: BollardSettings | undefined,
): DayCategory {
  const normalizedDate = normalizeToDateOnly(date);
  const dayType = getDayType(normalizedDate);

  if (dayType === "working") return "working";

  const dateStr = getUTCDateKey(normalizedDate);

  let bollardStartDate: string | null = null;
  if (neighbourhood === "Pedró") {
    bollardStartDate = bollardSettings?.bollardStartDatePedro || null;
  } else if (neighbourhood === "Gavarra") {
    bollardStartDate = bollardSettings?.bollardStartDateGavarra || null;
  }

  if (!bollardStartDate) return "holiday_down";

  return dateStr >= bollardStartDate ? "holiday_up" : "holiday_down";
}

/**
 * Reduces per-record traffic rows to one entry per (camera, date) with the
 * per-vehicle-type breakdown and daily total. Mirrors the former
 * storage.getDetailedDataCoverage() SQL aggregation, but in memory.
 */
export function computeDetailedCoverage(rows: TrafficData[]): DataCoverageDetail[] {
  const byKey = new Map<string, DataCoverageDetail>();

  for (const row of rows) {
    const date = row.datahora.slice(0, 10);
    const key = `${row.camera}-${date}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { camera: row.camera, date, totalVehicles: 0, vehicleBreakdown: {} };
      byKey.set(key, entry);
    }
    entry.totalVehicles += row.valor;
    entry.vehicleBreakdown[row.tipusVehicle] =
      (entry.vehicleBreakdown[row.tipusVehicle] || 0) + row.valor;
  }

  return Array.from(byKey.values());
}
