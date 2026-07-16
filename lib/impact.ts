// Impact analysis of the traffic-calming measures (pilones/càmeres).
//
// The political question: "did the measures reduce vehicle circulation, and does
// the reduction differ where there's a physical bollard (pilona) vs a plain
// monitoring camera?".
//
// Method (descriptive before/after, not a causal model):
//   1. Split each barri at its activation date into BEFORE / AFTER.
//   2. For each camera, average vehicles PER DAY (Σvalor / distinct days with
//      data) so growing data coverage doesn't distort the comparison.
//   3. Compare like-for-like day types:
//        · "festiu" (restriction) days — the days each point is under restriction
//          per its configured schedule (raised bollard for a PILONA, camera-enforced
//          restriction for a CÀMERA), counted when active ≥12h that day.
//        · "working" days — a control that should barely change if the effect is
//          really the restriction.
//   4. A camera qualifies for a comparison only with enough days on both sides
//      (MIN_DAYS_PER_SIDE).
//   5. Barri figures sum the per-camera averages of qualifying reliable cameras,
//      split by device type so the pilona effect and the camera (no physical
//      barrier) effect are separable.
//
// Negative deltaPct = reduction (the intended effect).

import { getDayType } from "@/lib/holidays";
import { isUpDay, type SchedulesMap } from "@/lib/schedule";
import type { TrafficData, CameraSettings } from "@/lib/types";

export const MIN_DAYS_PER_SIDE = 10;
export const NO_CHANGE_THRESHOLD = 5; // percent

export type Bucket = "festiu" | "working";

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
export interface VehicleDelta {
  before: number;
  after: number;
  deltaPct: number | null;
}
export interface DeviceComparison extends Comparison {
  byVehicleDelta: Record<string, VehicleDelta>;
  camerasCount: number;
}

export interface CameraImpact {
  camera: string;
  displayName: string | null;
  neighbourhood: string;
  cameraType: string;
  hasPilona: boolean;
  scheduleId: string;
  reliable: boolean;
  festiu: Comparison | null; // restriction days per the point's schedule
  working: Comparison | null;
}

export interface NeighbourhoodImpact {
  neighbourhood: string;
  interventionDate: string;
  pilona: DeviceComparison; // pilona points, on their restriction days
  camera: DeviceComparison; // càmera points (no barrier), on their restriction days
  working: DeviceComparison; // all eligible cameras, working days (control)
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
const emptyAccum = (): Accum => ({ sum: 0, days: new Set(), byVehicle: {} });

interface CameraSide {
  festiu: { before: Accum; after: Accum };
  working: { before: Accum; after: Accum };
  monthsBefore: Set<number>;
  monthsAfter: Set<number>;
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
const hasPilonaOf = (c: CameraSettings) => c.cameraType === "Pilona";

export function computeImpact(
  rows: TrafficData[],
  cameras: CameraSettings[],
  schedules: SchedulesMap,
  dates: Record<string, string | null>,
  opts: { reliableOnly?: boolean; minDaysPerSide?: number } = {},
): ImpactResult {
  const reliableOnly = opts.reliableOnly ?? true;
  const minDays = opts.minDaysPerSide ?? MIN_DAYS_PER_SIDE;

  const settingsByCamera = new Map(cameras.map((c) => [c.cameraId, c]));
  const perCamera = new Map<string, CameraSide>();

  for (const row of rows) {
    const s = settingsByCamera.get(row.camera);
    if (!s) continue;
    const interventionDate = dates[s.neighbourhood] ?? null;
    if (!interventionDate) continue;

    const date = row.datahora.slice(0, 10);
    const period: "before" | "after" = date < interventionDate ? "before" : "after";

    // Which bucket does this day fall in for this camera? Every point (pilona OR
    // càmera) now follows its configured restriction schedule for the "festiu" set.
    let bucket: Bucket | null;
    if (getDayType(new Date(`${date}T12:00:00.000Z`)) === "working") {
      bucket = "working";
    } else {
      const sched = schedules[s.scheduleId];
      bucket = sched && isUpDay(sched.hours, date) ? "festiu" : null; // not-restricted festiu day → skip
    }
    if (!bucket) continue;

    let side = perCamera.get(row.camera);
    if (!side) {
      side = {
        festiu: { before: emptyAccum(), after: emptyAccum() },
        working: { before: emptyAccum(), after: emptyAccum() },
        monthsBefore: new Set(),
        monthsAfter: new Set(),
      };
      perCamera.set(row.camera, side);
    }
    const acc = side[bucket][period];
    acc.sum += row.valor;
    acc.days.add(date);
    acc.byVehicle[row.tipusVehicle] = (acc.byVehicle[row.tipusVehicle] || 0) + row.valor;
    (period === "before" ? side.monthsBefore : side.monthsAfter).add(parseInt(date.slice(5, 7), 10));
  }

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
        hasPilona: hasPilonaOf(c),
        scheduleId: c.scheduleId,
        reliable: c.reliable !== false,
        festiu: side ? comparisonOf(side.festiu) : null,
        working: side ? comparisonOf(side.working) : null,
      };
    });

  // Aggregate a set of per-camera comparisons into one DeviceComparison.
  const aggregate = (comparisons: Comparison[]): DeviceComparison => {
    const bAcc: Record<string, number> = {}, aAcc: Record<string, number> = {};
    let bTotal = 0, aTotal = 0, bDays = 0, aDays = 0;
    for (const c of comparisons) {
      bTotal += c.before.avgPerDay;
      aTotal += c.after.avgPerDay;
      bDays = Math.max(bDays, c.before.days);
      aDays = Math.max(aDays, c.after.days);
      for (const [v, val] of Object.entries(c.before.byVehicle)) bAcc[v] = (bAcc[v] || 0) + val;
      for (const [v, val] of Object.entries(c.after.byVehicle)) aAcc[v] = (aAcc[v] || 0) + val;
    }
    const byVehicleDelta: Record<string, VehicleDelta> = {};
    for (const v of new Set([...Object.keys(bAcc), ...Object.keys(aAcc)])) {
      byVehicleDelta[v] = { before: bAcc[v] || 0, after: aAcc[v] || 0, deltaPct: pct(bAcc[v] || 0, aAcc[v] || 0) };
    }
    return {
      before: { avgPerDay: bTotal, days: bDays, byVehicle: bAcc },
      after: { avgPerDay: aTotal, days: aDays, byVehicle: aAcc },
      deltaPct: pct(bTotal, aTotal),
      byVehicleDelta,
      camerasCount: comparisons.length,
    };
  };

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
      if (!side || !(qualifies(side.festiu) || qualifies(side.working))) {
        camerasExcluded.push({ camera: c.cameraId, reason: "insufficient-data" });
        continue;
      }
      eligible.push(c);
    }

    const festiuComps = (pred: (c: CameraSettings) => boolean) =>
      eligible
        .filter(pred)
        .map((c) => comparisonOf(perCamera.get(c.cameraId)!.festiu))
        .filter((x): x is Comparison => x !== null);
    const workingComps = eligible
      .map((c) => comparisonOf(perCamera.get(c.cameraId)!.working))
      .filter((x): x is Comparison => x !== null);

    const monthsBefore = new Set<number>(), monthsAfter = new Set<number>();
    for (const c of eligible) {
      const side = perCamera.get(c.cameraId)!;
      side.monthsBefore.forEach((m) => monthsBefore.add(m));
      side.monthsAfter.forEach((m) => monthsAfter.add(m));
    }
    const shared = [...monthsBefore].filter((m) => monthsAfter.has(m)).length;

    byNeighbourhood.push({
      neighbourhood,
      interventionDate,
      pilona: aggregate(festiuComps(hasPilonaOf)),
      camera: aggregate(festiuComps((c) => !hasPilonaOf(c))),
      working: aggregate(workingComps),
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
