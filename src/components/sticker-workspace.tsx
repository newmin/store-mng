"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ImagePlus, Pencil, Plus, X } from "lucide-react";
import { uid } from "@/lib/dates";
import { resolveMenuImage, uploadMenuImage } from "@/lib/menu-image-client";
import {
  drawSticker,
  newStickerDesign,
  stickerBox,
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

export function StickerWorkspace({
  state,
  run,
  onEditing,
}: {
  state: StoreState;
  run: (c: Command) => Promise<void>;
  onEditing: (dirty: boolean) => void;
}) {
  const [tab, setTab] = useState<"library" | "studio">("library");
  const [showArchived, setShowArchived] = useState(false);
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
  const [overflow, setOverflow] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    box: StickerDesign["textBox"];
    layer: "imageBox" | "textBox";
  } | null>(null);
  const assets = state.stickerAssets || [];
  const artwork = assets.find((a) => a.id === design.assetId);
  const { image, error } = useArtwork(design.image || artwork?.image);
  const tags = [
    ...new Set(assets.filter((a) => !a.archived).flatMap((a) => a.tags)),
  ].sort();
  const visible = assets.filter((a) =>
    showArchived && tab === "library"
      ? !!a.archived &&
        stickerMatches({ ...a, archived: false }, filters, query)
      : stickerMatches(a, filters, query),
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
        setOverflow(drawSticker(canvas.current, design, image, selected));
    });
    return () => {
      active = false;
    };
  }, [design, image, selected, tab]);
  function patch(value: Partial<StickerDesign>) {
    setDesign((d) => ({ ...d, ...value }));
    setDirty(true);
  }
  function discard() {
    return !dirty || confirm("저장하지 않은 디자인 변경을 버릴까요?");
  }
  function addTag() {
    const value = tag.trim();
    if (!asset || !value) return;
    if (value.length > 24 || asset.tags.length >= 20) {
      setNotice("태그는 24자 이내, 그림당 20개까지 등록할 수 있습니다.");
      return;
    }
    setAsset({ ...asset, tags: [...new Set([...asset.tags, value])] });
    setTag("");
  }
  async function saveAsset() {
    if (!asset) return;
    setWorking(true);
    try {
      await run({ type: "saveStickerAsset", asset });
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
  async function download() {
    setWorking(true);
    try {
      await document.fonts.ready;
      const output = document.createElement("canvas");
      if (drawSticker(output, design, image))
        throw new Error(
          "문구가 영역을 넘었습니다. 글자 크기나 문구 영역을 조절해 주세요.",
        );
      const blob = await new Promise<Blob>((resolve, reject) =>
        output.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error("이미지를 만들지 못했습니다.")),
          "image/png",
        ),
      );
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
    if (!hit) return;
    setSelected(hit);
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      box: design[hit],
      layer: hit,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
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
          aria-pressed={tab === "library"}
          onClick={() => setTab("library")}
        >
          그림 관리
        </button>
        <button
          type="button"
          aria-pressed={tab === "studio"}
          onClick={() => setTab("studio")}
        >
          스티커 제작{dirty ? " · 미저장" : ""}
        </button>
      </div>
      <div className="sticker-filters">
        {tab === "library" && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => {
                setShowArchived(e.target.checked);
                setFilters([]);
              }}
            />
            보관한 그림
          </label>
        )}
        <input
          aria-label="스티커 그림 검색"
          placeholder="그림 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="sticker-chips" role="group" aria-label="그림 태그 필터">
          <button aria-pressed={!filters.length} onClick={() => setFilters([])}>
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
                  그림 이름
                  <input
                    required
                    maxLength={80}
                    value={asset.name}
                    onChange={(e) =>
                      setAsset({ ...asset, name: e.target.value })
                    }
                  />
                </label>
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
                                name:
                                  a.name || file.name.replace(/\.[^.]+$/, ""),
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
                    aria-label="추가할 태그"
                    value={tag}
                    maxLength={24}
                    onChange={(e) => setTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="button secondary"
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
      {tab === "studio" && (
        <div className="sticker-studio">
          <section className="sticker-preview">
            <canvas
              ref={canvas}
              aria-label="스티커 디자인 미리보기"
              onPointerDown={pointerDown}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || d.id !== e.pointerId) return;
                const r = e.currentTarget.getBoundingClientRect();
                patch({
                  [d.layer]: stickerBox({
                    ...d.box,
                    x: d.box.x + ((e.clientX - d.x) / r.width) * 100,
                    y: d.box.y + ((e.clientY - d.y) / r.height) * 100,
                  }),
                });
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            />
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
            </div>
          </section>
          <section className="sticker-controls">
            <fieldset disabled={working}>
              <label>
                저장한 디자인
                <select
                  aria-label="저장한 디자인"
                  value={
                    state.stickerDesigns?.some((d) => d.id === design.id)
                      ? design.id
                      : ""
                  }
                  onChange={(e) => {
                    const saved = state.stickerDesigns?.find(
                      (d) => d.id === e.target.value,
                    );
                    if (saved && discard()) {
                      setDesign(structuredClone(saved));
                      setDirty(false);
                    }
                  }}
                >
                  <option value="">선택</option>
                  {state.stickerDesigns?.map((d) => (
                    <option value={d.id} key={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="text-button"
                onClick={() => {
                  if (discard()) {
                    setDesign(newStickerDesign(uid()));
                    setDirty(false);
                  }
                }}
              >
                <Plus size={15} />새 디자인
              </button>
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
                      text: order?.sticker || design.text,
                    });
                  }}
                >
                  <option value="">직접 입력</option>
                  {state.orders
                    .filter((o) => o.status !== "cancelled" && o.sticker.trim())
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.date} · {o.customer}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                문구
                <textarea
                  aria-label="문구"
                  rows={4}
                  maxLength={2000}
                  value={design.text}
                  onChange={(e) => patch({ text: e.target.value })}
                />
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
              <label>
                글꼴
                <select
                  aria-label="글꼴"
                  value={design.font}
                  onChange={(e) =>
                    patch({ font: e.target.value as StickerDesign["font"] })
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
                  onChange={(e) => patch({ fontSize: Number(e.target.value) })}
                />
                {design.fontSize}
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={design.bold}
                  onChange={(e) => patch({ bold: e.target.checked })}
                />
                굵게
              </label>
              <label>
                글자 색
                <input
                  type="color"
                  value={design.color}
                  onChange={(e) => patch({ color: e.target.value })}
                />
              </label>
              <label>
                문구 정렬
                <select
                  aria-label="문구 정렬"
                  value={design.align}
                  onChange={(e) =>
                    patch({ align: e.target.value as StickerDesign["align"] })
                  }
                >
                  <option value="left">왼쪽</option>
                  <option value="center">가운데</option>
                  <option value="right">오른쪽</option>
                </select>
              </label>
              <div
                className="sticker-tabs"
                role="group"
                aria-label="배치 조절 대상"
              >
                <button
                  aria-pressed={selected === "imageBox"}
                  onClick={() => setSelected("imageBox")}
                >
                  그림 위치
                </button>
                <button
                  aria-pressed={selected === "textBox"}
                  onClick={() => setSelected("textBox")}
                >
                  문구 위치
                </button>
              </div>
              {(["x", "y", "width", "height"] as const).map((key) => (
                <label key={key}>
                  {
                    {
                      x: "가로 위치",
                      y: "세로 위치",
                      width: "영역 너비",
                      height: "영역 높이",
                    }[key]
                  }
                  <input
                    type="range"
                    min={key === "width" || key === "height" ? 5 : 0}
                    max={100}
                    value={design[selected][key]}
                    onChange={(e) =>
                      patch({
                        [selected]: stickerBox({
                          ...design[selected],
                          [key]: Number(e.target.value),
                        }),
                      })
                    }
                  />
                </label>
              ))}
              {design.assetId && (
                <button
                  className="text-button"
                  onClick={() =>
                    patch({ assetId: undefined, image: undefined })
                  }
                >
                  그림 빼기
                </button>
              )}
            </fieldset>
          </section>
        </div>
      )}
      <div className="sticker-gallery">
        {visible.map((a) => (
          <article
            key={a.id}
            className={`sticker-art-card ${design.assetId === a.id && tab === "studio" ? "selected" : ""}`}
          >
            <button
              className="sticker-art-select"
              disabled={working || !!a.archived}
              aria-label={`${a.name} 그림 선택`}
              onClick={() => {
                patch({ assetId: a.id, image: a.image });
                setTab("studio");
              }}
            >
              <Artwork asset={a} />
              <b>{a.name}</b>
            </button>
            <div className="sticker-chips">
              {a.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            {tab === "library" && (
              <div className="button-row">
                <button
                  className="text-button"
                  disabled={working}
                  onClick={() => {
                    if (asset && !confirm("그림 편집을 닫을까요?")) return;
                    setAsset(structuredClone(a));
                    setTag("");
                  }}
                >
                  <Pencil size={14} />
                  편집
                </button>
                <button
                  className="text-button"
                  disabled={working}
                  onClick={async () => {
                    if (
                      !confirm(
                        a.archived
                          ? `${a.name} 그림을 복원할까요?`
                          : `${a.name} 그림을 보관할까요? 저장한 디자인에서는 유지됩니다.`,
                      )
                    )
                      return;
                    setWorking(true);
                    try {
                      await run({
                        type: "saveStickerAsset",
                        asset: { ...a, archived: !a.archived },
                      });
                    } catch (e) {
                      setNotice((e as Error).message);
                    } finally {
                      setWorking(false);
                    }
                  }}
                >
                  {a.archived ? "복원" : "보관"}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {!visible.length && (
        <p className="sticker-empty">
          {assets.some((a) => !a.archived)
            ? "선택한 조건의 그림이 없습니다."
            : "재사용할 스티커 그림을 등록해 주세요."}
        </p>
      )}
    </div>
  );
}
