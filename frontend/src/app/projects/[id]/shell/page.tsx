"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card, PageHeader, ErrorBanner, btnPrimary, inputCls } from "@/components/ui";
import { ProjectLayout } from "@/components/project-nav";

export default function Shell({ params }: { params: { id: string } }) {
  const [output, setOutput] = useState<string[]>(["Press Connect to open a shell in the running container."]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const boxRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [output ]);

  useEffect(() => () => { try { wsRef.current?.close(); } catch { /* noop */ } }, []);

  async function connect() {
    setError(null);
    try {
      const s = await api.openShell(params.id);
      const token = window.localStorage.getItem("shipyard_token");
      const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/^http/, "ws");
      const ws = new WebSocket(`${base}${s.attachUrl}?token=${token}`);
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        setOutput((p) => [...p, `--- connected to ${s.session.container_id} (session ${s.session.id}) ---`]);
      };
      ws.onmessage = (e) => setOutput((p) => [...p.slice(-500), String(e.data)].slice(-500));
      ws.onclose = () => {
        setConnected(false);
        setOutput((p) => [...p, "--- session closed ---"]);
      };
      ws.onerror = () => setError("connection failed — is a deployment RUNNING?");
    } catch (e) {
      setError(e instanceof Error ? e.message : "connect_failed");
    }
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (wsRef.current && connected) {
      wsRef.current.send(input + "\n");
      setInput("");
    }
  }

  return (
    <ProjectLayout id={params.id} active="shell">
    <div>
      <PageHeader
        title="Container shell"
        sub="Confined to this project's running container · sessions expire after 15 minutes and are audited"
        actions={!connected ? <button className={btnPrimary} onClick={connect}>Connect</button> : undefined}
        back={{ href: `/projects/${params.id}`, label: "Back to project" }}
      />
      {error && <ErrorBanner message={error} />}
      <Card className="!bg-gray-950 !p-0 dark:!bg-black">
        <div className="flex items-center gap-1.5 border-b border-gray-800 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="h-3 w-3 rounded-full bg-yellow-500" />
          <span className="h-3 w-3 rounded-full bg-green-500" />
          <span className="ml-2 font-mono text-xs text-gray-400">{connected ? "connected" : "disconnected"}</span>
        </div>
        <pre ref={boxRef} className="log-scroll max-h-96 min-h-64 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm text-green-300">
          {output.join("\n")}
        </pre>
      </Card>
      {connected && (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input className={`${inputCls} flex-1 font-mono`} placeholder="$ command" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
          <button className={btnPrimary} type="submit">Send</button>
        </form>
      )}
    </div>
    </ProjectLayout>
  );
}
