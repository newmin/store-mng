"use client";

import {
  CalendarDays,
  ClipboardList,
  CookingPot,
  LoaderCircle,
  Package,
  ShieldCheck,
  X,
} from "lucide-react";
import { fallbackCandidates, requirements } from "@/lib/calculations";
import { addDays, koreanDate } from "@/lib/dates";
import type { StoreState } from "@/lib/types";

export function RecommendationLoading({
  state,
  date,
  onCancel,
}: {
  state: StoreState;
  date: string;
  onCancel: () => void;
}) {
  const settings = state.settings;
  const candidates = fallbackCandidates(state, date);
  const demand = requirements(state, date);
  const pending = state.orders.filter(
    (order) => order.date === date && order.status === "reserved",
  ).length;
  const excluded = state.products.filter((product) =>
    settings.excluded.includes(product.id),
  );
  return (
    <div className="recommendation-loading">
      <div className="recommendation-loading-status" role="status">
        <span className="recommendation-loading-symbol" aria-hidden="true">
          <LoaderCircle size={30} />
        </span>
        <div>
          <h3>매장에 맞는 추가 메뉴를 찾고 있어요</h3>
          <p>{koreanDate(date, true)} 생산 기준</p>
        </div>
      </div>
      <h3 className="recommendation-conditions-title">
        이번 추천에 적용하는 조건
      </h3>
      <ul className="recommendation-conditions">
        <li>
          <ClipboardList size={19} aria-hidden="true" />
          <div>
            <strong>예약 주문과 진열 목표</strong>
            <p>
              수령 대기 {pending}건과 메뉴별 진열 목표를 우선 반영합니다. 사용
              가능한 완제품 재고를 차감해 필요한 생산량을 계산합니다.
            </p>
          </div>
        </li>
        <li>
          <CookingPot size={19} aria-hidden="true" />
          <div>
            <strong>
              추가 메뉴 최대 {settings.extraCount}종 · 메뉴당{" "}
              {settings.extraBatches}생산 단위
            </strong>
            <p>메뉴별 기본 생산량과 레시피에 맞춰 추천합니다.</p>
          </div>
        </li>
        <li>
          <CalendarDays size={19} aria-hidden="true" />
          <div>
            <strong>
              {settings.avoidDays
                ? `최근 ${settings.avoidDays}일 및 기준일 생산 메뉴 제외`
                : "기준일에 생산한 메뉴 제외"}
            </strong>
            <p>
              추천 후보 {candidates.length}종 · 판매 중이고 생산 기준이 등록된
              메뉴를 검토합니다. 예약 충당에 추가 생산이 필요한 메뉴와 진열
              목표가 있는 메뉴는 추가 추천에서 제외합니다.
            </p>
            {excluded.length > 0 && (
              <p>
                지정 제외: {excluded.map((product) => product.name).join(" · ")}
              </p>
            )}
          </div>
        </li>
        <li>
          <Package size={19} aria-hidden="true" />
          <div>
            <strong>재료 재고와 향후 예약 확보</strong>
            <p>
              {koreanDate(date)}부터 {koreanDate(addDays(date, 6))}까지 예약에
              필요한 재료를 확보할 수 있는지 확인합니다.
            </p>
          </div>
        </li>
      </ul>
      {demand.some((row) => row.issue) && (
        <p className="recommendation-loading-warning">
          생산 기준이 미등록된 메뉴가 있어 추천이 제한될 수 있어요.
        </p>
      )}
      <p className="recommendation-loading-note">
        <ShieldCheck size={17} aria-hidden="true" />
        추천 결과를 확인한 뒤 생산계획에 반영할 수 있어요.
      </p>
      <div className="form-footer">
        <button type="button" className="button secondary" onClick={onCancel}>
          <X size={16} aria-hidden="true" />
          추천 취소
        </button>
      </div>
    </div>
  );
}
