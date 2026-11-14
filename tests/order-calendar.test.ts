import { describe, expect, it } from "vitest";
import {
  calendarDays,
  calendarPeriod,
  moveCalendar,
} from "../src/lib/order-calendar";

describe("reservation calendar", () => {
  it("covers leap February and pads full Sunday–Saturday weeks", () => {
    expect(calendarPeriod("2028-02-15", "month")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
    const days = calendarDays("2028-02-15", "month");
    expect(days[0]).toBe("2028-01-30");
    expect(days.at(-1)).toBe("2028-03-04");
    expect(days).toContain("2028-02-29");
    expect(days.length % 7).toBe(0);
  });
  it("includes every date in six-row months", () => {
    const days = calendarDays("2026-05-31", "month");
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-04-26");
    expect(days.at(-1)).toBe("2026-06-06");
    expect(new Set(days).size).toBe(42);
  });
  it("keeps weeks contiguous across year boundaries", () => {
    expect(calendarPeriod("2027-01-01", "week")).toEqual({
      start: "2026-12-27",
      end: "2027-01-02",
    });
    expect(calendarDays("2027-01-01", "week")).toHaveLength(7);
    expect(moveCalendar("2027-01-01", "week", -1)).toBe("2026-12-25");
    expect(moveCalendar("2026-12-28", "week", 1)).toBe("2027-01-04");
  });
  it("clamps month-end navigation without skipping months", () => {
    expect(moveCalendar("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(moveCalendar("2028-03-31", "month", -1)).toBe("2028-02-29");
    expect(moveCalendar("2026-12-31", "month", 1)).toBe("2027-01-31");
    expect(moveCalendar("2027-01-31", "month", -1)).toBe("2026-12-31");
  });
});
