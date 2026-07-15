// Serialises the dashboard filter state to/from URL query params so a filtered
// view can be shared as a link. Kept framework-agnostic (plain URLSearchParams);
// the page wires it to window.history on the client.

import type { DateRange } from "react-day-picker";

export interface DashboardFilters {
  neighbourhood: string; // 'all' | 'Pedró' | 'Gavarra'
  deviceType: string; // 'all' | 'Pilona' | 'Càmera'
  cameras: string[];
  vehicles: string[];
  dateRange: DateRange | undefined;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a Date as a local YYYY-MM-DD (matches how the calendar produces dates). */
function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a YYYY-MM-DD string into a local Date, or undefined if malformed. */
function fromKey(s: string): Date | undefined {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}

export function buildFilterQuery(f: DashboardFilters): string {
  const params = new URLSearchParams();
  if (f.neighbourhood && f.neighbourhood !== "all") params.set("barri", f.neighbourhood);
  if (f.deviceType && f.deviceType !== "all") params.set("dispositiu", f.deviceType);
  if (f.cameras.length) params.set("cameres", f.cameras.join(","));
  if (f.vehicles.length) params.set("vehicles", f.vehicles.join(","));
  if (f.dateRange?.from) params.set("desde", toKey(f.dateRange.from));
  if (f.dateRange?.to) params.set("fins", toKey(f.dateRange.to));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function parseFilterQuery(search: string): Partial<DashboardFilters> {
  const params = new URLSearchParams(search);
  const out: Partial<DashboardFilters> = {};

  const barri = params.get("barri");
  if (barri) out.neighbourhood = barri;

  const dispositiu = params.get("dispositiu");
  if (dispositiu) out.deviceType = dispositiu;

  const cameres = params.get("cameres");
  if (cameres) out.cameras = cameres.split(",").filter(Boolean);

  const vehicles = params.get("vehicles");
  if (vehicles) out.vehicles = vehicles.split(",").filter(Boolean);

  const from = params.get("desde");
  const to = params.get("fins");
  if (from || to) {
    out.dateRange = { from: from ? fromKey(from) : undefined, to: to ? fromKey(to) : undefined };
  }

  return out;
}
