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
