import { describe, it, expect } from "vitest";
import {
  getDayCategory,
  getUTCDateKey,
  computeDetailedCoverage,
} from "@/lib/analytics";
import type { TrafficData } from "@/lib/types";

const d = (s: string) => new Date(`${s}T12:00:00.000Z`);
const NO_BOLLARD = { bollardStartDatePedro: null, bollardStartDateGavarra: null };

describe("getUTCDateKey", () => {
  it("formats a date as YYYY-MM-DD in UTC", () => {
    expect(getUTCDateKey(d("2024-02-15"))).toBe("2024-02-15");
  });
});

describe("getDayCategory", () => {
  it("returns 'working' for a normal weekday regardless of bollards", () => {
    expect(getDayCategory(d("2024-02-15"), "Pedró", NO_BOLLARD)).toBe("working");
  });

  it("returns 'holiday_down' for a weekend when no bollard date is set", () => {
    expect(getDayCategory(d("2024-02-17"), "Pedró", NO_BOLLARD)).toBe("holiday_down");
  });

  it("returns 'holiday_down' before the bollard activation date", () => {
    const settings = { bollardStartDatePedro: "2024-06-01", bollardStartDateGavarra: null };
    expect(getDayCategory(d("2024-02-17"), "Pedró", settings)).toBe("holiday_down");
  });

  it("returns 'holiday_up' on/after the bollard activation date", () => {
    const settings = { bollardStartDatePedro: "2024-06-01", bollardStartDateGavarra: null };
    expect(getDayCategory(d("2024-06-08"), "Pedró", settings)).toBe("holiday_up"); // Saturday
    expect(getDayCategory(d("2024-06-01"), "Pedró", settings)).toBe("holiday_up"); // boundary, Saturday
  });

  it("applies the correct neighbourhood's bollard date", () => {
    const settings = { bollardStartDatePedro: "2024-06-01", bollardStartDateGavarra: null };
    // Gavarra has no date → stays down even after Pedró's date.
    expect(getDayCategory(d("2024-06-08"), "Gavarra", settings)).toBe("holiday_down");
  });
});

describe("computeDetailedCoverage", () => {
  const row = (
    camera: string,
    date: string,
    tipusVehicle: string,
    valor: number,
  ): TrafficData => ({
    id: `${camera}|${date}|${tipusVehicle}`,
    camera,
    datahora: `${date} 00:00`,
    tipusVehicle,
    valor,
    dateTime: `${date}T00:00:00.000Z`,
    neighbourhood: null,
  });

  it("aggregates per (camera, date) with a vehicle breakdown", () => {
    const rows = [
      row("CT10", "2024-02-15", "Cotxe", 30),
      row("CT10", "2024-02-15", "Moto", 5),
      row("CT10", "2024-02-16", "Cotxe", 10),
      row("CT16", "2024-02-15", "Cotxe", 8),
    ];
    const result = computeDetailedCoverage(rows);

    const ct10day1 = result.find((r) => r.camera === "CT10" && r.date === "2024-02-15")!;
    expect(ct10day1.totalVehicles).toBe(35);
    expect(ct10day1.vehicleBreakdown).toEqual({ Cotxe: 30, Moto: 5 });

    expect(result).toHaveLength(3); // 2 CT10 days + 1 CT16 day
  });
});
