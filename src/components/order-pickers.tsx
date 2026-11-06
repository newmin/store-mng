"use client";

import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  Clock3,
  Instagram,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Package,
  Phone,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import type { Product } from "@/lib/types";
import { findMenuPhoto, menuBoard, menuCategories } from "@/lib/menu-catalog";

function PickerDialog({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`order-picker-dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="picker-handle" aria-hidden="true" />
      <div className="picker-heading">
        <div>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={`${title} 닫기`}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const minutes = ["00", "10", "20", "30", "40", "50"];
const rowHeight = 44;
function Wheel({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  // Center the saved selection only on mount. Subsequent touch momentum must
  // remain native instead of being interrupted by a controlled scroll effect.
  useEffect(() => {
    if (ref.current)
      ref.current.scrollTop = Math.max(0, options.indexOf(value)) * rowHeight;
  }, []);
  function select(index: number, smooth = false) {
    const i = Math.max(0, Math.min(options.length - 1, index));
    onChange(options[i]);
    ref.current?.scrollTo({
      top: i * rowHeight,
      behavior: smooth ? "smooth" : "instant",
    });
  }
  return (
    <div className="wheel-column">
      <span className="wheel-label">{label}</span>
      <div className="wheel-window">
        <div className="wheel-highlight" aria-hidden="true" />
        <div
          ref={ref}
          className="time-wheel"
          role="listbox"
          aria-label={label}
          tabIndex={0}
          aria-activedescendant={`${id}-${value}`}
          onKeyDown={(e) => {
            const i = options.indexOf(value);
            const next =
              e.key === "ArrowDown"
                ? i + 1
                : e.key === "ArrowUp"
                  ? i - 1
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? options.length - 1
                      : null;
            if (next !== null) {
              e.preventDefault();
              select(next);
            }
          }}
          onScroll={(e) => {
            const i = Math.max(
              0,
              Math.min(
                options.length - 1,
                Math.round(e.currentTarget.scrollTop / rowHeight),
              ),
            );
            if (options[i] !== value) onChange(options[i]);
          }}
        >
          {options.map((option, i) => (
            <div
              key={option}
              id={`${id}-${option}`}
              role="option"
              aria-selected={value === option}
              className={`wheel-option ${value === option ? "chosen" : ""}`}
              onClick={() => select(i, true)}
            >
              {option}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="time-picker-field">
      <span className="field-label">수령 시간</span>
      <input type="hidden" name="time" value={value} />
      <button
        type="button"
        className="time-picker-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`수령 시간 ${value}, 시간 선택`}
      >
        <Clock3 size={18} />
        <b>{value}</b>
        <span>시간 선택</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <TimeDialog
          value={value}
          onClose={() => setOpen(false)}
          onDone={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
function TimeDialog({
  value,
  onClose,
  onDone,
}: {
  value: string;
  onClose: () => void;
  onDone: (v: string) => void;
}) {
  const [hour, setHour] = useState(value.split(":")[0]);
  const [minute, setMinute] = useState(value.split(":")[1]);
  // Preserve pre-existing reservations such as 10:35 without silent rounding.
  const options = minutes.includes(value.split(":")[1])
    ? minutes
    : [...minutes, value.split(":")[1]].sort();
  return (
    <PickerDialog
      title="수령 시간 선택"
      className="time-dialog"
      onClose={onClose}
    >
      <p className="picker-description">24시간 기준 · 10분 단위</p>
      <div className="wheel-pair">
        <Wheel label="시" options={hours} value={hour} onChange={setHour} />
        <span className="wheel-colon" aria-hidden="true">
          :
        </span>
        <Wheel
          label="분"
          options={options}
          value={minute}
          onChange={setMinute}
        />
      </div>
      <div className="time-picker-footer">
        <span>
          선택한 시간{" "}
          <b>
            {hour}:{minute}
          </b>
        </span>
        <button
          type="button"
          className="button primary"
          onClick={() => onDone(`${hour}:${minute}`)}
        >
          이 시간으로 선택 <Check size={17} />
        </button>
      </div>
    </PickerDialog>
  );
}

const channels = [
  { name: "카카오톡", icon: MessageCircle, color: "#f4d73f", key: "kakao" },
  { name: "전화", icon: Phone, color: "#86a48c", key: "phone" },
  { name: "문자", icon: MessageSquare, color: "#88a4c9", key: "sms" },
  { name: "네이버 톡톡", icon: MessageCircle, color: "#42bb75", key: "naver" },
  { name: "인스타그램", icon: Instagram, color: "#d982a1", key: "instagram" },
  { name: "매장", icon: ShoppingBag, color: "#c6a87d", key: "shop" },
  { name: "기타", icon: MoreHorizontal, color: "#a1aaa0", key: "other" },
];
export function ChannelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const choices = channels.some((c) => c.name === value)
    ? channels
    : [
        ...channels,
        { name: value, icon: MoreHorizontal, color: "#a1aaa0", key: "custom" },
      ];
  return (
    <fieldset className="channel-picker">
      <legend className="field-label">주문 채널</legend>
      <div className="channel-options">
        {choices.map((c) => (
          <label
            className={`channel-choice ${value === c.name ? "is-selected" : ""}`}
            key={c.name}
            style={{ "--channel-color": c.color } as React.CSSProperties}
          >
            <input
              className="visually-hidden"
              type="radio"
              name="channel"
              value={c.name}
              checked={value === c.name}
              onChange={() => onChange(c.name)}
            />
            <span className={`channel-symbol ${c.key}`} aria-hidden="true">
              {c.key === "naver" ? (
                <b>N</b>
              ) : (
                <c.icon size={23} strokeWidth={1.8} />
              )}
            </span>
            <span>{c.name === "네이버 톡톡" ? "네이버 톡톡" : c.name}</span>
            {value === c.name && (
              <Check className="channel-check" size={12} aria-hidden="true" />
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function OrderKindPicker({
  value,
  onChange,
}: {
  value: "single" | "gift";
  onChange: (v: "single" | "gift") => void;
}) {
  return (
    <fieldset className="order-kind-picker">
      <legend className="field-label">주문 형태</legend>
      <div className="order-kind-options">
        {(
          [
            { value: "single", name: "단품 주문", icon: ShoppingBag },
            { value: "gift", name: "선물세트", icon: Package },
          ] as const
        ).map((c) => (
          <label
            key={c.value}
            className={value === c.value ? "is-selected" : ""}
          >
            <input
              className="visually-hidden"
              type="radio"
              name="kind"
              value={c.value}
              checked={value === c.value}
              onChange={() => onChange(c.value)}
            />
            <c.icon size={17} aria-hidden="true" />
            {c.name}
            {value === c.value && <Check size={14} aria-hidden="true" />}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function RiceThumbnail({ product }: { product: Product }) {
  const photo = findMenuPhoto(product.image);
  const round = /꿀떡|경단|송편/.test(product.name);
  if (photo) return <CatalogThumbnail image={product.image} />;
  return (
    <span
      className={`menu-thumbnail ${round ? "round-rice" : ""}`}
      style={{ "--rice-color": product.color } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="thumbnail-plate">
        <i />
        <i />
        <i />
        <i />
      </span>
      <LeafDetail />
    </span>
  );
}
export function CatalogThumbnail({ image }: { image?: string }) {
  const photo = findMenuPhoto(image);
  if (!photo) return null;
  const [x, y, width, height] = photo.rect;
  return (
    <span
      className="menu-thumbnail has-photo catalog-thumbnail"
      aria-hidden="true"
      data-menu-photo={photo.id}
      style={{
        backgroundImage: `url("${menuBoard.src}")`,
        backgroundSize: `${(menuBoard.width / width) * 100}% ${(menuBoard.height / height) * 100}%`,
        backgroundPosition: `${(x / (menuBoard.width - width)) * 100}% ${(y / (menuBoard.height - height)) * 100}%`,
      }}
    />
  );
}
function LeafDetail() {
  return (
    <svg
      className="thumbnail-leaf"
      width="28"
      height="29"
      viewBox="0 0 28 29"
      aria-hidden="true"
    >
      <path d="M6 25C8 13 15 5 24 3c0 12-7 20-18 22Z" fill="#b1c4a0" />
      <path d="m6 25 12-15" stroke="#91aa7e" strokeWidth="1.2" />
    </svg>
  );
}
export function MenuPicker({
  products,
  selectedIds,
  onSelect,
  onClose,
}: {
  products: Product[];
  selectedIds: string[];
  onSelect: (p: Product) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | keyof typeof menuCategories>(
    "all",
  );
  const visible = products.filter(
    (p) =>
      p.active &&
      p.name.includes(query.trim()) &&
      (category === "all" || (p.category || "general") === category),
  );
  return (
    <PickerDialog title="어떤 떡을 담을까요?" onClose={onClose}>
      <div className="menu-category-tabs" role="group" aria-label="떡 분류">
        {(["all", "general", "seolgi", "oven"] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c === "all" ? "전체" : menuCategories[c]}
            <span>
              {
                products.filter(
                  (p) =>
                    p.active &&
                    (c === "all" || (p.category || "general") === c),
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      <label className="menu-picker-search">
        <Search size={17} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="떡 이름으로 찾아보기"
          aria-label="떡 이름 검색"
        />
      </label>
      <div className="menu-picker-grid">
        {visible.map((p) => (
          <button
            type="button"
            key={p.id}
            className="menu-picker-card"
            onClick={() => onSelect(p)}
            aria-label={`${p.name} 선택`}
          >
            <RiceThumbnail product={p} />
            <span className="menu-picker-name">{p.name}</span>
            <span className="menu-picker-meta">1박스 {p.boxSize}개</span>
            {p.boxPrice && (
              <span className="menu-picker-price">
                {p.boxPrice.toLocaleString("ko-KR")}원 / 박스
              </span>
            )}
            {selectedIds.includes(p.id) && (
              <span className="menu-picked-label">
                <Check size={12} /> 담긴 메뉴
              </span>
            )}
          </button>
        ))}
      </div>
      {!visible.length && (
        <p className="menu-picker-empty">
          {products.some((p) => p.active)
            ? "검색 결과 없음"
            : "매장 설정에서 판매할 메뉴를 먼저 등록해 주세요."}
        </p>
      )}
    </PickerDialog>
  );
}
