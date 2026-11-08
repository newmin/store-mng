import { describe, expect, it } from "vitest";
import { createVoiceRequestLimit } from "../src/lib/voice-request-limit";

describe("음성 연결 요청 제한", () => {
  it("한 사용자의 반복 요청을 제한하고 1분 후 다시 허용한다", () => {
    let now = 0;
    const allow = createVoiceRequestLimit(() => now);
    for (let i = 0; i < 6; i++) expect(allow("one")).toBe(true);
    expect(allow("one")).toBe(false);
    expect(allow("two")).toBe(true);
    now = 60000;
    expect(allow("one")).toBe(true);
  });
  it("여러 사용자가 요청해도 서버 인스턴스의 분당 총 요청을 제한한다", () => {
    const allow = createVoiceRequestLimit(() => 0);
    for (let i = 0; i < 30; i++) expect(allow(`client-${i}`)).toBe(true);
    expect(allow("another")).toBe(false);
  });
});
