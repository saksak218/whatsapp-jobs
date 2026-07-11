const monthMap = new Map<string, number>([
  ["january", 0],
  ["february", 1],
  ["march", 2],
  ["april", 3],
  ["may", 4],
  ["june", 5],
  ["july", 6],
  ["august", 7],
  ["september", 8],
  ["october", 9],
  ["november", 10],
  ["december", 11]
]);

export function parseUkDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;

  const normalized = value.replace(/\s+/g, " ").trim();

  // Handle DD/MM/YYYY or DD-MM-YYYY format
  const slashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(normalized);
  if (slashMatch) {
    const day = Number.parseInt(slashMatch[1] ?? "", 10);
    const month = Number.parseInt(slashMatch[2] ?? "", 10) - 1; // Date constructor expects 0-indexed month
    const year = Number.parseInt(slashMatch[3] ?? "", 10);
    if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
      return new Date(Date.UTC(year, month, day));
    }
  }

  // Handle textual month format (e.g. 11 July 2026)
  const match = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(normalized);
  if (!match) return undefined;

  const day = Number.parseInt(match[1] ?? "", 10);
  const month = monthMap.get((match[2] ?? "").toLowerCase());
  const year = Number.parseInt(match[3] ?? "", 10);

  if (!day || month === undefined || !year) return undefined;

  return new Date(Date.UTC(year, month, day));
}

export function formatDate(value: Date | undefined): string | undefined {
  return value?.toISOString().slice(0, 10);
}
