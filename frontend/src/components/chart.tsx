"use client";

export function LineChart({ points, height = 120 }: { points: { x: string; y: number }[]; height?: number }) {
  const w = 560;
  const h = height;
  const pad = 8;
  const max = Math.max(1, ...points.map((p) => p.y));
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${(h - pad - (p.y / max) * (h - pad * 2)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full" role="img">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-600 dark:text-indigo-400" />
      {points.map((p, i) => (
        <circle key={i} cx={pad + i * step} cy={h - pad - (p.y / max) * (h - pad * 2)} r="2.5" className="fill-indigo-600 dark:fill-indigo-400">
          <title>{`${p.x}: ${p.y}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function BarChart({ points, height = 120 }: { points: { x: string; y: number }[]; height?: number }) {
  const w = 560;
  const h = height;
  const max = Math.max(1, ...points.map((p) => p.y));
  const bw = points.length ? w / points.length : w;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full" role="img">
      {points.map((p, i) => {
        const bh = (p.y / max) * (h - 18);
        return (
          <g key={i}>
            <rect x={i * bw + 2} y={h - 14 - bh} width={Math.max(1, bw - 4)} height={bh} rx="2" className="fill-indigo-500 dark:fill-indigo-400">
              <title>{`${p.x}: ${p.y}`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

export function fmtBytes(n: number | undefined): string {
  if (n === undefined || n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
