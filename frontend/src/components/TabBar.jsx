// Shared underline-tab bar, styled to look identical to the top nav
// (.tab-bar / .top-nav share the same CSS in index.css). Used for every
// sub-tab bar in the app instead of each page re-implementing its own.
// A tab with badge > 0 gets a red numbered circle (check forms waiting there).
export function TabBar({ tabs, active, onSelect }) {
  return (
    <div className="tab-bar">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          className={active === t.key ? 'active' : ''}
        >
          {t.label}
          {t.badge > 0 && <span className="tab-badge" aria-label={`${t.badge} waiting`}>{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
