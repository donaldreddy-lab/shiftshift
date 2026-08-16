export const STATUS_OPTIONS = [
  { value: "covered", label: "Covered" },
  { value: "self-managed", label: "Self-managed" },
  { value: "unassigned", label: "Needs cover" },
  { value: "flagged", label: "Flagged" },
];

export const PEACH = "#fcebd8";
export const HEADER_BG = "#d9d9d9";
export const SUBHEADER_BG = "#f2f2f2";
export const GRID = "#595959";
export const BREAK_BG = ["#dbeafe", "#dcfce7", "#ede9fe"];

export function fmt(min) {
  let m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

export function timeToMinutes(t) {
  const [h, m] = String(t || "").split(":").map((x) => parseInt(x, 10));
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}