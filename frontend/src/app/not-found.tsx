import Link from "next/link";
import { Card } from "@/components/ui";

export default function NotFound() {
  return <div className="mx-auto max-w-xl py-12"><Card className="p-6 text-center"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Error 404</p><h1 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Nothing here</h1><p className="mt-2 text-sm text-[var(--muted)]">This ShipYard resource does not exist or is no longer available.</p><Link href="/" className="mt-5 inline-flex bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]">Back to dashboard</Link></Card></div>;
}
