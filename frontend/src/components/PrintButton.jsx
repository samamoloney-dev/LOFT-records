import { useAuth } from '../context/AuthContext';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// HOTC/HOFO/Flight Ops Admin only - opens a print-formatted version of an
// archived record in a new window and triggers the browser's print dialog.
export function PrintButton({ onPrint }) {
  const { user } = useAuth();
  if (!ADMIN_ROLES.includes(user.role)) return null;
  return <button onClick={onPrint}>Print</button>;
}
