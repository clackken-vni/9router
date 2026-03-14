"use client";

export default function SectionHeader({ title, subtitle, help }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {help ? (
          <span className="group relative inline-flex">
            <span className="material-symbols-outlined text-text-muted text-[18px] cursor-help">help</span>
            <span className="absolute left-6 top-0 z-20 hidden group-hover:block w-72 p-2 rounded-lg border border-border bg-surface text-xs text-text-muted shadow-lg">
              {help}
            </span>
          </span>
        ) : null}
      </div>
      {subtitle ? <p className="text-sm text-text-muted">{subtitle}</p> : null}
    </div>
  );
}
