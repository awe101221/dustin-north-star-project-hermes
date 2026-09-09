// Published regular-session closures; unknown years fail closed. Early closes
// remain sessions because grading waits until the following UTC day.
// https://www.nyse.com/trade/hours-calendars (verified 2026-09-09)
export const MARKET_CALENDAR_VERSION = "us-equities-2026-2028-v1";
export const MARKET_HOLIDAYS = [
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19", "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25",
] as const;
export function validPriceDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function isMarketSession(day: string) {
  return validPriceDate(day) && day >= "2026-01-01" && day <= "2028-12-31" &&
    ![0, 6].includes(new Date(day).getUTCDay()) && !(MARKET_HOLIDAYS as readonly string[]).includes(day);
}
export function previousCompletedSession(today: string) {
  if (!validPriceDate(today)) return undefined;
  for (let offset = 1; offset <= 7; offset++) {
    const day = new Date(Date.parse(today) - offset * 86400000).toISOString().slice(0, 10);
    if (isMarketSession(day)) return day;
  }
  return undefined;
}
