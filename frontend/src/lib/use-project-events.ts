"use client";

import { useEffect, useRef } from "react";
import { apiBase, clearApiCache } from "@/lib/api";

// Deployment events are already published by the backend. Keep polling as a
// fallback, but use project-scoped SSE connections to refresh immediately.
export function useProjectEvents(projectIds: string[], onEvent: () => void) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;
  const key = projectIds.join(",");

  useEffect(() => {
    if (!key || typeof window === "undefined" || typeof EventSource === "undefined") return;
    const token = window.localStorage.getItem("shipyard_token");
    if (!token) return;
    const sources = key.split(",").filter(Boolean).map((projectId) => {
      const source = new EventSource(`${apiBase()}/api/projects/${projectId}/events?token=${encodeURIComponent(token)}`);
      const refresh = () => {
        clearApiCache();
        callbackRef.current();
      };
      source.addEventListener("DEPLOYMENT_CREATED", refresh);
      source.addEventListener("DEPLOYMENT_STATUS", refresh);
      return { source, refresh };
    });
    return () => {
      sources.forEach(({ source, refresh }) => {
        source.removeEventListener("DEPLOYMENT_CREATED", refresh);
        source.removeEventListener("DEPLOYMENT_STATUS", refresh);
        source.close();
      });
    };
  }, [key]);
}
