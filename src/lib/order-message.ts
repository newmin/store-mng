import { brand } from "./brand";
import type { Order, Product } from "./types";

export function fulfillmentLabel(value: Order["fulfillment"]) {
  if (!value) return "수령 방식 미지정";
  return { pickup: "픽업", quick: "퀵", delivery: "배달" }[value];
}

export function orderMessage(
  order: Order,
  products: Product[],
  paymentAccount = "",
  paymentBank = "",
  paymentAmount?: number,
) {
  const items = order.lines
    .map((line) => {
      const name =
        products.find((p) => p.id === line.productId)?.name || "미등록 메뉴";
      return `${name} ${line.quantity}${line.unit === "box" ? "박스" : "개"}`;
    })
    .join(", ");
  const contents =
    order.kind === "gift"
      ? `선물세트 ${order.boxes}상자 (상자당 ${items})`
      : items;
  const address =
    order.fulfillment && order.fulfillment !== "pickup"
      ? order.deliveryAddress?.trim()
      : "";
  const [hour, minute] = order.time.split(":").map(Number);
  const time = `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}시${minute ? ` ${minute}분` : ""}`;
  const day = new Date(`${order.date}T00:00:00+09:00`);
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "long",
  })
    .format(day)
    .replace(/\s/g, "")
    .replace(/(일)([월화수목금토일]요일)/, "$1 $2");
  const account = [paymentBank.trim(), paymentAccount.trim()]
    .filter(Boolean)
    .join("\n");
  const fulfillment = order.fulfillment
    ? fulfillmentLabel(order.fulfillment)
    : "";
  return [
    `안녕하세요 ${brand.name}입니다`,
    `${date} ${time.replace(/^오전 /, "")} ${fulfillment}`.trim(),
    contents,
    "예약되었습니다",
    ...(order.sticker.trim() ? [`스티커: ${order.sticker.trim()}`] : []),
    ...(address ? [`배송지: ${address}`] : []),
    "",
    ...(account ? [account] : []),
    ...(paymentAmount && paymentAmount > 0
      ? [`${paymentAmount.toLocaleString("ko-KR")}원`]
      : []),
    "입금부탁드립니다",
    "",
    "입금주시면 입금자명 꼭 문자부탁드립니다",
    "1시간이내 미입금시 자동취소되는점",
    "양해부탁드립니다",
    "감사합니다☺️",
  ].join("\n");
}

export function smsLink(phone: string, body: string, apple = false) {
  const recipient = phone.replace(/[^\d+]/g, "");
  if (!recipient) return "";
  return `sms:${recipient}${apple ? "&" : "?"}body=${encodeURIComponent(body)}`;
}
