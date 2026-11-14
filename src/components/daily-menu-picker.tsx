"use client";

import { useState } from "react";
import { Check, History, Plus, Search, Store } from "lucide-react";
import { requirements } from "@/lib/calculations";
import type { Plan, StoreState } from "@/lib/types";
import { RiceThumbnail } from "./order-pickers";

export function DailyMenuPicker({
  state,
  date,
  lines,
  onChange,
}: {
  state: StoreState;
  date: string;
  lines: Plan["lines"];
  onChange: (lines: Plan["lines"]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const products = state.products.filter((p) => p.active && !p.archived);
  const required = requirements(state, date);
  const defaults = products.filter((p) => p.displayTarget > 0).map((p) => p.id);
  const recentDate = state.plans
    .filter((p) => p.date < date && p.status !== "draft")
    .map((p) => p.date)
    .sort()
    .at(-1);
  const recent = [
    ...new Set(
      state.plans
        .filter((p) => p.date === recentDate && p.status !== "draft")
        .flatMap((p) => p.lines.map((l) => l.productId)),
    ),
  ].filter((id) => products.some((p) => p.id === id));
  const visible = products.filter(
    (p) =>
      p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
      (!selectedOnly || lines.some((l) => l.productId === p.id)),
  );
  function add(ids: string[]) {
    onChange([
      ...lines,
      ...ids
        .filter((id) => !lines.some((l) => l.productId === id))
        .map((productId) => ({
          productId,
          batches: Math.max(
            1,
            required.find((r) => r.product.id === productId)?.batches || 0,
          ),
        })),
    ]);
  }
  return (
    <section className="daily-menu-picker" aria-label="생산 메뉴 선택">
      <div className="daily-menu-heading">
        <h3>
          <Store size={18} aria-hidden="true" /> 생산 메뉴 고르기
        </h3>
        <span className="muted small">{lines.length}종 선택</span>
      </div>
      <div className="daily-menu-shortcuts">
        <button
          type="button"
          className="button secondary"
          disabled={
            !defaults.some((id) => !lines.some((l) => l.productId === id))
          }
          onClick={() => add(defaults)}
        >
          <Store size={16} aria-hidden="true" /> 기본 진열 메뉴 담기
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={
            !recent.some((id) => !lines.some((l) => l.productId === id))
          }
          onClick={() => add(recent)}
          title={
            recentDate ? `${recentDate} 생산 메뉴` : "이전 생산계획이 없습니다"
          }
        >
          <History size={16} aria-hidden="true" /> 최근 생산 메뉴 담기
        </button>
      </div>
      <p className="muted small">
        선택은 이 날짜의 생산계획에만 반영됩니다. 담은 메뉴의 생산량은
        예약·재고·진열 목표를 기준으로 계산하며, 필요량이 없으면 1단위로
        시작합니다.
      </p>
      <div className="daily-menu-filters">
        <label className="daily-menu-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="진열 메뉴 검색"
            placeholder="메뉴 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="button secondary"
          aria-pressed={selectedOnly}
          onClick={() => setSelectedOnly(!selectedOnly)}
        >
          <Check size={16} aria-hidden="true" /> 선택한 메뉴
        </button>
      </div>
      <div className="daily-menu-grid">
        {visible.map((product) => {
          const selected = lines.some((l) => l.productId === product.id);
          const row = required.find((r) => r.product.id === product.id);
          return (
            <button
              key={product.id}
              type="button"
              className={`daily-menu-card${selected ? " selected" : ""}${product.displayTarget > 0 ? " standing-menu" : ""}`}
              aria-pressed={selected}
              aria-label={`${product.name} ${selected ? "선택 해제" : "선택"}`}
              onClick={() =>
                selected
                  ? onChange(lines.filter((l) => l.productId !== product.id))
                  : add([product.id])
              }
            >
              <RiceThumbnail product={product} />
              <span className="daily-menu-card-copy">
                <strong>{product.name}</strong>
                {product.displayTarget > 0 && (
                  <small className="standing-menu-label">상시 진열</small>
                )}
                {!!row && row.pending > row.carry && (
                  <small>
                    주문 생산 {(row.pending - row.carry).toLocaleString()}개
                  </small>
                )}
              </span>
              {selected ? (
                <Check size={18} aria-hidden="true" />
              ) : (
                <Plus size={18} aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
      {!visible.length && (
        <p className="muted small">표시할 메뉴가 없습니다.</p>
      )}
    </section>
  );
}
