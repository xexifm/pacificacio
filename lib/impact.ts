// Impact analysis of the traffic-calming measures (pilones/càmeres).
//
// The political question is: "did the measures change how many vehicles circulate?".
// A naïve "total before vs total after" would be wrong here, because data coverage
// grows over time (more camera-days later), so later totals look bigger for reasons
// unrelated to the measures. This module answers it defensibly:
//
//   1. Days are classified as `working` or `holiday` (weekend/official holiday) and
//      only ever compared like-for-like (working↔working, holiday↔holiday).
//   2. Each barri is split at its own activation date into BEFORE and AFTER.
//   3. Per CAMERA we compute the average vehicles PER DAY (Σvalor / distinct days
//      with data). This normalises away coverage differences between periods.
//   4. A camera only counts for a comparison if it has enough days on BOTH sides
//      (MIN_DAYS_PER_SIDE), so a camera installed late can't distort the result.
//   5. The barri figure sums the per-camera averages of the qualifying cameras
//      (the same cameras contribute to both sides by construction).
//
// Convention: a negative deltaPct means a REDUCTION in traffic (the intended effect).
// This is a descriptive before/after comparison, not a causal/inferential model.

import { getDayType } from "@/lib/holidays";
import type { TrafficData, CameraSettings } from "@/lib/types";

export const MIN_DAYS_PER_SIDE = 10;
export const NO_CHANGE_THRESHOLD = 5; // percent; |delta| below this = "no meaningful change"

export type DayType = "working" | "holiday";

export interface PeriodStats {
  avgPerDay: number;
  days: number;
  byVehicle: Record<string, number>;
}

export interface Comparison {
  before: PeriodStats;
  after: PeriodStats;
  deltaPct: number | null;
}

export interface CameraImpact {
  camera: string;
  displayName: string | null;
  neighbourhood: string;
  cameraType: string;
  reliable: boolean;
  working: Comparison | null; // null = does not qualify (insufficient days on a side)
  holiday: Comparison | null;
}

export interface VehicleDelta {
  before: number;
  after: number;
  deltaPct: number | null;
}

export interface NeighbourhoodComparison extends Comparison {
  byVehicleDelta: Record<string, VehicleDelta>;
}

export interface NeighbourhoodImpact {
  neighbourhood: string;
  interventionDate: string;
  working: NeighbourhoodComparison;
  holiday: NeighbourhoodComparison;
  camerasIncluded: string[];
  camerasExcluded: { camera: string; reason: "unreliable" | "insufficient-data" }[];
  seasonalityWarning: boolean;
}

export interface ImpactResult {
  byNeighbourhood: NeighbourhoodImpact[];
  byCamera: CameraImpact[];
}

// ── internals ───────────────────────────────────────────────────────────────

interface Accum {
  sum: number;
  days: Set<string>;
  byVehicle: Record<string, number>;
}

function emptyAccum(): Accum {
  return { sum: 0, days: new Set(), byVehicle: {} };
}

function dayTypeOf(dateStr: string): DayType {
  return getDayType(new Date(`${dateStr}T12:00:00.000Z`));
}

function toPeriodStats(a: Accum): PeriodStats {
  const days = a.days.size;
  const byVehicle: Record<string, number> = {};
  for (const [v, s] of Object.entries(a.byVehicle)) byVehicle[v] = days > 0 ? s / days : 0;
  return { avgPerDay: days > 0 ? a.sum / days : 0, days, byVehicle };
}

function pct(before: number, after: number): number | null {
  if (before <= 0) return null;
  return ((after - before) / before) * 100;
}

/** Per-camera, per-day-type BEFORE/AFTER accumulators. */
interface CameraSide {
  working: { before: Accum; after: Accum };
  holiday: { before: Accum; after: Accum };
  monthsBefore: Set<number>;
  monthsAfter: Set<number>;
}

export function computeImpact(
  rows: TrafficData[],
  cameras: CameraSettings[],
  dates: Record<string, string | null>,
  opts: { reliableOnly?: boolean; minDaysPerSide?: number } = {},
): ImpactResult {
  const reliableOnly = opts.reliableOnly ?? true;
  const minDays = opts.minDaysPerSide ?? MIN_DAYS_PER_SIDE;

  const settingsByCamera = new Map(cameras.map((c) => [c.cameraId, c]));
  const perCamera = new Map<string, CameraSide>();

  for (const row of rows) {
    const settings = settingsByCamera.get(row.camera);
    if (!settings) continue;
    const interventionDate = dates[settings.neighbourhood] ?? null;
    if (!interventionDate) continue; // no reference date → nothing to compare

    const date = row.datahora.slice(0, 10);
    const period: "before" | "after" = date < interventionDate ? "before" : "after";
    const dayType = dayTypeOf(date);

    let side = perCamera.get(row.camera);
    if (!side) {
      side = {
        working: { before: emptyAccum(), after: emptyAccum() },
        holiday: { before: emptyAccum(), after: emptyAccum() },
        monthsBefore: new Set(),
        monthsAfter: new Set(),
      };
      perCamera.set(row.camera, side);
    }

    const acc = side[dayType][period];
    acc.sum += row.valor;
    acc.days.add(date);
    acc.byVehicle[row.tipusVehicle] = (acc.byVehicle[row.tipusVehicle] || 0) + row.valor;

    const month = parseInt(date.slice(5, 7), 10);
    (period === "before" ? side.monthsBefore : side.monthsAfter).add(month);
  }

  // Build per-camera comparisons.
  const qualifies = (s: { before: Accum; after: Accum }) =>
    s.before.days.size >= minDays && s.after.days.size >= minDays;

  const comparisonOf = (s: { before: Accum; after: Accum }): Comparison | null => {
    if (!qualifies(s)) return null;
    const before = toPeriodStats(s.before);
    const after = toPeriodStats(s.after);
    return { before, after, deltaPct: pct(before.avgPerDay, after.avgPerDay) };
  };

  const byCamera: CameraImpact[] = cameras
    .slice()
    .sort((a, b) => parseInt(a.cameraId.replace(/\D/g, "")) - parseInt(b.cameraId.replace(/\D/g, "")))
    .map((c) => {
      const side = perCamera.get(c.cameraId);
      return {
        camera: c.cameraId,
        displayName: c.displayName,
        neighbourhood: c.neighbourhood,
        cameraType: c.cameraType,
        reliable: c.reliable !== false,
        working: side ? comparisonOf(side.working) : null,
        holiday: side ? comparisonOf(side.holiday) : null,
      };
    });

  // Aggregate per neighbourhood (only those with an activation date).
  const byNeighbourhood: NeighbourhoodImpact[] = [];

  for (const [neighbourhood, interventionDate] of Object.entries(dates)) {
    if (!interventionDate) continue;

    const nbCameras = cameras.filter((c) => c.neighbourhood === neighbourhood);
    const camerasExcluded: NeighbourhoodImpact["camerasExcluded"] = [];
    const eligible: CameraSettings[] = [];

    for (const c of nbCameras) {
      if (reliableOnly && c.reliable === false) {
        camerasExcluded.push({ camera: c.cameraId, reason: "unreliable" });
        continue;
      }
      const side = perCamera.get(c.cameraId);
      const qualifiesAny = side && (qualifies(side.working) || qualifies(side.holiday));
      if (!qualifiesAny) {
        camerasExcluded.push({ camera: c.cameraId, reason: "insufficient-data" });
        continue;
      }
      eligible.push(c);
    }

    const aggregate = (dayType: DayType): NeighbourhoodComparison => {
      const beforeSum = { total: 0, byVehicle: {} as Record<string, number>, days: 0 };
      const afterSum = { total: 0, byVehicle: {} as Record<string, number>, days: 0 };

      for (const c of eligible) {
        const side = perCamera.get(c.cameraId)!;
        if (!qualifies(side[dayType])) continue;
        const before = toPeriodStats(side[dayType].before);
        const after = toPeriodStats(side[dayType].after);
        beforeSum.total += before.avgPerDay;
        afterSum.total += after.avgPerDay;
        beforeSum.days = Math.max(beforeSum.days, before.days);
        afterSum.days = Math.max(afterSum.days, after.days);
        for (const [v, val] of Object.entries(before.byVehicle))
          beforeSum.byVehicle[v] = (beforeSum.byVehicle[v] || 0) + val;
        for (const [v, val] of Object.entries(after.byVehicle))
          afterSum.byVehicle[v] = (afterSum.byVehicle[v] || 0) + val;
      }

      const byVehicleDelta: Record<string, VehicleDelta> = {};
      const vehicles = new Set([
        ...Object.keys(beforeSum.byVehicle),
        ...Object.keys(afterSum.byVehicle),
      ]);
      for (const v of vehicles) {
        const b = beforeSum.byVehicle[v] || 0;
        const a = afterSum.byVehicle[v] || 0;
        byVehicleDelta[v] = { before: b, after: a, deltaPct: pct(b, a) };
      }

      return {
        before: { avgPerDay: beforeSum.total, days: beforeSum.days, byVehicle: beforeSum.byVehicle },
        after: { avgPerDay: afterSum.total, days: afterSum.days, byVehicle: afterSum.byVehicle },
        deltaPct: pct(beforeSum.total, afterSum.total),
        byVehicleDelta,
      };
    };

    // Seasonality: how many calendar months are shared between the two periods.
    const monthsBefore = new Set<number>();
    const monthsAfter = new Set<number>();
    for (const c of eligible) {
      const side = perCamera.get(c.cameraId)!;
      side.monthsBefore.forEach((m) => monthsBefore.add(m));
      side.monthsAfter.forEach((m) => monthsAfter.add(m));
    }
    const shared = [...monthsBefore].filter((m) => monthsAfter.has(m)).length;

    byNeighbourhood.push({
      neighbourhood,
      interventionDate,
      working: aggregate("working"),
      holiday: aggregate("holiday"),
      camerasIncluded: eligible.map((c) => c.cameraId),
      camerasExcluded,
      seasonalityWarning: shared < 6,
    });
  }

  return { byNeighbourhood, byCamera };
}

/** Human-readable direction of a delta, for auto-generated conclusions. */
export function deltaVerdict(deltaPct: number | null): "reduction" | "increase" | "no-change" | "n/a" {
  if (deltaPct === null) return "n/a";
  if (deltaPct <= -NO_CHANGE_THRESHOLD) return "reduction";
  if (deltaPct >= NO_CHANGE_THRESHOLD) return "increase";
  return "no-change";
}
