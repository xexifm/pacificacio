import { describe, it, expect } from "vitest";
import { computeImpact } from "@/lib/impact";
import { getDayType } from "@/lib/holidays";
import type { SchedulesMap } from "@/lib/schedule";
import type { TrafficData, CameraSettings } from "@/lib/types";

const SCHED: SchedulesMap = {
  generic: {
    label: "generic",
    hours: {
      fri: { from: "20:00", to: "23:59" },
      sat: { from: "00:00", to: "23:59" },
      sun: { from: "00:00", to: "23:59" },
      holiday: { from: "00:00", to: "23:59" },
    },
  },
  diumenges_festius: {
    label: "diumenges",
    hours: { sun: { from: "00:00", to: "23:59" }, holiday: { from: "00:00", to: "23:59" } },
  },
};

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
  return { id: `${camera}|${date}|${tipusVehicle}`, camera, datahora: `${date} 00:00`, tipusVehicle, valor, dateTime: `${date}T00:00:00.000Z`, neighbourhood: null };
}
function cam(cameraId: string, over: Partial<CameraSettings> = {}): CameraSettings {
  return { cameraId, displayName: null, neighbourhood: "Pedró", cameraType: "Pilona", reliable: true, scheduleId: "generic", ...over };
}

const DATES = { Pedró: "2025-04-01", Gavarra: null as string | null };

describe("computeImpact (schedule-aware, device split)", () => {
  it("1. detects a clear reduction on a pilona's up-days (100 -> 50 => -50%)", () => {
    const before = genDates("2024-06-01", "holiday", 12);
    const after = genDates("2025-04-02", "holiday", 12);
    const rows = [
      ...before.map((d) => row("CT10", d, "Cotxe", 100)),
      ...after.map((d) => row("CT10", d, "Cotxe", 50)),
    ];
    const res = computeImpact(rows, [cam("CT10")], SCHED, DATES);
    expect(res.byCamera.find((c) => c.camera === "CT10")!.festiu!.deltaPct).toBeCloseTo(-50, 5);
    const pedro = res.byNeighbourhood.find((n) => n.neighbourhood === "Pedró")!;
    expect(pedro.pilona.deltaPct).toBeCloseTo(-50, 5);
    expect(pedro.pilona.camerasCount).toBe(1);
  });

  it("2. marks insufficient days on one side as not-qualifying", () => {
    const before = genDates("2024-06-01", "holiday", 12);
    const after = genDates("2025-04-02", "holiday", 2);
    const rows = [
      ...before.map((d) => row("CT10", d, "Cotxe", 100)),
      ...after.map((d) => row("CT10", d, "Cotxe", 50)),
    ];
    const res = computeImpact(rows, [cam("CT10")], SCHED, DATES);
    expect(res.byCamera.find((c) => c.camera === "CT10")!.festiu).toBeNull();
    expect(res.byNeighbourhood[0].camerasExcluded).toContainEqual({ camera: "CT10", reason: "insufficient-data" });
  });

  it("3. splits pilona vs càmera and excludes unreliable from the aggregate", () => {
    const before = genDates("2024-06-01", "holiday", 12);
    const after = genDates("2025-04-02", "holiday", 12);
    const mk = (id: string, b: number, a: number) => [
      ...before.map((d) => row(id, d, "Cotxe", b)),
      ...after.map((d) => row(id, d, "Cotxe", a)),
    ];
    const rows = [...mk("CT10", 100, 50), ...mk("CT14", 80, 76), ...mk("CT13", 200, 100)];
    const cameras = [
      cam("CT10", { cameraType: "Pilona", reliable: true }),
      cam("CT14", { cameraType: "Càmera", reliable: true }),
      cam("CT13", { cameraType: "Pilona", reliable: false }),
    ];
    const res = computeImpact(rows, cameras, SCHED, DATES, { reliableOnly: true });
    const pedro = res.byNeighbourhood.find((n) => n.neighbourhood === "Pedró")!;

    expect(pedro.pilona.camerasCount).toBe(1); // CT10 only (CT13 unreliable)
    expect(pedro.pilona.deltaPct).toBeCloseTo(-50, 5);
    expect(pedro.camera.camerasCount).toBe(1); // CT14
    expect(pedro.camera.deltaPct).toBeCloseTo(-5, 5); // 80 -> 76
    expect(pedro.camerasExcluded).toContainEqual({ camera: "CT13", reason: "unreliable" });
    // Unreliable pilona still analysed per-camera:
    expect(res.byCamera.find((c) => c.camera === "CT13")!.festiu!.deltaPct).toBeCloseTo(-50, 5);
  });

  it("4. returns null deltaPct when the before average is 0", () => {
    const before = genDates("2024-06-01", "holiday", 12);
    const after = genDates("2025-04-02", "holiday", 12);
    const rows = [
      ...before.map((d) => row("CT10", d, "Cotxe", 0)),
      ...after.map((d) => row("CT10", d, "Cotxe", 50)),
    ];
    const res = computeImpact(rows, [cam("CT10")], SCHED, DATES);
    expect(res.byCamera.find((c) => c.camera === "CT10")!.festiu!.deltaPct).toBeNull();
  });

  it("5. counts multiple vehicle rows on the same day as one day", () => {
    const before = genDates("2024-06-01", "holiday", 12);
    const after = genDates("2025-04-02", "holiday", 12);
    const rows = [
      ...before.flatMap((d) => [row("CT10", d, "Cotxe", 60), row("CT10", d, "Moto", 40)]),
      ...after.flatMap((d) => [row("CT10", d, "Cotxe", 30), row("CT10", d, "Moto", 20)]),
    ];
    const f = computeImpact(rows, [cam("CT10")], SCHED, DATES).byCamera.find((c) => c.camera === "CT10")!.festiu!;
    expect(f.before.days).toBe(12);
    expect(f.before.avgPerDay).toBeCloseTo(100, 5);
    expect(f.deltaPct).toBeCloseTo(-50, 5);
  });

  it("6. produces no neighbourhood impact for a barri without an activation date", () => {
    const before = genDates("2024-06-01", "holiday", 12);
    const after = genDates("2025-04-02", "holiday", 12);
    const rows = [
      ...before.map((d) => row("CT16", d, "Cotxe", 100)),
      ...after.map((d) => row("CT16", d, "Cotxe", 50)),
    ];
    const res = computeImpact(rows, [cam("CT16", { neighbourhood: "Gavarra" })], SCHED, { Pedró: "2025-04-01", Gavarra: null });
    expect(res.byNeighbourhood.find((n) => n.neighbourhood === "Gavarra")).toBeUndefined();
  });

  it("7. flags a seasonality warning when before/after months barely overlap", () => {
    const before = genDates("2024-06-01", "holiday", 8).filter((d) => d.startsWith("2024-06"));
    const after = genDates("2025-05-01", "holiday", 8).filter((d) => d.startsWith("2025-05"));
    const rows = [
      ...before.map((d) => row("CT10", d, "Cotxe", 100)),
      ...after.map((d) => row("CT10", d, "Cotxe", 50)),
    ];
    const res = computeImpact(rows, [cam("CT10")], SCHED, DATES, { minDaysPerSide: 4 });
    expect(res.byNeighbourhood[0].seasonalityWarning).toBe(true);
  });

  it("8. a 'diumenges i festius' pilona ignores Saturdays (schedule-aware up-days)", () => {
    // Saturdays are holiday-type but NOT up-days for this schedule → excluded.
    const saturdays = ["2024-06-01", "2024-06-08", "2024-06-15"]; // all Saturdays
    const rows = saturdays.map((d) => row("CT11", d, "Cotxe", 100));
    const res = computeImpact(rows, [cam("CT11", { scheduleId: "diumenges_festius" })], SCHED, DATES, { minDaysPerSide: 1 });
    // No up-days recorded → festiu bucket empty → not qualifying.
    expect(res.byCamera.find((c) => c.camera === "CT11")!.festiu).toBeNull();
  });
});
