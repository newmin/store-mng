"use client";

import { useRef, useState } from "react";
import { orderMessage, smsLink } from "@/lib/order-message";
import type { Order, Product } from "@/lib/types";

export function OrderMessage({
  order,
  products,
  paymentAccount,
  paymentBank,
}: {
  order: Order;
  products: Product[];
  paymentAccount?: string;
  paymentBank?: string;
}) {
  const [body, setBody] = useState(() =>
    orderMessage(order, products, paymentAccount, paymentBank),
  );
  const [feedback, setFeedback] = useState("");
  const text = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setFeedback("문구를 복사했어요.");
    } catch {
      text.current?.focus();
      text.current?.select();
      setFeedback("문구를 길게 누르거나 Ctrl+C를 눌러 복사해 주세요.");
    }
  }

  function openMessages() {
    const apple =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    window.location.href = smsLink(order.phone, body, apple);
  }

  return (
    <div className="order-message">
      {order.phone && (
        <p className="message-recipient">
          받는 사람　{order.customer} · {order.phone}
        </p>
      )}
      <label>
        문자 내용
        <textarea
          ref={text}
          rows={10}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setFeedback("");
          }}
        />
      </label>
      <div className="form-footer button-row">
        <button
          type="button"
          className="button secondary"
          onClick={() => void copy()}
        >
          문구 복사
        </button>
        {order.phone && (
          <button
            type="button"
            className="button primary"
            onClick={openMessages}
          >
            문자 앱 열기
          </button>
        )}
      </div>
      <p role="status">{feedback}</p>
    </div>
  );
}
