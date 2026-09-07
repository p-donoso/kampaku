"use client";

export function DetailTabNav<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="shrink-0 border-b border-zinc-800 px-6">
      <div className="flex gap-6 overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`shrink-0 border-b-2 py-3 text-sm transition-colors ${
              active === item.id
                ? "border-amber-400 text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-xs">{item.count}</span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
