// Client-side data layer — the single source of truth for the static app.
//
// It reads the committed JSON files under public/data (traffic + settings), and
// derives everything the dashboard needs (traffic rows, camera settings, bollard
// settings, per-day coverage). There is no server and no database.
//
// This module is deliberately the ONLY place that knows where data comes from, so
// when the real data source is defined later, only the loaders below change.

import { asset } from "@/lib/paths";
import type {
  TrafficData,
  CameraSettings,
  BollardSettings,
  DataCoverageDetail,
} from "@/lib/types";

interface RawTraffic {
  meta: {
    generatedAt: string;
    granularity: string;
    rowCount: number;
    dateFrom: string | null;
    dateTo: string | null;
    cameras: string[];
  };
  columns: string[];
  rows: [string, string, string, number][]; // [camera, date, tipusVehicle, valor]
}

interface RawSettings {
  cameras: CameraSettings[];
  bollard: BollardSettings;
}

// Memoised fetches so multiple useQuery hooks share one network round-trip.
let trafficPromise: Promise<TrafficData[]> | null = null;
let settingsPromise: Promise<RawSettings> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(asset(path), { cache: "force-cache" });
  if (!res.ok) throw new Error(`No s'ha pogut carregar ${path}: ${res.status}`);
  return (await res.json()) as T;
}

async function loadSettings(): Promise<RawSettings> {
  if (!settingsPromise) {
    settingsPromise = fetchJson<RawSettings>("/data/settings.json");
  }
  return settingsPromise;
}

async function loadTraffic(): Promise<TrafficData[]> {
  if (!trafficPromise) {
    trafficPromise = (async () => {
      const [raw, settings] = await Promise.all([
        fetchJson<RawTraffic>("/data/traffic-daily.json"),
        loadSettings(),
      ]);
      const neighbourhoodByCamera: Record<string, string> = {};
      settings.cameras.forEach((c) => {
        neighbourhoodByCamera[c.cameraId] = c.neighbourhood;
      });

      return raw.rows.map(([camera, date, tipusVehicle, valor]) => ({
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

// Equivalent of the former storage.getDetailedDataCoverage(): one entry per
// (camera, date) with the per-vehicle-type breakdown and daily total.
export async function getDetailedDataCoverage(): Promise<DataCoverageDetail[]> {
  const rows = await loadTraffic();
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
