"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Notice } from "./notice";
import { DailyMenuPicker } from "./daily-menu-picker";
import { PlanRecommendations } from "./plan-recommendations";
import { OrderVoiceInput } from "./order-voice-input";
import type { VoiceOrderDraft } from "@/lib/order-voice";
import { formatPhone, validPhone } from "@/lib/order-input";
import {
  Plus,
  Minus,
  Trash2,
  Info,
  RefreshCw,
  Save,
  CheckCheck,
  MoreHorizontal,
  Package,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import {
  FulfillmentPicker,
  MenuPicker,
  OrderKindPicker,
  RiceThumbnail,
  TimePicker,
} from "./order-pickers";
import { uid, today } from "@/lib/dates";
import { materialUsage, orderPieces, requirements } from "@/lib/calculations";
import type {
  Command,
  Material,
  Order,
  OrderLine,
  Plan,
  Product,
  StoreState,
  Lot,
  Closing,
} from "@/lib/types";
type Save = (c: Command) => Promise<void>;
const field = (f: FormData, name: string) => String(f.get(name) || "");
const num = (f: FormData, name: string) => Number(f.get(name) || 0);
function Footer({
  label = "저장하기",
  disabled = false,
}: {
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="form-footer">
      <button className="button primary" type="submit" disabled={disabled}>
        <Save size={16} aria-hidden="true" />
        {label}
      </button>
    </div>
  );
}
export function OrderForm({
  state,
  order,
  date,
  save,
  onDirtyChange,
}: {
  state: StoreState;
  order?: Order;
  date: string;
  save: Save;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [kind, setKind] = useState<Order["kind"]>(order?.kind || "single");
  const [lines, setLines] = useState<OrderLine[]>(order?.lines || []);
  const [orderId] = useState(() => order?.id || uid());
  const [fulfillment, setFulfillment] = useState(order?.fulfillment);
  const [deliveryAddress, setDeliveryAddress] = useState(
    order?.deliveryAddress || "",
  );
  const [phone, setPhone] = useState(order?.phone || "");
  const [customer, setCustomer] = useState(order?.customer || "");
  const [pickupDate, setPickupDate] = useState(order?.date || date);
  const [sticker, setSticker] = useState(order?.sticker || "");
  const [time, setTime] = useState(order?.time || "10:00");
  const [menuPicker, setMenuPicker] = useState<number | "add" | null>(null);
  const [boxes, setBoxes] = useState(order?.boxes || 0);
  const [saving, setSaving] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [invalidField, setInvalidField] = useState("");
  const voiceDraft: VoiceOrderDraft = {
    customer,
    phone,
    date: pickupDate,
    time,
    fulfillment: fulfillment ?? null,
    deliveryAddress,
    kind,
    boxes,
    lines,
    sticker,
  };
  const initialDraft = useRef(JSON.stringify(voiceDraft));
  useEffect(() => {
    onDirtyChange?.(JSON.stringify(voiceDraft) !== initialDraft.current);
  }, [JSON.stringify(voiceDraft), onDirtyChange]);
  function applyVoiceDraft(draft: VoiceOrderDraft) {
    setCustomer(draft.customer);
    setPhone(draft.phone);
    setPickupDate(draft.date);
    setTime(draft.time);
    setFulfillment(draft.fulfillment ?? undefined);
    setDeliveryAddress(draft.deliveryAddress);
    setKind(draft.kind);
    setBoxes(draft.boxes);
    setLines(draft.lines);
    setSticker(draft.sticker);
    setFormError("");
  }
  const change = (i: number, patch: Partial<OrderLine>) =>
    setLines(lines.map((l, j) => (i === j ? { ...l, ...patch } : l)));
  function selectProduct(p: Product) {
    if (menuPicker === "add") {
      const existing = lines.findIndex(
        (l) => l.productId === p.id && l.unit === "piece",
      );
      if (existing >= 0)
        change(existing, { quantity: lines[existing].quantity + 1 });
      else
        setLines([
          ...lines,
          { productId: p.id, quantity: 1, unit: "piece", piecesPerUnit: 1 },
        ]);
    } else if (typeof menuPicker === "number")
      change(menuPicker, {
        productId: p.id,
        piecesPerUnit: lines[menuPicker].unit === "box" ? p.boxSize : 1,
      });
    if (menuPicker !== "add") setMenuPicker(null);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (voiceBusy || saving) return;
    setFormError("");
    if (!fulfillment) {
      setFormError("수령 방식을 선택해 주세요.");
      return;
    }
    if (!lines.length) {
      setFormError("주문할 떡을 먼저 담아 주세요.");
      return;
    }
    if (!validPhone(phone)) {
      setFormError(
        "연락처를 확인해 주세요. 예: 010-1234-5678 (연락처가 없으면 비워 두세요.)",
      );
      return;
    }
    setSaving(true);
    try {
      const f = new FormData(e.currentTarget);
      await save({
        type: "saveOrder",
        order: {
          id: orderId,
          customer: field(f, "customer"),
          phone: field(f, "phone"),
          channel: order?.channel,
          fulfillment,
          deliveryAddress:
            fulfillment === "pickup" ? "" : deliveryAddress.trim(),
          date: field(f, "date"),
          time: field(f, "time"),
          kind,
          boxes: kind === "gift" ? boxes : 1,
          lines,
          sticker: field(f, "sticker"),
          imagePath: order?.imagePath,
          status: order?.status || "reserved",
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const pieces =
    lines.reduce((s, l) => s + l.quantity * l.piecesPerUnit, 0) *
    (kind === "gift" ? boxes : 1);
  return (
    <form
      onSubmit={submit}
      onInputCapture={() => setInvalidField("")}
      onInvalidCapture={(e) => {
        e.preventDefault();
        const first = e.currentTarget.querySelector<HTMLInputElement>(
          "input:invalid, select:invalid, textarea:invalid",
        );
        if (e.target !== first) return;
        first?.focus();
        first?.scrollIntoView({ block: "center", behavior: "smooth" });
        const label =
          first?.getAttribute("aria-label") ||
          first?.closest("label")?.textContent?.trim() ||
          "입력값";
        setFormError(
          `${label}: ${first?.validationMessage || "값을 확인해 주세요."}`,
        );
        setInvalidField(first?.name || "");
      }}
    >
      <OrderVoiceInput
        draft={voiceDraft}
        products={state.products}
        disabled={saving}
        onDraft={applyVoiceDraft}
        onBusyChange={setVoiceBusy}
      />
      <fieldset disabled={saving || voiceBusy}>
        {formError && (
          <Notice message={formError} onDismiss={() => setFormError("")} />
        )}
        <div className="form-grid">
          <label>
            고객명{" "}
            <input
              name="customer"
              aria-invalid={invalidField === "customer" || undefined}
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              required
              placeholder="예약자 성함"
              maxLength={80}
            />
            {invalidField === "customer" && (
              <small className="danger-text">고객명을 입력해 주세요.</small>
            )}
          </label>
          <label>
            연락처{" "}
            <input
              name="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="010-0000-0000"
              maxLength={14}
            />
          </label>
          <label>
            수령 날짜{" "}
            <input
              name="date"
              type="date"
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
              required
            />
          </label>
          <TimePicker value={time} onChange={setTime} />
        </div>
        <FulfillmentPicker value={fulfillment} onChange={setFulfillment} />
        {(fulfillment === "quick" || fulfillment === "delivery") && (
          <label className="delivery-address">
            배송지
            <input
              name="deliveryAddress"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              maxLength={500}
              autoComplete="street-address"
            />
          </label>
        )}
        <OrderKindPicker value={kind} onChange={setKind} />
        {kind === "gift" && (
          <label className="gift-box-count">
            <Info size={17} aria-hidden="true" />
            선물상자 수{" "}
            <input
              aria-label="선물상자 수"
              type="number"
              min={1}
              max={1000000}
              value={boxes || ""}
              placeholder="0"
              onChange={(e) => setBoxes(Number(e.target.value))}
              required
            />{" "}
            상자
          </label>
        )}
        <div className="section-label">
          {kind === "gift" ? "상자당 구성" : "주문 메뉴"}{" "}
          <span>총 {pieces.toLocaleString()}개</span>
        </div>
        {lines.map((l, i) => {
          const p = state.products.find((p) => p.id === l.productId);
          return (
            <div className="order-menu-line" key={i}>
              <button
                type="button"
                className="order-menu-product"
                onClick={() => setMenuPicker(i)}
                aria-label={`${p?.name || "메뉴"} 변경`}
              >
                {p && <RiceThumbnail product={p} />}
                <span>
                  <b>{p?.name || "메뉴 선택"}</b>
                </span>
              </button>
              <label className="order-quantity">
                <span className="visually-hidden">수량 {i + 1}</span>
                <input
                  aria-label={`수량 ${i + 1}`}
                  type="number"
                  min={1}
                  max={1000000}
                  required
                  value={l.quantity || ""}
                  onChange={(e) =>
                    change(i, { quantity: Number(e.target.value) })
                  }
                />
              </label>
              <div
                className="order-unit-options"
                role="group"
                aria-label={`단위 ${i + 1}`}
              >
                <button
                  type="button"
                  aria-pressed={l.unit === "piece"}
                  onClick={() => change(i, { unit: "piece", piecesPerUnit: 1 })}
                >
                  개
                </button>
                <button
                  type="button"
                  aria-pressed={l.unit === "box"}
                  onClick={() =>
                    change(i, {
                      unit: "box",
                      piecesPerUnit:
                        l.unit === "box" ? l.piecesPerUnit : p?.boxSize || 1,
                    })
                  }
                >
                  박스
                </button>
                <small>
                  {l.unit === "box" ? `1박스 ${l.piecesPerUnit}개` : ""}
                </small>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={`메뉴 ${i + 1} 삭제`}
                onClick={() => setLines(lines.filter((_, j) => i !== j))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="add-order-menu"
          onClick={() => setMenuPicker("add")}
        >
          <Plus size={19} /> 메뉴 추가
        </button>
        {menuPicker !== null && (
          <MenuPicker
            multiple={menuPicker === "add"}
            products={state.products}
            selectedIds={lines.map((l) => l.productId)}
            onSelect={selectProduct}
            onClose={() => setMenuPicker(null)}
          />
        )}
        <label>
          스티커 참고 문구{" "}
          <textarea
            name="sticker"
            value={sticker}
            onChange={(e) => setSticker(e.target.value)}
            placeholder="스티커에 들어갈 문구나 참고사항을 적어 주세요."
            maxLength={2000}
          />
        </label>
        <Footer
          disabled={!lines.length || saving}
          label={
            saving ? "저장 중…" : order ? "주문 수정하기" : "주문 등록하기"
          }
        />
      </fieldset>
    </form>
  );
}
export { ProductForm } from "./product-form";
export function MaterialForm({
  material,
  kind,
  save,
}: {
  material?: Material;
  kind: "ingredient" | "supply";
  save: Save;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await save({
          type: "saveMaterial",
          material: {
            id: material?.id || uid(),
            name: field(f, "name"),
            unit: field(f, "unit") as Material["unit"],
            kind,
            stock: material?.stock ?? num(f, "stock"),
            threshold: num(f, "threshold"),
          },
        });
      }}
    >
      <div className="form-grid">
        <label>
          품목명 <input name="name" required defaultValue={material?.name} />
        </label>
        <label>
          기본 단위{" "}
          <select
            name="unit"
            defaultValue={material?.unit || (kind === "supply" ? "개" : "g")}
            disabled={!!material}
          >
            {["g", "ml", "개"].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          {material && (
            <input type="hidden" name="unit" value={material.unit} />
          )}
        </label>
        {!material && (
          <label>
            초기 재고{" "}
            <input
              name="stock"
              type="number"
              min={0}
              step="any"
              defaultValue={0}
              required
            />
          </label>
        )}
        <label>
          부족 알림 기준{" "}
          <input
            name="threshold"
            type="number"
            min={0}
            step="any"
            defaultValue={material?.threshold || 0}
            required
          />
        </label>
      </div>
      <Footer />
    </form>
  );
}
export function StockForm({
  material,
  save,
}: {
  material: Material;
  save: Save;
}) {
  const [mode, setMode] = useState("receive");
  const [quantity, setQuantity] = useState("");
  const [scale, setScale] = useState(1);
  const amount = Number(quantity) * scale;
  const after =
    mode === "count"
      ? amount
      : material.stock + (mode === "receive" ? amount : -amount);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await save({
          type: "adjustStock",
          materialId: material.id,
          mode: field(f, "mode") as "receive",
          quantity: amount,
          note: field(f, "note"),
        });
      }}
    >
      <div className="callout">
        현재 재고{" "}
        <b>
          {material.stock.toLocaleString()} {material.unit}
        </b>
      </div>
      <div className="form-grid">
        <label>
          처리 종류{" "}
          <select
            name="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="receive">입고</option>
            <option value="use">사용</option>
            <option value="waste">폐기</option>
            <option value="count">실사 · 현재 잔량으로 변경</option>
          </select>
        </label>
        <label>
          {
            {
              receive: "입고할 수량",
              use: "사용한 수량",
              waste: "폐기한 수량",
              count: "현재 실제 잔량",
            }[mode]
          }{" "}
          (
          {scale === 1000
            ? material.unit === "g"
              ? "kg"
              : "L"
            : material.unit}
          )
          <input
            name="quantity"
            type="number"
            min={0}
            step="any"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {(material.unit === "g" || material.unit === "ml") && (
            <select
              aria-label="입출고 입력 단위"
              value={scale}
              onChange={(e) => {
                const next = Number(e.target.value);
                setQuantity(
                  quantity ? String((Number(quantity) * scale) / next) : "",
                );
                setScale(next);
              }}
            >
              <option value={1}>{material.unit}</option>
              <option value={1000}>{material.unit === "g" ? "kg" : "L"}</option>
            </select>
          )}
        </label>
      </div>
      {quantity !== "" && (
        <p className={after < 0 ? "callout danger-text" : "callout"}>
          현재 {material.stock.toLocaleString()}
          {material.unit} → 반영 후 {after.toLocaleString()}
          {material.unit}
          {after < 0 && " · 재고가 부족합니다."}
        </p>
      )}
      <label>
        기록 사유{" "}
        <input
          name="note"
          required
          placeholder="예: 쌀가루 입고 / 실물 잔량 확인"
          maxLength={300}
        />
      </label>
      <Footer label="재고 반영하기" disabled={after < 0} />
    </form>
  );
}
export function PlanForm({
  state,
  date,
  plan,
  initial,
  showPicker,
  setShowPicker,
  aiOpen,
  setAiOpen,
  recommend,
  save,
  onDirtyChange,
}: {
  state: StoreState;
  date: string;
  plan?: Plan;
  initial?: Plan["lines"];
  showPicker: boolean;
  setShowPicker: (open: boolean) => void;
  aiOpen: boolean;
  setAiOpen: (open: boolean) => void;
  recommend: (
    lines: Plan["lines"],
    signal: AbortSignal,
  ) => Promise<{ lines: Plan["lines"]; questions: string[] }>;
  save: Save;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [id] = useState(() => plan?.id || uid());
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<Plan["lines"]>(
    initial ||
      plan?.lines ||
      requirements(state, date)
        .filter((r) => r.batches > 0)
        .map((r) => ({ productId: r.product.id, batches: r.batches })),
  );
  const originalLines = useRef(JSON.stringify(lines));
  useEffect(() => {
    onDirtyChange?.(JSON.stringify(lines) !== originalLines.current);
  }, [lines, onDirtyChange]);
  const usage = materialUsage(state, lines);
  const reservationNeeds = requirements(state, date, false);
  const materials = Object.entries(usage.usage)
    .flatMap(([id, quantity]) => {
      const material = state.materials.find((m) => m.id === id);
      return material
        ? [
            {
              material,
              quantity,
              shortage: Math.max(0, quantity - material.stock),
            },
          ]
        : [];
    })
    .sort((a, b) => Number(b.shortage > 0) - Number(a.shortage > 0));
  const shortages = materials.filter((m) => m.shortage > 0);
  const uncovered = requirements(state, date, false).filter((r) => {
    const line = lines.find((l) => l.productId === r.product.id);
    return (
      r.carry + (line?.batches || 0) * (r.product.batchYield || 0) < r.pending
    );
  });
  const nextProduct = state.products.find(
    (p) => !p.archived && p.active && !lines.some((l) => l.productId === p.id),
  );
  const change = (index: number, patch: Partial<Plan["lines"][number]>) =>
    setLines(
      lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  return (
    <form
      className="plan-editor-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement | null;
        if (aiOpen) return;
        if (showPicker) {
          setShowPicker(false);
          return;
        }
        const status = submitter?.value === "confirmed" ? "confirmed" : "draft";
        setSaving(true);
        try {
          await save({ type: "savePlan", id, date, status, lines });
        } finally {
          setSaving(false);
        }
      }}
    >
      <fieldset disabled={saving}>
        {aiOpen ? (
          <PlanRecommendations
            state={state}
            date={date}
            lines={lines}
            recommend={recommend}
            onClose={() => setAiOpen(false)}
            onApply={(additions) => {
              setLines([
                ...lines,
                ...additions.filter(
                  (a) => !lines.some((l) => l.productId === a.productId),
                ),
              ]);
              setAiOpen(false);
            }}
          />
        ) : showPicker ? (
          <>
            <div className="plan-editor-scroll" key="picker">
              <DailyMenuPicker
                state={state}
                date={date}
                lines={lines}
                onChange={setLines}
              />
            </div>
            <div
              className="form-footer button-row plan-editor-footer"
              key="picker-footer"
            >
              <button
                type="button"
                className="button primary"
                onClick={(event) => {
                  event.preventDefault();
                  setShowPicker(false);
                }}
              >
                <CheckCheck size={17} /> 선택 완료 · {lines.length}종
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="plan-editor-scroll" key="editor">
              <div className="production-section-heading">
                <span className="muted small">{lines.length}종 생산</span>
                <div className="plan-editor-tools">
                  <button
                    type="button"
                    className="button primary"
                    disabled={lines.some(
                      (l) =>
                        !Number.isInteger(l.batches) ||
                        l.batches < 1 ||
                        l.batches > 100000,
                    )}
                    onClick={() => setAiOpen(true)}
                  >
                    <Sparkles size={16} /> AI 추가 추천
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!nextProduct}
                    onClick={() => setShowPicker(true)}
                  >
                    <Plus size={16} /> 메뉴 추가
                  </button>
                  <details className="plan-editor-more">
                    <summary aria-label="생산계획 추가 작업" title="추가 작업">
                      <MoreHorizontal size={20} />
                    </summary>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        const recalculated = requirements(state, date)
                          .filter((r) => r.batches > 0)
                          .map((r) => ({
                            productId: r.product.id,
                            batches: r.batches,
                          }));
                        setLines([
                          ...recalculated,
                          ...lines.filter(
                            (line) =>
                              !recalculated.some(
                                (r) => r.productId === line.productId,
                              ),
                          ),
                        ]);
                      }}
                    >
                      <RefreshCw size={16} aria-hidden="true" /> 필요 수량 다시
                      계산
                    </button>
                  </details>
                </div>
              </div>
              <div className="plan-editor-list">
                {lines.map((line, index) => {
                  const product = state.products.find(
                    (p) => p.id === line.productId,
                  );
                  const reservation = reservationNeeds.find(
                    (r) => r.product.id === line.productId,
                  );
                  const orderNeed = Math.max(
                    0,
                    (reservation?.pending || 0) - (reservation?.carry || 0),
                  );
                  const batchLabel = product?.batchLabel || "";
                  const batchUnit = /^1\s*([^\d.\s].*)$/.exec(batchLabel)?.[1];
                  return (
                    <div
                      className={`plan-editor-item${product?.displayTarget ? " standing-menu" : ""}`}
                      key={line.productId}
                    >
                      <div className="plan-editor-product">
                        {product && <RiceThumbnail product={product} />}
                        <div className="plan-editor-name">
                          <strong>{product?.name || "미등록 메뉴"}</strong>
                          {!!product?.displayTarget && (
                            <small className="standing-menu-label">
                              상시 진열
                            </small>
                          )}
                          {orderNeed > 0 && (
                            <small className="muted">
                              주문 생산 {orderNeed.toLocaleString()}개
                            </small>
                          )}
                        </div>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`${product?.name || index + 1} 생산 메뉴 삭제`}
                          onClick={() =>
                            setLines(lines.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                      <div className="plan-editor-quantity">
                        <div
                          className="plan-batch-input"
                          role="group"
                          aria-label={`${product?.name} 생산량 조절`}
                        >
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`${product?.name} 생산량 줄이기`}
                            disabled={line.batches <= 1}
                            onClick={() =>
                              change(index, {
                                batches: Math.max(1, line.batches - 1),
                              })
                            }
                          >
                            <Minus size={16} />
                          </button>
                          <div className="plan-batch-value">
                            <input
                              aria-label={`${product?.name} 생산량`}
                              type="number"
                              min={1}
                              max={100000}
                              required
                              value={line.batches || ""}
                              onChange={(e) =>
                                change(index, {
                                  batches: Number(e.target.value),
                                })
                              }
                            />
                            <span>{batchUnit || `× ${batchLabel}`}</span>
                          </div>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`${product?.name} 생산량 늘리기`}
                            disabled={line.batches >= 100000}
                            onClick={() =>
                              change(index, {
                                batches: Math.min(100000, line.batches + 1),
                              })
                            }
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        <strong>
                          {product?.batchYield
                            ? `${(line.batches * product.batchYield).toLocaleString()}개`
                            : "생산량 미등록"}
                        </strong>
                      </div>
                      {line.reason && (
                        <p className="muted small">{line.reason}</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                className="add-order-menu"
                disabled={!nextProduct}
                onClick={() => setShowPicker(true)}
              >
                <Plus size={17} />
                메뉴 추가
              </button>
              {(usage.issues.length > 0 || uncovered.length > 0) && (
                <div className="callout vertical">
                  {usage.issues.map((issue) => (
                    <span key={issue}>{issue}</span>
                  ))}
                  {uncovered.map((r) => (
                    <span key={r.product.id}>
                      {r.product.name} 예약 수량이 부족해요. 가용 재고와
                      생산량을 합쳐 {r.pending.toLocaleString()}개가 필요합니다.
                    </span>
                  ))}
                </div>
              )}
              <details
                className="plan-material-details"
                key={shortages.map((m) => m.material.id).join(",")}
                open={shortages.length > 0 || undefined}
              >
                <summary>
                  <Package size={17} />
                  <span>필요 재료 {materials.length}종</span>
                  {shortages.length > 0 && (
                    <small className="danger-text">
                      {shortages.length}종 부족
                    </small>
                  )}
                  <ChevronDown size={16} />
                </summary>
                <div className="plan-material-preview">
                  {materials.map(({ material, quantity, shortage }) => {
                    return (
                      <div key={material.id}>
                        <span>
                          {material.name}
                          <small>
                            현재 {material.stock.toLocaleString()}
                            {material.unit}
                          </small>
                        </span>
                        <b>
                          {quantity.toLocaleString()}
                          {material.unit}
                          {shortage > 0 && (
                            <small className="danger-text">
                              {shortage.toLocaleString()}
                              {material.unit} 부족
                            </small>
                          )}
                        </b>
                      </div>
                    );
                  })}
                </div>
                {Object.keys(usage.usage).length === 0 && (
                  <p className="muted small">
                    등록한 레시피가 있는 메뉴를 선택해 주세요.
                  </p>
                )}
              </details>
            </div>
            <div
              className="form-footer button-row plan-editor-footer"
              key="editor-footer"
            >
              <button
                className="button secondary"
                type="submit"
                value="draft"
                disabled={!lines.length}
              >
                <Save size={16} aria-hidden="true" /> 초안 저장
              </button>
              <button
                className="button primary"
                type="submit"
                value="confirmed"
                disabled={
                  !lines.length ||
                  usage.issues.length > 0 ||
                  uncovered.length > 0
                }
              >
                <CheckCheck size={16} aria-hidden="true" /> 계획 확정
              </button>
            </div>
          </>
        )}
      </fieldset>
    </form>
  );
}
export function CompleteForm({
  state,
  plan,
  save,
}: {
  state: StoreState;
  plan: Plan;
  save: Save;
}) {
  const usage = materialUsage(state, plan.lines).usage;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await save({
          type: "completePlan",
          id: plan.id,
          actual: plan.lines.map((l) => ({
            productId: l.productId,
            pieces: num(f, `pieces-${l.productId}`),
          })),
          usage: Object.keys(usage).map((id) => ({
            materialId: id,
            quantity: num(f, `usage-${id}`),
          })),
        });
      }}
    >
      <div className="callout">생산 완료 시 아래 사용량만큼 재료 차감</div>
      <div className="section-label">실제 완성 수량</div>
      {plan.lines.map((l) => {
        const p = state.products.find((p) => p.id === l.productId)!;
        return (
          <label className="horizontal-field" key={l.productId}>
            <span>
              {p.name} · {l.batches} × {p.batchLabel}
            </span>
            <input
              aria-label={`${p.name} 실제 생산량`}
              name={`pieces-${p.id}`}
              type="number"
              min={0}
              max={1000000}
              required
              defaultValue={l.batches * (p.batchYield || 0)}
            />
            <span>개</span>
          </label>
        );
      })}
      <div className="section-label">실제 재료 사용량</div>
      {Object.entries(usage).map(([id, q]) => {
        const m = state.materials.find((m) => m.id === id)!;
        return (
          <label className="horizontal-field" key={id}>
            <span>{m.name}</span>
            <input
              aria-label={`${m.name} 실제 사용량`}
              name={`usage-${id}`}
              type="number"
              min={0}
              step="any"
              required
              defaultValue={q}
            />
            <span>{m.unit}</span>
          </label>
        );
      })}
      <Footer label="생산 완료 · 재료 차감" />
    </form>
  );
}
export function CloseForm({
  lot,
  product,
  save,
  closing,
  picked = 0,
}: {
  lot: Lot;
  product: Product;
  save: Save;
  closing?: Closing;
  picked?: number;
}) {
  const available = closing
    ? closing.remaining +
      closing.waste +
      closing.other +
      closing.soldEstimate -
      picked
    : lot.remaining;
  const [remaining, setRemaining] = useState(String(closing?.remaining ?? ""));
  const [waste, setWaste] = useState(String(closing?.waste ?? 0));
  const [other, setOther] = useState(String(closing?.other ?? 0));
  const sold =
    available - Number(remaining) - Number(waste) - Number(other) + picked;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (closing) {
          await save({
            type: "amendClosing",
            id: closing.id,
            remaining: Number(remaining),
            waste: Number(waste),
            other: Number(other),
          });
          return;
        }
        await save({
          type: "closeLot",
          lotId: lot.id,
          date: field(f, "date"),
          remaining: num(f, "remaining"),
          waste: num(f, "waste"),
          other: num(f, "other"),
        });
      }}
    >
      <div className="callout">
        기록 전 잔량 {available}개 · 판매 가능 기한 {lot.expires}
      </div>
      <label>
        마감 날짜{" "}
        <input
          name="date"
          type="date"
          min={lot.date}
          max={today()}
          defaultValue={closing?.date || today()}
          disabled={!!closing}
          required
        />
      </label>
      <div className="form-grid">
        <label>
          마감 후 남은 수량{" "}
          <input
            name="remaining"
            type="number"
            min={0}
            max={available}
            required
            value={remaining}
            onChange={(e) => setRemaining(e.target.value)}
          />
        </label>
        <label>
          폐기 수량{" "}
          <input
            name="waste"
            type="number"
            min={0}
            max={available}
            required
            value={waste}
            onChange={(e) => setWaste(e.target.value)}
          />
        </label>
        <label>
          시식·증정 등 기타 출고{" "}
          <input
            name="other"
            type="number"
            min={0}
            max={available}
            required
            value={other}
            onChange={(e) => setOther(e.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          setRemaining("0");
          setWaste("0");
          setOther("0");
        }}
      >
        전량 판매
      </button>
      {remaining !== "" && (
        <p className="callout">
          판매 추정 {sold}개 · 남은 수량 {remaining}개 · 폐기 {waste}개 · 기타{" "}
          {other}개{sold < picked && " · 입력 합계가 가용 수량을 초과합니다."}
        </p>
      )}
      <p className="muted small">
        {product.shelfDays === 1
          ? "당일 판매 · 잔량 이월 안 됨"
          : `생산일부터 ${product.shelfDays}일간 판매 가능`}
        <br />
        판매 추정량에 예약 수령 포함
      </p>
      <Footer
        label={closing ? "마감 수정하기" : "마감 기록하기"}
        disabled={remaining === "" || sold < picked}
      />
    </form>
  );
}
export function PaymentAccountForm({
  account,
  bank,
  save,
  busy,
}: {
  account?: string;
  bank?: string;
  save: Save;
  busy: boolean;
}) {
  const [value, setValue] = useState(account || "");
  const [bankName, setBankName] = useState(bank || "");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await save({
          type: "savePaymentAccount",
          account: value,
          bank: bankName,
        });
      }}
    >
      <fieldset disabled={busy}>
        <label>
          은행명
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            maxLength={50}
            required={!!value.trim()}
          />
        </label>
        <label>
          입금 계좌
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={200}
            placeholder="계좌번호 · 예금주"
          />
        </label>
        <p className="field-help">저장한 계좌는 예약확인문자에 포함됩니다.</p>
        <Footer label="계좌 저장" />
      </fieldset>
    </form>
  );
}

export function SettingsForm({
  state,
  save,
}: {
  state: StoreState;
  save: Save;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await save({
          type: "saveSettings",
          settings: {
            extraCount: num(f, "count"),
            extraBatches: num(f, "batches"),
            avoidDays: num(f, "avoid"),
            excluded: f.getAll("excluded").map(String),
            initialized: true,
          },
        });
      }}
    >
      <div className="form-grid">
        <label>
          추가할 메뉴 수{" "}
          <input
            name="count"
            type="number"
            min={0}
            max={10}
            required
            defaultValue={state.settings.extraCount}
          />
        </label>
        <label>
          메뉴당 추가 생산 단위 수{" "}
          <input
            name="batches"
            type="number"
            min={1}
            max={100}
            required
            defaultValue={state.settings.extraBatches}
          />
        </label>
        <label>
          최근 생산 메뉴 제외 기간 (일){" "}
          <input
            name="avoid"
            type="number"
            min={0}
            max={365}
            required
            defaultValue={state.settings.avoidDays}
          />
        </label>
      </div>
      <div className="section-label">추천에서 제외할 메뉴</div>
      <div className="checkbox-list">
        {state.products
          .filter((p) => !p.archived)
          .map((p) => (
            <label className="checkbox" key={p.id}>
              <input
                name="excluded"
                type="checkbox"
                value={p.id}
                defaultChecked={state.settings.excluded.includes(p.id)}
              />
              {p.name}
            </label>
          ))}
      </div>
      <Footer label="추천 기준 저장" />
    </form>
  );
}
