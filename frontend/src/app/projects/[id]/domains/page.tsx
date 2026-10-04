"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, PageHeader, Empty, ErrorBanner, btnPrimary, btnSecondary, inputCls } from "@/components/ui";
import { ProjectLayout } from "@/components/project-nav";

type Domain = { id: number; hostname: string; kind: string; verified: number };

export default function Domains({ params }: { params: { id: string } }) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [hostname, setHostname] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setDomains((await api.listDomains(params.id)).domains);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setHint(null);
    try {
      const r = await api.addDomain(params.id, hostname);
      setHostname("");
      setHint(`Add this DNS TXT record at ${r.domain.hostname}: shipyard-verification=${r.verificationToken} — then press Verify.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "add_failed");
    }
  }

  return (
    <ProjectLayout id={params.id} active="domains">
    <div>
      <PageHeader
        title="Custom domains"
        sub="Verified domains route on the next deployment. TLS via Traefik."
        back={{ href: `/projects/${params.id}`, label: "Back to project" }}
      />
      {error && <ErrorBanner message={error} />}
      {hint && <Card className="mb-4 border-blue-200 bg-blue-50 font-mono text-xs dark:border-blue-900 dark:bg-blue-950/50">{hint}</Card>}
      <Card>
        <form onSubmit={add} className="flex gap-2">
          <input className={`${inputCls} flex-1 font-mono`} placeholder="api.example.com" value={hostname} onChange={(e) => setHostname(e.target.value)} />
          <button className={btnPrimary} type="submit">Add domain</button>
        </form>
      </Card>
      <Card className="mt-4 !p-0">
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {domains.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="font-mono">{d.hostname}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.verified ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"}`}>
                {d.verified ? "verified" : d.kind === "shipyard" ? "shipyard (auto)" : "pending verification"}
              </span>
              {!d.verified && d.kind === "custom" && (
                <button className={btnSecondary} onClick={() => api.verifyDomain(params.id, d.id).then(load).catch((e) => setError(e.message))}>Verify</button>
              )}
              {d.kind === "custom" && (
                <button className="ml-auto text-sm text-red-600 dark:text-red-400" onClick={() => api.removeDomain(params.id, d.id).then(load).catch((e) => setError(e.message))}>Remove</button>
              )}
            </li>
          ))}
          {domains.length === 0 && <Empty text="No domains yet." />}
        </ul>
      </Card>
    </div>
    </ProjectLayout>
  );
}
