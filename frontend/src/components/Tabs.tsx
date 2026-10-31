export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: number;
}

export default function Tabs<T extends string>({ items, active, onChange, label }: { items: TabItem<T>[]; active: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button key={item.id} role="tab" aria-selected={active === item.id} className={active === item.id ? "active" : ""} onClick={() => onChange(item.id)}>
          {item.label}
          {item.badge ? <span className="tab-badge">{item.badge > 99 ? "99+" : item.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
