"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Plus, RefreshCw, Sparkles } from "lucide-react";
import type { Plan, StoreState } from "@/lib/types";
import { RecommendationLoading } from "./recommendation-loading";
import { RiceThumbnail } from "./order-pickers";
import { Notice } from "./notice";

export function PlanRecommendations({
  state,
  date,
  lines,
  recommend,
  onClose,
  onApply,
}: {
  state: StoreState;
  date: string;
  lines: Plan["lines"];
  recommend: (
    lines: Plan["lines"],
    signal: AbortSignal,
  ) => Promise<{ lines: Plan["lines"]; questions: string[] }>;
  onClose: () => void;
  onApply: (lines: Plan["lines"]) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    lines: Plan["lines"];
    questions: string[];
  } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    setResult(null);
    setSelected([]);
    void recommend(lines, request.signal)
      .then((response) => {
        if (!request.signal.aborted)
          setResult({
            ...response,
            lines: response.lines.filter(
              (l) =>
                !lines.some((existing) => existing.productId === l.productId),
            ),
          });
      })
      .catch((e) => {
        if (!request.signal.aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
    // Each attempt uses the plan as it stood when this recommendation screen opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return (
    <>
      <div className="plan-editor-scroll">
        {loading ? (
          <RecommendationLoading
            state={state}
            date={date}
            currentLines={lines}
            onCancel={onClose}
          />
        ) : (
          <>
            <h3 className="plan-ai-heading">
              <Sparkles size={18} /> AI 추가 추천
            </h3>
            {error && <Notice message={error} />}
            {result && (
              <>
                {result.lines.length === 0 && (
                  <p className="muted">
                    현재 조건에 맞는 추가 메뉴가 없습니다.
                  </p>
                )}
                <div className="plan-ai-list">
                  {result.lines.map((line) => {
                    const product = state.products.find(
                      (p) => p.id === line.productId,
                    );
                    if (!product) return null;
                    const checked = selected.includes(line.productId);
                    return (
                      <button
                        type="button"
                        className={`daily-menu-card${checked ? " selected" : ""}`}
                        key={line.productId}
                        aria-pressed={checked}
                        onClick={() =>
                          setSelected(
                            checked
                              ? selected.filter((id) => id !== line.productId)
                              : [...selected, line.productId],
                          )
                        }
                      >
                        <RiceThumbnail product={product} />
                        <span className="daily-menu-card-copy">
                          <strong>
                            {product.name} ·{" "}
                            {(
                              line.batches * (product.batchYield || 0)
                            ).toLocaleString()}
                            개
                          </strong>
                          <small>{line.reason}</small>
                        </span>
                        {checked ? <Check size={18} /> : <Plus size={18} />}
                      </button>
                    );
                  })}
                </div>
                {result.questions.map((question, index) => (
                  <p className="callout" key={index}>
                    {question}
                  </p>
                ))}
              </>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => setAttempt(attempt + 1)}
            >
              <RefreshCw size={16} /> 다시 추천
            </button>
          </>
        )}
      </div>
      <div className="form-footer button-row plan-editor-footer">
        <button type="button" className="button secondary" onClick={onClose}>
          <ArrowLeft size={16} /> 계획으로 돌아가기
        </button>
        {!loading && (
          <button
            type="button"
            className="button primary"
            disabled={!selected.length}
            onClick={(event) => {
              event.preventDefault();
              onApply(
                result!.lines.filter((l) => selected.includes(l.productId)),
              );
            }}
          >
            <Plus size={16} /> {selected.length}종 추가
          </button>
        )}
      </div>
    </>
  );
}
