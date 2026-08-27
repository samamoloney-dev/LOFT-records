// Maps a currency item's label (see backend/src/routes/crew.js itemsFor) to
// the CrewDetail tab/sub-tab it lives on, so a "due soon"/overdue row can
// link straight to that specific check instead of just the crew profile
// root - see CrewDetail.jsx's ?top=&sub= query param handling.
const CHECK_SUB_TABS = {
  'Emergency Procedures': 'ep',
  IPC: 'ipc',
  'Proficiency Check': 'pc',
  'Line Check': 'linecheck',
};

export function crewLinkForItem(memberId, label) {
  const subTab = CHECK_SUB_TABS[label];
  if (subTab) return `/crew/${memberId}?top=currency&sub=${subTab}`;
  if (label === 'Medical') return `/crew/${memberId}?top=medical`;
  // Everything else here is a competency (catalog-driven or a one-off ad
  // hoc one) - those live on their own Competencies tab now, not Expiration.
  return `/crew/${memberId}?top=competencies`;
}
