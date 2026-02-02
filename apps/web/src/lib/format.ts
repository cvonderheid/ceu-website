import { format, parseISO } from "date-fns";

export function formatDate(dateString: string) {
  return format(parseISO(dateString), "MMM d, yyyy");
}

export function formatRange(start: string, end: string) {
  return `${format(parseISO(start), "MMM d")} - ${format(parseISO(end), "MMM d, yyyy")}`;
}

export function formatHours(value: string | number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
}
