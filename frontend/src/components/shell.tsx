"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { setToken } from "@/lib/api";
import ThemeToggle from "./theme-toggle";

const LINKS = [
  { href: "/", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/projects", label: "Projects", icon: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" },
];

function itemClass(href: string, path: string) {
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return active
    ? "flex items-center gap-3 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-gray-900"
    : "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800";
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!window.localStorage.getItem("shipyard_token"));
  }, [path]);

  function logout() {
    setToken(null);
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 md:flex">
        <a href="/" className="px-2 text-lg font-bold tracking-tight">
          Ship<span className="text-indigo-600 dark:text-indigo-400">Yard</span>
        </a>
        <nav className="mt-6 flex flex-col gap-1">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={itemClass(l.href, path)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={l.icon} /></svg>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2 border-t border-gray-200 pt-4 dark:border-gray-800">
          <ThemeToggle />
          {loggedIn ? (
            <button onClick={logout} className="ml-auto rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
              Logout
            </button>
          ) : (
            <a href="/login" className="ml-auto rounded-lg bg-gray-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-gray-900">
              Login
            </a>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 md:hidden">
          <a href="/" className="font-bold">ShipYard</a>
          <a href="/projects" className="text-sm text-gray-600 dark:text-gray-300">Projects</a>
          <span className="ml-auto"><ThemeToggle /></span>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
