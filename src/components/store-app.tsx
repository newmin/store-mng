"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Box,
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CookingPot,
  Download,
  Flower2,
  LayoutDashboard,
  LogOut,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  StickyNote,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { addDays, koreanDate, today, uid } from "@/lib/dates";
import {
  demand,
  forecast,
  orderPieces,
  recipeIssue,
  requirements,
} from "@/lib/calculations";
import { useStore } from "@/lib/use-store";
import { authFetch, sharedMode, supabase } from "@/lib/client";
import { brand } from "@/lib/brand";
import { Notice } from "./notice";
import { BrandMark, BrandWelcome } from "./store-brand";
import { OrderMessage } from "./order-message";
import { OrderList } from "./order-list";
import { BackToTop } from "./back-to-top";
import { MenuManager } from "./menu-manager";
import type { ProductSection } from "./product-form";
import { ProductionWorkspace } from "./production-workspace";
import { StickerWorkspace, type StickerHeader } from "./sticker-workspace";
import { fulfillmentLabel } from "@/lib/order-message";
import type { Command, Material, Order, Plan, Product, Lot } from "@/lib/types";
import {
  CloseForm,
  CompleteForm,
  MaterialForm,
  OrderForm,
  PaymentAccountForm,
  PlanForm,
  ProductForm,
  SettingsForm,
  StockForm,
} from "./forms";

type View =
  | "home"
  | "orders"
  | "production"
  | "inventory"
  | "closing"
  | "settings"
  | "stickers";
type Modal =
  | { type: "order"; order?: Order }
  | { type: "message"; orderId: string }
  | { type: "product"; product?: Product; section?: ProductSection }
  | { type: "material"; material?: Material; kind: "ingredient" | "supply" }
  | { type: "stock"; material: Material }
  | { type: "plan"; plan?: Plan; initial?: Plan["lines"] }
  | { type: "complete"; plan: Plan }
  | { type: "close"; lot: Lot }
  | { type: "recommend"; lines: Plan["lines"]; questions: string[] }
  | { type: "image"; path: string }
  | { type: "settings" };
const navigation = [
  { id: "home" as const, label: "오늘의 매장", icon: LayoutDashboard },
  { id: "orders" as const, label: "주문 예약장", icon: CalendarDays },
  { id: "production" as const, label: "생산계획", icon: CookingPot },
  { id: "inventory" as const, label: "재료 · 비품", icon: Package },
  { id: "closing" as const, label: "마감 기록", icon: ClipboardList },
  { id: "settings" as const, label: "매장 설정", icon: Settings },
  { id: "stickers" as const, label: "스티커", icon: StickyNote },
];
const number = (n: number) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
function Empty({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Flower2 size={34} />
      <p>{children}</p>
      {action}
    </div>
  );
}
function Pill({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "orange" | "gray" | "red";
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
function ModalShell({
  title,
  children,
  onClose,
  busy,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      aria-labelledby="modal-title"
      className="modal"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button
          disabled={busy}
          className="icon-button"
          onClick={onClose}
          aria-label="닫기"
        >
          <X size={22} />
        </button>
      </div>
      <fieldset disabled={busy} className="modal-body">
        {children}
      </fieldset>
    </dialog>
  );
}
function ReferenceImage({ path }: { path: string }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (path.startsWith("demo:"))
      setUrl(localStorage.getItem(`tteokdam-image:${path}`) || "");
    else
      authFetch(`/api/images?path=${encodeURIComponent(path)}`)
        .then((d) => setUrl(d.url))
        .catch((e) => setError(e.message));
  }, [path]);
  return url ? (
    <img className="reference-image" src={url} alt="주문 스티커 참고 이미지" />
  ) : (
    <p>{error || "이미지 불러오는 중…"}</p>
  );
}

export default function StoreApp() {
  const store = useStore();
  const { state, ready, user, busy, error, setError, run, refresh, version } =
    store;
  const [view, changeView] = useState<View>("home"),
    [date, setDate] = useState(today()),
    [range, setRange] = useState<"day" | "week" | "custom">("day"),
    [customEnd, setCustomEnd] = useState(addDays(today(), 6)),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState("all"),
    [inventoryKind, setInventoryKind] = useState<"ingredient" | "supply">(
      "ingredient",
    ),
    [modal, setModal] = useState<Modal | null>(null),
    [toast, setToast] = useState(""),
    [thinking, setThinking] = useState(false),
    [recovery, setRecovery] = useState(false);
  const todayDate = today();
  const [productSaving, setProductSaving] = useState(false);
  const [stickerEditing, setStickerEditing] = useState(false);
  const [stickerHeader, setStickerHeader] = useState<StickerHeader>({
    title: "스티커",
    back: null,
    busy: false,
  });
  const [stickerOrderId, setStickerOrderId] = useState<string>();
  function setView(next: View) {
    if (
      next !== view &&
      stickerEditing &&
      !confirm("저장하지 않은 스티커 편집을 닫을까요?")
    )
      return;
    if (next !== "stickers") setStickerOrderId(undefined);
    changeView(next);
  }
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);
  const end =
    range === "week" ? addDays(date, 6) : range === "custom" ? customEnd : date;
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    const { data } =
      supabase?.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
      }) || {};
    return () => data?.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!sharedMode || !user || modal || busy || stickerEditing) return;
    const handler = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const id = setInterval(handler, 20000);
    window.addEventListener("focus", handler);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", handler);
    };
  }, [user, modal, busy, refresh, stickerEditing]);
  const open = (m: Modal) => {
    setError("");
    setModal(m);
  };
  async function save(c: Command) {
    try {
      await run(c);
      setModal(
        c.type === "saveOrder" && modal?.type === "order" && !modal.order
          ? { type: "message", orderId: c.order.id }
          : null,
      );
      setToast("저장했습니다.");
    } catch {
      /* keep form and draft visible; the store exposes the error */
    }
  }
  async function action(c: Command) {
    try {
      await run(c);
      setToast("변경사항을 반영했어요.");
    } catch {}
  }
  async function recommend() {
    setThinking(true);
    setError("");
    try {
      if (!sharedMode)
        throw new Error(
          "추가 메뉴 추천을 사용하려면 매장 데이터와 AI 연결이 필요해요.",
        );
      const result = await authFetch("/api/recommend", {
        method: "POST",
        body: JSON.stringify({ date, version }),
      });
      if (result.version !== version)
        throw new Error("주문·재고가 변경됐습니다. 다시 추천받으세요.");
      open({
        type: "recommend",
        lines: result.lines,
        questions: result.questions,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  }
  if (!ready)
    return (
      <div className="loading">
        <Flower2 size={36} />
        <p>불러오는 중…</p>
      </div>
    );
  if (recovery)
    return (
      <Login
        recovery
        done={() => setRecovery(false)}
        error={error}
        setError={setError}
      />
    );
  if (!state) return <Login error={error} setError={setError} />;
  const orders = state.orders
    .filter((o) => o.date >= date && o.date <= end)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const activeOrders = orders.filter((o) => o.status !== "cancelled");
  const filtered = orders.filter(
    (o) =>
      (statusFilter === "all" || o.status === statusFilter) &&
      (!query || `${o.customer} ${o.phone} ${o.sticker}`.includes(query)),
  );
  const req = requirements(state, date);
  const predicted = forecast(
    state,
    date,
    range === "day" ? addDays(date, 6) : end >= date ? end : date,
  );
  const shortage = predicted.filter(
    (m) => m.shortage > 0 || m.stock < m.threshold,
  );
  const plan = state.plans.find(
    (p) => p.date === date && p.status !== "completed",
  );
  const reservedPieces = activeOrders.reduce(
    (s, o) => s + orderPieces(o).reduce((n, l) => n + l.pieces, 0),
    0,
  );
  const productionCount = req.reduce(
    (n, r) => n + r.batches * (r.product.batchYield || 0),
    0,
  );
  const title =
    view === "stickers"
      ? stickerHeader.title
      : navigation.find((n) => n.id === view)!.label;
  const materialName = (id: string) =>
    state.materials.find((m) => m.id === id)?.name || "삭제된 품목";
  const productName = (id: string) =>
    state.products.find((p) => p.id === id)?.name || "미등록 메뉴";
  const newOrderButton = (
    <button
      className="button primary"
      onClick={() => open({ type: "order" })}
      disabled={!state.products.length}
    >
      <Plus size={18} /> 주문 등록
    </button>
  );
  function OrderCard({
    order: o,
    compact = false,
  }: {
    order: Order;
    compact?: boolean;
  }) {
    return (
      <article
        className={`order-card ${o.status === "cancelled" ? "cancelled" : o.status === "picked" ? "picked" : ""}`}
      >
        <div className="order-time">
          <strong>{o.time}</strong>
          <span>
            {o.date === todayDate
              ? "오늘"
              : o.date.slice(5).replace("-", " / ")}
          </span>
          {o.status === "reserved" && (
            <button
              className="icon-button order-edit"
              aria-label={`${o.customer} 주문 수정`}
              title="주문 수정"
              onClick={() => open({ type: "order", order: o })}
            >
              <Pencil size={18} />
            </button>
          )}
        </div>
        <div className="order-content">
          <div className="order-title">
            <h3>{o.customer}</h3>
            {o.status === "cancelled" && <Pill tone="gray">취소</Pill>}
            <span className="channel">{fulfillmentLabel(o.fulfillment)}</span>
          </div>
          <p className="order-items">
            {o.kind === "gift" && (
              <>
                <b>선물세트 {o.boxes}상자</b>
                {" ("}
              </>
            )}
            {o.lines
              .map(
                (l) =>
                  `${productName(l.productId)} ${l.quantity}${l.unit === "box" ? "박스" : "개"}`,
              )
              .join(" · ")}
            {o.kind === "gift" && ")"}
          </p>
          {o.sticker && (
            <p className="sticker-note">
              <span>스티커</span> {o.sticker}
            </p>
          )}
          {!compact && o.phone && (
            <a className="phone" href={`tel:${o.phone}`}>
              {o.phone}
            </a>
          )}
          {o.fulfillment !== "pickup" && o.deliveryAddress && (
            <p className="order-delivery-address">{o.deliveryAddress}</p>
          )}
          {o.status !== "cancelled" && (
            <button
              type="button"
              className="text-button small"
              onClick={() => {
                setStickerOrderId(o.id);
                setView("stickers");
              }}
            >
              <StickyNote size={14} /> 스티커 제작
            </button>
          )}
          {o.status !== "cancelled" && (
            <button
              type="button"
              className="text-button small"
              onClick={() => open({ type: "message", orderId: o.id })}
            >
              예약확인문자
            </button>
          )}
          {o.imagePath && (
            <button
              className="text-button small"
              onClick={() => open({ type: "image", path: o.imagePath! })}
            >
              참고 이미지 보기
            </button>
          )}
        </div>
        <div className="order-actions">
          {o.status !== "cancelled" ? (
            <>
              <label className="pickup-check">
                <input
                  type="checkbox"
                  checked={o.status === "picked"}
                  aria-label={`${o.customer} 주문 수령 완료`}
                  disabled={busy}
                  onChange={(e) =>
                    void action({
                      type: "orderStatus",
                      id: o.id,
                      status: e.target.checked ? "picked" : "reserved",
                    })
                  }
                />
              </label>
              {o.status === "picked" && o.pickedAt && (
                <time className="pickup-time" dateTime={o.pickedAt}>
                  {new Intl.DateTimeFormat("ko-KR", {
                    timeZone: "Asia/Seoul",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(o.pickedAt))}
                </time>
              )}
            </>
          ) : (
            <button
              className="text-button small"
              disabled={busy}
              onClick={() =>
                void action({
                  type: "orderStatus",
                  id: o.id,
                  status: "reserved",
                })
              }
            >
              <Undo2 size={14} /> 되돌리기
            </button>
          )}
        </div>
      </article>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="말랑콩떡 홈">
          <BrandMark />
          <span>
            말랑콩떡<small>함께 쓰는 매장 노트</small>
          </span>
        </a>
        <div className="shop-label">
          <span className="live-dot" /> 말랑콩떡{" "}
          <span className="shop-tag">매장</span>
        </div>
        <nav>
          {navigation.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "nav-item active" : "nav-item"}
              onClick={() => {
                setView(n.id);
                setQuery("");
              }}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.id === "orders" && (
                <span className="nav-count">
                  {
                    state.orders.filter(
                      (o) => o.date === todayDate && o.status === "reserved",
                    ).length
                  }
                </span>
              )}
            </button>
          ))}
        </nav>
        {sharedMode && (
          <div className="sidebar-account">
            <span className="avatar">매</span>
            <div>
              <b>함께 운영 중</b>
              <small>{user}</small>
            </div>
            <button
              className="icon-button"
              aria-label="로그아웃"
              onClick={() => void supabase?.auth.signOut()}
            >
              <LogOut size={17} />
            </button>
          </div>
        )}
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            말랑콩떡 <span>/</span> <b>{title}</b>
          </div>
          <div className="topbar-right">
            {sharedMode && (
              <>
                <span className="sharing">
                  <Users size={15} />
                  매장 공유 모드
                </span>
                <button
                  className="icon-button"
                  aria-label="매장 데이터 새로고침"
                  disabled={busy}
                  onClick={() => void refresh()}
                >
                  <RefreshCw size={18} />
                </button>
              </>
            )}
            <span className="top-avatar">떡</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div
              className={view === "stickers" ? "sticker-page-title" : undefined}
            >
              {view === "stickers" && stickerHeader.back && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${stickerHeader.title} 목록으로 돌아가기`}
                  disabled={stickerHeader.busy}
                  onClick={stickerHeader.back}
                >
                  <ArrowLeft size={22} />
                </button>
              )}
              <h1>
                {title}
                <span className="heading-dot">.</span>
              </h1>
            </div>
            {view === "home" || view === "orders" ? (
              newOrderButton
            ) : view === "settings" ? (
              <button
                className="button primary"
                onClick={() => open({ type: "product" })}
              >
                <Plus size={18} /> 메뉴 등록
              </button>
            ) : null}
          </div>
          {error && !modal && view !== "stickers" && (
            <Notice message={error} onDismiss={() => setError("")} />
          )}
          {view === "inventory" &&
            !error &&
            !toast &&
            !modal &&
            state.products.some(
              (p) =>
                recipeIssue(p, state) &&
                (p.displayTarget > 0 ||
                  state.orders.some(
                    (o) =>
                      o.status !== "cancelled" &&
                      o.date >= date &&
                      o.date <= (range === "day" ? addDays(date, 6) : end) &&
                      o.lines.some((l) => l.productId === p.id),
                  )),
            ) && (
              <Notice
                kind="warning"
                message="생산 기준 미등록 메뉴는 재료 계산에서 제외됩니다. 매장 설정에서 생산량·레시피를 등록해 주세요."
              />
            )}
          {view !== "settings" && view !== "stickers" && (
            <div className="date-toolbar">
              <div className="date-switch">
                <button
                  aria-label="이전 날짜"
                  className="icon-button"
                  onClick={() => setDate(addDays(date, -1))}
                >
                  <ChevronLeft size={18} />
                </button>
                <label className="date-picker">
                  <CalendarDays size={17} />
                  <span>{koreanDate(date)}</span>
                  <input
                    aria-label="조회 날짜"
                    type="date"
                    value={date}
                    onChange={(e) => {
                      if (e.target.value) {
                        setDate(e.target.value);
                        if (customEnd < e.target.value)
                          setCustomEnd(e.target.value);
                      }
                    }}
                  />
                </label>
                <button
                  aria-label="다음 날짜"
                  className="icon-button"
                  onClick={() => setDate(addDays(date, 1))}
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  className="today-button"
                  onClick={() => {
                    setDate(todayDate);
                    setRange("day");
                  }}
                >
                  오늘
                </button>
                <button
                  className="today-button"
                  onClick={() => {
                    setDate(addDays(todayDate, 1));
                    setRange("day");
                  }}
                >
                  내일
                </button>
              </div>
              <div className="segmented">
                {(["day", "week", "custom"] as const).map((r, i) => (
                  <button
                    key={r}
                    className={range === r ? "selected" : ""}
                    onClick={() => {
                      setRange(r);
                      if (r === "custom" && customEnd < date)
                        setCustomEnd(date);
                    }}
                  >
                    {["일간", "7일간", "기간 지정"][i]}
                  </button>
                ))}
              </div>
              {range === "custom" && (
                <label className="range-end">
                  종료일{" "}
                  <input
                    aria-label="종료일"
                    type="date"
                    min={date}
                    max={addDays(date, 365)}
                    value={customEnd}
                    onChange={(e) =>
                      setCustomEnd(
                        e.target.value < date ? date : e.target.value,
                      )
                    }
                  />
                </label>
              )}
            </div>
          )}
          {view === "home" && (
            <>
              <BrandWelcome />
              <section className="metrics">
                <div className="metric">
                  <span className="metric-icon peach">
                    <ShoppingBag size={21} />
                  </span>
                  <span className="metric-label">
                    {range === "day" ? "오늘의" : "기간 내"} 예약 주문
                  </span>
                  <div className="metric-value">
                    {activeOrders.length}
                    <small>건</small>
                  </div>
                  <span className="metric-foot">
                    수령 대기{" "}
                    <b>
                      {
                        activeOrders.filter((o) => o.status === "reserved")
                          .length
                      }
                      건
                    </b>
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-icon sage">
                    <CookingPot size={21} />
                  </span>
                  <span className="metric-label">필요한 예약 수량</span>
                  <div className="metric-value">
                    {number(reservedPieces)}
                    <small>개</small>
                  </div>
                  <span className="metric-foot">
                    떡 종류{" "}
                    <b>
                      {
                        new Set(
                          activeOrders.flatMap((o) =>
                            o.lines.map((l) => l.productId),
                          ),
                        ).size
                      }
                      종
                    </b>
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-icon lavender">
                    <CheckCheck size={21} />
                  </span>
                  <span className="metric-label">수령 완료</span>
                  <div className="metric-value">
                    {activeOrders.filter((o) => o.status === "picked").length}
                    <small>건</small>
                  </div>
                </div>
                <div className="metric">
                  <span className="metric-icon sand">
                    <Package size={21} />
                  </span>
                  <span className="metric-label">확인이 필요한 재료</span>
                  <div className="metric-value">
                    {shortage.length}
                    <small>종</small>
                  </div>
                  <button
                    className="metric-link"
                    onClick={() => setView("inventory")}
                  >
                    향후 7일 재료 확인 <ArrowUpRight size={13} />
                  </button>
                </div>
              </section>
              <div className="dashboard-grid">
                <section className="panel orders-panel">
                  <div className="panel-heading">
                    <h2>
                      예약 주문{" "}
                      <span className="count-badge">{activeOrders.length}</span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => setView("orders")}
                    >
                      전체 보기 <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="panel-subheading">
                    <span>수령 시간순</span>
                  </div>
                  {activeOrders.length ? (
                    <OrderList
                      items={activeOrders.slice(0, 4)}
                      groupDates={date !== end}
                      renderOrder={(order) => (
                        <OrderCard key={order.id} order={order} compact />
                      )}
                    />
                  ) : (
                    <Empty action={newOrderButton}>예약 없음</Empty>
                  )}
                </section>
                <div className="dashboard-side">
                  <section className="production-summary">
                    <div className="panel-heading">
                      <h2>
                        <CookingPot size={19} /> 생산 준비
                      </h2>
                      <span className="mini-label">
                        {date === todayDate ? "TODAY" : date.slice(5)}
                      </span>
                    </div>
                    <div className="summary-pieces">
                      <b>{number(productionCount)}</b>
                      <span>개 추가 생산 필요</span>
                    </div>
                    <div className="product-dots">
                      {req
                        .filter((r) => r.batches)
                        .slice(0, 4)
                        .map((r) => (
                          <span key={r.product.id}>
                            <i style={{ background: r.product.color }} />
                            {r.product.name}{" "}
                            <b>{r.batches * (r.product.batchYield || 0)}</b>
                          </span>
                        ))}
                    </div>
                    <button
                      className="button cream"
                      onClick={() => setView("production")}
                    >
                      생산계획 살펴보기 <ArrowRight size={16} />
                    </button>
                  </section>
                  <section className="panel stock-summary">
                    <div className="panel-heading">
                      <h2>재료 미리 챙기기</h2>
                      <span className="small muted">향후 7일</span>
                    </div>
                    {shortage.length ? (
                      shortage.slice(0, 3).map((m) => (
                        <div className="stock-mini" key={m.id}>
                          <span className="ingredient-dot" />
                          <span>
                            {m.name}
                            <small>
                              현재 {number(m.stock)} {m.unit}
                            </small>
                          </span>
                          <Pill tone="orange">
                            {m.shortage
                              ? `${number(m.shortage)}${m.unit} 부족`
                              : "재고 낮음"}
                          </Pill>
                        </div>
                      ))
                    ) : (
                      <p className="muted">부족 예상 재료 없음</p>
                    )}
                    <button
                      className="text-button"
                      onClick={() => setView("inventory")}
                    >
                      재고 전체 보기 <ArrowRight size={15} />
                    </button>
                  </section>
                </div>
              </div>
            </>
          )}
          {view === "orders" && (
            <>
              <div className="list-controls">
                <div className="filter-tabs">
                  {[
                    ["all", "전체"],
                    ["reserved", "수령 대기"],
                    ["picked", "수령 완료"],
                    ["cancelled", "취소"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={statusFilter === id ? "active" : ""}
                      onClick={() => setStatusFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="search-box">
                  <Search size={17} />
                  <input
                    placeholder="고객명, 연락처, 문구 검색"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="panel">
                <div className="panel-heading">
                  <h2>
                    예약 목록{" "}
                    <span className="count-badge">{filtered.length}</span>
                  </h2>
                  <span className="muted small">
                    {date} {date !== end && `— ${end}`}
                  </span>
                </div>
                {filtered.length ? (
                  <OrderList
                    key={`${date}:${end}:${query}:${statusFilter}`}
                    items={filtered}
                    collapsible
                    renderOrder={(order) => (
                      <OrderCard key={order.id} order={order} />
                    )}
                  />
                ) : (
                  <Empty action={newOrderButton}>
                    조회 조건에 맞는 주문이 없어요.
                  </Empty>
                )}
              </div>
              <section className="panel below">
                <div className="panel-heading">
                  <h2>기간 내 떡별 예약 수량</h2>
                  <span className="muted small">
                    취소 제외 · 세트 구성 포함
                  </span>
                </div>
                <div className="chip-grid">
                  {state.products.map((p) => {
                    const qty = activeOrders
                      .flatMap(orderPieces)
                      .filter((l) => l.productId === p.id)
                      .reduce((s, l) => s + l.pieces, 0);
                    return qty ? (
                      <div className="quantity-chip" key={p.id}>
                        <i style={{ background: p.color }} />
                        {p.name}
                        <b>{number(qty)}개</b>
                      </div>
                    ) : null;
                  })}
                </div>
              </section>
            </>
          )}
          {view === "production" && (
            <ProductionWorkspace
              state={state}
              date={date}
              today={todayDate}
              busy={busy}
              thinking={thinking}
              onEdit={() => open({ type: "plan", plan })}
              onComplete={(plan) => open({ type: "complete", plan })}
              onRecommend={() => void recommend()}
              onProduct={(product) =>
                open({ type: "product", product, section: "production" })
              }
              onInventory={() => {
                setInventoryKind("ingredient");
                setView("inventory");
              }}
              onSettings={() => open({ type: "settings" })}
            />
          )}
          {view === "inventory" && (
            <>
              <div className="section-intro">
                <div className="filter-tabs">
                  {(["ingredient", "supply"] as const).map((k) => (
                    <button
                      key={k}
                      className={inventoryKind === k ? "active" : ""}
                      onClick={() => setInventoryKind(k)}
                    >
                      {k === "ingredient" ? "원재료" : "포장 · 비품"}
                    </button>
                  ))}
                </div>
                <button
                  className="button primary"
                  onClick={() =>
                    open({ type: "material", kind: inventoryKind })
                  }
                >
                  <Plus size={17} />
                  {inventoryKind === "ingredient" ? "재료" : "비품"} 등록
                </button>
              </div>
              {inventoryKind === "ingredient" && (
                <div className="callout">
                  <CalendarDays size={18} />
                  <span>
                    <b>
                      {date} — {range === "day" ? addDays(date, 6) : end}
                    </b>{" "}
                    · 생산 완료 시 재료 차감
                  </span>
                </div>
              )}
              <section className="panel">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>품목</th>
                        <th>현재 재고</th>
                        {inventoryKind === "ingredient" ? (
                          <>
                            <th>예약 필요</th>
                            <th>진열·추가 예상</th>
                            <th>예상 부족 / 첫 부족일</th>
                          </>
                        ) : (
                          <th>부족 기준</th>
                        )}
                        <th>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.materials
                        .filter((m) => m.kind === inventoryKind)
                        .map((m) => {
                          const f = predicted.find((r) => r.id === m.id);
                          return (
                            <tr key={m.id}>
                              <td>
                                <b>{m.name}</b>
                                {m.stock < m.threshold && (
                                  <small className="danger-text">
                                    재고 낮음
                                  </small>
                                )}
                              </td>
                              <td>
                                {number(m.stock)} {m.unit}
                              </td>
                              {inventoryKind === "ingredient" ? (
                                <>
                                  <td>
                                    {number(f?.reservedNeed || 0)} {m.unit}
                                  </td>
                                  <td>
                                    {number(f?.displayNeed || 0)} {m.unit}
                                  </td>
                                  <td>
                                    {f?.shortage ? (
                                      <>
                                        <b className="danger-text">
                                          {number(f.shortage)} {m.unit}
                                        </b>
                                        <small>{f.firstShortage}</small>
                                      </>
                                    ) : (
                                      <Pill>충분</Pill>
                                    )}
                                  </td>
                                </>
                              ) : (
                                <td>
                                  {number(m.threshold)} {m.unit}
                                </td>
                              )}
                              <td>
                                <div className="button-row">
                                  <button
                                    className="button small secondary"
                                    onClick={() =>
                                      open({ type: "stock", material: m })
                                    }
                                  >
                                    입출고
                                  </button>
                                  <button
                                    className="text-button small"
                                    onClick={() =>
                                      open({
                                        type: "material",
                                        material: m,
                                        kind: m.kind,
                                      })
                                    }
                                  >
                                    기준 수정
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                {!state.materials.filter((m) => m.kind === inventoryKind)
                  .length && <Empty>관리할 재료나 비품을 등록해 주세요.</Empty>}
              </section>
              <section className="panel below">
                <div className="panel-heading">
                  <h2>최근 입출고 기록</h2>
                </div>
                <div className="movement-list">
                  {state.movements
                    .slice()
                    .reverse()
                    .slice(0, 20)
                    .map((m) => (
                      <div className="movement" key={m.id}>
                        <span
                          className={
                            m.delta >= 0
                              ? "movement-icon in"
                              : "movement-icon out"
                          }
                        >
                          {m.delta >= 0 ? (
                            <ArrowDownLeft size={18} />
                          ) : (
                            <ArrowUpRight size={18} />
                          )}
                        </span>
                        <div>
                          <b>{materialName(m.materialId)}</b>
                          <small>
                            {m.reason} · {m.actor}
                          </small>
                        </div>
                        <strong className={m.delta >= 0 ? "green-text" : ""}>
                          {m.delta > 0 ? "+" : ""}
                          {number(m.delta)}{" "}
                          {
                            state.materials.find((x) => x.id === m.materialId)
                              ?.unit
                          }
                        </strong>
                        <time>
                          {new Intl.DateTimeFormat("ko-KR", {
                            timeZone: "Asia/Seoul",
                            month: "numeric",
                            day: "numeric",
                          }).format(new Date(m.at))}
                        </time>
                      </div>
                    ))}
                  {!state.movements.length && (
                    <Empty>입출고 내역이 아직 없어요.</Empty>
                  )}
                </div>
              </section>
            </>
          )}
          {view === "closing" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <h2>생산일별 완제품</h2>
                  <span className="muted small">
                    선택일까지 생산된 미소진 품목
                  </span>
                </div>
                {state.lots.filter(
                  (l) => l.date <= end && (l.remaining > 0 || l.date >= date),
                ).length ? (
                  <div className="lot-grid">
                    {state.lots
                      .filter(
                        (l) =>
                          l.date <= end && (l.remaining > 0 || l.date >= date),
                      )
                      .map((l) => {
                        const p = state.products.find(
                          (p) => p.id === l.productId,
                        )!;
                        const closed = state.closings.some(
                          (c) => c.lotId === l.id && c.date >= todayDate,
                        );
                        return (
                          <article className="lot-card" key={l.id}>
                            <div className="order-title">
                              <h3>{p.name}</h3>
                              <Pill
                                tone={
                                  l.expires < todayDate
                                    ? "red"
                                    : p.shelfDays === 1
                                      ? "gray"
                                      : "green"
                                }
                              >
                                {l.expires < todayDate
                                  ? "판매 기간 종료"
                                  : p.shelfDays === 1
                                    ? "당일 판매"
                                    : "여러 날 판매"}
                              </Pill>
                            </div>
                            <p className="muted small">
                              생산 {l.date} · 판매 가능 {l.expires}까지
                            </p>
                            <div className="lot-numbers">
                              <span>
                                생산 <b>{l.produced}개</b>
                              </span>
                              <span>
                                기록상 잔량 <b>{l.remaining}개</b>
                              </span>
                            </div>
                            <button
                              className="button secondary small"
                              disabled={closed || busy}
                              onClick={() => open({ type: "close", lot: l })}
                            >
                              {closed
                                ? "오늘 마감 기록 완료"
                                : "잔량 · 폐기 기록"}
                            </button>
                          </article>
                        );
                      })}
                  </div>
                ) : (
                  <Empty>마감할 생산 기록 없음</Empty>
                )}
              </section>
              <section className="panel below">
                <div className="panel-heading">
                  <h2>마감 내역</h2>
                  <span className="muted small">
                    {date} — {end}
                  </span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>메뉴 / 날짜</th>
                        <th>판매 추정</th>
                        <th>잔량</th>
                        <th>폐기</th>
                        <th>기타 출고</th>
                        <th>기록한 사람</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.closings
                        .filter((c) => c.date >= date && c.date <= end)
                        .map((c) => (
                          <tr key={c.id}>
                            <td>
                              <b>
                                {productName(
                                  state.lots.find((l) => l.id === c.lotId)!
                                    .productId,
                                )}
                              </b>
                              <small>{c.date}</small>
                            </td>
                            <td>{c.soldEstimate}개</td>
                            <td>{c.remaining}개</td>
                            <td>{c.waste}개</td>
                            <td>{c.other}개</td>
                            <td>{c.actor}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="table-note">
                  판매 추정: 예약 수령 포함 · POS 매출과 다를 수 있음
                </p>
              </section>
            </>
          )}
          {view === "settings" && (
            <>
              <button
                className="button secondary"
                onClick={() => setView("stickers")}
              >
                <StickyNote size={18} />
                스티커 제작 · 템플릿 관리
              </button>
              <MenuManager
                state={state}
                onEdit={(product, section) =>
                  open({ type: "product", product, section })
                }
              />
              <div className="settings-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>예약확인문자</h2>
                  </div>
                  <div className="settings-content">
                    <PaymentAccountForm
                      account={state.paymentAccount}
                      bank={state.paymentBank}
                      save={save}
                      busy={busy}
                    />
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      <Sparkles size={18} /> 오늘의 메뉴 추천 기준
                    </h2>
                  </div>
                  <div className="settings-content">
                    <dl>
                      <div>
                        <dt>추가 메뉴</dt>
                        <dd>{state.settings.extraCount}종</dd>
                      </div>
                      <div>
                        <dt>메뉴당 생산량</dt>
                        <dd>{state.settings.extraBatches}생산 단위</dd>
                      </div>
                      <div>
                        <dt>중복 제외</dt>
                        <dd>최근 {state.settings.avoidDays}일</dd>
                      </div>
                    </dl>
                    <button
                      className="button secondary"
                      onClick={() => open({ type: "settings" })}
                    >
                      추천 기준 수정
                    </button>
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      <Users size={18} /> 매장 관리
                    </h2>
                  </div>
                  <div className="settings-content">
                    {sharedMode && (
                      <>
                        <p>{user}</p>
                        <button
                          className="button secondary"
                          onClick={() => setRecovery(true)}
                        >
                          비밀번호 설정 · 변경
                        </button>
                      </>
                    )}
                    <button
                      className="text-button"
                      onClick={() => {
                        const blob = new Blob(
                          [JSON.stringify(state, null, 2)],
                          { type: "application/json" },
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `malrang-ktt-${todayDate}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download size={15} /> 매장 기록 백업 다운로드
                    </button>
                  </div>
                </section>
              </div>
              <section className="panel below">
                <div className="panel-heading">
                  <h2>최근 활동</h2>
                </div>
                <div className="activity-list">
                  {state.audit.slice(0, 12).map((a, i) => (
                    <div key={`${a.at}-${i}`}>
                      <span className="live-dot" />
                      <b>{a.message}</b>
                      <small>
                        {a.actor} ·{" "}
                        {new Date(a.at).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                        })}
                      </small>
                    </div>
                  ))}
                  {!state.audit.length && (
                    <p className="muted">활동 내역 없음</p>
                  )}
                </div>
              </section>
            </>
          )}
          {view === "stickers" && (
            <StickerWorkspace
              key={stickerOrderId || "stickers"}
              initialOrderId={stickerOrderId}
              state={state}
              run={run}
              onEditing={setStickerEditing}
              onHeaderChange={setStickerHeader}
            />
          )}
        </main>
      </div>
      <nav className="mobile-nav">
        {navigation
          .filter((n) => n.id !== "settings" && n.id !== "stickers")
          .map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => setView(n.id)}
            >
              <n.icon size={20} />
              <span>
                {n.id === "home"
                  ? "오늘"
                  : n.id === "orders"
                    ? "예약장"
                    : n.id === "production"
                      ? "생산"
                      : n.id === "inventory"
                        ? "재고"
                        : "마감"}
              </span>
            </button>
          ))}
        <button
          className={view === "settings" ? "active" : ""}
          onClick={() => setView("settings")}
        >
          <Settings size={20} />
          <span>설정</span>
        </button>
      </nav>
      <BackToTop hidden={!!modal} />
      {toast && (
        <Notice
          kind="success"
          message={toast}
          autoDismissMs={4000}
          onDismiss={() => setToast("")}
        />
      )}
      {modal && (
        <ModalShell
          title={
            modal.type === "order"
              ? modal.order
                ? "예약 주문 수정"
                : "새로운 예약 주문"
              : modal.type === "message"
                ? "예약확인문자"
                : modal.type === "product"
                  ? modal.product
                    ? `${modal.product.name} 수정`
                    : "새 메뉴 등록"
                  : modal.type === "material"
                    ? "재고 품목 등록 · 수정"
                    : modal.type === "stock"
                      ? `${modal.material.name} 입출고`
                      : modal.type === "plan"
                        ? "생산계획 작성"
                        : modal.type === "complete"
                          ? "실제 생산 완료"
                          : modal.type === "close"
                            ? "마감 수량 기록"
                            : modal.type === "settings"
                              ? "오늘의 메뉴 추천 기준"
                              : modal.type === "image"
                                ? "스티커 참고 이미지"
                                : "오늘의 메뉴 추천안"
          }
          busy={busy || productSaving}
          onClose={() => setModal(null)}
        >
          {error && <Notice message={error} onDismiss={() => setError("")} />}
          {modal.type === "message" &&
            (() => {
              const order = state.orders.find((o) => o.id === modal.orderId);
              return (
                order && (
                  <OrderMessage
                    key={order.id}
                    order={order}
                    products={state.products}
                    paymentAccount={state.paymentAccount}
                    paymentBank={state.paymentBank}
                  />
                )
              );
            })()}
          {modal.type === "order" && (
            <>
              <OrderForm
                state={state}
                order={modal.order}
                date={date}
                save={save}
              />
              {modal.order?.status === "reserved" && (
                <button
                  type="button"
                  className="text-button danger-text order-cancel"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(`${modal.order!.customer}님의 주문을 취소할까요?`)
                    )
                      void save({
                        type: "orderStatus",
                        id: modal.order!.id,
                        status: "cancelled",
                      });
                  }}
                >
                  주문 취소
                </button>
              )}
            </>
          )}
          {modal.type === "product" && (
            <ProductForm
              key={modal.product?.id || "new"}
              state={state}
              product={modal.product}
              initialSection={modal.section}
              onSavingChange={setProductSaving}
              save={save}
            />
          )}
          {modal.type === "material" && (
            <MaterialForm
              material={modal.material}
              kind={modal.kind}
              save={save}
            />
          )}
          {modal.type === "stock" && (
            <StockForm material={modal.material} save={save} />
          )}
          {modal.type === "plan" && (
            <PlanForm
              state={state}
              date={date}
              plan={modal.plan}
              initial={modal.initial}
              save={save}
            />
          )}
          {modal.type === "complete" && (
            <CompleteForm state={state} plan={modal.plan} save={save} />
          )}
          {modal.type === "close" && (
            <CloseForm
              lot={modal.lot}
              product={state.products.find(
                (p) => p.id === modal.lot.productId,
              )!}
              save={save}
            />
          )}
          {modal.type === "settings" && (
            <SettingsForm state={state} save={save} />
          )}
          {modal.type === "image" && <ReferenceImage path={modal.path} />}
          {modal.type === "recommend" && (
            <div>
              {modal.lines.map((l) => (
                <div className="recommendation" key={l.productId}>
                  <Sparkles size={22} />
                  <div>
                    <h3>
                      {productName(l.productId)} · {l.batches} 생산 단위
                    </h3>
                    <p>{l.reason}</p>
                  </div>
                </div>
              ))}
              {modal.questions.map((q, i) => (
                <p className="callout" key={i}>
                  {q}
                </p>
              ))}
              {!modal.lines.length && (
                <p>
                  조건에 맞는 추가 메뉴가 없습니다. 재고와 추천 기준을 확인해
                  주세요.
                </p>
              )}
              <button
                className="button primary"
                disabled={!modal.lines.length}
                onClick={() =>
                  open({
                    type: "plan",
                    plan,
                    initial: [
                      ...req
                        .filter((r) => r.batches)
                        .map((r) => ({
                          productId: r.product.id,
                          batches: r.batches,
                        })),
                      ...modal.lines,
                    ],
                  })
                }
              >
                추천안을 생산계획에서 검토
              </button>
            </div>
          )}
        </ModalShell>
      )}
    </div>
  );
}
function Login({
  error,
  setError,
  recovery = false,
  done,
}: {
  error: string;
  setError: (s: string) => void;
  recovery?: boolean;
  done?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (!supabase) throw new Error("인증 서버 설정이 필요합니다.");
      const result = recovery
        ? await supabase.auth.updateUser({
            password: String(f.get("password")),
          })
        : await supabase.auth.signInWithPassword({
            email: String(f.get("email")),
            password: String(f.get("password")),
          });
      if (result.error) throw result.error;
      if (recovery) {
        setMessage("비밀번호를 저장했습니다.");
        done?.();
      }
    } catch (e) {
      setError(
        recovery
          ? "비밀번호를 저장하지 못했습니다. 로그인 링크를 다시 요청해 주세요."
          : "이메일과 비밀번호를 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <img
          className="login-brand-logo"
          src={brand.logo}
          alt="말랑콩떡 토끼 로고"
          width={1200}
          height={1200}
        />
        <h1>말랑콩떡 매장 노트</h1>
        <span className="login-flower">✳</span>
      </div>
      <div className="login-form">
        <h2>{recovery ? "비밀번호 설정" : "로그인"}</h2>
        <p className="muted">
          {recovery
            ? "초대받은 계정에서 사용할 비밀번호를 설정하세요."
            : "매장에 초대된 이메일로 로그인해 주세요."}
        </p>
        <form onSubmit={submit}>
          {!recovery && (
            <label>
              이메일{" "}
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                placeholder="your@email.com"
              />
            </label>
          )}
          <label>
            비밀번호{" "}
            <input
              name="password"
              type="password"
              minLength={8}
              autoComplete={recovery ? "new-password" : "current-password"}
              required
              placeholder="8자 이상 입력하세요"
            />
          </label>
          {error && <Notice message={error} onDismiss={() => setError("")} />}
          {message && (
            <Notice
              kind="success"
              message={message}
              onDismiss={() => setMessage("")}
            />
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "처리 중…" : recovery ? "비밀번호 저장" : "로그인"}
            <ArrowRight size={17} />
          </button>
          {!recovery && (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={async () => {
                const email = prompt(
                  "비밀번호 재설정 링크를 받을 이메일을 입력하세요.",
                );
                if (!email || !supabase) return;
                setBusy(true);
                try {
                  const { error } = await supabase.auth.resetPasswordForEmail(
                    email,
                    { redirectTo: window.location.origin },
                  );
                  if (error) throw error;
                  setMessage("등록된 이메일이라면 재설정 링크를 보내드립니다.");
                } catch {
                  setError(
                    "링크 요청에 실패했습니다. 잠시 후 다시 시도하세요.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              비밀번호를 잊으셨나요?
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
