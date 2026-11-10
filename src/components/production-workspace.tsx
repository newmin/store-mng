"use client";

import {
  CheckCheck,
  ChevronDown,
  CookingPot,
  Pencil,
  Plus,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { recipeIssue, requirements, simulate } from "@/lib/calculations";
import { koreanDate } from "@/lib/dates";
import type { Plan, Product, StoreState } from "@/lib/types";
import { RiceThumbnail } from "./order-pickers";

const number = (value: number) => value.toLocaleString("ko-KR");

export function ProductionWorkspace({
  state,
  date,
  today,
  busy,
  thinking,
  onEdit,
  onComplete,
  onRecommend,
  onProduct,
  onInventory,
  onSettings,
}: {
  state: StoreState;
  date: string;
  today: string;
  busy: boolean;
  thinking: boolean;
  onEdit: () => void;
  onComplete: (plan: Plan) => void;
  onRecommend: () => void;
  onProduct: (product: Product) => void;
  onInventory: () => void;
  onSettings: () => void;
}) {
  const req = requirements(state, date);
  const plan = state.plans.find(
    (p) => p.date === date && p.status !== "completed",
  );
  const completed = state.plans.filter(
    (p) => p.date === date && p.status === "completed",
  );
  const needed = req.filter(
    (r) =>
      r.batches > 0 ||
      (r.issue &&
        (r.pending > r.carry ||
          r.product.displayTarget > Math.max(0, r.carry - r.pending))),
  );
  const lines =
    plan?.lines ||
    needed
      .filter((r) => r.batches > 0)
      .map((r) => ({ productId: r.product.id, batches: r.batches }));
  const missing = needed.filter(
    (r) => !lines.some((l) => l.productId === r.product.id),
  );
  const check = simulate(state, lines);
  const stale = !!plan && plan.sourceRevision !== state.revision;
  const past = date < today;
  const confirmed = plan?.status === "confirmed" && !stale;
  const pieces = lines.reduce(
    (sum, l) =>
      sum +
      l.batches *
        (state.products.find((p) => p.id === l.productId)?.batchYield || 0),
    0,
  );
  const status = stale
    ? "재확정 필요"
    : plan?.status === "confirmed"
      ? "확정"
      : plan
        ? "초안"
        : "작성 전";

  function menuRow(product: Product, batches: number | undefined) {
    const row = req.find((r) => r.product.id === product.id);
    const issue = recipeIssue(product, state);
    const planned = lines.find((l) => l.productId === product.id);
    return (
      <details className="production-menu" key={product.id}>
        <summary className="production-menu-main">
          <RiceThumbnail product={product} />
          <div className="production-menu-name">
            <h3>{product.name}</h3>
            <span className={issue ? "production-menu-warning" : undefined}>
              {batches === undefined
                ? issue || "생산 기준 등록 필요"
                : `${number(batches)} × ${product.batchLabel}`}
              {issue && batches !== undefined && ` · ${issue}`}
            </span>
          </div>
          <strong className="production-menu-quantity">
            {product.batchYield && batches !== undefined ? (
              <>
                {number(batches * product.batchYield)}
                <small>개</small>
              </>
            ) : (
              <small>계산 필요</small>
            )}
          </strong>
          <ChevronDown className="production-menu-chevron" size={16} />
        </summary>
        {issue && (
          <div className="production-menu-issue">
            <span>{issue}</span>
            <button className="text-button" onClick={() => onProduct(product)}>
              기준 등록
            </button>
          </div>
        )}
        {row && (
          <div className="production-calculation">
            <dl>
              <div>
                <dt>예약 전체</dt>
                <dd>{number(row.reserved)}개</dd>
              </div>
              <div>
                <dt>수령 대기</dt>
                <dd>{number(row.pending)}개</dd>
              </div>
              <div>
                <dt>가용 완제품</dt>
                <dd>{number(row.carry)}개</dd>
              </div>
              <div>
                <dt>진열 목표</dt>
                <dd>{number(product.displayTarget)}개</dd>
              </div>
              <div>
                <dt>현재 필요 생산</dt>
                <dd>
                  {product.batchYield
                    ? `${number(row.batches)} × ${product.batchLabel}`
                    : "생산량 미등록"}
                </dd>
              </div>
              {plan && planned && (
                <div>
                  <dt>계획에 담은 생산</dt>
                  <dd>
                    {number(planned.batches)} × {product.batchLabel}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </details>
    );
  }

  return (
    <div className="production-workspace">
      <section className="panel production-workbar">
        <div className="production-workbar-heading">
          <div>
            <h2>{koreanDate(date)} 생산계획</h2>
            <span
              className={`production-status ${stale ? "needs-review" : ""}`}
            >
              {status}
            </span>
          </div>
          <div className="button-row">
            {!past && (
              <button
                className="button primary production-recommend-button"
                disabled={thinking || busy}
                aria-busy={thinking}
                onClick={state.settings.initialized ? onRecommend : onSettings}
              >
                <Sparkles size={19} />
                {thinking
                  ? "AI 추천안 검증 중…"
                  : state.settings.initialized
                    ? "AI 메뉴 추천"
                    : "AI 추천 기준 설정"}
              </button>
            )}
            {confirmed && !past && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={onEdit}
              >
                <Pencil size={16} />
                계획 수정
              </button>
            )}
            {!past &&
              (confirmed ? (
                <button
                  className="button primary"
                  disabled={busy || date !== today}
                  onClick={() => plan && onComplete(plan)}
                >
                  <CheckCheck size={17} />
                  생산 완료 기록
                </button>
              ) : (
                <button
                  className="button secondary"
                  disabled={busy || !state.products.length}
                  onClick={onEdit}
                >
                  <CookingPot size={17} />
                  {stale
                    ? "검토 · 다시 확정"
                    : plan
                      ? "계획 검토 · 확정"
                      : "생산계획 작성"}
                </button>
              ))}
          </div>
        </div>
        <div className="production-totals">
          <span>
            {plan ? "계획한 메뉴" : "계산 가능한 메뉴"}
            <b>
              {lines.length}
              <small>종</small>
            </b>
          </span>
          <span>
            {plan ? "예정 생산량" : "필요 생산량"}
            <b>
              {number(pieces)}
              <small>개</small>
            </b>
          </span>
          <span>
            완료한 생산
            <b>
              {number(
                completed.reduce(
                  (sum, p) =>
                    sum +
                    p.lines.reduce((n, l) => n + (l.actualPieces || 0), 0),
                  0,
                ),
              )}
              <small>개</small>
            </b>
          </span>
        </div>
        {stale && (
          <p className="production-feedback">
            <TriangleAlert size={16} />
            주문 또는 재고가 변경됐어요. 현재 필요 수량을 확인하고 계획을 다시
            확정해 주세요.
          </p>
        )}
        {needed.some((r) => r.issue) && (
          <p className="production-feedback">
            <TriangleAlert size={16} />
            생산할 메뉴 {needed.filter((r) => r.issue).length}종의 생산 기준을
            확인해 주세요.
          </p>
        )}
        {past && (
          <p className="production-feedback">지난 날짜의 생산 기록입니다.</p>
        )}
        {confirmed && date > today && (
          <p className="production-feedback">
            생산 완료는 해당 날짜에 기록할 수 있어요.
          </p>
        )}
      </section>

      <div className="production-columns">
        <section className="production-task-list">
          <div className="production-section-heading">
            <h2>
              {plan ? "만들 메뉴" : "생산이 필요한 메뉴"}
              <span className="production-menu-count">{lines.length}종</span>
            </h2>
          </div>
          {!!lines.length && (
            <div className="production-menu-list">
              {lines.map((l) => {
                const product = state.products.find(
                  (p) => p.id === l.productId,
                );
                return product && menuRow(product, l.batches);
              })}
            </div>
          )}
          {missing.length > 0 && (
            <div className="production-missing">
              <h3>
                {plan ? "계획에 담기지 않은 메뉴" : "생산 기준을 확인할 메뉴"}
              </h3>
              <div className="production-menu-list">
                {missing.map((r) =>
                  menuRow(
                    r.product,
                    r.product.batchYield ? r.batches : undefined,
                  ),
                )}
              </div>
            </div>
          )}
          {!lines.length && !missing.length && (
            <div className="panel production-empty">
              <CheckCheck size={28} />
              <h3>추가로 만들 메뉴가 없습니다.</h3>
              {!past && (
                <button className="button secondary" onClick={onEdit}>
                  <Plus size={16} />
                  메뉴를 골라 계획 작성
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="panel production-materials">
          <div className="panel-heading">
            <h2>준비할 재료</h2>
          </div>
          <div className="production-material-content">
            {check.shortages.length > 0 && (
              <div className="production-shortage">
                <TriangleAlert size={17} />
                <span>부족한 재료 {check.shortages.length}종</span>
                <button className="text-button" onClick={onInventory}>
                  재고 관리
                </button>
              </div>
            )}
            {(check.issues.length > 0 || missing.some((r) => r.issue)) && (
              <p className="production-feedback">
                생산 기준이 없는 메뉴의 재료는 계산에 포함되지 않았어요.
              </p>
            )}
            <dl>
              {Object.entries(check.usage).map(([id, quantity]) => {
                const material = state.materials.find((m) => m.id === id);
                if (!material) return null;
                const shortage = Math.max(0, quantity - material.stock);
                return (
                  <div className={shortage ? "material-short" : ""} key={id}>
                    <dt>
                      {material.name}
                      <small>
                        현재 {number(material.stock)}
                        {material.unit}
                      </small>
                    </dt>
                    <dd>
                      {number(quantity)}
                      {material.unit}
                      {shortage > 0 && (
                        <small>
                          {number(shortage)}
                          {material.unit} 부족
                        </small>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {!Object.keys(check.usage).length && (
              <p className="muted">
                생산 메뉴의 레시피를 등록하면 필요한 재료를 확인할 수 있어요.
              </p>
            )}
          </div>
        </aside>
      </div>

      {completed.length > 0 && (
        <section className="panel production-completed">
          <div className="panel-heading">
            <h2>완료한 생산</h2>
            <span>재료 차감 완료</span>
          </div>
          {completed.map((p) => (
            <div className="plan-content" key={p.id}>
              {p.lines.map((l) => (
                <div className="plan-line" key={l.productId}>
                  <b>
                    {(p.recipeSnapshot || state.products).find(
                      (product) => product.id === l.productId,
                    )?.name || "미등록 메뉴"}
                  </b>
                  <span>{number(l.actualPieces || 0)}개</span>
                </div>
              ))}
              <p className="muted small">
                {p.completedBy} ·{" "}
                {p.completedAt &&
                  new Date(p.completedAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}
              </p>
            </div>
          ))}
        </section>
      )}

      <details className="panel production-all">
        <summary>전체 메뉴의 생산 기준과 수량</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>메뉴</th>
                <th>수령 대기</th>
                <th>가용 완제품</th>
                <th>진열 목표</th>
                <th>필요 생산</th>
                <th>생산 기준</th>
              </tr>
            </thead>
            <tbody>
              {req.map((r) => (
                <tr key={r.product.id}>
                  <td>{r.product.name}</td>
                  <td>{number(r.pending)}개</td>
                  <td>{number(r.carry)}개</td>
                  <td>{number(r.product.displayTarget)}개</td>
                  <td>
                    {r.product.batchYield
                      ? `${r.batches} × ${r.product.batchLabel}`
                      : "계산 필요"}
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => onProduct(r.product)}
                    >
                      {r.issue ||
                        `${r.product.batchYield}개 / ${r.product.batchLabel}`}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
