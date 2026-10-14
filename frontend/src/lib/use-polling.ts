"use client";

import { useEffect, useRef } from "react";

// Runs at most one request at a time and pauses while the tab is hidden.
export function usePolling(task: () => Promise<void> | void, intervalMs: number, enabled = true, resetKey?: string) {
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: number | undefined;

    const run = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        await taskRef.current();
      }
      if (!stopped) timer = window.setTimeout(run, intervalMs);
    };

    void run();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [enabled, intervalMs, resetKey]);
}
