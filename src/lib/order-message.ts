import { brand } from "./brand";
import { koreanDate } from "./dates";
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
  const date = koreanDate(order.date).replace(" (", "(");
  const account = [paymentBank.trim(), paymentAccount.trim()]
    .filter(Boolean)
    .join(" ");
  const fulfillment = order.fulfillment
    ? `${fulfillmentLabel(order.fulfillment)}${order.fulfillment === "delivery" ? "로" : "으로"} 준비해 드릴게요.`
    : "수령 방식을 답장으로 알려 주세요.";
  return [
    `안녕하세요, ${brand.name}입니다. ${order.customer}님, ${date} ${time}에 ${contents} 예약해 주셨어요.`,
    fulfillment,
    ...(paymentAccount.trim() ? [`입금 계좌는 ${account}입니다.`] : []),
    "입금하신 후 입금자명을 답장으로 알려 주세요.",
    order.sticker.trim()
      ? `스티커에는 “${order.sticker.trim()}” 문구를 넣어드릴게요.`
      : "스티커가 필요하시면 넣으실 문구도 함께 보내 주세요.",
    ...(order.fulfillment === "quick" || order.fulfillment === "delivery"
      ? [
          address
            ? `${address} 주소로 보내드릴게요.`
            : "받으실 주소를 답장으로 보내 주세요.",
        ]
      : []),
    "감사합니다.",
  ].join("\n");
}

export function smsLink(phone: string, body: string, apple = false) {
  const recipient = phone.replace(/[^\d+]/g, "");
  if (!recipient) return "";
  return `sms:${recipient}${apple ? "&" : "?"}body=${encodeURIComponent(body)}`;
}
