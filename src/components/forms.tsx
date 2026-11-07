"use client";
import { useState, type FormEvent } from "react";
import { Notice } from "./notice";
import { formatPhone, validPhone } from "@/lib/order-input";
import { Plus, Trash2, Info } from "lucide-react";
import {
  ChannelPicker,
  MenuPicker,
  OrderKindPicker,
  RiceThumbnail,
  CatalogThumbnail,
  TimePicker,
} from "./order-pickers";
import {
  menuCatalog,
  menuPhotoKey,
  findMenuPhoto,
  menuCategories,
} from "@/lib/menu-catalog";
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
}: {
  state: StoreState;
  order?: Order;
  date: string;
  save: Save;
}) {
  const [kind, setKind] = useState<Order["kind"]>(order?.kind || "single");
  const [lines, setLines] = useState<OrderLine[]>(order?.lines || []);
  const [channel, setChannel] = useState(order?.channel || "카카오톡");
  const [phone, setPhone] = useState(order?.phone || "");
  const [time, setTime] = useState(order?.time || "10:00");
  const [menuPicker, setMenuPicker] = useState<number | "add" | null>(null);
  const [boxes, setBoxes] = useState(order?.boxes || 0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
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
    setMenuPicker(null);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
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
          id: order?.id || uid(),
          customer: field(f, "customer"),
          phone: field(f, "phone"),
          channel: field(f, "channel"),
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
      onInvalidCapture={(e) => {
        e.preventDefault();
        setFormError(
          "필수 입력값을 확인해 주세요. 고객명·수령 날짜·수량을 올바르게 입력해야 합니다.",
        );
      }}
    >
      <fieldset disabled={saving}>
        {formError && (
          <Notice message={formError} onDismiss={() => setFormError("")} />
        )}
        <div className="form-grid">
          <label>
            고객명{" "}
            <input
              name="customer"
              defaultValue={order?.customer}
              required
              placeholder="예약자 성함"
              maxLength={80}
            />
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
              defaultValue={order?.date || date}
              required
            />
          </label>
          <TimePicker value={time} onChange={setTime} />
        </div>
        <ChannelPicker value={channel} onChange={setChannel} />
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
            defaultValue={order?.sticker}
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
export function ProductForm({
  state,
  product,
  save,
}: {
  state: StoreState;
  product?: Product;
  save: Save;
}) {
  const [recipe, setRecipe] = useState(product?.recipe || []);
  const [photo, setPhoto] = useState<Product["image"] | "">(
    product?.image || "",
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await save({
          type: "saveProduct",
          product: {
            id: product?.id || uid(),
            name: field(f, "name"),
            color: field(f, "color"),
            image: photo || undefined,
            category: field(f, "category") as NonNullable<Product["category"]>,
            boxPrice: num(f, "boxPrice") || undefined,
            boxSize: num(f, "boxSize"),
            batchYield: num(f, "yield") || null,
            batchLabel: field(f, "batchLabel"),
            shelfDays: num(f, "shelfDays"),
            displayTarget: num(f, "displayTarget"),
            active: f.get("active") === "on",
            recipe,
          },
        });
      }}
    >
      <div className="form-grid">
        <label>
          메뉴 이름{" "}
          <input
            name="name"
            defaultValue={product?.name}
            required
            maxLength={80}
          />
        </label>
        <label>
          메뉴 색상{" "}
          <input
            name="color"
            type="color"
            defaultValue={product?.color || "#bdc9ad"}
          />
        </label>
        <label>
          박스당 개수{" "}
          <input
            name="boxSize"
            type="number"
            min={1}
            max={1000000}
            defaultValue={product?.boxSize || 1}
            required
          />
        </label>
        <label>
          메뉴 분류
          <select name="category" defaultValue={product?.category || "general"}>
            {Object.entries(menuCategories).map(([key, name]) => (
              <option value={key} key={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          1박스 가격 (원)
          <input
            name="boxPrice"
            type="number"
            min={1}
            max={100000000}
            defaultValue={product?.boxPrice || ""}
            placeholder="가격이 미정이면 비워 두세요"
          />
        </label>
        <label>
          생산 단위 이름{" "}
          <input
            name="batchLabel"
            defaultValue={product?.batchLabel || "1되"}
            required
          />
        </label>
        <label>
          한 생산 단위의 완성 개수{" "}
          <input
            name="yield"
            type="number"
            min={1}
            max={1000000}
            defaultValue={product?.batchYield || ""}
            placeholder="미정이면 비워 두세요"
          />
        </label>
        <label>
          판매 가능 기간 (생산일 포함){" "}
          <input
            name="shelfDays"
            type="number"
            min={1}
            max={365}
            defaultValue={product?.shelfDays || 1}
            required
          />
        </label>
        <label>
          상시 진열 목표 (개){" "}
          <input
            name="displayTarget"
            type="number"
            min={0}
            max={100000}
            defaultValue={product?.displayTarget || 0}
            required
          />
        </label>
        <label className="checkbox">
          <input
            name="active"
            type="checkbox"
            aria-describedby="active-menu-help"
            defaultChecked={product?.active ?? true}
          />{" "}
          생산 메뉴로 사용
        </label>
        <p id="active-menu-help" className="field-help">
          체크하면 새 주문에서 선택할 수 있고 생산 계산·추가 생산 추천에
          사용됩니다. 해제하면 새 주문의 메뉴 선택과 추가 생산 추천에서
          제외됩니다. 기존 주문·생산 기록은 유지되며, 이미 예약된 주문의
          생산량·재료 계산은 계속됩니다.
        </p>
      </div>
      <fieldset className="product-photo-picker">
        <legend className="field-label">메뉴 썸네일</legend>
        <details className="catalog-photo-options">
          <summary>
            {findMenuPhoto(photo)?.name || "기본 그림"} · 사진 변경
          </summary>
          <div className="product-photo-options">
            <label className={!photo ? "selected" : ""}>
              <input
                className="visually-hidden"
                type="radio"
                name="menuPhoto"
                value=""
                checked={!photo}
                onChange={() => setPhoto("")}
              />
              <span className="no-photo-choice">기본 그림</span>
            </label>
            {menuCatalog.map((p) => (
              <label
                key={p.id}
                className={photo === menuPhotoKey(p.id) ? "selected" : ""}
              >
                <input
                  className="visually-hidden"
                  type="radio"
                  name="menuPhoto"
                  value={menuPhotoKey(p.id)}
                  checked={photo === menuPhotoKey(p.id)}
                  onChange={() => setPhoto(menuPhotoKey(p.id))}
                />
                <CatalogThumbnail image={menuPhotoKey(p.id)} />
                <span>{p.name}</span>
              </label>
            ))}
          </div>
        </details>
      </fieldset>
      <div className="section-label">한 생산 단위에 필요한 재료</div>
      <p className="muted small">재료에 등록된 단위(g·ml·개)로 입력</p>
      {recipe.map((r, i) => (
        <div className="line-editor recipe" key={i}>
          <select
            aria-label={`재료 ${i + 1}`}
            value={r.materialId}
            required
            onChange={(e) =>
              setRecipe(
                recipe.map((x, j) =>
                  i === j ? { ...x, materialId: e.target.value } : x,
                ),
              )
            }
          >
            <option value="" disabled>
              재료 선택
            </option>
            {state.materials
              .filter((m) => m.kind === "ingredient")
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
          </select>
          <input
            aria-label={`사용량 ${i + 1}`}
            type="number"
            min={0.001}
            step="any"
            max={1e9}
            required
            value={r.quantity || ""}
            onChange={(e) =>
              setRecipe(
                recipe.map((x, j) =>
                  i === j ? { ...x, quantity: Number(e.target.value) } : x,
                ),
              )
            }
          />
          <button
            type="button"
            aria-label={`재료 ${i + 1} 삭제`}
            className="icon-button"
            onClick={() => setRecipe(recipe.filter((_, j) => i !== j))}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        onClick={() =>
          setRecipe([
            ...recipe,
            {
              materialId:
                state.materials.find((m) => m.kind === "ingredient")?.id || "",
              quantity: 1,
            },
          ])
        }
      >
        <Plus size={16} /> 재료 추가
      </button>
      <Footer />
    </form>
  );
}
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
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await save({
          type: "adjustStock",
          materialId: material.id,
          mode: field(f, "mode") as "receive",
          quantity: num(f, "quantity"),
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
          <select name="mode">
            <option value="receive">입고</option>
            <option value="use">사용</option>
            <option value="waste">폐기</option>
            <option value="count">실사 · 현재 잔량으로 변경</option>
          </select>
        </label>
        <label>
          수량 ({material.unit}){" "}
          <input name="quantity" type="number" min={0} step="any" required />
        </label>
      </div>
      <label>
        기록 사유{" "}
        <input
          name="note"
          required
          placeholder="예: 쌀가루 입고 / 실물 잔량 확인"
          maxLength={300}
        />
      </label>
      <Footer label="재고 반영하기" />
    </form>
  );
}
export function PlanForm({
  state,
  date,
  plan,
  initial,
  save,
}: {
  state: StoreState;
  date: string;
  plan?: Plan;
  initial?: Plan["lines"];
  save: Save;
}) {
  const [lines, setLines] = useState<Plan["lines"]>(
    initial ||
      plan?.lines ||
      requirements(state, date)
        .filter((r) => r.batches)
        .map((r) => ({ productId: r.product.id, batches: r.batches })),
  );
  const usage = materialUsage(state, lines);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await save({
          type: "savePlan",
          id: plan?.id || uid(),
          date,
          status: field(f, "status") as "draft",
          lines,
        });
      }}
    >
      {lines.map((l, i) => (
        <div className="line-editor recipe" key={i}>
          <select
            aria-label={`생산 메뉴 ${i + 1}`}
            value={l.productId}
            onChange={(e) =>
              setLines(
                lines.map((x, j) =>
                  i === j ? { ...x, productId: e.target.value } : x,
                ),
              )
            }
          >
            {state.products
              .filter((p) => !p.archived || p.id === l.productId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.batchLabel} ({p.batchYield || "?"}개)
                </option>
              ))}
          </select>
          <input
            aria-label={`생산 단위 수 ${i + 1}`}
            type="number"
            min={1}
            max={100000}
            required
            value={l.batches || ""}
            onChange={(e) =>
              setLines(
                lines.map((x, j) =>
                  i === j ? { ...x, batches: Number(e.target.value) } : x,
                ),
              )
            }
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`생산 메뉴 ${i + 1} 삭제`}
            onClick={() => setLines(lines.filter((_, j) => i !== j))}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        onClick={() =>
          setLines([
            ...lines,
            { productId: state.products[0]?.id || "", batches: 1 },
          ])
        }
      >
        <Plus size={16} /> 메뉴 추가
      </button>
      <div className="callout vertical">
        {usage.issues.map((x) => (
          <span key={x}>{x}</span>
        ))}
        {Object.entries(usage.usage).map(([id, qty]) => {
          const m = state.materials.find((m) => m.id === id);
          return (
            <span key={id} className={m && qty > m.stock ? "danger-text" : ""}>
              {m?.name} {qty.toLocaleString()} {m?.unit} 필요 · 현재{" "}
              {m?.stock.toLocaleString()}
            </span>
          );
        })}
      </div>
      <label>
        저장 상태{" "}
        <select
          name="status"
          defaultValue={plan?.status === "confirmed" ? "confirmed" : "draft"}
        >
          <option value="draft">초안으로 저장</option>
          <option value="confirmed">계획 확정</option>
        </select>
      </label>
      <Footer label="생산계획 저장" />
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
}: {
  lot: Lot;
  product: Product;
  save: Save;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
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
        기록 전 잔량 {lot.remaining}개 · 판매 가능 기한 {lot.expires}
      </div>
      <label>
        마감 날짜{" "}
        <input
          name="date"
          type="date"
          min={lot.date}
          max={today()}
          defaultValue={today()}
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
            max={lot.remaining}
            required
            defaultValue={0}
          />
        </label>
        <label>
          폐기 수량{" "}
          <input
            name="waste"
            type="number"
            min={0}
            max={lot.remaining}
            required
            defaultValue={0}
          />
        </label>
        <label>
          시식·증정 등 기타 출고{" "}
          <input
            name="other"
            type="number"
            min={0}
            max={lot.remaining}
            required
            defaultValue={0}
          />
        </label>
      </div>
      <p className="muted small">
        {product.shelfDays === 1
          ? "당일 판매 · 잔량 이월 안 됨"
          : `생산일부터 ${product.shelfDays}일간 판매 가능`}
        <br />
        판매 추정량에 예약 수령 포함
      </p>
      <Footer label="마감 기록하기" />
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
