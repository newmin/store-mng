"use client";
import { Copy, MessageSquare } from "lucide-react";

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
  const [amount, setAmount] = useState("");
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
        입금 금액
        <input
          type="number"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => {
            const value = e.target.value;
            setAmount(value);
            const price = Number(value);
            setBody((current) =>
              current.replace(
                /(?:^\d[\d,]*원\n)?입금부탁드립니다/m,
                `${Number.isFinite(price) && price > 0 ? `${price.toLocaleString("ko-KR")}원\n` : ""}입금부탁드립니다`,
              ),
            );
            setFeedback("");
          }}
        />
      </label>
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
          <Copy size={16} aria-hidden="true" /> 문구 복사
        </button>
        {order.phone && (
          <button
            type="button"
            className="button primary"
            onClick={openMessages}
          >
            <MessageSquare size={16} aria-hidden="true" /> 문자 앱 열기
          </button>
        )}
      </div>
      <p role="status">{feedback}</p>
    </div>
  );
}
