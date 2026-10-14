"use client";

import { Button, Card } from "@/components/ui";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-xl py-12"><Card className="text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-xl text-red-600 dark:bg-red-900/30 dark:text-red-300">!</div><h1 className="mt-4 text-xl font-semibold">Something went wrong</h1><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">The page could not load. Retry the request or return to the dashboard.</p><div className="mt-5 flex justify-center gap-2"><Button variant="secondary" onClick={() => { window.location.href = "/"; }}>Dashboard</Button><Button onClick={reset}>Try again</Button></div></Card></div>;
}
