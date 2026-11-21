// Calendar dates for the operator (Perth, no daylight saving), as YYYY-MM-DD.
//
// Two traps this avoids, both caused by date.toISOString() being in UTC while
// the people using the app are 8 hours ahead:
//  - "today": before 8am Perth the UTC day is still yesterday, so a default or a
//    "latest allowed" date of toISOString().slice(0, 10) was a day behind.
//  - a date read from an Excel cell: the spreadsheet library returns local
//    midnight, which toISOString() turns into the previous day (5 March read as
//    4 March) - the calendar day has to be read from the local parts instead.
const OPERATOR_TIMEZONE = 'Australia/Perth';

export function perthToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: OPERATOR_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Turns whatever a spreadsheet cell holds into YYYY-MM-DD: a real date cell (a
// Date), an ISO or Australian day/month/year text date ("05/03/2026" is 5 March,
// never 3 May), or blank (undefined). Anything unreadable is passed through
// as typed, so the server can reject it and the row is reported rather than
// silently changed.
export function normalizeImportedDate(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : localIsoDate(v);
  const s = String(v).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const au = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (au) {
    const year = au[3].length === 2 ? `20${au[3]}` : au[3];
    return `${year}-${au[2].padStart(2, '0')}-${au[1].padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? s : localIsoDate(parsed);
}

// The calendar day of a Date as it reads on the wall (local parts), YYYY-MM-DD.
export function localIsoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
