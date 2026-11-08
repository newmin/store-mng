import { describe, expect, it } from "vitest";
import { demoState, applyCommand } from "../src/lib/state";
import { orderSchema } from "../src/lib/types";
import {
  fulfillmentLabel,
  orderMessage,
  smsLink,
} from "../src/lib/order-message";

describe("fulfillment and confirmation messages", () => {
  it("reads legacy channel orders without inventing a fulfillment method", () => {
    const state = demoState("2026-11-12");
    const order = orderSchema.parse(state.orders[0]);
    expect(order.fulfillment).toBeUndefined();
    expect(fulfillmentLabel(order.fulfillment)).toBe("수령 방식 미지정");
  });

  it("saves all fulfillment methods with or without an address and updates one order", () => {
    let state = demoState("2026-11-12");
    const count = state.orders.length;
    for (const fulfillment of ["pickup", "quick", "delivery"] as const) {
      const order = {
        ...state.orders[0],
        channel: undefined,
        fulfillment,
        deliveryAddress: "",
      };
      state = applyCommand(state, { type: "saveOrder", order }, "테스트");
      expect(state.orders[0].fulfillment).toBe(fulfillment);
      expect(state.orders.length).toBe(count);
    }
    const order = {
      ...state.orders[0],
      deliveryAddress: "서울시 테스트 배송지",
    };
    state = applyCommand(state, { type: "saveOrder", order }, "테스트");
    expect(state.orders[0].deliveryAddress).toBe(order.deliveryAddress);
    expect(
      orderSchema.safeParse({ ...order, fulfillment: "unknown" }).success,
    ).toBe(false);
  });

  it("renders piece and box quantities, dates and delivery addresses", () => {
    const state = demoState("2026-11-12");
    const order = {
      ...state.orders[0],
      kind: "single" as const,
      time: "10:00",
      fulfillment: "quick" as const,
      deliveryAddress: "서울시 테스트 배송지",
    };
    order.lines = [
      {
        productId: state.products[0].id,
        quantity: 2,
        unit: "box",
        piecesPerUnit: 24,
      },
      {
        productId: state.products[1].id,
        quantity: 5,
        unit: "piece",
        piecesPerUnit: 1,
      },
    ];
    const message = orderMessage(order, state.products);
    expect(message).toContain("11월 12일(목) 오전 10시에");
    expect(message).toContain(
      `${state.products[0].name} 2박스, ${state.products[1].name} 5개`,
    );
    expect(message).toContain("퀵으로 준비해 드릴게요.");
    expect(message).toContain("서울시 테스트 배송지 주소로 보내드릴게요.");
    expect(
      orderMessage({ ...order, fulfillment: "pickup" }, state.products),
    ).not.toContain("주소");
    expect(
      orderMessage({ ...order, deliveryAddress: "" }, state.products),
    ).toContain("받으실 주소를 답장으로 보내 주세요.");
  });

  it("distinguishes gift box totals from per-box composition", () => {
    const state = demoState("2026-11-12");
    const order = { ...state.orders[0], kind: "gift" as const, boxes: 3 };
    order.lines = [
      {
        productId: state.products[0].id,
        quantity: 2,
        unit: "piece",
        piecesPerUnit: 1,
      },
    ];
    expect(orderMessage(order, state.products)).toContain(
      `선물세트 3상자 (상자당 ${state.products[0].name} 2개)`,
    );
  });

  it("encodes the edited Korean body and preserves line breaks on each platform", () => {
    const body = "수정한 문구 & #예약\n배송지　테스트 1동";
    expect(smsLink("010-1234-5678", body)).toBe(
      `sms:01012345678?body=${encodeURIComponent(body)}`,
    );
    expect(smsLink("010-1234-5678", body, true)).toBe(
      `sms:01012345678&body=${encodeURIComponent(body)}`,
    );
    expect(smsLink("", body)).toBe("");
  });

  it("includes the saved account and asks for payer name and missing sticker text", () => {
    const state = demoState("2026-11-12");
    const order = {
      ...state.orders[0],
      sticker: "",
      fulfillment: "pickup" as const,
    };
    const message = orderMessage(
      order,
      state.products,
      "테스트은행 123-456 예금주",
    );
    expect(message).toContain("입금 계좌는 테스트은행 123-456 예금주입니다.");
    expect(message).toContain("입금하신 후 입금자명을 답장으로 알려 주세요.");
    expect(message).toContain(
      "스티커가 필요하시면 넣으실 문구도 함께 보내 주세요.",
    );
    expect(message).not.toContain("주소");
    expect(orderMessage(order, state.products)).not.toContain("입금 계좌는");
    expect(
      orderMessage(
        { ...order, sticker: "축하합니다", time: "13:25" },
        state.products,
      ),
    ).toContain("스티커에는 “축하합니다” 문구를 넣어드릴게요.");
    expect(orderMessage({ ...order, time: "13:25" }, state.products)).toContain(
      "오후 1시 25분에",
    );
  });

  it("saves and clears the account independently of production settings and orders", () => {
    const state = demoState("2026-11-12");
    const saved = applyCommand(
      state,
      { type: "savePaymentAccount", account: "  테스트은행 123 예금주  " },
      "테스트",
    );
    expect(saved.paymentAccount).toBe("테스트은행 123 예금주");
    expect(saved.settings).toEqual(state.settings);
    expect(saved.orders).toEqual(state.orders);
    expect(saved.revision).toBe(state.revision);
    const changedSettings = applyCommand(
      saved,
      { type: "saveSettings", settings: saved.settings },
      "테스트",
    );
    expect(changedSettings.paymentAccount).toBe(saved.paymentAccount);
    expect(
      applyCommand(saved, { type: "savePaymentAccount", account: "" }, "테스트")
        .paymentAccount,
    ).toBe("");
  });

  it("saves the bank separately and includes it in the confirmation message", () => {
    const state = demoState("2026-11-12");
    const saved = applyCommand(
      state,
      {
        type: "savePaymentAccount",
        bank: " 테스트은행 ",
        account: " 123-456 예금주 ",
      },
      "테스트",
    );
    expect(saved.paymentBank).toBe("테스트은행");
    expect(saved.paymentAccount).toBe("123-456 예금주");
    expect(
      orderMessage(
        saved.orders[0],
        saved.products,
        saved.paymentAccount,
        saved.paymentBank,
      ),
    ).toContain("입금 계좌는 테스트은행 123-456 예금주입니다.");
    const legacyUpdate = applyCommand(
      saved,
      { type: "savePaymentAccount", account: "789 예금주" },
      "테스트",
    );
    expect(legacyUpdate.paymentBank).toBe("테스트은행");
  });
});
