"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowRight,
  Clock3,
  Copy,
  Files,
  ImagePlus,
  Plus,
  RectangleHorizontal,
  Square,
  X,
  StickyNote,
} from "lucide-react";
import { uid } from "@/lib/dates";
import { resolveMenuImage, uploadMenuImage } from "@/lib/menu-image-client";
import {
  drawSticker,
  collectStickerTags,
  newStickerTemplate,
  stickerTemplates,
  isStickerSampleImage,
  stickerBox,
  resizeStickerBox,
  fitStickerImageBox,
  isOrderSticker,
  orderFromTemplate,
  MAX_STICKER_DAYS,
  stickerExpiresAt,
  type StickerDesign,
} from "@/lib/stickers";
import type { Command, StoreState } from "@/lib/types";
import { Notice } from "./notice";
const expiryFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
function useArtwork(path?: string) {
  const [loaded, setLoaded] = useState<{
    path: string;
    image: HTMLImageElement;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    if (!path) return;
    async function load() {
      try {
        const url = isStickerSampleImage(path!)
          ? path!
          : await resolveMenuImage(path!);
        const response = await fetch(url);
        if (!response.ok) throw new Error("그림을 불러오지 못했습니다.");
        const blob = await response.blob();
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const image = new Image();
        image.src = data;
        await image.decode();
        if (alive) setLoaded({ path: path!, image });
      } catch {
        if (alive) setError("그림을 불러오지 못했습니다. 다시 시도해 주세요.");
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [path]);
  return { image: loaded && loaded.path === path ? loaded.image : null, error };
}

function TemplateCard({
  design,
  imagePath,
  onEdit,
}: {
  design: StickerDesign;
  imagePath?: string;
  onEdit: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { image, error } = useArtwork(imagePath);
  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => {
      if (active && canvas.current) drawSticker(canvas.current, design, image);
    });
    return () => {
      active = false;
    };
  }, [design, image]);
  return (
    <article className="sticker-template-card">
      <button
        className="sticker-template-select"
        aria-label={`${design.name} 편집`}
        onClick={onEdit}
      >
        <span className="sticker-sample">
          <canvas ref={canvas} aria-hidden="true" />
        </span>
        <span className="sticker-template-name">{design.name}</span>
      </button>
      {error && <small role="status">{error}</small>}
    </article>
  );
}
export type StickerHeader = {
  title: string;
  back: (() => void) | null;
  busy: boolean;
};
export function StickerWorkspace({
  state,
  run,
  onEditing,
  initialOrderId,
  onHeaderChange,
}: {
  state: StoreState;
  run: (c: Command) => Promise<void>;
  onEditing: (dirty: boolean) => void;
  initialOrderId?: string;
  onHeaderChange: (header: StickerHeader) => void;
}) {
  const templates = stickerTemplates(state);
  const [tab, setTab] = useState<"stickers" | "templates">("stickers");
  const [editorActive, setEditorActive] = useState(() =>
    state.orders.some((order) => order.id === initialOrderId),
  );
  const [savedOrder, setSavedOrder] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0].id);
  const [design, setDesign] = useState<StickerDesign>(() => {
    const draft = orderFromTemplate(templates[0], uid());
    const order = state.orders.find((o) => o.id === initialOrderId);
    return order
      ? {
          ...draft,
          orderId: order.id,
          name: `${order.customer} ${order.date}`.slice(0, 80),
          text: order.sticker || draft.text,
        }
      : draft;
  });
  const [dirty, setDirty] = useState(false),
    [working, setWorking] = useState(false);
  const [notice, setNotice] = useState(""),
    [success, setSuccess] = useState("");
  const [query, setQuery] = useState(""),
    [tag, setTag] = useState("");
  const [selected, setSelected] = useState<"imageBox" | "textBox">("textBox");
  const [panelOpen, setPanelOpen] = useState(false),
    [overflow, setOverflow] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    canvasArea = useRef<HTMLDivElement>(null);
  const adjustment = useRef<HTMLElement>(null);
  const photoInput = useRef<HTMLInputElement>(null),
    tagInput = useRef<HTMLInputElement>(null);
  const composingTag = useRef(false);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    box: StickerDesign["textBox"];
    layer: "imageBox" | "textBox";
    mode: "move" | "resize";
  } | null>(null);
  const assets = state.stickerAssets || [];
  const artwork = assets.find((a) => a.id === design.assetId);
  const { image, error } = useArtwork(design.image || artwork?.image);
  const designs = state.stickerDesigns || [];
  const orders = designs
    .filter(isOrderSticker)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const orderMode = isOrderSticker(design);
  const persisted = designs.find((d) => d.id === design.id);
  const expiry =
    orderMode && persisted
      ? stickerExpiresAt(
          { ...persisted, retentionDays: design.retentionDays },
          state,
        )
      : 0;
  const visibleTemplates = templates.filter((d) =>
    `${d.name} ${(d.tags || []).join(" ")}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  useEffect(() => {
    onEditing(dirty);
    return () => onEditing(false);
  }, [dirty, onEditing]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    onHeaderChange({
      title: tab === "templates" ? "템플릿" : "스티커",
      busy: working,
      back: editorActive
        ? () => {
            if (
              working ||
              (dirty && !confirm("저장하지 않은 변경을 버릴까요?"))
            )
              return;
            setEditorActive(false);
            setDirty(false);
            setPanelOpen(false);
            setSavedOrder(false);
            setTag("");
          }
        : null,
    });
  }, [tab, editorActive, dirty, working, onHeaderChange]);
  useEffect(() => {
    if (savedOrder && !persisted) {
      setSavedOrder(false);
      setEditorActive(false);
      setDirty(false);
      setPanelOpen(false);
      setNotice("보관 기간이 끝나 스티커가 삭제되었습니다.");
    }
  }, [savedOrder, persisted]);
  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => {
      if (active && canvas.current)
        setOverflow(
          drawSticker(
            canvas.current,
            design,
            image,
            panelOpen ? selected : undefined,
          ),
        );
    });
    return () => {
      active = false;
    };
  }, [design, image, selected, panelOpen, editorActive]);
  useEffect(() => {
    if (!panelOpen) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPanelOpen(false);
      }
    };
    const outside = (e: globalThis.PointerEvent) => {
      if (
        e.target instanceof Node &&
        !canvasArea.current?.contains(e.target) &&
        !adjustment.current?.contains(e.target)
      )
        setPanelOpen(false);
    };
    window.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [panelOpen]);
  function patch(value: Partial<StickerDesign>) {
    setDesign((d) => ({ ...d, ...value }));
    setDirty(true);
  }
  function discard() {
    return !dirty || confirm("저장하지 않은 변경을 버릴까요?");
  }
  function loadDesign(saved: StickerDesign, existingOrder = false) {
    if (!discard()) return false;
    setDesign(structuredClone(saved));
    setSavedOrder(existingOrder);
    setEditorActive(true);
    setDirty(false);
    setTag("");
    setPanelOpen(false);
    return true;
  }
  function switchTab(next: "stickers" | "templates") {
    if (next === tab || !discard()) return;
    setTab(next);
    setDirty(false);
    setTag("");
    setPanelOpen(false);
    setSavedOrder(false);
    setEditorActive(false);
  }
  function selectTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const order = state.orders.find((o) => o.id === design.orderId);
    if (
      loadDesign({
        ...orderFromTemplate(template, uid()),
        ...(order
          ? {
              orderId: order.id,
              name: `${order.customer} ${order.date}`.slice(0, 80),
              text: order.sticker || template.text,
            }
          : {}),
      })
    )
      setTemplateId(id);
  }
  function importOrderText(id: string) {
    const order = state.orders.find((o) => o.id === id);
    if (order && design.text && !confirm("현재 문구를 주문 문구로 바꿀까요?"))
      return;
    const copyForOrder = savedOrder && order && order.id !== design.orderId;
    if (copyForOrder) setSavedOrder(false);
    patch({
      ...(copyForOrder ? orderFromTemplate(design, uid()) : {}),
      orderId: order?.id,
      ...(order
        ? {
            name: `${order.customer} ${order.date}`.slice(0, 80),
            text: order.sticker || design.text,
          }
        : {}),
    });
  }
  function updateTags(value: string, complete = false) {
    try {
      const result = collectStickerTags(design.tags || [], value, complete);
      patch({ tags: result.tags });
      setTag(result.remaining);
    } catch (e) {
      setTag(value);
      setNotice((e as Error).message);
    }
  }
  async function attachPhoto(file?: File) {
    if (!file) return;
    setWorking(true);
    try {
      const image = await uploadMenuImage(file);
      patch({
        image,
        assetId: undefined,
        imageAspectLocked: true,
        imageStretch: false,
      });
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function saveDesign() {
    if (savedOrder && !persisted) return;
    if (!design.name.trim()) {
      setNotice(
        orderMode
          ? "스티커 이름을 입력해 주세요."
          : "템플릿명을 입력해 주세요.",
      );
      return;
    }
    setWorking(true);
    try {
      const tags = orderMode
        ? design.tags
        : collectStickerTags(design.tags || [], tag, true).tags;
      await run({
        type: "saveStickerDesign",
        design: {
          ...design,
          tags,
          createdAt: persisted?.createdAt,
          updatedAt: persisted?.updatedAt,
        },
      });
      setDesign((d) => ({ ...d, tags }));
      setTag("");
      setDirty(false);
      setSavedOrder(orderMode);
      setSuccess(
        orderMode ? "스티커를 저장했습니다." : "템플릿을 저장했습니다.",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function makePng() {
    await document.fonts.ready;
    if ((design.assetId || design.image) && !image)
      throw new Error("그림을 불러온 뒤 다시 시도해 주세요.");
    const output = document.createElement("canvas");
    if (drawSticker(output, design, image))
      throw new Error(
        "문구가 영역을 넘었습니다. 글자 크기나 문구 영역을 조절해 주세요.",
      );
    return new Promise<Blob>((resolve, reject) =>
      output.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("이미지를 만들지 못했습니다.")),
        "image/png",
      ),
    );
  }
  async function copyImage() {
    setNotice("");
    setSuccess("");
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setNotice(
        "이 브라우저에서는 이미지 복사를 지원하지 않습니다. Chrome 또는 Safari에서 열어 주세요.",
      );
      return;
    }
    setWorking(true);
    try {
      // Pass a promise so Safari keeps the clipboard write in the tap gesture.
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": makePng() }),
      ]);
      setSuccess("이미지를 복사했습니다.");
    } catch {
      setNotice(
        "이미지를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      setWorking(false);
    }
  }
  function pointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect(),
      x = ((e.clientX - r.left) / r.width) * 100,
      y = ((e.clientY - r.top) / r.height) * 100;
    const hit = (
      [selected, selected === "textBox" ? "imageBox" : "textBox"] as const
    ).find((key) => {
      const b = design[key];
      return (
        (key !== "imageBox" || image) &&
        x >= b.x &&
        x <= b.x + b.width &&
        y >= b.y &&
        y <= b.y + b.height
      );
    });
    if (!hit) {
      setPanelOpen(false);
      return;
    }
    setSelected(hit);
    setPanelOpen(true);
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      box: design[hit],
      layer: hit,
      mode: "move",
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function movePointer(e: PointerEvent<HTMLElement>) {
    const d = drag.current,
      r = canvas.current?.getBoundingClientRect();
    if (!d || d.id !== e.pointerId || !r) return;
    const dx = ((e.clientX - d.x) / r.width) * 100,
      dy = ((e.clientY - d.y) / r.height) * 100;
    patch({
      [d.layer]:
        d.mode === "resize"
          ? resizeStickerBox(
              d.box,
              dx,
              dy,
              d.layer === "imageBox" && design.imageAspectLocked !== false,
            )
          : stickerBox({ ...d.box, x: d.box.x + dx, y: d.box.y + dy }),
    });
  }

  return (
    <div className="stickers">
      {notice && <Notice message={notice} onDismiss={() => setNotice("")} />}
      {success && (
        <Notice
          message={success}
          kind="success"
          autoDismissMs={3000}
          onDismiss={() => setSuccess("")}
        />
      )}
      <div
        className="sticker-tabs sticker-navigation"
        role="group"
        aria-label="스티커 화면"
      >
        <button
          disabled={working}
          aria-pressed={tab === "stickers"}
          onClick={() => switchTab("stickers")}
        >
          <StickyNote size={16} />
          스티커
        </button>
        <button
          disabled={working}
          aria-pressed={tab === "templates"}
          onClick={() => switchTab("templates")}
        >
          <Files size={16} />
          템플릿
        </button>
      </div>
      {tab === "templates" && !editorActive && (
        <section className="sticker-collection">
          <header className="sticker-section-heading">
            <h2>템플릿</h2>
            <button
              className="button primary"
              onClick={() => loadDesign(newStickerTemplate(uid()))}
            >
              <Plus size={16} />새 템플릿
            </button>
          </header>
          <input
            aria-label="템플릿 검색"
            placeholder="이름·태그 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="sticker-template-grid">
            {visibleTemplates.map((d) => (
              <TemplateCard
                key={d.id}
                design={d}
                imagePath={
                  d.image || assets.find((a) => a.id === d.assetId)?.image
                }
                onEdit={() => loadDesign(d)}
              />
            ))}
          </div>
          {!visibleTemplates.length && (
            <p className="sticker-empty">검색한 템플릿이 없습니다.</p>
          )}
        </section>
      )}
      {editorActive && (
        <>
          <input
            ref={photoInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="사진 첨부"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void attachPhoto(file);
            }}
          />
          {orderMode && (
            <section className="sticker-controls sticker-source-controls">
              <fieldset disabled={working}>
                <label>
                  템플릿
                  <select
                    aria-label="템플릿 선택"
                    value={templateId}
                    onChange={(e) => selectTemplate(e.target.value)}
                  >
                    {!templateId && <option value="">템플릿 선택</option>}
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  주문
                  <select
                    aria-label="주문 선택"
                    value={design.orderId || ""}
                    onChange={(e) => importOrderText(e.target.value)}
                  >
                    <option value="">직접 입력</option>
                    {state.orders
                      .filter((o) => o.status !== "cancelled")
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.date} · {o.customer}
                        </option>
                      ))}
                  </select>
                </label>
              </fieldset>
            </section>
          )}
          <div className="sticker-studio">
            <section className="sticker-preview">
              <div className="sticker-tabs" role="group" aria-label="조정 대상">
                <button
                  type="button"
                  disabled={working}
                  onClick={() => photoInput.current?.click()}
                >
                  <ImagePlus size={16} />
                  {design.image || design.assetId ? "사진 변경" : "사진 추가"}
                </button>
                {image && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelected("imageBox");
                      setPanelOpen(true);
                    }}
                  >
                    사진 편집
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelected("textBox");
                    setPanelOpen(true);
                  }}
                >
                  문구 편집
                </button>
              </div>
              <div ref={canvasArea} className="sticker-canvas">
                <canvas
                  ref={canvas}
                  aria-label="스티커 디자인 미리보기"
                  onPointerDown={pointerDown}
                  onPointerMove={movePointer}
                  onPointerUp={() => {
                    drag.current = null;
                    const rect = canvas.current?.getBoundingClientRect();
                    if (rect && rect.bottom > window.innerHeight * 0.6)
                      canvas.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                />
                {panelOpen && (
                  <button
                    type="button"
                    className="sticker-resize-handle"
                    aria-label={
                      selected === "imageBox"
                        ? "그림 크기 조절"
                        : "문구 영역 크기 조절"
                    }
                    style={{
                      left: `${design[selected].x + design[selected].width}%`,
                      top: `${design[selected].y + design[selected].height}%`,
                    }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      drag.current = {
                        id: e.pointerId,
                        x: e.clientX,
                        y: e.clientY,
                        box: design[selected],
                        layer: selected,
                        mode: "resize",
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={movePointer}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                    }}
                    onKeyDown={(e) => {
                      const delta = (
                        {
                          ArrowRight: [1, 0],
                          ArrowLeft: [-1, 0],
                          ArrowDown: [0, 1],
                          ArrowUp: [0, -1],
                        } as Record<string, number[]>
                      )[e.key];
                      if (!delta) return;
                      e.preventDefault();
                      patch({
                        [selected]: resizeStickerBox(
                          design[selected],
                          delta[0],
                          delta[1],
                          selected === "imageBox" &&
                            design.imageAspectLocked !== false,
                        ),
                      });
                    }}
                  >
                    <span aria-hidden="true" />
                  </button>
                )}
              </div>
              {(overflow || error) && (
                <p role="status" className="danger-text">
                  {error ||
                    "문구가 영역을 넘었습니다. 글자 크기나 문구 영역을 조절해 주세요."}
                </p>
              )}
            </section>

            <section className="sticker-controls sticker-document">
              <fieldset disabled={working}>
                <label>
                  {orderMode ? "스티커 이름" : "템플릿명"}
                  <input
                    aria-label={orderMode ? "스티커 이름" : "템플릿명"}
                    value={design.name}
                    maxLength={80}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </label>
                {!orderMode && (
                  <div className="sticker-template-tags">
                    <label>
                      태그
                      <div className="sticker-tag-input">
                        <input
                          ref={tagInput}
                          aria-label="템플릿 태그"
                          placeholder="띄어쓰기 또는 쉼표(,)로 태그 추가"
                          value={tag}
                          onChange={(e) =>
                            composingTag.current
                              ? setTag(e.target.value)
                              : updateTags(e.target.value)
                          }
                          onCompositionStart={() => {
                            composingTag.current = true;
                          }}
                          onCompositionEnd={(e) => {
                            composingTag.current = false;
                            updateTags(e.currentTarget.value);
                          }}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              !e.nativeEvent.isComposing &&
                              !composingTag.current
                            ) {
                              e.preventDefault();
                              updateTags(tag, true);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => {
                            updateTags(tag, true);
                            tagInput.current?.focus();
                          }}
                        >
                          추가
                        </button>
                      </div>
                    </label>
                    <div className="sticker-chips">
                      {(design.tags || []).map((t) => (
                        <button
                          type="button"
                          aria-label={`${t} 태그 삭제`}
                          key={t}
                          onClick={() =>
                            patch({ tags: design.tags?.filter((v) => v !== t) })
                          }
                        >
                          {t}
                          <X size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <label>
                  {orderMode ? "스티커 문구" : "예시 문구"}
                  <textarea
                    aria-label={orderMode ? "스티커 문구" : "예시 문구"}
                    rows={3}
                    maxLength={2000}
                    value={design.text}
                    onChange={(e) => patch({ text: e.target.value })}
                  />
                </label>
                <div className="sticker-options">
                  <div
                    className="sticker-shape-picker"
                    role="group"
                    aria-label="모양"
                  >
                    <span>모양</span>
                    <div className="sticker-tabs">
                      <button
                        type="button"
                        aria-label="직사각형"
                        title="직사각형"
                        aria-pressed={design.shape === "wide"}
                        onClick={() => patch({ shape: "wide" })}
                      >
                        <RectangleHorizontal size={22} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="정사각형"
                        title="정사각형"
                        aria-pressed={design.shape === "square"}
                        onClick={() => patch({ shape: "square" })}
                      >
                        <Square size={22} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {orderMode && (
                    <label>
                      보관 기간
                      <select
                        aria-label="보관 기간"
                        value={design.retentionDays ?? MAX_STICKER_DAYS}
                        onChange={(e) =>
                          patch({ retentionDays: Number(e.target.value) })
                        }
                      >
                        {Array.from(
                          { length: MAX_STICKER_DAYS },
                          (_, i) => i + 1,
                        ).map((days) => (
                          <option
                            key={days}
                            value={days}
                            disabled={
                              !!persisted &&
                              stickerExpiresAt(
                                { ...persisted, retentionDays: days },
                                state,
                              ) <= Date.now()
                            }
                          >
                            {days}일
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                {orderMode && (
                  <small className="sticker-expiry">
                    <Clock3 size={15} />
                    {expiry
                      ? `${expiryFormat.format(expiry)} 삭제 예정`
                      : `최초 저장일부터 ${design.retentionDays ?? MAX_STICKER_DAYS}일 후 자동 삭제`}
                  </small>
                )}
              </fieldset>
              <div className="button-row">
                <button
                  className="button primary"
                  disabled={working}
                  onClick={() => void saveDesign()}
                >
                  {orderMode ? "스티커 저장" : "템플릿 저장"}
                </button>
                {orderMode && (
                  <button
                    className="button secondary"
                    disabled={
                      working ||
                      overflow ||
                      !!((design.assetId || design.image) && !image)
                    }
                    onClick={() => void copyImage()}
                  >
                    <Copy size={17} />
                    이미지 복사
                  </button>
                )}
              </div>
            </section>
            {panelOpen && (
              <section
                ref={adjustment}
                className="sticker-controls sticker-adjustment"
                role="dialog"
                aria-modal="false"
                aria-label={selected === "imageBox" ? "그림 조정" : "문구 조정"}
              >
                <header>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="조정창 닫기"
                    onClick={() => setPanelOpen(false)}
                  >
                    <X size={20} />
                  </button>
                </header>
                <fieldset disabled={working}>
                  {selected === "textBox" && (
                    <>
                      <label>
                        문구
                        <textarea
                          aria-label="문구"
                          rows={2}
                          maxLength={2000}
                          value={design.text}
                          onChange={(e) => patch({ text: e.target.value })}
                        />
                      </label>
                      <label>
                        글꼴
                        <select
                          aria-label="글꼴"
                          value={design.font}
                          onChange={(e) =>
                            patch({
                              font: e.target.value as StickerDesign["font"],
                            })
                          }
                        >
                          <option value="sans">고딕</option>
                          <option value="serif">명조</option>
                          <option value="mono">고정폭</option>
                        </select>
                      </label>
                      <label>
                        글자 크기
                        <input
                          type="range"
                          min={12}
                          max={100}
                          value={design.fontSize}
                          onChange={(e) =>
                            patch({ fontSize: Number(e.target.value) })
                          }
                        />
                        {design.fontSize}
                      </label>
                      <div
                        className="sticker-text-tools"
                        role="toolbar"
                        aria-label="문구 서식"
                      >
                        <button
                          type="button"
                          aria-label="굵게"
                          aria-pressed={design.bold}
                          onClick={() => patch({ bold: !design.bold })}
                          className="sticker-bold"
                        >
                          굵
                        </button>
                        {(
                          [
                            {
                              value: "left",
                              label: "왼쪽 정렬",
                              Icon: AlignLeft,
                            },
                            {
                              value: "center",
                              label: "가운데 정렬",
                              Icon: AlignCenter,
                            },
                            {
                              value: "right",
                              label: "오른쪽 정렬",
                              Icon: AlignRight,
                            },
                          ] as const
                        ).map(({ value, label, Icon }) => (
                          <button
                            type="button"
                            key={value}
                            aria-label={label}
                            title={label}
                            aria-pressed={design.align === value}
                            onClick={() => patch({ align: value })}
                          >
                            <Icon size={19} />
                          </button>
                        ))}
                        <input
                          type="color"
                          aria-label="글자 색"
                          title="글자 색"
                          value={design.color}
                          onChange={(e) => patch({ color: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  {selected === "imageBox" &&
                    (design.assetId || design.image) && (
                      <>
                        <div
                          className="sticker-tabs sticker-aspect"
                          role="group"
                          aria-label="그림 비율"
                        >
                          <button
                            type="button"
                            aria-pressed={design.imageAspectLocked !== false}
                            onClick={() => patch({ imageAspectLocked: true })}
                          >
                            비율 고정
                          </button>
                          <button
                            type="button"
                            aria-pressed={design.imageAspectLocked === false}
                            disabled={!image}
                            onClick={() =>
                              patch({
                                imageAspectLocked: false,
                                imageStretch: true,
                                ...(!design.imageStretch && image
                                  ? {
                                      imageBox: fitStickerImageBox(
                                        design.imageBox,
                                        image.naturalWidth,
                                        image.naturalHeight,
                                        design.shape,
                                      ),
                                    }
                                  : {}),
                              })
                            }
                          >
                            자유
                          </button>
                        </div>
                        <button
                          className="text-button"
                          onClick={() =>
                            patch({ assetId: undefined, image: undefined })
                          }
                        >
                          사진 제거
                        </button>
                      </>
                    )}
                </fieldset>
              </section>
            )}
          </div>
        </>
      )}
      {tab === "stickers" && !editorActive && (
        <section className="sticker-collection">
          <header className="sticker-section-heading">
            <h2>저장한 스티커</h2>
            <button
              className="button secondary"
              disabled={working}
              onClick={() => {
                if (loadDesign(orderFromTemplate(templates[0], uid())))
                  setTemplateId(templates[0].id);
              }}
            >
              <Plus size={16} />새 스티커
            </button>
          </header>
          {orders.length ? (
            <div className="sticker-order-list">
              {orders.map((d) => (
                <button
                  key={d.id}
                  disabled={working}
                  onClick={() => {
                    if (loadDesign(d, true)) setTemplateId("");
                  }}
                >
                  <span>
                    <strong>{d.name}</strong>
                    <small>
                      {expiryFormat.format(stickerExpiresAt(d, state))} 삭제
                      예정
                    </small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          ) : (
            <p className="sticker-empty">저장한 스티커가 없습니다.</p>
          )}
        </section>
      )}
    </div>
  );
}
