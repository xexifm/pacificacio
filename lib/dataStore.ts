// Client-side data layer — the single source of truth for the static app.
//
// It reads the committed JSON files under public/data (traffic + settings), and
// derives everything the dashboard needs (traffic rows, camera settings, bollard
// settings, per-day coverage). There is no server and no database.
//
// This module is deliberately the ONLY place that knows where data comes from, so
// when the real data source is defined later, only the loaders below change.

import { z } from "zod";
import { asset } from "@/lib/paths";
import { computeDetailedCoverage } from "@/lib/analytics";
import { DEFAULT_SCHEDULES, type SchedulesMap } from "@/lib/schedule";
import type {
  TrafficData,
  CameraSettings,
  BollardSettings,
  DataCoverageDetail,
} from "@/lib/types";

// ── Runtime validation of the committed JSON ────────────────────────────────
// Catches a malformed/corrupt data file early with a clear message instead of
// letting undefined values propagate into the charts.

const rawTrafficSchema = z.object({
  meta: z.object({
    generatedAt: z.string(),
    granularity: z.string(),
    rowCount: z.number(),
    dateFrom: z.string().nullable(),
    dateTo: z.string().nullable(),
    cameras: z.array(z.string()),
  }),
  columns: z.array(z.string()),
  rows: z.array(z.tuple([z.string(), z.string(), z.string(), z.number()])),
});

const timeRangeSchema = z.object({ from: z.string(), to: z.string() });
const namedScheduleSchema = z.object({
  label: z.string(),
  hours: z.record(z.string(), timeRangeSchema.nullable()),
});

const rawSettingsSchema = z.object({
  cameras: z.array(
    z.object({
      cameraId: z.string(),
      displayName: z.string().nullable(),
      neighbourhood: z.string(),
      cameraType: z.string(),
      // Older settings files may omit these; sensible defaults keep them valid.
      reliable: z.boolean().default(true),
      scheduleId: z.string().default("generic"),
    }),
  ),
  bollard: z.object({
    bollardStartDatePedro: z.string().nullable(),
    bollardStartDateGavarra: z.string().nullable(),
  }),
  schedules: z.record(z.string(), namedScheduleSchema).optional(),
});

type RawSettings = z.infer<typeof rawSettingsSchema>;

// Memoised fetches so multiple useQuery hooks share one network round-trip.
let trafficPromise: Promise<TrafficData[]> | null = null;
let settingsPromise: Promise<RawSettings> | null = null;

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(asset(path), { cache: "force-cache" });
  if (!res.ok) throw new Error(`No s'ha pogut carregar ${path}: ${res.status}`);
  return res.json();
}

// Locally-saved settings override (from the Configuració "Guardar canvis" button).
// Lets the admin apply changes on their device without a server; the committed
// settings.json remains the public default until they download + commit it.
const SETTINGS_OVERRIDE_KEY = "pacificacio-settings-override";

function readOverride(): unknown | null {
  if (typeof window === "undefined") return null;
  try {
    const s = window.localStorage.getItem(SETTINGS_OVERRIDE_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function saveSettingsOverride(raw: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_OVERRIDE_KEY, JSON.stringify(raw));
  settingsPromise = null; // force re-read on next query
}

export function clearSettingsOverride(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SETTINGS_OVERRIDE_KEY);
  settingsPromise = null;
}

export function hasSettingsOverride(): boolean {
  return readOverride() !== null;
}

async function loadSettings(): Promise<RawSettings> {
  if (!settingsPromise) {
    settingsPromise = (async () => {
      const override = readOverride();
      const json = override ?? (await fetchJson("/data/settings.json"));
      const parsed = rawSettingsSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error(`settings.json invàlid: ${parsed.error.message}`);
      }
      return parsed.data;
    })();
  }
  return settingsPromise;
}

async function loadTraffic(): Promise<TrafficData[]> {
  if (!trafficPromise) {
    trafficPromise = (async () => {
      const [json, settings] = await Promise.all([
        fetchJson("/data/traffic-daily.json"),
        loadSettings(),
      ]);
      const parsed = rawTrafficSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error(`traffic-daily.json invàlid: ${parsed.error.message}`);
      }

      const neighbourhoodByCamera: Record<string, string> = {};
      settings.cameras.forEach((c) => {
        neighbourhoodByCamera[c.cameraId] = c.neighbourhood;
      });

      return parsed.data.rows.map(([camera, date, tipusVehicle, valor]) => ({
        id: `${camera}|${date}|${tipusVehicle}`,
        camera,
        datahora: `${date} 00:00`,
        tipusVehicle,
        valor,
        dateTime: `${date}T00:00:00.000Z`,
        neighbourhood: neighbourhoodByCamera[camera] ?? null,
      }));
    })();
  }
  return trafficPromise;
}

export async function getTrafficData(): Promise<TrafficData[]> {
  return loadTraffic();
}

export async function getCameraSettings(): Promise<CameraSettings[]> {
  const settings = await loadSettings();
  return settings.cameras;
}

export async function getBollardSettings(): Promise<BollardSettings> {
  const settings = await loadSettings();
  return settings.bollard;
}

export async function getSchedules(): Promise<SchedulesMap> {
  const settings = await loadSettings();
  // Fall back to the built-in defaults when the file omits schedules.
  return (settings.schedules as SchedulesMap) ?? DEFAULT_SCHEDULES;
}

// Equivalent of the former storage.getDetailedDataCoverage(): one entry per
// (camera, date) with the per-vehicle-type breakdown and daily total.
export async function getDetailedDataCoverage(): Promise<DataCoverageDetail[]> {
  const rows = await loadTraffic();
  return computeDetailedCoverage(rows);
}
