"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type ProjectSection = "overview" | "deployments" | "metrics" | "requests" | "domains" | "shell";

const SECTIONS: { key: ProjectSection; label: string; href: (id: string) => string }[] = [
  { key: "overview", label: "Overview", href: (id) => `/projects/${id}` },
  { key: "deployments", label: "Deployments", href: (id) => `/projects/${id}/deployments` },
  { key: "metrics", label: "Metrics", href: (id) => `/projects/${id}/metrics` },
  { key: "requests", label: "Requests", href: (id) => `/projects/${id}/requests` },
  { key: "domains", label: "Domains", href: (id) => `/projects/${id}/domains` },
  { key: "shell", label: "Shell", href: (id) => `/projects/${id}/shell` },
];

// Shared workspace frame for every service page: breadcrumb, service identity
// and section tabs. The service name is loaded here so pages stay focused on
// their own content.
export function ProjectLayout({ id, active, children }: { id: string; active: ProjectSection; children: React.ReactNode }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getProject(id)
      .then((r) => {
        if (!cancelled) setName(r.project.name);
      })
      .catch(() => {
        if (!cancelled) setName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="w-full min-w-0 space-y-6 overflow-x-hidden">
      <div>
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <Link href="/projects" className="transition hover:text-[var(--foreground)]">
            Services
          </Link>
          <span className="text-[var(--subtle)]">/</span>
          <span className="truncate font-medium text-[var(--foreground)]">{name ?? `Service #${id}`}</span>
        </nav>
        <h1 className="mt-3 truncate text-[28px] font-semibold leading-none tracking-[-0.04em] text-[var(--foreground)] sm:text-[32px]">
          {name ?? "Loading service…"}
        </h1>
      </div>

      <nav aria-label="Service sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-[var(--border)] px-1">
        {SECTIONS.map((section) => {
          const isActive = section.key === active;
          return (
            <Link
              key={section.key}
              href={section.href(id)}
              aria-current={isActive ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-sm font-medium transition ${
                isActive
                  ? "border-[var(--accent)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
