// British date format (dd/mm/yyyy) throughout the app, rather than
// relying on the browser's locale (which would render US-style m/d/yyyy).
export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
