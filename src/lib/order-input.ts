export type TimeFormat = "24" | "12";
export const TIME_FORMAT_KEY = "tteokdam-time-format";
export function displayTime(value: string, format: TimeFormat) {
  if (format === "24") return value;
  const [hour, minute] = value.split(":");
  return `${Number(hour) < 12 ? "오전" : "오후"} ${Number(hour) % 12 || 12}:${minute}`;
}
export function hour24(hour: string, period: string) {
  return String((Number(hour) % 12) + (period === "오후" ? 12 : 0)).padStart(
    2,
    "0",
  );
}
export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const limit = digits.startsWith("050") ? 12 : 11;
  const n = digits.slice(0, limit);
  const prefix = n.startsWith("02") ? 2 : n.startsWith("050") ? 4 : 3;
  if (/^1[568]/.test(n))
    return n.length > 4 ? `${n.slice(0, 4)}-${n.slice(4, 8)}` : n;
  if (n.length <= prefix) return n;
  if (n.length <= prefix + 4) return `${n.slice(0, prefix)}-${n.slice(prefix)}`;
  const middle = n.length > prefix + 7 ? 4 : 3;
  return `${n.slice(0, prefix)}-${n.slice(prefix, prefix + middle)}-${n.slice(prefix + middle)}`;
}
export function validPhone(value: string) {
  if (!value) return true;
  const n = value.replace(/-/g, "");
  return /^(?:02\d{7,8}|0[3-6]\d\d{7,8}|01[016789]\d{7,8}|070\d{8}|050\d{8,9}|1[568]\d{6})$/.test(
    n,
  );
}
