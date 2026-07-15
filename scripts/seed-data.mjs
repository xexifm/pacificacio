// One-shot data seeding script (NOT shipped to the client).
//
// Reads a long-format traffic CSV (Càmera,Datahora,TipusVehicle,Valor), aggregates
// it losslessly to DAILY granularity per (camera, date, vehicleType) — which is all
// the dashboard needs — and writes:
//   public/data/traffic-daily.json   (compact columnar rows)
//   public/data/settings.json        (camera → barri / device / bollard config)
//
// Usage:
//   node scripts/seed-data.mjs [path/to/source.csv]
//
// When the real data source is defined later, re-run this (or replace it) to
// regenerate public/data/traffic-daily.json. The app only ever reads the JSON.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "public/data");

const DEFAULT_CSV =
  "/tmp/claude-0/-home-user-pacificacio/6cd474c3-a7ef-596f-8aa1-e29966f74e02/scratchpad/attached_assets/2026-02-13_dades_Replit_1772560603461.csv";

const VALID_CAMERAS = new Set([
  "CT10", "CT11", "CT12", "CT13", "CT14", "CT15", "CT16",
  "CT17", "CT18", "CT19", "CT20", "CT21", "CT22", "CT23",
]);

const DEFAULT_CAMERA_MAPPINGS = {
  CT10: "Pedró", CT11: "Pedró", CT12: "Pedró", CT13: "Pedró", CT14: "Pedró", CT15: "Pedró",
  CT16: "Gavarra", CT17: "Gavarra", CT18: "Gavarra", CT19: "Gavarra",
  CT20: "Gavarra", CT21: "Gavarra", CT22: "Gavarra", CT23: "Gavarra",
};

const DEFAULT_CAMERA_TYPES = {
  CT10: "Pilona", CT11: "Pilona", CT12: "Pilona", CT13: "Pilona",
  CT14: "Càmera", CT15: "Càmera",
  CT16: "Pilona", CT17: "Pilona", CT18: "Pilona", CT19: "Pilona",
  CT20: "Càmera", CT21: "Càmera", CT22: "Càmera", CT23: "Càmera",
};

// Cameras whose counts are not trustworthy enough for headline figures.
const UNRELIABLE_CAMERAS = new Set([
  "CT13", "CT15", "CT16", "CT17", "CT21", "CT22", "CT23",
]);

// Activation dates of the traffic-calming measures (pilones/càmeres) per barri.
const DEFAULT_BOLLARD = {
  bollardStartDatePedro: "2025-04-25",
  bollardStartDateGavarra: "2025-03-01",
};

const CAMERA_DISPLAY_NAMES = {
  CT10: "c/de Maria Benlliure",
  CT11: "c/Joan Fernández i Comas amb c/Lluís Domènech i Montaner",
  CT12: "c/Feliu i Codina",
  CT13: "c/Ignasi Iglesias",
  CT14: "c/Iscle Soler",
  CT15: "c/Josep Fiter",
  CT16: "c/Doctor Ferran amb c/Cornella Modern",
  CT17: "c/Orioles amb c/Cornella Modern",
  CT18: "c/Miranda",
  CT19: "c/Ermengol Goula (Av. del Parc)",
  CT20: "c/Palma Mallorca (Av. Del Parc)",
  CT21: "Av. Republica Argentina",
  CT22: "c/Mossèn Andreu amb c/dels Catalans",
  CT23: "c/Mossèn Andreu amb c/Jacinto Guerrero",
};

function main() {
  const csvPath = process.argv[2] || DEFAULT_CSV;
  console.log(`[seed] Reading CSV: ${csvPath}`);
  const text = readFileSync(csvPath, "utf-8").replace(/^﻿/, "");
  const lines = text.split("\n");

  // Aggregate: key = camera|date|vehicle -> summed valor
  const agg = new Map();
  let read = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = line.split(",");
    if (cells.length < 4) { skipped++; continue; }

    const camera = cells[0].trim();
    const datahora = cells[1].trim();
    const vehicle = cells[2].trim();
    const valor = parseInt(cells[3].trim(), 10);

    if (!VALID_CAMERAS.has(camera) || !vehicle || Number.isNaN(valor) || valor < 0) {
      skipped++;
      continue;
    }
    // Expect "YYYY-MM-DD HH:MM" — keep just the date part.
    const date = datahora.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }

    const key = `${camera}|${date}|${vehicle}`;
    agg.set(key, (agg.get(key) || 0) + valor);
    read++;
  }

  // Build compact columnar rows, sorted for stable diffs.
  const rows = Array.from(agg.entries())
    .map(([key, valor]) => {
      const [camera, date, vehicle] = key.split("|");
      return [camera, date, vehicle, valor];
    })
    .sort((a, b) => {
      if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
      if (a[1] !== b[1]) return a[1].localeCompare(b[1]);
      return a[2].localeCompare(b[2]);
    });

  const dates = rows.map((r) => r[1]);
  const meta = {
    generatedAt: new Date().toISOString(),
    granularity: "daily",
    rowCount: rows.length,
    dateFrom: dates.length ? dates.reduce((m, d) => (d < m ? d : m), dates[0]) : null,
    dateTo: dates.length ? dates.reduce((m, d) => (d > m ? d : m), dates[0]) : null,
    cameras: Array.from(new Set(rows.map((r) => r[0]))).sort(),
  };

  const trafficOut = {
    meta,
    columns: ["camera", "date", "tipusVehicle", "valor"],
    rows,
  };

  const settingsOut = {
    cameras: Object.keys(DEFAULT_CAMERA_MAPPINGS)
      .sort()
      .map((cameraId) => ({
        cameraId,
        displayName: CAMERA_DISPLAY_NAMES[cameraId] ?? null,
        neighbourhood: DEFAULT_CAMERA_MAPPINGS[cameraId],
        cameraType: DEFAULT_CAMERA_TYPES[cameraId] ?? "Càmera",
        reliable: !UNRELIABLE_CAMERAS.has(cameraId),
      })),
    bollard: { ...DEFAULT_BOLLARD },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, "traffic-daily.json"), JSON.stringify(trafficOut));
  // settings.json is config the admin maintains (dates, reliability). Only write
  // it when absent so re-seeding the traffic data never clobbers those edits.
  const settingsPath = resolve(OUT_DIR, "settings.json");
  if (!existsSync(settingsPath)) {
    writeFileSync(settingsPath, JSON.stringify(settingsOut, null, 2));
    console.log("[seed] Wrote default settings.json");
  } else {
    console.log("[seed] Kept existing settings.json (not overwritten)");
  }

  console.log(`[seed] Rows read: ${read}, skipped: ${skipped}`);
  console.log(`[seed] Daily aggregated rows: ${rows.length}`);
  console.log(`[seed] Date span: ${meta.dateFrom} → ${meta.dateTo}`);
  console.log(`[seed] Wrote public/data/traffic-daily.json`);
}

main();
