"use client";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowRight,
  Clock3,
  Copy,
  Download,
  Files,
  ImagePlus,
  Plus,
  RectangleHorizontal,
  Square,
  X,
  StickyNote,
} from "lucide-react";
import { uid } from "@/lib/dates";
import {
  formtecPapers,
  makeFormtecFile,
  type FormtecPaper,
} from "@/lib/formtec";
import { resolveMenuImage, uploadMenuImage } from "@/lib/menu-image-client";
import {
  drawSticker,
  stickerImages,
  MAX_STICKER_IMAGES,
  type StickerImage,
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
function useArtworks(layers: StickerImage[]) {
  const paths = JSON.stringify([
    ...new Set(layers.map((layer) => layer.image)),
  ]);
  const [loaded, setLoaded] = useState<{
    paths: string;
    images: Record<string, HTMLImageElement>;
    error: string;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    const images: Record<string, HTMLImageElement> = {};
    async function load() {
      const results = await Promise.allSettled(
        (JSON.parse(paths) as string[]).map(async (path) => {
          const url = isStickerSampleImage(path)
            ? path
            : await resolveMenuImage(path);
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
          images[path] = image;
        }),
      );
      if (alive)
        setLoaded({
          paths,
          images,
          error: results.some((r) => r.status === "rejected")
            ? "일부 사진을 불러오지 못했습니다. 다시 열어 주세요."
            : "",
        });
    }
    void load();
    return () => {
      alive = false;
    };
  }, [paths]);
  const images = useMemo(
    () => (loaded?.paths === paths ? loaded.images : {}),
    [loaded, paths],
  );
  return {
    images,
    error: loaded?.paths === paths ? loaded.error : "",
    ready: layers.every((layer) => !!images[layer.image]),
  };
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
  const renderDesign = useMemo(
    () => ({ ...design, image: design.image || imagePath }),
    [design, imagePath],
  );
  const { images, error } = useArtworks(stickerImages(renderDesign));
  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => {
      if (active && canvas.current)
        drawSticker(canvas.current, renderDesign, images);
    });
    return () => {
      active = false;
    };
  }, [renderDesign, images]);
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
  const [selectedImageId, setSelectedImageId] = useState("legacy");
  const [panelOpen, setPanelOpen] = useState(false),
    [overflow, setOverflow] = useState(false);
  const [paper, setPaper] = useState<FormtecPaper>("3106");
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
    imageId?: string;
    mode: "move" | "resize";
  } | null>(null);
  const assets = state.stickerAssets || [];
  const artwork = assets.find((a) => a.id === design.assetId);
  const renderDesign = useMemo(
    () => ({ ...design, image: design.image || artwork?.image }),
    [design, artwork?.image],
  );
  const layers = stickerImages(renderDesign);
  const selectedPhoto =
    layers.find((layer) => layer.id === selectedImageId) || layers[0];
  const selectedBox =
    selected === "imageBox" && selectedPhoto
      ? selectedPhoto.box
      : design.textBox;
  const { images, error, ready } = useArtworks(layers);
  const image = selectedPhoto ? images[selectedPhoto.image] : undefined;
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
            renderDesign,
            images,
            panelOpen ? selected : undefined,
            selectedPhoto?.id,
          ),
        );
    });
    return () => {
      active = false;
    };
  }, [
    renderDesign,
    images,
    selected,
    selectedPhoto?.id,
    panelOpen,
    editorActive,
  ]);
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
    setDesign((d) => {
      const { imageBox, imageAspectLocked, imageStretch, ...rest } = value;
      if (
        imageBox ||
        imageAspectLocked !== undefined ||
        imageStretch !== undefined
      ) {
        return {
          ...d,
          ...rest,
          images: stickerImages(d, artwork?.image).map((layer) =>
            layer.id === selectedPhoto?.id
              ? {
                  ...layer,
                  ...(imageBox ? { box: imageBox } : {}),
                  ...(imageAspectLocked !== undefined
                    ? { aspectLocked: imageAspectLocked }
                    : {}),
                  ...(imageStretch !== undefined
                    ? { stretch: imageStretch }
                    : {}),
                }
              : layer,
          ),
        };
      }
      return { ...d, ...value };
    });
    setDirty(true);
  }
  function discard() {
    return !dirty || confirm("저장하지 않은 변경을 버릴까요?");
  }
  function loadDesign(saved: StickerDesign, existingOrder = false) {
    if (!discard()) return false;
    setDesign(structuredClone(saved));
    setSelectedImageId(
      stickerImages(saved, assets.find((a) => a.id === saved.assetId)?.image)[0]
        ?.id || "legacy",
    );
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
  async function attachPhotos(files: File[]) {
    if (!files.length) return;
    if (layers.length + files.length > MAX_STICKER_IMAGES) {
      setNotice(`사진은 ${MAX_STICKER_IMAGES}장까지 추가할 수 있습니다.`);
      return;
    }
    setWorking(true);
    setNotice("");
    const added: StickerImage[] = [];
    try {
      for (const file of files) {
        const path = await uploadMenuImage(file);
        const index = layers.length + added.length;
        added.push({
          id: uid(),
          image: path,
          box: {
            x: 5 + (index % 4) * 12,
            y: 10 + (index % 4) * 10,
            width: 30,
            height: 55,
          },
          aspectLocked: true,
          stretch: false,
        });
      }
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      if (added.length) {
        patch({
          images: [...layers, ...added],
          assetId: undefined,
          image: undefined,
        });
        setSelectedImageId(added[added.length - 1].id);
        setSelected("imageBox");
        setPanelOpen(true);
      }
      setWorking(false);
    }
  }
  function removePhoto() {
    const remaining = layers.filter((layer) => layer.id !== selectedPhoto?.id);
    patch({ images: remaining, image: undefined, assetId: undefined });
    setSelectedImageId(remaining[remaining.length - 1]?.id || "");
    if (!remaining.length) {
      setSelected("textBox");
      setPanelOpen(false);
    }
  }
  function reorderPhoto(direction: number) {
    const index = layers.findIndex((layer) => layer.id === selectedPhoto?.id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= layers.length) return;
    const reordered = [...layers];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    patch({ images: reordered, image: undefined, assetId: undefined });
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
    if (!ready) throw new Error("그림을 불러온 뒤 다시 시도해 주세요.");
    const output = document.createElement("canvas");
    if (drawSticker(output, renderDesign, images))
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
  async function downloadFormtec() {
    setNotice("");
    setSuccess("");
    setWorking(true);
    try {
      const png = new Uint8Array(await (await makePng()).arrayBuffer());
      const file = makeFormtecFile(png, paper);
      const url = URL.createObjectURL(
        new Blob([file], { type: "application/zip" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${design.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "스티커"}_폼텍${paper}_${formtecPapers[paper].count}개.dgz`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setSuccess("폼텍 파일을 다운로드했습니다.");
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "폼텍 파일을 만들지 못했습니다.",
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
    const contains = (b: StickerDesign["textBox"]) =>
      x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
    const photo = [...layers].reverse().find((layer) => contains(layer.box));
    const preferText =
      panelOpen && selected === "textBox" && contains(design.textBox);
    const hit = preferText
      ? "textBox"
      : photo
        ? "imageBox"
        : contains(design.textBox)
          ? "textBox"
          : null;
    if (!hit) {
      setPanelOpen(false);
      return;
    }
    if (photo && hit === "imageBox") setSelectedImageId(photo.id);
    setSelected(hit);
    setPanelOpen(true);
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      box: hit === "imageBox" && photo ? photo.box : design.textBox,
      layer: hit,
      imageId: hit === "imageBox" ? photo?.id : undefined,
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
    const targetPhoto = layers.find((layer) => layer.id === d.imageId);
    const box =
      d.mode === "resize"
        ? resizeStickerBox(
            d.box,
            dx,
            dy,
            d.layer === "imageBox" && targetPhoto?.aspectLocked !== false,
          )
        : stickerBox({ ...d.box, x: d.box.x + dx, y: d.box.y + dy });
    patch(
      d.layer === "imageBox"
        ? {
            images: layers.map((layer) =>
              layer.id === d.imageId ? { ...layer, box } : layer,
            ),
          }
        : { textBox: box },
    );
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
            multiple
            aria-label="사진 첨부"
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              void attachPhotos(files);
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
                  사진 추가
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
              {!!layers.length && (
                <div
                  className="sticker-photo-list"
                  role="group"
                  aria-label="스티커 사진"
                >
                  {layers.map((layer, index) => (
                    <button
                      key={layer.id}
                      type="button"
                      disabled={working}
                      aria-label={`사진 ${index + 1} 편집`}
                      aria-pressed={
                        panelOpen &&
                        selected === "imageBox" &&
                        selectedPhoto?.id === layer.id
                      }
                      onClick={() => {
                        setSelectedImageId(layer.id);
                        setSelected("imageBox");
                        setPanelOpen(true);
                      }}
                    >
                      {images[layer.image] && (
                        <img src={images[layer.image].src} alt="" />
                      )}
                      사진 {index + 1}
                    </button>
                  ))}
                </div>
              )}
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
                      left: `${selectedBox.x + selectedBox.width}%`,
                      top: `${selectedBox.y + selectedBox.height}%`,
                    }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      drag.current = {
                        id: e.pointerId,
                        x: e.clientX,
                        y: e.clientY,
                        box: selectedBox,
                        imageId: selectedPhoto?.id,
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
                          selectedBox,
                          delta[0],
                          delta[1],
                          selected === "imageBox" &&
                            selectedPhoto?.aspectLocked !== false,
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
                    disabled={working || overflow || !ready}
                    onClick={() => void copyImage()}
                  >
                    <Copy size={17} />
                    이미지 복사
                  </button>
                )}
              </div>
              {orderMode && (
                <fieldset disabled={working}>
                  <label>
                    폼텍 용지
                    <select
                      aria-label="폼텍 용지"
                      value={paper}
                      onChange={(e) => setPaper(e.target.value as FormtecPaper)}
                    >
                      {Object.entries(formtecPapers).map(([code, spec]) => (
                        <option key={code} value={code}>
                          {spec.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {paper === "3639" && (
                    <small>
                      내용이 잘리지 않도록 이미지 전체를 원 안에 맞춥니다.
                    </small>
                  )}
                  <button
                    className="button secondary"
                    disabled={working || overflow || !ready}
                    onClick={() => void downloadFormtec()}
                  >
                    <Download size={17} />
                    폼텍 {formtecPapers[paper].count}개 내보내기
                  </button>
                </fieldset>
              )}
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
                  {selected === "imageBox" && selectedPhoto && (
                    <>
                      <div
                        className="sticker-tabs sticker-aspect"
                        role="group"
                        aria-label="그림 비율"
                      >
                        <button
                          type="button"
                          aria-pressed={selectedPhoto?.aspectLocked !== false}
                          onClick={() => patch({ imageAspectLocked: true })}
                        >
                          비율 고정
                        </button>
                        <button
                          type="button"
                          aria-pressed={selectedPhoto?.aspectLocked === false}
                          disabled={!image}
                          onClick={() =>
                            patch({
                              imageAspectLocked: false,
                              imageStretch: true,
                              ...(!selectedPhoto?.stretch && image
                                ? {
                                    imageBox: fitStickerImageBox(
                                      selectedPhoto.box,
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
                      <button className="text-button" onClick={removePhoto}>
                        사진 제거
                      </button>
                      <div className="button-row">
                        <button
                          className="button secondary"
                          disabled={layers[0]?.id === selectedPhoto.id}
                          onClick={() => reorderPhoto(-1)}
                        >
                          뒤로 보내기
                        </button>
                        <button
                          className="button secondary"
                          disabled={
                            layers[layers.length - 1]?.id === selectedPhoto.id
                          }
                          onClick={() => reorderPhoto(1)}
                        >
                          앞으로 가져오기
                        </button>
                      </div>
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
