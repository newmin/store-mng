import { describe, expect, it } from "vitest";
import {
  displayTime,
  hour24,
  formatPhone,
  validPhone,
} from "../src/lib/order-input";

describe("pickup time formats", () => {
  it("preserves midnight, noon and existing non-ten-minute reservations", () => {
    expect(displayTime("00:35", "12")).toBe("오전 12:35");
    expect(displayTime("12:00", "12")).toBe("오후 12:00");
    expect(displayTime("23:50", "12")).toBe("오후 11:50");
    expect(displayTime("23:50", "24")).toBe("23:50");
    expect(hour24("12", "오전")).toBe("00");
    expect(hour24("12", "오후")).toBe("12");
    expect(hour24("01", "오후")).toBe("13");
  });
});
describe("Korean contact input", () => {
  it("formats mobile, area, internet, virtual and service numbers", () => {
    for (const [raw, formatted] of [
      ["01012345678", "010-1234-5678"],
      ["010-123-4567", "010-123-4567"],
      ["0212345678", "02-1234-5678"],
      ["0311234567", "031-123-4567"],
      ["07012345678", "070-1234-5678"],
      ["050512345678", "0505-1234-5678"],
      ["15881234", "1588-1234"],
    ]) {
      expect(formatPhone(raw)).toBe(formatted);
      expect(validPhone(formatted)).toBe(true);
    }
  });
  it("allows no contact, rejects incomplete or non-phone text and limits pasted digits", () => {
    expect(validPhone("")).toBe(true);
    for (const value of ["010", "010-12", "hello", "010-1234-56789000"])
      expect(validPhone(value)).toBe(false);
    expect(formatPhone("01012345678999999999")).toBe("010-1234-5678");
    expect(formatPhone("010 1234 5678")).toBe("010-1234-5678");
  });
});
