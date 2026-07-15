// Plain TypeScript types shared across the client app. These replace the
// Drizzle-derived types from the previous server-backed schema — the static app
// has no database, so nothing here depends on drizzle-orm.

export interface TrafficData {
  id: string;
  camera: string;
  /** "YYYY-MM-DD HH:MM" — for the static daily dataset the time is always 00:00. */
  datahora: string;
  tipusVehicle: string;
  valor: number;
  /** Kept for shape compatibility; components re-derive the date from `datahora`. */
  dateTime: string | null;
  neighbourhood: string | null;
}

export interface CameraSettings {
  cameraId: string;
  displayName: string | null;
  neighbourhood: string;
  cameraType: string;
  /** Whether this device's counts are trustworthy enough for headline figures. */
  reliable: boolean;
}

export interface BollardSettings {
  bollardStartDatePedro: string | null;
  bollardStartDateGavarra: string | null;
}

export interface DataCoverageDetail {
  camera: string;
  date: string;
  totalVehicles: number;
  vehicleBreakdown: Record<string, number>;
}
