// Pilona operating schedules — which days and hours each bollard is raised.
//
// Standardised as a small set of NAMED schedules (edited once, assigned per camera)
// rather than 14×8 individual cells. A schedule sets, per day of week (+ "holiday"),
// an optional time range during which the pilona is up.
//
// The traffic dataset is DAILY, so hours can't be measured directly; a day counts
// as a "pilona-up day" for the impact analysis when the bollard is raised for at
// least UP_DAY_MIN_HOURS of that day (so e.g. "Friday from 20:00" is NOT a full
// up-day, while "Saturday 00:00–24:00" is). The hours are still stored and shown
// for documentation and future hourly data.

import { getDayType, isHoliday } from "@/lib/holidays";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" | "holiday";

export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun", "holiday"];
export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Dilluns", tue: "Dimarts", wed: "Dimecres", thu: "Dijous",
  fri: "Divendres", sat: "Dissabte", sun: "Diumenge", holiday: "Festius",
};
// Unique 2-letter abbreviations (Divendres/Dissabte/Diumenge share the "Di" prefix).
export const DAY_SHORT: Record<DayKey, string> = {
  mon: "Dl", tue: "Dt", wed: "Dc", thu: "Dj",
  fri: "Dv", sat: "Ds", sun: "Dg", holiday: "Fe",
};

export interface TimeRange { from: string; to: string } // "HH:MM"
export type DaySchedule = Partial<Record<DayKey, TimeRange | null>>;
export interface NamedSchedule { label: string; hours: DaySchedule }
export type SchedulesMap = Record<string, NamedSchedule>;

/** A day is treated as "pilona up" when it's raised at least this many hours. */
export const UP_DAY_MIN_HOURS = 12;

// Default named schedules, from the municipal signage decree.
export const DEFAULT_SCHEDULES: SchedulesMap = {
  generic: {
    label: "Genèric (div. 20h + caps de setmana i festius)",
    hours: {
      fri: { from: "20:00", to: "23:59" },
      sat: { from: "00:00", to: "23:59" },
      sun: { from: "00:00", to: "23:59" },
      holiday: { from: "00:00", to: "23:59" },
    },
  },
  diumenges_festius: {
    label: "Diumenges i festius",
    hours: {
      sun: { from: "00:00", to: "23:59" },
      holiday: { from: "00:00", to: "23:59" },
    },
  },
};

// Cameras whose pilona follows the "Sundays + holidays" schedule (per the decree):
// c/Miranda (CT18), the two of c/Cornellà Modern (CT16, CT17), and Domènech i
// Montaner (CT11). All other pilonas use the generic schedule.
export const DEFAULT_SCHEDULE_BY_CAMERA: Record<string, string> = {
  CT11: "diumenges_festius",
  CT16: "diumenges_festius",
  CT17: "diumenges_festius",
  CT18: "diumenges_festius",
};

const WEEKDAY_BY_UTCDAY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function minutesOf(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Hours the pilona is raised for a given day's time range. */
export function hoursCovered(r: TimeRange | null | undefined): number {
  if (!r) return 0;
  let mins = minutesOf(r.to) - minutesOf(r.from);
  if (r.to === "23:59") mins += 1; // treat as full end-of-day
  return Math.max(0, mins) / 60;
}

/** The schedule key that applies to a date: official holidays use "holiday". */
export function dayKeyForDate(dateStr: string): DayKey {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  if (isHoliday(d)) return "holiday";
  return WEEKDAY_BY_UTCDAY[d.getUTCDay()];
}

/** True when the bollard is raised for most of the day (>= UP_DAY_MIN_HOURS). */
export function isUpDay(hours: DaySchedule, dateStr: string): boolean {
  return hoursCovered(hours[dayKeyForDate(dateStr)]) >= UP_DAY_MIN_HOURS;
}

/** Weekend or official holiday — the control "festiu" set for camera-only points. */
export function isWeekendOrHoliday(dateStr: string): boolean {
  return getDayType(new Date(`${dateStr}T12:00:00.000Z`)) === "holiday";
}

/** Compact human summary of a schedule, e.g. "Ds, Dg, Festius (+ Dv 20:00)". */
export function scheduleSummary(s: NamedSchedule): string {
  const full: string[] = [];
  const partial: string[] = [];
  for (const k of DAY_KEYS) {
    const h = s.hours[k];
    if (!h) continue;
    if (hoursCovered(h) >= UP_DAY_MIN_HOURS) full.push(DAY_SHORT[k]);
    else partial.push(`${DAY_SHORT[k]} ${h.from}`);
  }
  let out = full.join(", ") || "—";
  if (partial.length) out += ` (+ ${partial.join(", ")})`;
  return out;
}
