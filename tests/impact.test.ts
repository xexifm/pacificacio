import { describe, it, expect } from "vitest";
import { computeImpact } from "@/lib/impact";
import { getDayType } from "@/lib/holidays";
import type { TrafficData, CameraSettings } from "@/lib/types";

// Generate `n` consecutive dates of a given day type starting from `startISO`
// (uses the real holiday logic, so results are correct regardless of holidays).
function genDates(startISO: string, dayType: "working" | "holiday", n: number): string[] {
  const out: string[] = [];
  let t = new Date(`${startISO}T12:00:00.000Z`).getTime();
  while (out.length < n) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (getDayType(new Date(`${iso}T12:00:00.000Z`)) === dayType) out.push(iso);
    t += 86_400_000;
  }
  return out;
}

function row(camera: string, date: string, tipusVehicle: string, valor: number): TrafficData {
  return {
    id: `${camera}|${date}|${tipusVehicle}`,
    camera,
    datahora: `${date} 00:00`,
    tipusVehicle,
    valor,
    dateTime: `${date}T00:00:00.000Z`,
    neighbourhood: null,
  };
}

function cam(cameraId: string, over: Partial<CameraSettings> = {}): CameraSettings {
  return {
    cameraId,
    displayName: null,
    neighbourhood: "Pedró",
    cameraType: "Pilona",
    reliable: true,
    ...over,
  };
}

const DATES = { Pedró: "2025-04-01", Gavarra: null as string | null };

describe("computeImpact", () => {
  it("1. detects a clear reduction (100 -> 50 v/d on holidays => -50%)", () => {
    const before = genDates("2024-06-01", "holiday", 12);
    const after = genDates("2025-04-02", "holiday", 12);
    const rows = [
      ...before.map((d) => row("CT10", d, "Cotxe", 100)),
      ...after.map((d) => row("CT10", d, "Cotxe", 50)),
    ];
    const res = computeImpact(rows, [cam("CT10")], DATES);

    const ct10 = res.byCamera.find((c) => c.camera === "CT10")!;
    expect(ct10.holiday).not.toBeNull();
    expect(ct10.holiday!.deltaPct).toBeCloseTo(-50, 5);

    const pedro = res.byNeighbourhood.find((n) => n.neighbourhood === "Pedró")!;
    expect(pedro.holiday.deltaPct).toBeCloseTo(-50, 5);
    expect(pedro.camerasIncluded).toContain("CT10");
  });

  it("2. marks a camera with insufficient days on one side as not-qualifying", () => {
    const before = genDates("2024-06-01", "holiday", 12);
    const after = genDates("2025-04-02", "holiday", 2); // too few
    const rows = [
      ...before.map((d) => row("CT10", d, "Cotxe", 100)),
      ...after.map((d) => row("CT10", d, "Cotxe", 50)),
    ];
    const res = computeImpact(rows, [cam("CT10")], DATES);

    expect(res.byCamera.find((c) => c.camera === "CT10")!.holiday).toBeNull();
    const pedro = res.byNeighbourhood.find((n) => n.neighbourhood === "Pedró")!;
    expect(pedro.camerasExcluded).toContainEqual({ camera: "CT10", reason: "insufficient-data" });
  });

  it("3. excludes unreliable cameras from the barri aggregate but keeps them per-camera", () => {
    const before = genDates("2024-06-01", "holiday", 12);
    const after = genDates("2025-04-02", "holiday", 12);
    const mk = (id: string, b: number, a: number) => [
      ...before.map((d) => row(id, d, "Cotxe", b)),
      ...after.map((d) => row(id, d, "Cotxe", a)),
    ];
    const rows = [...mk("CT10", 100, 50), ...mk("CT13", 200, 100)];
    const cameras = [cam("CT10", { reliable: true }), cam("CT13", { reliable: false })];

    const res = computeImpact(rows, cameras, DATES, { reliableOnly: true });
    const pedro = res.byNeighbourhood.find((n) => n.neighbourhood === "Pedró")!;

    expect(pedro.camerasIncluded).toEqual(["CT10"]);
    expect(pedro.camerasExcluded).toContainEqual({ camera: "CT13", reason: "unreliable" });
    // CT13 still analysed per-camera:
    expect(res.byCamera.find((c) => c.camera === "CT13")!.holiday!.deltaPct).toBeCloseTo(-50, 5);

    // With reliableOnly false, CT13 joins the aggregate.
    const res2 = computeImpact(rows, cameras, DATES, { reliableOnly: false });
    expect(res2.byNeighbourhood[0].camerasIncluded).toEqual(["CT10", "CT13"]);
  });

  it("4. returns null deltaPct when the before average is 0", () => {
    const before = genDates("2024-06-01", "holiday", 12);
    const after = genDates("2025-04-02", "holiday", 12);
    const rows = [
      ...before.map((d) => row("CT10", d, "Cotxe", 0)),
      ...after.map((d) => row("CT10", d, "Cotxe", 50)),
    ];
    const res = computeImpact(rows, [cam("CT10")], DATES);
    expect(res.byCamera.find((c) => c.camera === "CT10")!.holiday!.deltaPct).toBeNull();
  });

  it("5. counts multiple vehicle rows on the same day as one day", () => {
    const before = genDates("2024-06-01", "holiday", 12);
    const after = genDates("2025-04-02", "holiday", 12);
    const rows = [
      ...before.flatMap((d) => [row("CT10", d, "Cotxe", 60), row("CT10", d, "Moto", 40)]),
      ...after.flatMap((d) => [row("CT10", d, "Cotxe", 30), row("CT10", d, "Moto", 20)]),
    ];
    const res = computeImpact(rows, [cam("CT10")], DATES);
    const h = res.byCamera.find((c) => c.camera === "CT10")!.holiday!;
    expect(h.before.days).toBe(12); // not 24
    expect(h.before.avgPerDay).toBeCloseTo(100, 5);
    expect(h.after.avgPerDay).toBeCloseTo(50, 5);
    expect(h.deltaPct).toBeCloseTo(-50, 5);
  });

  it("6. produces no neighbourhood impact for a barri without an activation date", () => {
    const before = genDates("2024-06-01", "holiday", 12);
    const after = genDates("2025-04-02", "holiday", 12);
    const rows = [
      ...before.map((d) => row("CT16", d, "Cotxe", 100)),
      ...after.map((d) => row("CT16", d, "Cotxe", 50)),
    ];
    const cameras = [cam("CT16", { neighbourhood: "Gavarra" })];
    const res = computeImpact(rows, cameras, { Pedró: "2025-04-01", Gavarra: null });
    expect(res.byNeighbourhood.find((n) => n.neighbourhood === "Gavarra")).toBeUndefined();
  });

  it("7. flags a seasonality warning when before/after months barely overlap", () => {
    // before entirely in one month, after entirely in a different month.
    const before = genDates("2024-06-01", "holiday", 8).filter((d) => d.startsWith("2024-06"));
    const after = genDates("2025-05-01", "holiday", 8).filter((d) => d.startsWith("2025-05"));
    const rows = [
      ...before.map((d) => row("CT10", d, "Cotxe", 100)),
      ...after.map((d) => row("CT10", d, "Cotxe", 50)),
    ];
    const res = computeImpact(rows, [cam("CT10")], DATES, { minDaysPerSide: 4 });
    expect(res.byNeighbourhood.find((n) => n.neighbourhood === "Pedró")!.seasonalityWarning).toBe(true);
  });
});
