"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, PageHeader, Empty, ErrorBanner, btnPrimary, inputCls } from "@/components/ui";
import { ProjectLayout } from "@/components/project-nav";

type Req = { method: string; path: string; status_code: number; latency_ms: number; created_at: string };

function methodStyle(m: string) {
  if (m === "GET") return "text-blue-600 dark:text-blue-400";
  if (m === "POST") return "text-green-600 dark:text-green-400";
  if (m === "DELETE") return "text-red-600 dark:text-red-400";
  return "text-gray-600 dark:text-gray-300";
}

function statusStyle(s: number) {
  if (s >= 500) return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  if (s >= 400) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
}

export default function Requests({ params }: { params: { id: string } }) {
  const [rows, setRows] = useState<Req[]>([]);
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.projectRequests(params.id, {
        ...(method ? { method } : {}),
        ...(status ? { status } : {}),
        ...(pathFilter ? { path: pathFilter } : {}),
      });
      setRows(r.requests);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ProjectLayout id={params.id} active="requests">
    <div>
      <PageHeader
        title="Requests"
        sub="Metadata only — no bodies, no query strings."
        back={{ href: `/projects/${params.id}`, label: "Back to project" }}
      />
      {error && <ErrorBanner message={error} />}
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); setOpen(null); load(); }} className="flex flex-wrap gap-2">
          <input className={`${inputCls} w-32`} placeholder="method" value={method} onChange={(e) => setMethod(e.target.value.toUpperCase())} />
          <input className={`${inputCls} w-32`} placeholder="status" value={status} onChange={(e) => setStatus(e.target.value)} />
          <input className={`${inputCls} min-w-0 flex-1`} placeholder="path contains…" value={pathFilter} onChange={(e) => setPathFilter(e.target.value)} />
          <button className={btnPrimary} type="submit">Filter</button>
        </form>
      </Card>
      <Card className="mt-4 !p-0">
        <ul className="divide-y divide-gray-100 font-mono text-xs dark:divide-gray-800">
          {rows.map((r, i) => (
            <li key={i}>
              <button className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50" onClick={() => setOpen(open === i ? null : i)}>
                <span className="text-gray-400">{open === i ? "▾" : "▸"}</span>
                <span className={`w-14 font-semibold ${methodStyle(r.method)}`}>{r.method}</span>
                <span className="min-w-0 flex-1 truncate">{r.path}</span>
                <span className={`rounded px-1.5 py-0.5 ${statusStyle(r.status_code)}`}>{r.status_code}</span>
                <span className="w-16 text-right text-gray-500 dark:text-gray-400">{r.latency_ms}ms</span>
              </button>
              {open === i && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-100 bg-gray-50 px-4 py-2 sm:grid-cols-4 dark:border-gray-800 dark:bg-gray-800/30">
                  <div><dt className="text-gray-400">method</dt><dd>{r.method}</dd></div>
                  <div className="col-span-2"><dt className="text-gray-400">path</dt><dd className="break-all">{r.path}</dd></div>
                  <div><dt className="text-gray-400">status</dt><dd>{r.status_code}</dd></div>
                  <div><dt className="text-gray-400">latency</dt><dd>{r.latency_ms} ms</dd></div>
                  <div className="col-span-2"><dt className="text-gray-400">at</dt><dd>{r.created_at}</dd></div>
                </dl>
              )}
            </li>
          ))}
          {rows.length === 0 && <Empty text="No requests recorded." />}
        </ul>
      </Card>
    </div>
    </ProjectLayout>
  );
}
