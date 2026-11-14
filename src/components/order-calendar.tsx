"use client";

import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus, CalendarCheck } from "lucide-react";
import { koreanDate } from "@/lib/dates";
import {
  calendarDays,
  calendarPeriod,
  moveCalendar,
  type CalendarView,
} from "@/lib/order-calendar";
import { fulfillmentLabel } from "@/lib/order-message";
import type { Order, Product } from "@/lib/types";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const statuses = {
  reserved: "수령 대기",
  picked: "수령 완료",
  cancelled: "취소",
};

export function OrderCalendar({
  view,
  date,
  today,
  orders,
  products,
  controls,
  onDate,
  onNewOrder,
  renderOrder,
}: {
  view: CalendarView;
  date: string;
  today: string;
  orders: Order[];
  products: Product[];
  controls: ReactNode;
  onDate: (date: string) => void;
  onNewOrder: () => void;
  renderOrder: (order: Order) => ReactNode;
}) {
  const detail = useRef<HTMLElement>(null);
  const { start, end } = calendarPeriod(date, view);
  const days = calendarDays(date, view);
  const groups = new Map<string, Order[]>();
  for (const order of orders) {
    const group = groups.get(order.date) || [];
    group.push(order);
    groups.set(order.date, group);
  }
  const selectedOrders = groups.get(date) || [];
  const title =
    view === "month"
      ? `${date.slice(0, 4)}.${date.slice(5, 7)}`
      : `${start.slice(0, 4)}.${start.slice(5).replace("-", ".")} – ${start.slice(0, 4) !== end.slice(0, 4) ? `${end.slice(0, 4)}.` : ""}${end.slice(5).replace("-", ".")}`;
  function selectDay(day: string, showDetails = true) {
    onDate(day);
    if (showDetails) {
      detail.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      detail.current?.focus({ preventScroll: true });
    }
  }
  function items(order: Order) {
    return `${order.kind === "gift" ? `선물세트 ${order.boxes}상자 · ` : ""}${order.lines.map((line) => `${products.find((p) => p.id === line.productId)?.name || "미등록 메뉴"} ${line.quantity}${line.unit === "box" ? "박스" : "개"}`).join(" · ")}`;
  }
  return (
    <>
      <div className="reservation-toolbar">
        <div className="reservation-period">
          <button
            className="icon-button"
            aria-label={view === "month" ? "이전 달" : "이전 주"}
            onClick={() => onDate(moveCalendar(date, view, -1))}
          >
            <ChevronLeft size={20} />
          </button>
          <label className="reservation-date-picker">
            <span aria-live="polite">{title}</span>
            <input
              type="date"
              aria-label="예약 달력 조회 날짜"
              value={date}
              onChange={(e) => {
                if (e.target.value) onDate(e.target.value);
              }}
            />
          </label>
          <button
            className="icon-button"
            aria-label={view === "month" ? "다음 달" : "다음 주"}
            onClick={() => onDate(moveCalendar(date, view, 1))}
          >
            <ChevronRight size={20} />
          </button>
          <button className="today-button" onClick={() => onDate(today)}>
            <CalendarCheck size={16} aria-hidden="true" /> 오늘
          </button>
          <span className="reservation-total" aria-live="polite">
            {orders.length}건
          </span>
        </div>
        {controls}
      </div>
      <section
        className={`reservation-calendar ${view}`}
        aria-label={`${title} 예약 달력`}
        tabIndex={0}
      >
        <div className="reservation-weekdays" aria-hidden="true">
          {weekdays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="reservation-days">
          {days.map((day, index) => {
            if (day < start || day > end)
              return (
                <div
                  key={day}
                  className="reservation-day outside"
                  aria-hidden="true"
                />
              );
            const entries = groups.get(day) || [];
            return (
              <article
                key={day}
                className={`reservation-day${day === date ? " selected" : ""}${day === today ? " today" : ""}`}
              >
                <button
                  className="reservation-day-heading"
                  aria-label={`${koreanDate(day, true)}, 주문 ${entries.length}건`}
                  aria-pressed={day === date}
                  aria-current={day === today ? "date" : undefined}
                  onClick={() => selectDay(day)}
                >
                  <span>
                    <time dateTime={day}>{Number(day.slice(8))}</time>
                    <span className="reservation-weekday">
                      {weekdays[index % 7]}
                    </span>
                    {day === today && (
                      <small className="reservation-today-label">오늘</small>
                    )}
                  </span>
                  {entries.length > 0 && <b>{entries.length}건</b>}
                </button>
                <div className="reservation-events">
                  {entries.map((order) => (
                    <button
                      key={order.id}
                      className={`reservation-event ${order.status}`}
                      onClick={() => selectDay(day, true)}
                      aria-label={`${order.time} ${order.customer}, ${statuses[order.status]}, ${fulfillmentLabel(order.fulfillment)}, ${items(order)}`}
                    >
                      <span className="reservation-event-title">
                        <time>{order.time}</time>
                        <strong>{order.customer}</strong>
                      </span>
                      <span className="reservation-event-meta">
                        {fulfillmentLabel(order.fulfillment)} ·{" "}
                        {statuses[order.status]}
                      </span>
                      <span className="reservation-event-items">
                        {items(order)}
                      </span>
                    </button>
                  ))}
                  {!entries.length && (
                    <span className="reservation-no-orders">예약 없음</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      {!orders.length && (
        <p className="reservation-empty" role="status">
          이 기간에 조회 조건에 맞는 주문이 없어요.
        </p>
      )}
      <section
        className="panel reservation-detail"
        ref={detail}
        tabIndex={-1}
        aria-label="선택한 날짜의 예약"
      >
        <div className="panel-heading">
          <h2>
            {koreanDate(date)}{" "}
            <span className="count-badge">{selectedOrders.length}건</span>
          </h2>
          <button
            className="text-button"
            disabled={!products.length}
            onClick={onNewOrder}
          >
            <Plus size={16} /> 주문 등록
          </button>
        </div>
        {selectedOrders.length ? (
          selectedOrders.map((order) => (
            <div key={order.id}>{renderOrder(order)}</div>
          ))
        ) : (
          <p className="reservation-empty">
            이 날짜에 조회 조건에 맞는 주문이 없어요.
          </p>
        )}
      </section>
    </>
  );
}
