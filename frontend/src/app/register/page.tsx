"use client";

import { useState } from "react";
import { api, setToken } from "@/lib/api";
import { Card, inputCls } from "@/components/ui";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api.register(email, password, name || undefined);
      setToken(r.token);
      window.location.href = "/projects";
    } catch (err) {
      setError(err instanceof Error ? err.message : "register_failed");
    }
  }

  return (
    <div className="auth-card mx-auto mt-10 w-full max-w-[calc(100vw-2rem)] sm:max-w-[18rem]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-strong)]">New workspace</p>
      <h1 className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.04em]">Create your account</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Deploy your first service in minutes</p>
      <Card className="mt-6 w-full min-w-0 overflow-hidden p-5">
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
          <label className="min-w-0 text-sm font-medium text-[#263b45] dark:text-gray-200">Name <span className="font-normal text-[#8a9894]">(optional)</span>
            <input className={`${inputCls} mt-1.5 min-w-0 w-full`} placeholder="Jane" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="min-w-0 text-sm font-medium text-[#263b45] dark:text-gray-200">Email
            <input className={`${inputCls} mt-1.5 min-w-0 w-full`} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="min-w-0 text-sm font-medium text-[#263b45] dark:text-gray-200">Password <span className="font-normal text-[#8a9894]">(min 8 chars)</span>
            <input className={`${inputCls} mt-1.5 min-w-0 w-full`} placeholder="••••••••" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button className="inline-flex w-full items-center justify-center bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]" type="submit">Create account</button>
        </form>
      </Card>
      <p className="mt-5 text-center text-sm text-[var(--muted)]">Have an account? <a className="font-semibold text-[var(--accent-strong)] hover:underline" href="/login">Sign in</a></p>
    </div>
  );
}
