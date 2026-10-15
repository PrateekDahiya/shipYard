"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, setToken, type Project } from "@/lib/api";
import { currentLiveUrl } from "@/lib/deployment";
import { LiveLink } from "./ui";
import ThemeToggle from "./theme-toggle";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/projects", label: "Services" },
];

type SearchProject = Project & { liveUrl?: string | null };

function activeLink(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function breadcrumbs(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const items = [{ label: "Workspace", href: "/" }];
  let href = "";
  for (const part of parts) {
    href += `/${part}`;
    items.push({ label: part.replace(/-/g, " "), href });
  }
  return items;
}

function Brand({ dark = false }: { dark?: boolean }) {
  return <Link href="/" className="group flex items-center gap-2.5" aria-label="ShipYard home">
    <span className={`flex h-7 w-7 items-center justify-center border ${dark ? "border-white/20 bg-white text-[#182230]" : "border-[var(--border-strong)] bg-[var(--foreground)] text-white"}`}><span className="h-2.5 w-2.5 border-2 border-current" /></span>
    <span className={`text-[15px] font-semibold tracking-[-0.02em] ${dark ? "text-white" : "text-[var(--foreground)]"}`}>ShipYard</span>
  </Link>;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<SearchProject[]>([]);

  useEffect(() => {
    const syncAuth = () => setLoggedIn(!!window.localStorage.getItem("shipyard_token"));
    syncAuth();
    window.addEventListener("storage", syncAuth);
    return () => window.removeEventListener("storage", syncAuth);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setJumpOpen(true);
      }
      if (event.key === "Escape") setJumpOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!jumpOpen) return;
    setProjectQuery("");
    api.overview().then((result) => setProjects(result.projects.map((project) => ({ ...project, liveUrl: currentLiveUrl(project.latest) })))).catch(() => setProjects([]));
  }, [jumpOpen]);

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();
    return projects.filter((project) => !query || project.name.toLowerCase().includes(query) || (project.repository_url || "").toLowerCase().includes(query));
  }, [projects, projectQuery]);

  function logout() {
    setToken(null);
    setLoggedIn(false);
    router.push("/login");
  }

  const publicRoute = pathname === "/login" || pathname === "/register";
  if (publicRoute) {
    return <div className="min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]"><div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8"><Brand/><main className="flex w-full min-w-0 flex-1 items-center justify-center py-10">{children}</main></div></div>;
  }

  const breadcrumbItems = breadcrumbs(pathname);
  const navigation = <nav className="space-y-0.5" aria-label="Workspace navigation">{LINKS.map((link) => {
    const active = activeLink(link.href, pathname);
    return <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={`flex items-center gap-2.5 border-l-2 px-3 py-2 text-[13px] transition ${active ? "border-white bg-white/10 text-white" : "border-transparent text-white/60 hover:bg-white/[0.06] hover:text-white"}`}><span className={`h-1.5 w-1.5 ${active ? "bg-[#6f9bb3]" : "bg-white/25"}`} /><span>{link.label}</span></Link>;
  })}</nav>;

  return <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col bg-[#182230] px-4 py-5 lg:flex">
        <div className="px-2"><Brand dark /></div>
        <p className="mb-2 mt-10 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Workspace</p>
        {navigation}
        <div className="mt-7 border-t border-white/10 pt-5">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Shortcuts</p>
          <button type="button" onClick={() => setJumpOpen(true)} className="flex w-full items-center justify-between border border-white/10 px-3 py-2 text-left text-xs text-white/60 transition hover:border-white/25 hover:text-white"><span>Find a service</span><kbd className="border border-white/15 px-1.5 py-0.5 font-mono text-[9px] text-white/40">⌘ K</kbd></button>
          <Link href="/projects/new" className="mt-2 flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#91afbf] transition hover:bg-white/[0.06]">+ New service</Link>
        </div>
        <div className="mt-auto border-t border-white/10 pt-4"><div className="flex items-center gap-2 text-[11px] text-white/55"><span className="h-1.5 w-1.5 bg-[#70c99d]" />Control plane ready</div><p className="mt-1.5 px-3 text-[10px] leading-relaxed text-white/30">Deployment signals are monitored continuously.</p></div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-5 sm:px-7 lg:px-9">
            <div className="lg:hidden"><button type="button" onClick={() => setMobileOpen((open) => !open)} aria-label="Toggle navigation" aria-expanded={mobileOpen} className="border border-[var(--border-strong)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide">Menu</button></div>
            <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap text-[11px] text-[var(--muted)] sm:text-xs">
              {breadcrumbItems.map((item, index) => {
                const current = index === breadcrumbItems.length - 1;
                return <span key={item.href} className="flex shrink-0 items-center gap-2"><span className="text-[var(--subtle)]">{index > 0 ? "/" : ""}</span>{current ? <span aria-current="page" className="font-medium capitalize text-[var(--foreground)]">{item.label}</span> : <Link href={item.href} className="capitalize hover:text-[var(--foreground)]">{item.label}</Link>}</span>;
              })}
            </nav>
            <div className="ml-auto flex min-w-0 items-center gap-2"><button type="button" onClick={() => setJumpOpen(true)} className="flex min-w-0 items-center gap-3 border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-left text-xs text-[var(--muted)] hover:border-[var(--border-strong)]"><span className="hidden sm:inline">Jump to service</span><span className="sm:hidden">Search</span><kbd className="hidden border border-[var(--border)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--subtle)] sm:inline">⌘ K</kbd></button><span className="hidden sm:block"><ThemeToggle/></span>{loggedIn ? <button onClick={logout} className="hidden px-2 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] sm:block">Sign out</button> : <Link href="/login" className="hidden px-2 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] sm:block">Sign in</Link>}</div>
          </div>
          {mobileOpen && <div className="border-t border-white/10 bg-[#182230] px-4 py-4">{navigation}<button type="button" onClick={() => { setMobileOpen(false); setJumpOpen(true); }} className="mt-3 w-full border border-white/15 px-3 py-2 text-left text-xs text-white/60">Find a service <span className="float-right font-mono">⌘ K</span></button></div>}
        </header>
        <main className="mx-auto w-full max-w-[1480px] min-w-0 overflow-x-hidden px-4 py-6 sm:px-7 sm:py-7 lg:px-9 lg:py-9">{children}</main>
      </div>
    </div>

    {jumpOpen && <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[#101722]/65 px-4 pt-[12vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Find a service" onMouseDown={(event) => { if (event.target === event.currentTarget) setJumpOpen(false); }}><div className="w-full max-w-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-2xl"><div className="flex items-center gap-3 border-b border-[var(--border)] px-4"><span className="font-mono text-sm text-[var(--accent)]">/</span><input autoFocus value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} placeholder="Find a service or repository…" className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--subtle)]"/><kbd className="border border-[var(--border)] px-1.5 py-1 font-mono text-[9px] text-[var(--subtle)]">ESC</kbd></div><div className="max-h-[55vh] overflow-y-auto p-2">{filteredProjects.map((project) => <div key={project.id} className="flex items-center gap-3 px-3 py-3 hover:bg-[var(--surface-subtle)]"><button type="button" onClick={() => { setJumpOpen(false); router.push(`/projects/${project.id}`); }} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--accent-subtle)] font-mono text-xs font-semibold text-[var(--accent-strong)]">{project.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{project.name}</span><span className="block truncate text-[10px] text-[var(--muted)]">{project.repository_url || "No repository connected"}</span></span></button><LiveLink href={project.liveUrl} /></div>)}{filteredProjects.length === 0 && <p className="px-3 py-8 text-center text-xs text-[var(--muted)]">{projects.length ? "No matching services." : "No services available yet."}</p>}</div><div className="border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--subtle)]">Use ↑ ↓ to navigate · Enter to open</div></div></div>}
  </div>;
}
