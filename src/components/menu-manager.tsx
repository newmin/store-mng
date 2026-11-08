"use client";

import { useState } from "react";
import { Pencil, Search } from "lucide-react";
import { recipeIssue } from "@/lib/calculations";
import { menuCategories } from "@/lib/menu-catalog";
import type { Product, StoreState } from "@/lib/types";
import { RiceThumbnail } from "./order-pickers";
import type { ProductSection } from "./product-form";

export function MenuManager({
  state,
  onEdit,
}: {
  state: StoreState;
  onEdit: (product?: Product, section?: ProductSection) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const products = state.products.filter((p) => !p.archived);
  const visible = products.filter(
    (p) =>
      p.name.replace(/\s/g, "").includes(search.replace(/\s/g, "")) &&
      (category === "all" || (p.category || "general") === category) &&
      (status === "all" ||
        (status === "active" && p.active) ||
        (status === "inactive" && !p.active) ||
        (status === "incomplete" && !!recipeIssue(p, state))),
  );
  return (
    <section className="panel menu-manager">
      <div className="panel-heading">
        <h2>
          메뉴와 생산 기준{" "}
          <span className="menu-count">{products.length}종</span>
        </h2>
      </div>
      <div className="menu-manager-tools">
        <label className="menu-search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="메뉴 이름 검색"
            placeholder="메뉴 이름 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div
          className="menu-manager-categories"
          role="group"
          aria-label="메뉴 분류 필터"
        >
          {[["all", "전체"], ...Object.entries(menuCategories)].map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <div className="menu-manager-status">
          <label>
            상태
            <select
              aria-label="메뉴 상태 필터"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">전체 상태</option>
              <option value="active">사용 중</option>
              <option value="inactive">미사용</option>
              <option value="incomplete">생산 기준 미등록</option>
            </select>
          </label>
          <span>{visible.length}종 표시</span>
        </div>
      </div>
      <div className="menu-manager-list">
        {visible.map((product) => {
          const issue = recipeIssue(product, state);
          return (
            <article
              className={`menu-manager-row ${product.active ? "" : "is-inactive"}`}
              key={product.id}
            >
              <button
                type="button"
                className="menu-manager-name"
                onClick={() => onEdit(product)}
                aria-label={`${product.name} 수정`}
              >
                <RiceThumbnail product={product} photoZoom={1.15} />
                <span>
                  <b>{product.name}</b>
                  <small>
                    {menuCategories[product.category || "general"]} ·{" "}
                    {product.boxSize}개 / 박스
                    {product.boxPrice
                      ? ` · ${product.boxPrice.toLocaleString()}원`
                      : ""}
                  </small>
                </span>
              </button>
              <div className="menu-manager-production">
                {issue ? (
                  <button
                    className="menu-setup-link"
                    onClick={() => onEdit(product, "production")}
                  >
                    기준 등록 필요
                  </button>
                ) : (
                  <>
                    <span>
                      {product.batchLabel}에 {product.batchYield}개
                    </span>
                    <small>진열 목표 {product.displayTarget}개</small>
                  </>
                )}
              </div>
              <span
                className={`menu-use-status ${product.active ? "is-active" : ""}`}
              >
                {product.active ? "사용 중" : "미사용"}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`${product.name} 상세 수정`}
                onClick={() => onEdit(product)}
              >
                <Pencil size={17} />
              </button>
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <div className="menu-manager-empty">
          <p>
            {products.length
              ? "조건에 맞는 메뉴가 없습니다."
              : "등록한 메뉴가 없습니다."}
          </p>
          {products.length > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setSearch("");
                setCategory("all");
                setStatus("all");
              }}
            >
              필터 초기화
            </button>
          )}
        </div>
      )}
    </section>
  );
}
