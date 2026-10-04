"use client";

import { useState } from "react";
import { api, setToken } from "@/lib/api";
import { Card, btnPrimary, inputCls } from "@/components/ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api.login(email, password);
      setToken(r.token);
      window.location.href = "/projects";
    } catch (err) {
      setError(err instanceof Error ? err.message : "login_failed");
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="text-center text-2xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-center text-sm text-gray-500 dark:text-gray-400">Login to your ShipYard account</p>
      <Card className="mt-6">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-sm font-medium">Email
            <input className={`${inputCls} mt-1 w-full`} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="text-sm font-medium">Password
            <input className={`${inputCls} mt-1 w-full`} placeholder="••••••••" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button className={btnPrimary} type="submit">Login</button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">No account? <a className="font-medium text-indigo-600 dark:text-indigo-400" href="/register">Register</a></p>
    </div>
  );
}
