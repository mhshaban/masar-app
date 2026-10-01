// Student averages always display with two decimals (98.50٪, 98.01٪) — one
// format everywhere instead of each screen rounding to whole numbers.
export function formatPct(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : null;
}
