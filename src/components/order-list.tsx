"use client";

import { Fragment, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { koreanDate } from "@/lib/dates";
import type { Order } from "@/lib/types";

function OrderDateGroup({
  date,
  count,
  initiallyOpen,
  children,
}: {
  date: string;
  count: number;
  initiallyOpen: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(initiallyOpen);
  return (
    <details
      className="order-date-group"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="order-date-heading">
        <CalendarDays size={16} aria-hidden="true" />
        <time dateTime={date}>{koreanDate(date)}</time>
        <span className="order-date-count">{count}건</span>
        <ChevronDown
          className="order-date-chevron"
          size={18}
          aria-hidden="true"
        />
      </summary>
      {children}
    </details>
  );
}

export function OrderList({
  items,
  groupDates = false,
  collapsible = false,
  renderOrder,
}: {
  items: Order[];
  groupDates?: boolean;
  collapsible?: boolean;
  renderOrder: (order: Order) => ReactNode;
}) {
  if (!groupDates && !collapsible)
    return items.map((order) => (
      <Fragment key={order.id}>{renderOrder(order)}</Fragment>
    ));

  const groups = new Map<string, Order[]>();
  for (const order of items) {
    const group = groups.get(order.date);
    if (group) group.push(order);
    else groups.set(order.date, [order]);
  }
  return [...groups].map(([date, orders], index) => {
    const cards = orders.map((order) => (
      <Fragment key={order.id}>{renderOrder(order)}</Fragment>
    ));
    return collapsible ? (
      <OrderDateGroup
        key={date}
        date={date}
        count={orders.length}
        initiallyOpen={index === 0}
      >
        {cards}
      </OrderDateGroup>
    ) : (
      <section key={date}>
        <h3 className="order-date-heading">
          <CalendarDays size={15} aria-hidden="true" />
          <time dateTime={date}>{koreanDate(date)}</time>
        </h3>
        {cards}
      </section>
    );
  });
}
