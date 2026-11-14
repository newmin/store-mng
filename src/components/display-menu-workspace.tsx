"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCheck,
  Plus,
  Save,
  Search,
  Store,
  Undo2,
} from "lucide-react";
import type { Command, Product, StoreState } from "@/lib/types";
import { RiceThumbnail } from "./order-pickers";

type Edit = { expectedTarget: number; displayTarget: number };
export function DisplayMenuWorkspace({
  state,
  busy,
  save,
  onDirtyChange,
}: {
  state: StoreState;
  busy: boolean;
  save: (command: Command) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"selected" | "all">("selected");
  const [saving, setSaving] = useState(false);
  const dirty = Object.keys(edits).length > 0;
  const disabled = busy || saving;
  useEffect(() => {
    onDirtyChange(dirty);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    if (dirty) window.addEventListener("beforeunload", warn);
    return () => {
      onDirtyChange(false);
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty, onDirtyChange]);
  const target = (product: Product) =>
    edits[product.id]?.displayTarget ?? product.displayTarget;
  const products = state.products.filter(
    (p) => !p.archived && (p.active || p.displayTarget > 0),
  );
  const selected = products.filter((p) => target(p) !== 0);
  const visible = products.filter(
    (p) =>
      (filter === "all" || target(p) !== 0) &&
      p.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  function update(products: Product[], choose: (product: Product) => number) {
    setEdits((current) => {
      const next = { ...current };
      for (const product of products) {
        const expectedTarget =
          current[product.id]?.expectedTarget ?? product.displayTarget;
        const displayTarget = choose(product);
        if (displayTarget === expectedTarget) delete next[product.id];
        else next[product.id] = { expectedTarget, displayTarget };
      }
      return next;
    });
  }
  return (
    <form
      className="display-workspace"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!dirty || disabled) return;
        setSaving(true);
        try {
          await save({
            type: "saveDisplayMenus",
            targets: Object.entries(edits).map(([productId, edit]) => ({
              productId,
              ...edit,
            })),
          });
          setEdits({});
        } catch {
          /* The store displays the error; keep the selection for retry. */
        } finally {
          setSaving(false);
        }
      }}
    >
      <fieldset disabled={disabled}>
        <section className="panel display-overview">
          <div>
            <h2>
              <Store size={22} aria-hidden="true" /> 매일 진열할 메뉴{" "}
              <span>{selected.length}종</span>
            </h2>
            <p className="muted">
              진열 목표는 매일의 생산계획과 AI 추천에 반영됩니다. 이미 저장한
              계획은 다시 검토해 주세요.
            </p>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              disabled={!dirty}
              onClick={() => setEdits({})}
            >
              <Undo2 size={16} /> 변경 취소
            </button>
            <button type="submit" className="button primary" disabled={!dirty}>
              <Save size={17} /> {saving ? "저장 중…" : "변경사항 저장"}
            </button>
          </div>
          {dirty && (
            <span className="display-unsaved" role="status">
              저장하지 않은 변경 {Object.keys(edits).length}종
            </span>
          )}
        </section>
        <div className="display-toolbar">
          <div className="filter-tabs">
            <button
              type="button"
              className={filter === "selected" ? "active" : ""}
              aria-pressed={filter === "selected"}
              onClick={() => setFilter("selected")}
            >
              <Store size={16} /> 상시 진열 {selected.length}
            </button>
            <button
              type="button"
              className={filter === "all" ? "active" : ""}
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              <Plus size={16} /> 전체 메뉴 {products.length}
            </button>
          </div>
          <label className="display-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="상시 진열 메뉴 검색"
              placeholder="메뉴 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {filter === "all" && (
            <button
              type="button"
              className="button secondary"
              disabled={!visible.some((p) => p.active && target(p) === 0)}
              onClick={() =>
                update(
                  visible.filter((p) => p.active && target(p) === 0),
                  (p) => p.batchYield || 1,
                )
              }
            >
              <CheckCheck size={16} />{" "}
              {query.trim() ? "검색 결과 모두 담기" : "전체 메뉴 담기"}
            </button>
          )}
        </div>
        <div className="display-grid">
          {visible.map((product) => {
            const quantity = target(product);
            const chosen = quantity !== 0;
            return (
              <article
                className={`panel display-card${chosen ? " selected" : ""}`}
                key={product.id}
              >
                <button
                  type="button"
                  className="display-card-select"
                  aria-label={`${product.name} 상시 진열 ${chosen ? "해제" : "선택"}`}
                  aria-pressed={chosen}
                  disabled={!product.active && quantity === 0}
                  onClick={() =>
                    update([product], () =>
                      chosen ? 0 : product.batchYield || 1,
                    )
                  }
                >
                  <RiceThumbnail product={product} />
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {!product.active
                        ? "판매 중지"
                        : chosen
                          ? "상시 진열"
                          : "미선정"}
                    </small>
                  </span>
                  {chosen ? <Check size={20} /> : <Plus size={20} />}
                </button>
                {chosen && (
                  <label className="display-quantity">
                    <span>매일 진열 목표</span>
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      required
                      aria-label={`${product.name} 진열 목표`}
                      value={Number.isNaN(quantity) ? "" : quantity}
                      onChange={(event) =>
                        update([product], () =>
                          Number(event.target.value) <= 0
                            ? NaN
                            : Number(event.target.value),
                        )
                      }
                    />
                    <span>개</span>
                  </label>
                )}
              </article>
            );
          })}
        </div>
        {!visible.length && (
          <div className="panel empty">
            <Store size={32} />
            <p>
              {query ? "검색한 메뉴가 없습니다." : "상시 진열 메뉴가 없습니다."}
            </p>
            {!query && (
              <button
                type="button"
                className="button primary"
                onClick={() => setFilter("all")}
              >
                <Plus size={16} /> 메뉴 선택하기
              </button>
            )}
          </div>
        )}
      </fieldset>
    </form>
  );
}
