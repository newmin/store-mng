"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Copy, Plus, Trash2, Upload } from "lucide-react";
import { uid } from "@/lib/dates";
import { recipeIssue } from "@/lib/calculations";
import { menuCategories } from "@/lib/menu-catalog";
import { isUploadedMenuImage } from "@/lib/menu-image";
import { uploadMenuImage, validateMenuImage } from "@/lib/menu-image-client";
import { UploadedMenuThumbnail } from "./uploaded-menu-thumbnail";
import type { Command, Product, StoreState } from "@/lib/types";
import { RiceThumbnail } from "./order-pickers";
import { Notice } from "./notice";

export type ProductSection = "basic" | "sales" | "production";
const sections = [
  { id: "basic", label: "기본 정보" },
  { id: "sales", label: "판매·포장" },
  { id: "production", label: "생산·레시피" },
] as const;

export function ProductForm({
  state,
  product,
  initialSection = "basic",
  onSavingChange,
  save,
}: {
  state: StoreState;
  product?: Product;
  initialSection?: ProductSection;
  onSavingChange: (saving: boolean) => void;
  save: (command: Command) => Promise<void>;
}) {
  const formId = useId();
  const [id] = useState(() => product?.id || uid());
  const [section, setSection] = useState<ProductSection>(initialSection);
  const [recipe, setRecipe] = useState(product?.recipe || []);
  const [photo, setPhoto] = useState<Product["image"] | "">(
    product?.image || "",
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const saveLock = useRef(false);
  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );
  const [batchLabel, setBatchLabel] = useState(product?.batchLabel || "1되");
  const [batchYield, setBatchYield] = useState<number | "">(
    product?.batchYield || "",
  );
  const [sourceId, setSourceId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const ingredients = state.materials.filter((m) => m.kind === "ingredient");
  const sources = state.products.filter(
    (p) => p.id !== product?.id && !p.archived && !recipeIssue(p, state),
  );
  const source = sources.find((p) => p.id === sourceId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current) return;
    const fields = new FormData(event.currentTarget);
    const text = (name: string) => String(fields.get(name) || "");
    const number = (name: string) => Number(fields.get(name) || 0);
    setError("");
    saveLock.current = true;
    setSaving(true);
    onSavingChange(true);
    try {
      let image = photo || undefined;
      if (photoFile) {
        image = await uploadMenuImage(photoFile);
        setPhoto(image);
        setPhotoFile(null);
        setPhotoPreview("");
      }
      await save({
        type: "saveProduct",
        product: {
          ...product,
          id,
          name: text("name"),
          color: text("color"),
          image,
          category: text("category") as NonNullable<Product["category"]>,
          boxPrice: number("boxPrice") || undefined,
          boxSize: number("boxSize"),
          batchLabel,
          batchYield: batchYield || null,
          shelfDays: number("shelfDays"),
          displayTarget: number("displayTarget"),
          active: fields.get("active") === "on",
          recipe,
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saveLock.current = false;
      setSaving(false);
      onSavingChange(false);
    }
  }

  return (
    <form
      className="product-editor"
      onSubmit={submit}
      onInvalidCapture={(event) => {
        event.preventDefault();
        const input = event.currentTarget.querySelector<HTMLInputElement>(
          "input:invalid, select:invalid",
        );
        const targetSection = input?.closest<HTMLElement>(
          "[data-product-section]",
        )?.dataset.productSection;
        if (targetSection) setSection(targetSection as ProductSection);
        setError("필수 항목과 입력값을 확인해 주세요.");
        requestAnimationFrame(() => input?.focus());
      }}
    >
      <fieldset disabled={saving}>
        <div
          className="product-editor-tabs"
          role="tablist"
          aria-label="메뉴 설정 항목"
        >
          {sections.map((tab) => (
            <button
              key={tab.id}
              id={`${formId}-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={section === tab.id}
              tabIndex={section === tab.id ? 0 : -1}
              aria-controls={`${formId}-${tab.id}`}
              onClick={() => {
                setSection(tab.id);
                setError("");
              }}
              onKeyDown={(event) => {
                const index = sections.findIndex((item) => item.id === tab.id);
                let next = index;
                if (event.key === "ArrowRight")
                  next = (index + 1) % sections.length;
                else if (event.key === "ArrowLeft")
                  next = (index + sections.length - 1) % sections.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = sections.length - 1;
                else return;
                event.preventDefault();
                setSection(sections[next].id);
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
                  [next]?.focus();
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {error && <Notice message={error} onDismiss={() => setError("")} />}
        <section
          data-product-section="basic"
          id={`${formId}-basic`}
          role="tabpanel"
          aria-labelledby={`${formId}-basic-tab`}
          hidden={section !== "basic"}
        >
          <div className="form-grid">
            <label>
              메뉴 이름
              <input
                name="name"
                defaultValue={product?.name}
                required
                maxLength={80}
              />
            </label>
            <label>
              메뉴 분류
              <select
                name="category"
                defaultValue={product?.category || "general"}
              >
                {Object.entries(menuCategories).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="checkbox product-use-field">
            <input
              name="active"
              type="checkbox"
              defaultChecked={product?.active ?? true}
            />
            메뉴 사용
          </label>
          <div className="product-photo-upload">
            <div className="product-photo-preview">
              {photoPreview ? (
                <img src={photoPreview} alt="선택한 메뉴 사진 미리보기" />
              ) : photo && isUploadedMenuImage(photo) ? (
                <UploadedMenuThumbnail path={photo} />
              ) : product ? (
                <RiceThumbnail
                  product={{ ...product, image: photo || undefined }}
                />
              ) : (
                <span className="product-photo-empty">사진 없음</span>
              )}
            </div>
            <div className="product-photo-actions">
              <label className="button secondary product-photo-select">
                <Upload size={16} />
                {photo || photoFile ? "사진 변경" : "사진 올리기"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="메뉴 사진 올리기"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    try {
                      validateMenuImage(file);
                      setPhotoFile(file);
                      setPhotoPreview(URL.createObjectURL(file));
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              </label>
              {(photo || photoFile) && (
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => {
                    setPhoto("");
                    setPhotoFile(null);
                    setPhotoPreview("");
                  }}
                >
                  사진 삭제
                </button>
              )}
            </div>
          </div>
          <details className="product-appearance">
            <summary>메뉴 색상 변경</summary>
            <label>
              메뉴 색상
              <input
                type="color"
                name="color"
                defaultValue={product?.color || "#bdc9ad"}
              />
            </label>
          </details>
        </section>
        <section
          data-product-section="sales"
          id={`${formId}-sales`}
          role="tabpanel"
          aria-labelledby={`${formId}-sales-tab`}
          hidden={section !== "sales"}
        >
          <div className="form-grid">
            <label>
              1박스 가격 (원)
              <input
                name="boxPrice"
                type="number"
                min={1}
                max={100000000}
                defaultValue={product?.boxPrice || ""}
              />
            </label>
            <label>
              박스당 개수
              <input
                name="boxSize"
                type="number"
                min={1}
                max={1000000}
                defaultValue={product?.boxSize || 1}
                required
              />
            </label>
          </div>
        </section>
        <section
          data-product-section="production"
          id={`${formId}-production`}
          role="tabpanel"
          aria-labelledby={`${formId}-production-tab`}
          hidden={section !== "production"}
        >
          {sources.length > 0 && (
            <details className="recipe-copy">
              <summary>
                <Copy size={16} />
                다른 메뉴의 생산 기준 가져오기
              </summary>
              <div className="recipe-copy-controls">
                <label>
                  복사할 메뉴
                  <select
                    value={sourceId}
                    onChange={(e) => {
                      setSourceId(e.target.value);
                      setFeedback("");
                    }}
                  >
                    <option value="">메뉴 선택</option>
                    {sources.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.batchLabel}에 {p.batchYield}개
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!source}
                  onClick={() => {
                    if (!source) return;
                    setBatchLabel(source.batchLabel);
                    setBatchYield(source.batchYield || "");
                    setRecipe(source.recipe.map((r) => ({ ...r })));
                    setFeedback(`${source.name}의 생산 기준을 가져왔어요.`);
                  }}
                >
                  가져오기
                </button>
              </div>
              <p className="field-help">
                현재 입력한 생산 단위·완성 개수·재료 사용량을 대체합니다.
              </p>
            </details>
          )}
          {feedback && (
            <p className="recipe-copy-feedback" role="status">
              {feedback}
            </p>
          )}
          <div className="form-grid">
            <label>
              생산 단위 이름
              <input
                name="batchLabel"
                value={batchLabel}
                onChange={(e) => setBatchLabel(e.target.value)}
                required
                maxLength={40}
              />
            </label>
            <label>
              한 생산 단위의 완성 개수
              <input
                name="yield"
                type="number"
                min={1}
                max={1000000}
                value={batchYield}
                onChange={(e) =>
                  setBatchYield(e.target.value ? Number(e.target.value) : "")
                }
              />
            </label>
            <label>
              판매 가능 기간 (생산일 포함)
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
              상시 진열 목표 (개)
              <input
                name="displayTarget"
                type="number"
                min={0}
                max={100000}
                defaultValue={product?.displayTarget || 0}
                required
              />
            </label>
          </div>
          <div className="section-label">
            {batchLabel || "한 생산 단위"}에 필요한 재료
          </div>
          <div className="product-recipe-list">
            {recipe.map((line, index) => {
              const ingredient = ingredients.find(
                (m) => m.id === line.materialId,
              );
              return (
                <div className="product-recipe-row" key={index}>
                  <select
                    aria-label={`재료 ${index + 1}`}
                    required
                    value={line.materialId}
                    onChange={(e) =>
                      setRecipe(
                        recipe.map((r, i) =>
                          i === index
                            ? { ...r, materialId: e.target.value }
                            : r,
                        ),
                      )
                    }
                  >
                    <option value="" disabled>
                      재료 선택
                    </option>
                    {ingredients.map((m) => (
                      <option
                        key={m.id}
                        value={m.id}
                        disabled={recipe.some(
                          (r, i) => i !== index && r.materialId === m.id,
                        )}
                      >
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <div className="product-recipe-amount">
                    <input
                      aria-label={`사용량 ${index + 1}`}
                      type="number"
                      min={0.001}
                      max={1e9}
                      step="any"
                      required
                      value={line.quantity || ""}
                      onChange={(e) =>
                        setRecipe(
                          recipe.map((r, i) =>
                            i === index
                              ? { ...r, quantity: Number(e.target.value) }
                              : r,
                          ),
                        )
                      }
                    />
                    <span>{ingredient?.unit}</span>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`재료 ${index + 1} 삭제`}
                    onClick={() =>
                      setRecipe(recipe.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="text-button"
            disabled={ingredients.every((m) =>
              recipe.some((r) => r.materialId === m.id),
            )}
            onClick={() => {
              const material = ingredients.find(
                (m) => !recipe.some((r) => r.materialId === m.id),
              );
              if (material)
                setRecipe([
                  ...recipe,
                  { materialId: material.id, quantity: 1 },
                ]);
            }}
          >
            <Plus size={16} />
            재료 추가
          </button>
          {!ingredients.length && (
            <p className="field-help">
              재료·비품에서 원재료를 등록한 뒤 레시피를 입력해 주세요.
            </p>
          )}
        </section>
        <div className="form-footer product-editor-footer">
          <button className="button primary" type="submit">
            {saving ? "사진과 메뉴 저장 중…" : "메뉴 저장"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
