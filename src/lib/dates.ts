export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dateRange(start: string, end: string) {
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (days.length >= 366) throw new Error("조회 기간은 최대 366일입니다.");
    days.push(d);
  }
  return days;
}
export function koreanDate(day: string, full = false) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: full ? "long" : "short",
    ...(full ? { year: "numeric" } : {}),
  }).format(new Date(`${day}T00:00:00+09:00`));
}
export function uid() {
  return crypto.randomUUID();
}
