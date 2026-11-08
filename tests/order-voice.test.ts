import { describe, expect, it } from "vitest";
import {
  applyVoiceOrder,
  voiceOrderInstructions,
  type VoiceMenu,
  type VoiceOrderDraft,
} from "../src/lib/order-voice";

export const voiceProducts: VoiceMenu[] = [
  { id: "white", name: "백설기", boxSize: 20, active: true },
  { id: "honey", name: "꿀떡", boxSize: 30, active: true },
  { id: "old", name: "미사용 떡", boxSize: 10, active: false },
];
export const emptyVoiceDraft: VoiceOrderDraft = {
  customer: "",
  phone: "",
  date: "2026-11-12",
  time: "10:00",
  fulfillment: null,
  deliveryAddress: "",
  kind: "single",
  boxes: 0,
  lines: [],
  sticker: "",
};

describe("음성 주문 초안 검증", () => {
  it("개와 박스의 수량을 구분하고 메뉴판의 박스 환산을 사용한다", () => {
    const before = structuredClone(emptyVoiceDraft);
    const { draft } = applyVoiceOrder(
      {
        customer: "테스트고객",
        fulfillment: "pickup",
        lines: [
          { productId: "white", quantity: 2, unit: "box" },
          { productId: "honey", quantity: 5, unit: "piece" },
        ],
      },
      before,
      voiceProducts,
    );
    expect(draft.lines.map((l) => l.quantity * l.piecesPerUnit)).toEqual([
      40, 5,
    ]);
    expect(draft.customer).toBe("테스트고객");
    expect(before).toEqual(emptyVoiceDraft);
  });
  it("선물세트 전체 상자 수와 상자당 구성을 중복 곱하지 않는다", () => {
    const { draft } = applyVoiceOrder(
      {
        kind: "gift",
        boxes: 3,
        lines: [
          { productId: "white", quantity: 2, unit: "piece" },
          { productId: "honey", quantity: 1, unit: "piece" },
        ],
      },
      emptyVoiceDraft,
      voiceProducts,
    );
    expect(draft.kind).toBe("gift");
    expect(draft.lines.map((l) => l.quantity)).toEqual([2, 1]);
    expect(
      draft.lines.reduce((n, l) => n + l.quantity * l.piecesPerUnit, 0) *
        draft.boxes,
    ).toBe(9);
  });
  it("말하지 않은 필드를 유지하고 픽업·퀵·배달과 주소를 반영한다", () => {
    for (const fulfillment of ["pickup", "quick", "delivery"] as const) {
      const { draft, notes } = applyVoiceOrder(
        { fulfillment, notes: ["수령 시간을 확인해 주세요."] },
        emptyVoiceDraft,
        voiceProducts,
      );
      expect(draft).toEqual({ ...emptyVoiceDraft, fulfillment });
      expect(draft.deliveryAddress).toBe("");
      expect(notes).toEqual(["수령 시간을 확인해 주세요."]);
    }
    expect(
      applyVoiceOrder(
        { fulfillment: "delivery", deliveryAddress: "테스트로 1길 2" },
        emptyVoiceDraft,
        voiceProducts,
      ).draft.deliveryAddress,
    ).toBe("테스트로 1길 2");
  });
  it("기존 주문의 박스 환산을 보존하며 수량 정정은 중복 추가하지 않는다", () => {
    const current = {
      ...emptyVoiceDraft,
      lines: [
        {
          productId: "white",
          quantity: 2,
          unit: "box" as const,
          piecesPerUnit: 12,
        },
      ],
    };
    const { draft } = applyVoiceOrder(
      { lines: [{ productId: "white", quantity: 3, unit: "box" }] },
      current,
      voiceProducts,
    );
    expect(draft.lines).toEqual([
      { productId: "white", quantity: 3, unit: "box", piecesPerUnit: 12 },
    ]);
  });
  it("없는 메뉴·새 미사용 메뉴·잘못된 날짜와 수량·저장 명령을 거절한다", () => {
    for (const patch of [
      { lines: [{ productId: "unknown", quantity: 2, unit: "piece" }] },
      { lines: [{ productId: "old", quantity: 2, unit: "piece" }] },
      { lines: [{ productId: "white", quantity: -1, unit: "piece" }] },
      { lines: [{ productId: "white", quantity: 1.5, unit: "piece" }] },
      {
        lines: [
          {
            productId: "white",
            quantity: 1,
            unit: "piece",
            piecesPerUnit: 999,
          },
        ],
      },
      { date: "2026-02-30" },
      { time: "25:00" },
      { status: "picked" },
      { type: "saveOrder" },
    ])
      expect(() =>
        applyVoiceOrder(patch, emptyVoiceDraft, voiceProducts),
      ).toThrow();
  });
  it("불완전한 전화번호를 만들지 않고 올바른 전체 번호를 표시 형식으로 변환한다", () => {
    expect(
      applyVoiceOrder(
        { phone: "010 0000 0001" },
        emptyVoiceDraft,
        voiceProducts,
      ).draft.phone,
    ).toBe("010-0000-0001");
    for (const phone of ["01012", "전화번호 모르겠어요", "010123456789999"])
      expect(() =>
        applyVoiceOrder({ phone }, emptyVoiceDraft, voiceProducts),
      ).toThrow("연락처");
  });
  it("상대 날짜의 오늘 기준과 미지정 값의 보존을 지시하고 새 미사용 메뉴를 노출하지 않는다", () => {
    const prompt = voiceOrderInstructions(
      emptyVoiceDraft,
      voiceProducts,
      "2026-11-08",
    );
    expect(prompt).toContain("한국 시간 2026-11-08");
    expect(prompt).toContain("기존 수령일을 유지");
    expect(prompt).toContain("백설기");
    expect(prompt).not.toContain("미사용 떡");
  });
});
