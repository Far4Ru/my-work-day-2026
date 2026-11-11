export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateKeyFromTimestamp(timestamp: string): string {
  return dateKey(new Date(timestamp));
}

export function parseDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key: string, amount: number): string {
  const date = parseDate(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

export function formatDate(
  key: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(
    "ru-RU",
    options ?? {
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  ).format(parseDate(key));
}

export function mondayOf(key: string): string {
  const day = parseDate(key).getDay();
  return addDays(key, -(day === 0 ? 6 : day - 1));
}

export function minutesLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} мин`;
  if (remainder === 0) return `${hours} ч`;
  return `${hours} ч ${remainder} мин`;
}
