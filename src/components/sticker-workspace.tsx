"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Copy,
  ImagePlus,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { uid } from "@/lib/dates";
import { resolveMenuImage, uploadMenuImage } from "@/lib/menu-image-client";
import {
  drawSticker,
  collectStickerTags,
  newStickerDesign,
  stickerBox,
  resizeStickerBox,
  fitStickerImageBox,
  isOrderSticker,
  stickerMatches,
  type StickerAsset,
  type StickerDesign,
} from "@/lib/stickers";
import type { Command, StoreState } from "@/lib/types";
import { Notice } from "./notice";

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
        const url = await resolveMenuImage(path!);
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
function Artwork({ asset }: { asset: StickerAsset }) {
  const { image, error } = useArtwork(asset.image);
  return image ? (
    <img src={image.src} alt={asset.name} />
  ) : (
    <span>{error || "불러오는 중…"}</span>
  );
}
function ArtworkGrid({
  assets,
  selected,
  onSelect,
  onEdit,
  onDelete,
  working,
}: {
  assets: StickerAsset[];
  selected?: string;
  onSelect: (asset: StickerAsset) => void;
  onEdit?: (asset: StickerAsset) => void;
  onDelete?: (asset: StickerAsset) => void;
  working: boolean;
}) {
  return (
    <div className="sticker-gallery">
      {assets.map((a) => (
        <article
          key={a.id}
          className={`sticker-art-card ${selected === a.id ? "selected" : ""}`}
        >
          <button
            className="sticker-art-select"
            disabled={working}
            aria-label={a.name ? `${a.name} 그림 선택` : "그림 선택"}
            onClick={() => onSelect(a)}
          >
            <Artwork asset={a} />
          </button>
          <div className="sticker-chips">
            {a.tags.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          {onEdit && (
            <div className="button-row">
              <button
                className="text-button"
                disabled={working}
                onClick={() => onEdit(a)}
              >
                <Pencil size={14} />
                편집
              </button>
              <button
                className="text-button"
                disabled={working}
                onClick={() => onDelete?.(a)}
              >
                삭제
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

export function StickerWorkspace({
  state,
  run,
  onEditing,
}: {
  state: StoreState;
  run: (c: Command) => Promise<void>;
  onEditing: (dirty: boolean) => void;
}) {
  const [tab, setTab] = useState<"library" | "studio">("studio");
  const [editorActive, setEditorActive] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const picker = useRef<HTMLDialogElement>(null);
  const [filters, setFilters] = useState<string[]>([]),
    [query, setQuery] = useState("");
  const [asset, setAsset] = useState<StickerAsset | null>(null),
    [tag, setTag] = useState("");
  const [design, setDesign] = useState<StickerDesign>(() =>
    newStickerDesign(uid()),
  );
  const [dirty, setDirty] = useState(false),
    [working, setWorking] = useState(false);
  const [notice, setNotice] = useState(""),
    [success, setSuccess] = useState("");
  const [selected, setSelected] = useState<"imageBox" | "textBox">("textBox");
  const [panelOpen, setPanelOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const canvasArea = useRef<HTMLDivElement>(null);
  const adjustment = useRef<HTMLElement>(null);
  const tagInput = useRef<HTMLInputElement>(null);
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
  const tags = [...new Set(assets.flatMap((a) => a.tags))].sort();
  const visible = assets.filter((a) =>
    stickerMatches({ ...a, archived: false }, filters, query),
  );
  useEffect(() => {
    onEditing(dirty || !!asset);
    return () => onEditing(false);
  }, [dirty, asset, onEditing]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || asset) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, asset]);
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
  }, [design, image, selected, tab, panelOpen, editorActive]);
  useEffect(() => {
    if (!pickerOpen) return;
    const dialog = picker.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [pickerOpen]);
  useEffect(() => {
    if (!panelOpen) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPanelOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    const outside = (e: globalThis.PointerEvent) => {
      if (
        !(e.target instanceof Node) ||
        canvasArea.current?.contains(e.target) ||
        adjustment.current?.contains(e.target)
      )
        return;
      setPanelOpen(false);
    };
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
    return !dirty || confirm("저장하지 않은 디자인 변경을 버릴까요?");
  }
  function loadDesign(saved: StickerDesign) {
    if (!discard()) return;
    setDesign(structuredClone(saved));
    setEditorActive(true);
    setDirty(false);
    setPanelOpen(false);
  }
  function openPicker() {
    setFilters([]);
    setQuery("");
    setPanelOpen(false);
    setPickerOpen(true);
  }
  function selectArtwork(a: StickerAsset) {
    patch({
      assetId: a.id,
      image: a.image,
      imageAspectLocked: true,
      imageStretch: false,
    });
    setTab("studio");
    setEditorActive(true);
    setPickerOpen(false);
    setSelected("imageBox");
    setPanelOpen(true);
    requestAnimationFrame(() =>
      canvas.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  async function deleteArtwork(a: StickerAsset) {
    if (
      !confirm(
        "이 그림을 삭제할까요? 저장한 템플릿과 주문 작업의 그림은 유지됩니다.",
      )
    )
      return;
    setWorking(true);
    try {
      await run({ type: "deleteStickerAsset", id: a.id });
      if (asset?.id === a.id) setAsset(null);
      if (design.assetId === a.id)
        setDesign((d) => ({
          ...d,
          assetId: undefined,
          image: d.image || a.image,
        }));
      setSuccess("그림을 삭제했습니다.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  function updateTags(value: string, complete = false) {
    if (!asset) return;
    try {
      const result = collectStickerTags(asset.tags, value, complete);
      setAsset({ ...asset, tags: result.tags });
      setTag(result.remaining);
    } catch (e) {
      setTag(value);
      setNotice((e as Error).message);
    }
  }
  function addTag() {
    updateTags(tag, true);
    tagInput.current?.focus({ preventScroll: true });
  }
  async function saveAsset() {
    if (!asset) return;
    setWorking(true);
    try {
      const result = collectStickerTags(asset.tags, tag, true);
      await run({
        type: "saveStickerAsset",
        asset: { ...asset, tags: result.tags },
      });
      setAsset(null);
      setSuccess("그림을 저장했습니다.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function saveDesign() {
    if (!design.name.trim()) {
      setNotice("디자인 이름을 입력해 주세요.");
      return;
    }
    setWorking(true);
    try {
      await run({ type: "saveStickerDesign", design });
      setDirty(false);
      setSuccess("디자인을 저장했습니다.");
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
        "이 브라우저에서는 이미지 복사를 지원하지 않습니다. PNG 저장을 이용해 주세요.",
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
        "이미지를 복사하지 못했습니다. 복사 권한을 확인하거나 PNG 저장을 이용해 주세요.",
      );
    } finally {
      setWorking(false);
    }
  }
  async function download() {
    setWorking(true);
    try {
      const blob = await makePng();
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `${design.name.replace(/[\\/:*?"<>|]/g, "_")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setNotice((e as Error).message);
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
      <div className="sticker-tabs" role="group" aria-label="스티커 화면">
        <button
          type="button"
          aria-pressed={tab === "studio"}
          onClick={() => setTab("studio")}
        >
          스티커 제작{dirty ? " · 미저장" : ""}
        </button>
        <button
          type="button"
          aria-pressed={tab === "library"}
          onClick={() => {
            setTab("library");
            setPanelOpen(false);
          }}
        >
          그림 관리
        </button>
      </div>
      {tab === "studio" && (
        <section className="sticker-template-loader">
          <label>
            템플릿 불러오기
            <select
              aria-label="템플릿 불러오기"
              value={
                editorActive &&
                !isOrderSticker(design) &&
                state.stickerDesigns?.some((d) => d.id === design.id)
                  ? design.id
                  : ""
              }
              onChange={(e) => {
                const saved = state.stickerDesigns?.find(
                  (d) => d.id === e.target.value,
                );
                if (saved) loadDesign(saved);
              }}
            >
              <option value="">템플릿 선택</option>
              {state.stickerDesigns
                ?.filter((d) => !isOrderSticker(d))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              if (!discard()) return;
              setDesign({
                ...newStickerDesign(uid()),
                name: "새 템플릿",
                kind: "template",
              });
              setEditorActive(true);
              setDirty(false);
              openPicker();
            }}
          >
            <Plus size={16} />새 템플릿
          </button>
          {!!state.stickerDesigns?.some(isOrderSticker) && (
            <details className="sticker-recent-work">
              <summary>최근 주문 작업</summary>
              <select
                aria-label="주문 작업 불러오기"
                value={isOrderSticker(design) ? design.id : ""}
                onChange={(e) => {
                  const saved = state.stickerDesigns?.find(
                    (d) => d.id === e.target.value,
                  );
                  if (saved) loadDesign(saved);
                }}
              >
                <option value="">주문 작업 선택</option>
                {state.stickerDesigns.filter(isOrderSticker).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </details>
          )}
        </section>
      )}
      {tab === "library" && (
        <div className="sticker-filters">
          <input
            aria-label="스티커 그림 검색"
            placeholder="그림 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div
            className="sticker-chips"
            role="group"
            aria-label="그림 태그 필터"
          >
            <button
              aria-pressed={!filters.length}
              onClick={() => setFilters([])}
            >
              전체
            </button>
            {tags.map((t) => (
              <button
                key={t}
                aria-pressed={filters.includes(t)}
                onClick={() =>
                  setFilters(
                    filters.includes(t)
                      ? filters.filter((v) => v !== t)
                      : [...filters, t],
                  )
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === "library" && (
        <>
          <button
            className="button secondary"
            disabled={working}
            onClick={() => {
              if (asset && !confirm("그림 편집을 닫을까요?")) return;
              setAsset({ id: uid(), name: "", image: "", tags: [] });
              setTag("");
            }}
          >
            <ImagePlus size={17} />
            그림 등록
          </button>
          {asset && (
            <form
              className="sticker-asset-form"
              onSubmit={(e) => {
                e.preventDefault();
                void saveAsset();
              }}
            >
              <fieldset disabled={working}>
                <label>
                  이미지
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setWorking(true);
                      try {
                        const path = await uploadMenuImage(file);
                        setAsset((a) =>
                          a
                            ? {
                                ...a,
                                image: path,
                              }
                            : a,
                        );
                      } catch (err) {
                        setNotice((err as Error).message);
                      } finally {
                        setWorking(false);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
                {asset.image && (
                  <div className="sticker-upload-preview">
                    <Artwork asset={asset} />
                  </div>
                )}
                <div className="sticker-chips">
                  {asset.tags.map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() =>
                        setAsset({
                          ...asset,
                          tags: asset.tags.filter((v) => v !== t),
                        })
                      }
                      aria-label={`${t} 태그 삭제`}
                    >
                      {t}
                      <X size={12} />
                    </button>
                  ))}
                </div>
                <div className="sticker-tag-input">
                  <input
                    ref={tagInput}
                    aria-label="추가할 태그"
                    value={tag}
                    maxLength={1024}
                    autoComplete="off"
                    onCompositionStart={() => {
                      composingTag.current = true;
                    }}
                    onCompositionEnd={(e) => {
                      composingTag.current = false;
                      updateTags(e.currentTarget.value);
                    }}
                    onChange={(e) => {
                      if (
                        composingTag.current ||
                        (e.nativeEvent as InputEvent).isComposing
                      )
                        setTag(e.target.value);
                      else updateTags(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.nativeEvent.isComposing &&
                        !composingTag.current
                      ) {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="button secondary"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={addTag}
                  >
                    태그 추가
                  </button>
                </div>
                <div className="button-row">
                  <button className="button primary" disabled={!asset.image}>
                    그림 저장
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      setAsset(null);
                      setTag("");
                    }}
                  >
                    닫기
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </>
      )}
      {tab === "studio" && editorActive && (
        <div className="sticker-studio">
          <section className="sticker-preview">
            <div className="sticker-tabs" role="group" aria-label="조정 대상">
              <button type="button" onClick={openPicker}>
                <ImagePlus size={16} />
                {design.image || design.assetId
                  ? "그림 추가·변경"
                  : "그림 추가"}
              </button>
              {image && (
                <button
                  type="button"
                  onClick={() => {
                    setSelected("imageBox");
                    setPanelOpen(true);
                  }}
                >
                  그림 편집
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
            <div className="button-row">
              <button
                className="button primary"
                disabled={working}
                onClick={() => void saveDesign()}
              >
                디자인 저장
              </button>
              <button
                className="button secondary"
                disabled={
                  working ||
                  overflow ||
                  !!((design.assetId || design.image) && !image)
                }
                onClick={() => void download()}
              >
                PNG 저장
              </button>
              <button
                type="button"
                className="button secondary"
                aria-label="스티커 이미지 복사"
                title="이미지 복사"
                disabled={
                  working ||
                  overflow ||
                  !!((design.assetId || design.image) && !image)
                }
                onClick={() => void copyImage()}
              >
                <Copy size={19} />
              </button>
            </div>
          </section>
          <section className="sticker-controls sticker-document">
            <details>
              <summary>디자인 정보</summary>
              <fieldset disabled={working}>
                <label>
                  저장 구분
                  <select
                    aria-label="저장 구분"
                    value={isOrderSticker(design) ? "order" : "template"}
                    onChange={(e) =>
                      patch({
                        kind: e.target.value as "order" | "template",
                        ...(state.stickerDesigns?.some(
                          (d) => d.id === design.id,
                        )
                          ? { id: uid() }
                          : {}),
                      })
                    }
                  >
                    <option value="template">재사용 템플릿</option>
                    <option value="order">주문 작업 · 30일 보관</option>
                  </select>
                </label>
                <label>
                  디자인 이름
                  <input
                    value={design.name}
                    maxLength={80}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </label>
                <label>
                  주문 문구 가져오기
                  <select
                    aria-label="주문 문구 가져오기"
                    value={design.orderId || ""}
                    onChange={(e) => {
                      const order = state.orders.find(
                        (o) => o.id === e.target.value,
                      );
                      if (
                        order &&
                        design.text &&
                        !confirm("현재 문구를 주문 문구로 바꿀까요?")
                      )
                        return;
                      patch({
                        orderId: order?.id,
                        kind: order ? "order" : "template",
                        ...(order &&
                        state.stickerDesigns?.some((d) => d.id === design.id) &&
                        (!isOrderSticker(design) || design.orderId !== order.id)
                          ? {
                              id: uid(),
                              name: `${order.customer} ${order.date}`,
                            }
                          : {}),
                        text: order?.sticker || design.text,
                      });
                    }}
                  >
                    <option value="">직접 입력</option>
                    {state.orders
                      .filter(
                        (o) => o.status !== "cancelled" && o.sticker.trim(),
                      )
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.date} · {o.customer}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  모양
                  <select
                    aria-label="모양"
                    value={design.shape}
                    onChange={(e) =>
                      patch({ shape: e.target.value as StickerDesign["shape"] })
                    }
                  >
                    <option value="wide">가로형</option>
                    <option value="square">정사각형</option>
                  </select>
                </label>
              </fieldset>
            </details>
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
                        그림 빼기
                      </button>
                    </>
                  )}
              </fieldset>
            </section>
          )}
        </div>
      )}
      {tab === "library" && (
        <ArtworkGrid
          assets={visible}
          working={working}
          onSelect={selectArtwork}
          onEdit={(a) => {
            if (asset && !confirm("그림 편집을 닫을까요?")) return;
            setAsset(structuredClone(a));
            setTag("");
          }}
          onDelete={(a) => void deleteArtwork(a)}
        />
      )}
      {tab === "library" && !visible.length && (
        <p className="sticker-empty">
          {assets.length
            ? "선택한 조건의 그림이 없습니다."
            : "재사용할 스티커 그림을 등록해 주세요."}
        </p>
      )}
      {pickerOpen && (
        <dialog
          ref={picker}
          className="sticker-image-picker"
          aria-labelledby="sticker-picker-title"
          onCancel={(e) => {
            e.preventDefault();
            setPickerOpen(false);
          }}
        >
          <header>
            <h2 id="sticker-picker-title">그림 선택</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="그림 선택 닫기"
              onClick={() => setPickerOpen(false)}
            >
              <X size={20} />
            </button>
          </header>
          <input
            aria-label="선택할 그림 검색"
            placeholder="그림 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div
            className="sticker-chips"
            role="group"
            aria-label="선택할 그림 태그"
          >
            <button
              type="button"
              aria-pressed={!filters.length}
              onClick={() => setFilters([])}
            >
              전체
            </button>
            {tags.map((t) => (
              <button
                type="button"
                key={t}
                aria-pressed={filters.includes(t)}
                onClick={() =>
                  setFilters(
                    filters.includes(t)
                      ? filters.filter((v) => v !== t)
                      : [...filters, t],
                  )
                }
              >
                {t}
              </button>
            ))}
          </div>
          <ArtworkGrid
            assets={visible}
            selected={design.assetId}
            working={working}
            onSelect={selectArtwork}
          />
          {!visible.length && (
            <p className="sticker-empty">
              {assets.length
                ? "선택한 조건의 그림이 없습니다."
                : "등록된 그림이 없습니다."}
            </p>
          )}
          {!assets.length && (
            <button
              className="button secondary"
              onClick={() => {
                setPickerOpen(false);
                setTab("library");
                setAsset({ id: uid(), name: "", image: "", tags: [] });
                setTag("");
              }}
            >
              그림 등록
            </button>
          )}
        </dialog>
      )}
    </div>
  );
}
