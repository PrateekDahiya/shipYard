"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inputCls } from "@/components/ui";

export interface LogEntry {
  source: string;
  stream: string;
  text: string;
}

// Reusable log pane: text search, stream/source filters, line numbers and
// a follow mode that pins to the bottom until the user scrolls up.
export default function LogViewer({
  entries,
  emptyText,
  accent = "green",
}: {
  entries: LogEntry[];
  emptyText: string;
  accent?: "green" | "cyan";
}) {
  const [query, setQuery] = useState("");
  const [stream, setStream] = useState<"all" | "stdout" | "stderr">("all");
  const [source, setSource] = useState<string>("all");
  const [follow, setFollow] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const prevTotal = useRef(0);

  const sources = useMemo(() => Array.from(new Set(entries.map((e) => e.source))).sort(), [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (stream === "all" || e.stream === stream) &&
        (source === "all" || e.source === source) &&
        (!q || e.text.toLowerCase().includes(q) || e.source.toLowerCase().includes(q))
    );
  }, [entries, query, stream, source]);

  useEffect(() => {
    if (follow && entries.length > prevTotal.current) {
      const el = boxRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    prevTotal.current = entries.length;
  }, [entries, follow]);

  function onScroll() {
    const el = boxRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (!nearBottom && follow) setFollow(false);
  }

  const textColor = accent === "cyan" ? "text-cyan-200" : "text-green-300";

  return (
    <div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} min-w-0 flex-1 font-mono !text-xs`}
          placeholder="Search logs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search logs"
        />
        <select
          className={`${inputCls} shrink-0 !py-1.5 !text-xs`}
          value={stream}
          onChange={(e) => setStream(e.target.value as "all" | "stdout" | "stderr")}
          aria-label="Filter by stream"
        >
          <option value="all">stdout + stderr</option>
          <option value="stdout">stdout</option>
          <option value="stderr">stderr</option>
        </select>
        {sources.length > 1 && (
          <select
            className={`${inputCls} shrink-0 !py-1.5 !text-xs`}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Filter by source"
          >
            <option value="all">all sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setFollow((f) => !f)}
          title={follow ? "Stop following new lines" : "Jump to newest lines and follow"}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium ${
            follow
              ? "border-green-600 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300"
              : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          }`}
        >
          {follow ? "● Following" : "Follow"}
        </button>
        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} of {entries.length} line{entries.length === 1 ? "" : "s"}
        </span>
      </div>

      <div
        ref={boxRef}
        onScroll={onScroll}
        className="log-scroll mt-2 max-h-96 overflow-auto rounded-lg bg-gray-950 p-4 font-mono text-xs leading-relaxed"
      >
        {entries.length === 0 ? (
          <p className={textColor}>{emptyText}</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400">No lines match the current filters.</p>
        ) : (
          filtered.map((e, i) => (
            <div key={i} className="flex gap-3 whitespace-pre">
              <span className="w-10 shrink-0 select-none text-right text-gray-600">{i + 1}</span>
              <span className="shrink-0 select-none text-gray-500">[{e.source}/{e.stream}]</span>
              <span className={e.stream === "stderr" ? "text-red-300" : textColor}>{e.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
