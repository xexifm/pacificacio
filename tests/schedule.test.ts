import { describe, it, expect } from "vitest";
import { hoursCovered, isUpDay, dayKeyForDate, DEFAULT_SCHEDULES } from "@/lib/schedule";

describe("schedule helpers", () => {
  it("computes covered hours (with 23:59 = end of day)", () => {
    expect(hoursCovered({ from: "00:00", to: "23:59" })).toBeCloseTo(24, 1);
    expect(hoursCovered({ from: "20:00", to: "23:59" })).toBeCloseTo(4, 1);
    expect(hoursCovered(null)).toBe(0);
  });

  it("maps dates to the right schedule key (holiday wins)", () => {
    expect(dayKeyForDate("2024-06-01")).toBe("sat"); // Saturday
    expect(dayKeyForDate("2024-06-02")).toBe("sun"); // Sunday
    expect(dayKeyForDate("2024-06-03")).toBe("mon"); // Monday
    expect(dayKeyForDate("2024-09-11")).toBe("holiday"); // Diada (Wed)
  });

  it("generic schedule: Sat/Sun/holiday are up-days, Friday is not", () => {
    const g = DEFAULT_SCHEDULES.generic.hours;
    expect(isUpDay(g, "2024-06-01")).toBe(true); // Saturday
    expect(isUpDay(g, "2024-06-02")).toBe(true); // Sunday
    expect(isUpDay(g, "2024-06-07")).toBe(false); // Friday (only 20:00–24:00)
    expect(isUpDay(g, "2024-06-03")).toBe(false); // Monday
  });

  it("'diumenges i festius' schedule: Sunday up, Saturday not", () => {
    const d = DEFAULT_SCHEDULES.diumenges_festius.hours;
    expect(isUpDay(d, "2024-06-02")).toBe(true); // Sunday
    expect(isUpDay(d, "2024-06-01")).toBe(false); // Saturday
    expect(isUpDay(d, "2024-09-11")).toBe(true); // holiday
  });
});
