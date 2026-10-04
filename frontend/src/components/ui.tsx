const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  RUNNING: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  QUEUED: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  CLONING: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  BUILDING: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  IMAGE_CREATED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  STARTING: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  HEALTH_CHECKING: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  CANCELLED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  STOPPED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
};

const FAILED = "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? (status.endsWith("_FAILED") || status === "DEPLOYMENT_FAILED" ? FAILED : STATUS_STYLES.QUEUED);
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>{status}</span>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5 ${className}`}>{children}</div>;
}

export function PageHeader({ title, sub, actions, back }: { title: string; sub?: string; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back && (
        <a href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          {back.label}
        </a>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {sub && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{sub}</p>}
        </div>
        {actions && <div className="ml-auto flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">{text}</p>;
}

export function ErrorBanner({ message }: { message: string }) {
  return <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{message}</p>;
}

export const btnPrimary = "rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200";
export const btnSecondary = "rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800";
export const inputCls = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800";
