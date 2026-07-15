import { describe, it, expect } from "vitest";
import { isHoliday, isWorkingDay, getDayType } from "@/lib/holidays";

// Helper: build a UTC-anchored date at noon for a given YYYY-MM-DD.
const d = (s: string) => new Date(`${s}T12:00:00.000Z`);

describe("holidays", () => {
  it("recognises an official Catalan holiday", () => {
    expect(isHoliday(d("2024-09-11"))).toBe(true); // Diada
    expect(isHoliday(d("2025-01-06"))).toBe(true); // Reis
  });

  it("returns false for a normal weekday", () => {
    expect(isHoliday(d("2024-02-15"))).toBe(false); // Thursday
  });

  it("classifies a plain weekday as a working day", () => {
    expect(isWorkingDay(d("2024-02-15"))).toBe(true);
    expect(getDayType(d("2024-02-15"))).toBe("working");
  });

  it("treats weekends as non-working", () => {
    expect(isWorkingDay(d("2024-02-17"))).toBe(false); // Saturday
    expect(isWorkingDay(d("2024-02-18"))).toBe(false); // Sunday
    expect(getDayType(d("2024-02-17"))).toBe("holiday");
  });

  it("treats official holidays as non-working even on a weekday", () => {
    expect(isWorkingDay(d("2024-09-11"))).toBe(false); // Wednesday holiday
    expect(getDayType(d("2024-09-11"))).toBe("holiday");
  });
});
