import { addDays, dateRange } from "./dates";

export type CalendarView = "month" | "week";

export function calendarPeriod(date: string, view: CalendarView) {
  const day = new Date(`${date}T00:00:00Z`);
  if (view === "week") {
    const start = addDays(date, -day.getUTCDay());
    return { start, end: addDays(start, 6) };
  }
  const start = `${date.slice(0, 7)}-01`;
  day.setUTCMonth(day.getUTCMonth() + 1, 0);
  return { start, end: day.toISOString().slice(0, 10) };
}

export function calendarDays(date: string, view: CalendarView) {
  const { start, end } = calendarPeriod(date, view);
  if (view === "week") return dateRange(start, end);
  const first = calendarPeriod(start, "week").start;
  const last = calendarPeriod(end, "week").end;
  return dateRange(first, last);
}

export function moveCalendar(date: string, view: CalendarView, step: number) {
  if (view === "week") return addDays(date, step * 7);
  const day = new Date(`${date}T00:00:00Z`);
  const originalDay = day.getUTCDate();
  day.setUTCDate(1);
  day.setUTCMonth(day.getUTCMonth() + step);
  const last = new Date(day);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  day.setUTCDate(Math.min(originalDay, last.getUTCDate()));
  return day.toISOString().slice(0, 10);
}
