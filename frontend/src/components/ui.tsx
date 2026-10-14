const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "bg-[var(--success-subtle)] text-[var(--success)]",
  RUNNING: "bg-[var(--accent-subtle)] text-[var(--accent-strong)]",
  QUEUED: "bg-[var(--surface-subtle)] text-[var(--muted)]",
  CLONING: "bg-[var(--accent-subtle)] text-[var(--accent-strong)]",
  BUILDING: "bg-[var(--accent-subtle)] text-[var(--accent-strong)]",
  IMAGE_CREATED: "bg-[var(--accent-subtle)] text-[var(--accent-strong)]",
  STARTING: "bg-[var(--accent-subtle)] text-[var(--accent-strong)]",
  HEALTH_CHECKING: "bg-[var(--accent-subtle)] text-[var(--accent-strong)]",
  CANCELLED: "bg-[var(--warning-subtle)] text-[var(--warning)]",
  STOPPED: "bg-[var(--warning-subtle)] text-[var(--warning)]",
};

const FAILED = "bg-[var(--danger-subtle)] text-[var(--danger)]";

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? (status.endsWith("_FAILED") || status === "DEPLOYMENT_FAILED" ? FAILED : STATUS_STYLES.QUEUED);
  return <span className={`inline-flex items-center gap-1.5 border border-current/10 px-2 py-0.5 text-[11px] font-medium ${style}`}><span className="h-1.5 w-1.5 bg-current" />{status.replace(/_/g, " ")}</span>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const padded = !className.includes("overflow-hidden") && !className.includes("flex flex-col");
  return <div className={`min-w-0 max-w-full border border-[var(--border)] bg-[var(--surface)] ${padded ? "p-4 sm:p-5" : ""} shadow-[0_1px_2px_rgb(16_24_40/0.04)] ${className}`}>{children}</div>;
}

export function PageHeader({ title, sub, actions, back }: { title: string; sub?: string; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && <a href={back.href} className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"><span aria-hidden="true">←</span>{back.label}</a>}
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">{title}</h1>{sub && <p className="mt-1 max-w-prose text-sm text-[var(--muted)]">{sub}</p>}</div>
        {actions && <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">{actions}</div>}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">{text}</p>;
}

export function ErrorBanner({ message }: { message: string }) {
  return <p className="mb-4 border border-[var(--danger)]/25 bg-[var(--danger-subtle)] px-3 py-2 text-sm text-[var(--danger)]">{message}</p>;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div className="flex min-h-32 items-center justify-center border border-dashed border-[var(--border-strong)] text-sm text-[var(--muted)]"><span className="mr-2 h-3 w-3 animate-spin border-2 border-[var(--accent)] border-t-transparent" />{label}</div>;
}

export function Button({ children, variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const variants = {
    primary: "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]",
    secondary: "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-subtle)]",
    ghost: "text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]",
    danger: "border border-[var(--danger)]/30 bg-[var(--danger-subtle)] text-[var(--danger)] hover:border-[var(--danger)]/50",
  };
  return <button className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

export function Tabs<T extends string>({ tabs, active, onChange, className = "" }: { tabs: { key: T; label: string; count?: number }[]; active: T; onChange: (key: T) => void; className?: string }) {
  return <div className={`flex gap-1 overflow-x-auto border-b border-[var(--border)] ${className}`} role="tablist">
    {tabs.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} onClick={() => onChange(tab.key)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${active === tab.key ? "border-[var(--accent)] text-[var(--foreground)]" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}>
      {tab.label}{tab.count !== undefined && <span className="ml-1.5 text-xs text-[var(--subtle)]">{tab.count}</span>}
    </button>)}
  </div>;
}

export function HealthBadge({ state }: { state?: string | null }) {
  const healthy = state === "UP" || state === "RUNNING";
  const failed = state === "DOWN" || state === "UNHEALTHY";
  return <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${healthy ? "text-[var(--success)]" : failed ? "text-[var(--danger)]" : "text-[var(--warning)]"}`}><span className={`h-1.5 w-1.5 ${healthy ? "bg-[var(--success)]" : failed ? "bg-[var(--danger)]" : "bg-[var(--warning)]"}`} />{state || "CHECKING"}</span>;
}

export function LiveLink({ href }: { href?: string | null }) {
  if (!href) return null;
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center border border-[var(--accent)]/40 px-2.5 py-1 text-[11px] font-medium text-[var(--accent-strong)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]">Open live ↗</a>;
}

export const btnPrimary = "inline-flex shrink-0 items-center justify-center gap-2 bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondary = "inline-flex shrink-0 items-center justify-center gap-2 border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-subtle)]";
export const inputCls = "box-border min-w-0 max-w-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm outline-none transition placeholder:text-[var(--subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 dark:[color-scheme:dark]";
