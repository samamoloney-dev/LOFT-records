import { useAuth } from '../context/AuthContext';

// Same admin gating as PrintButton (see PrintButton.jsx) - this exports the
// same underlying competency data an admin could already print, just in a
// machine-readable form for handing off to another system.
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

export function ExportCsvButton({ onExport, label = 'Export CSV' }) {
  const { user } = useAuth();
  if (!ADMIN_ROLES.includes(user.role)) return null;
  return <button onClick={onExport}>{label}</button>;
}
