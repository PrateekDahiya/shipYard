"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api, type Project } from "@/lib/api";
import { Card, Empty, ErrorBanner, HealthBadge, LiveLink, StatusBadge, btnPrimary, btnSecondary, inputCls } from "@/components/ui";
import { currentLiveUrl, isCurrentLiveDeployment, relativeTime } from "@/lib/deployment";
import { usePolling } from "@/lib/use-polling";
import { useProjectEvents } from "@/lib/use-project-events";

type Overview = Awaited<ReturnType<typeof api.overview>>;
type FleetRow = Project & { latest: Overview["projects"][number]["latest"] };
type Filter = "all" | "live" | "attention" | "idle";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "attention", label: "Attention" },
  { key: "idle", label: "Not deployed" },
];

function needsAttention(row: FleetRow) {
  return !!row.latest && (row.latest.status.includes("FAIL") || row.latest.public_health_state === "DOWN");
}

export default function Fleet() {
  const [rows, setRows] = useState<FleetRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [renaming, setRenaming] = useState<FleetRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  async function load() {
    try {
      const overview = await api.overview();
      setRows(overview.projects);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    } finally {
      setLoaded(true);
    }
  }

  useProjectEvents(rows.map((row) => String(row.id)), load);
  usePolling(load, 30000);

  async function saveRename(event: React.FormEvent) {
    event.preventDefault();
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name || name === renaming.name) {
      setRenaming(null);
      return;
    }
    setRenameSaving(true);
    try {
      await api.patchProject(String(renaming.id), { name });
      setRenaming(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    } finally {
      setRenameSaving(false);
    }
  }

  const counts = useMemo(
    () => ({
      all: rows.length,
      live: rows.filter((row) => isCurrentLiveDeployment(row.latest ?? { status: "", instance_state: null })).length,
      attention: rows.filter(needsAttention).length,
      idle: rows.filter((row) => !row.latest).length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !q || row.name.toLowerCase().includes(q) || (row.repository_url || "").toLowerCase().includes(q) || (row.branch || "").toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "live" && isCurrentLiveDeployment(row.latest ?? { status: "", instance_state: null })) ||
        (filter === "attention" && needsAttention(row)) ||
        (filter === "idle" && !row.latest);
      return matchesQuery && matchesFilter;
    });
  }, [rows, query, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Workspace / service register</p>
          <h1 className="text-[30px] font-semibold leading-none tracking-[-0.04em] text-[var(--foreground)] sm:text-[36px]">
            Services
          </h1>
          <p className="mt-2 text-xs text-[#788581]">{counts.all} registered · {counts.live} live · {counts.attention} need attention</p>
        </div>
        <Link href="/projects/new" className={`${btnPrimary} w-full sm:w-auto`}>
          ＋ New service
        </Link>
      </div>

      {error && <ErrorBanner message={error} />}

      <Card className="!p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 w-full flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[#99a5a0]">⌕</span>
            <input
              className={`${inputCls} w-full pl-8`}
              placeholder="Filter by name, repository, or branch"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Filter services"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Status filter">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                aria-pressed={filter === item.key}
                className={`whitespace-nowrap border px-3 py-1.5 text-xs font-medium transition ${
                  filter === item.key
                    ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-subtle)]"
                }`}
              >
                {item.label}
                <span className="ml-1.5 font-mono text-[10px] opacity-60">{counts[item.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {!loaded ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-16 animate-pulse rounded-2xl bg-[#e5e9e4] dark:bg-white/[0.04]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center">
          {rows.length === 0 ? (
            <>
              <Empty text="No services registered yet." />
              <Link href="/projects/new" className={`${btnPrimary} mt-2 inline-flex`}>
                Commission your first service
              </Link>
            </>
          ) : (
            <Empty text={query ? `No services match "${query}".` : "No services in this view."} />
          )}
        </Card>
      ) : (
        <>
          <Card className="hidden !p-0 md:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#e4e8e3] text-[8px] font-bold uppercase tracking-[0.16em] text-[#99a5a0] dark:border-white/10">
                <tr>
                  <th className="px-5 py-3 font-bold">Service</th>
                  <th className="px-3 py-3 font-bold">Runtime</th>
                  <th className="px-3 py-3 font-bold">Latest deploy</th>
                  <th className="px-3 py-3 font-bold">Public signal</th>
                  <th className="px-3 py-3 font-bold">Live site</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0ec] dark:divide-white/[0.06]">
                {visible.map((row) => (
                  <tr key={row.id} className="group transition hover:bg-[#f8f9f6] dark:hover:bg-white/[0.025]">
                    <td className="px-5 py-3.5">
                      <Link href={`/projects/${row.id}`} className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e5ece7] font-mono text-xs font-bold text-[#526b66] dark:bg-white/[0.07] dark:text-[#b8cdc4]">
                          {row.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-[#172630] dark:text-gray-100">{row.name}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-[#929e99]">{row.repository_url || "Repository not connected"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3.5 text-[#697a7b]">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 bg-[var(--accent)]" />
                        {row.deploy_type || "server"}
                        <span className="font-mono text-[#a1aca7]">· {row.branch || "main"}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      {row.latest ? (
                        <span className="flex items-center gap-2">
                          <StatusBadge status={row.latest.status} />
                          <span className="text-[10px] text-[#9aa5a1]">{relativeTime(row.latest.created_at)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#9aa5a1]">No deployment yet</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      {row.latest?.public_url ? (
                        <HealthBadge state={row.latest.public_health_state} />
                      ) : (
                        <span className="text-[10px] text-[#9aa5a1]">Private · no public URL</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5"><LiveLink href={currentLiveUrl(row.latest)} /></td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" className={`${btnSecondary} !px-2.5 !py-1 !text-[11px]`} onClick={() => { setRenaming(row); setRenameValue(row.name); }}>
                          Rename
                        </button>
                        <Link href={`/projects/${row.id}`} className={`${btnSecondary} !px-2.5 !py-1 !text-[11px]`}>
                          Open ↗
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="grid grid-cols-1 gap-3 md:hidden">
            {visible.map((row) => (
              <Card key={row.id} className="!p-4">
                <Link href={`/projects/${row.id}`} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e5ece7] font-mono text-xs font-bold text-[#526b66] dark:bg-white/[0.07]">
                    {row.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{row.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-[#929e99]">{row.repository_url || "Repository not connected"}</span>
                  </span>
                </Link>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[#697a7b]">
                  {row.latest ? <StatusBadge status={row.latest.status} /> : <span>No deployment yet</span>}
                   {row.latest && <span className="text-[#9aa5a1]">{relativeTime(row.latest.created_at)}</span>}
                   {row.latest?.public_url && <HealthBadge state={row.latest.public_health_state} />}
                   <LiveLink href={currentLiveUrl(row.latest)} />
                </div>
                <div className="mt-3 flex justify-end gap-2 border-t border-[#edf0ec] pt-3 dark:border-white/[0.06]">
                  <button type="button" className={`${btnSecondary} !px-2.5 !py-1 !text-[11px]`} onClick={() => { setRenaming(row); setRenameValue(row.name); }}>
                    Rename
                  </button>
                  <Link href={`/projects/${row.id}`} className={`${btnSecondary} !px-2.5 !py-1 !text-[11px]`}>
                    Open ↗
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {renaming && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[#14232b]/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Rename service"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRenaming(null);
          }}
        >
          <form onSubmit={saveRename} className="w-full max-w-md rounded-2xl border border-[#dce2df] bg-[#f8f9f6] p-6 shadow-2xl dark:border-white/10 dark:bg-[#18272f]">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#899692]">Rename service</p>
            <h2 className="mt-1 text-lg font-semibold">{renaming.name}</h2>
            <p className="mt-1 text-xs text-[#788581]">URLs and deployments keep working after a rename.</p>
            <input
              className={`${inputCls} mt-4 w-full font-mono`}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              required
              autoFocus
              maxLength={100}
              placeholder="my-api"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setRenaming(null)} disabled={renameSaving}>
                Cancel
              </button>
              <button type="submit" className={btnPrimary} disabled={renameSaving || !renameValue.trim()}>
                {renameSaving ? "Saving…" : "Save name"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
