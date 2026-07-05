// Shared underline-tab bar, styled to look identical to the top nav
// (.tab-bar / .top-nav share the same CSS in index.css). Used for every
// sub-tab bar in the app instead of each page re-implementing its own.
export function TabBar({ tabs, active, onSelect }) {
  return (
    <div className="tab-bar">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          className={active === t.key ? 'active' : ''}
        >{t.label}</button>
      ))}
    </div>
  );
}
