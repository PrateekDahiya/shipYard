"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { setToken } from "@/lib/api";
import ThemeToggle from "./theme-toggle";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
];

function itemClass(href: string, path: string) {
  const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  return active
    ? "rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-gray-900"
    : "rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800";
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
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-1 px-4 py-2.5 sm:gap-2 sm:px-6">
          <a href="/" className="mr-1 text-lg font-bold tracking-tight">
            Ship<span className="text-indigo-600 dark:text-indigo-400">Yard</span>
          </a>
          <nav className="flex items-center gap-1">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className={itemClass(l.href, path)}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <a
              href="/projects/new"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            >
              <span className="sm:hidden">+</span>
              <span className="hidden sm:inline">+ New project</span>
            </a>
            <ThemeToggle />
            {loggedIn ? (
              <button onClick={logout} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                Logout
              </button>
            ) : (
              <a href="/login" className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                Login
              </a>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
