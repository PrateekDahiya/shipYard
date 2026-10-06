"use client";

import type { Deployment } from "@/lib/api";

export type ProjectTabKey = "overview" | "build" | "environment" | "logs" | "team" | "activity";

const SECTIONS: { key: string; label: string; href: (id: string) => string }[] = [
  { key: "overview", label: "Overview", href: (id) => `/projects/${id}` },
  { key: "deployments", label: "Deployments", href: (id) => `/projects/${id}/deployments` },
  { key: "metrics", label: "Metrics", href: (id) => `/projects/${id}/metrics` },
  { key: "requests", label: "Requests", href: (id) => `/projects/${id}/requests` },
  { key: "domains", label: "Domains", href: (id) => `/projects/${id}/domains` },
  { key: "shell", label: "Shell", href: (id) => `/projects/${id}/shell` },
];

const INNER_TABS: { key: ProjectTabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "build", label: "Build" },
  { key: "environment", label: "Environment" },
  { key: "logs", label: "Logs" },
  { key: "team", label: "Team" },
  { key: "activity", label: "Activity" },
];

function sectionClass(active: boolean) {
  return active
    ? "flex w-full items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-gray-900"
    : "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800";
}

function childClass(active: boolean) {
  return active
    ? "flex w-full items-center gap-2 rounded-md bg-gray-100 py-1.5 pl-8 pr-3 text-left text-[13px] font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100"
    : "flex w-full items-center gap-2 rounded-md py-1.5 pl-8 pr-3 text-left text-[13px] text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-100";
}

export function SectionLayout({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-6">
      <aside className="hidden w-56 shrink-0 self-start lg:block">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">{sidebar}</div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ProjectSideNav({
  id,
  active,
  projectName,
  tab,
  onTabSelect,
  deployments,
  currentLiveId,
  activeDeploymentId,
}: {
  id: string;
  active: string;
  projectName?: string;
  tab?: string;
  onTabSelect?: (t: ProjectTabKey) => void;
  deployments?: Pick<Deployment, "id" | "status" | "branch">[];
  currentLiveId?: number | null;
  activeDeploymentId?: number | null;
}) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Project navigation">
      <a
        href="/projects"
        className="mb-2 inline-flex items-center gap-1 px-3 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        All projects
      </a>
      {projectName && (
        <div className="mb-2 truncate px-3 text-sm font-semibold text-gray-900 dark:text-gray-100" title={projectName}>
          {projectName}
        </div>
      )}
      {SECTIONS.map((s) => {
        const isActive = active === s.key;
        return (
          <div key={s.key}>
            <a href={s.href(id)} className={sectionClass(isActive)}>
              {s.label}
              {s.key === "deployments" && currentLiveId != null && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-green-500" title="Has a live deployment" />
              )}
            </a>
            {s.key === "overview" && isActive && (
              <div className="mt-0.5 flex flex-col gap-0.5">
                {INNER_TABS.map((t) =>
                  onTabSelect ? (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => onTabSelect(t.key)}
                      aria-current={tab === t.key ? "page" : undefined}
                      className={childClass(tab === t.key)}
                    >
                      {t.label}
                    </button>
                  ) : (
                    <a
                      key={t.key}
                      href={`/projects/${id}?tab=${t.key}`}
                      aria-current={tab === t.key ? "page" : undefined}
                      className={childClass(tab === t.key)}
                    >
                      {t.label}
                    </a>
                  )
                )}
              </div>
            )}
            {s.key === "deployments" && isActive && (deployments?.length ?? 0) > 0 && (
              <div className="mt-0.5 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                {deployments!.slice(0, 8).map((d) => {
                  const isCurrent = d.id === currentLiveId;
                  const isOpen = d.id === activeDeploymentId;
                  return (
                    <a
                      key={d.id}
                      href={`/projects/${id}/deployments/${d.id}`}
                      aria-current={isOpen ? "page" : undefined}
                      className={childClass(isOpen)}
                      title={`${d.status} · ${d.branch}`}
                    >
                      <span className="font-mono">#{d.id}</span>
                      <span className="truncate text-gray-400">{d.status}</span>
                      {isCurrent && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" title="Current live" />}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function ProjectLayout({
  id,
  active,
  children,
  projectName,
  tab,
  onTabSelect,
  deployments,
  currentLiveId,
  activeDeploymentId,
}: {
  id: string;
  active: string;
  children: React.ReactNode;
  projectName?: string;
  tab?: string;
  onTabSelect?: (t: ProjectTabKey) => void;
  deployments?: Pick<Deployment, "id" | "status" | "branch">[];
  currentLiveId?: number | null;
  activeDeploymentId?: number | null;
}) {
  return (
    <SectionLayout
      sidebar={
        <ProjectSideNav
          id={id}
          active={active}
          projectName={projectName}
          tab={tab}
          onTabSelect={onTabSelect}
          deployments={deployments}
          currentLiveId={currentLiveId}
          activeDeploymentId={activeDeploymentId}
        />
      }
    >
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800 lg:hidden" aria-label="Project sections">
        {SECTIONS.map((s) => (
          <a
            key={s.key}
            href={s.href(id)}
            aria-current={active === s.key ? "page" : undefined}
            className={
              active === s.key
                ? "whitespace-nowrap border-b-2 border-gray-900 px-3 py-2 text-sm font-medium dark:border-white"
                : "whitespace-nowrap px-3 py-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            }
          >
            {s.label}
          </a>
        ))}
      </div>
      {children}
    </SectionLayout>
  );
}

export default function ProjectNav({ id, active }: { id: string; active: string }) {
  return <ProjectSideNav id={id} active={active} />;
}
