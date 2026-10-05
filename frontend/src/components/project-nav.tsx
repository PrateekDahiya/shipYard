"use client";

export default function ProjectNav({ id, active }: { id: string; active: string }) {
  const links: [string, string, string][] = [
    ["projects", "Projects", "/projects"],
    ["overview", "Overview", `/projects/${id}`],
    ["deployments", "Deployments", `/projects/${id}/deployments`],
    ["metrics", "Metrics", `/projects/${id}/metrics`],
    ["requests", "Requests", `/projects/${id}/requests`],
    ["domains", "Domains", `/projects/${id}/domains`],
    ["shell", "Shell", `/projects/${id}/shell`],
  ];
  return (
    <nav className="flex flex-col gap-1">
      {links.map(([key, label, href]) => (
        <a
          key={key}
          href={href}
          className={
            active === key
              ? "rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-gray-900"
              : "rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          }
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

export function ProjectLayout({ id, active, children }: { id: string; active: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-6">
      <aside className="hidden w-48 shrink-0 self-start lg:block">
        <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
          <ProjectNav id={id} active={active} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
