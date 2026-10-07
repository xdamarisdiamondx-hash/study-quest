/**
 * The P16 charts: a score trend line and a study-time heatmap.
 *
 * Both are hand-built SVG/DOM on purpose — theme-aware through the same CSS
 * variables everything else uses, no chart library to keep honest — and both
 * are accessible the same way: `role="img"` with a summary label, plus a
 * collapsed `<details>` table that carries every number the picture draws
 * (PRD plan: "table equivalent available"). A quiet day plots at zero; the
 * charts never smooth or interpolate data they don't have.
 */
import { useMemo } from "react";
import { heatmapColumns, type HeatmapCell } from "@sq/core/progress";
import { dayKey } from "@sq/core/gamification";

import type { DayMinutes } from "../../lib/useProgress";

/** Minutes → intensity bucket (0, light, …, full) for the heatmap's cells. */
function heatLevel(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes < 15) return 1;
  if (minutes < 30) return 2;
  if (minutes < 60) return 3;
  return 4;
}

const shortDay = (day: string): string => day.slice(5).replace("-", "/");

/* --- heatmap -------------------------------------------------------------- */

export function Heatmap({
  from,
  to,
  days,
  label,
}: {
  from: string;
  to: string;
  days: DayMinutes[];
  label: string;
}) {
  const minutesByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of days) map[d.day] = d.minutes;
    return map;
  }, [days]);

  const columns = useMemo(() => heatmapColumns(from, to, minutesByDay), [from, to, minutesByDay]);
  const total = days.reduce((sum, d) => sum + d.minutes, 0);
  const studied = days.filter((d) => d.minutes > 0).length;
  const best = days.reduce((max, d) => Math.max(max, d.minutes), 0);

  if (columns.length === 0) return null;

  const summary = `${label}: ${studied} of the last ${dayCount(from, to)} days held study time, ${total} minutes total, best day ${best}.`;

  return (
    <div className="sq-heat-wrap">
      <div className="sq-heat" role="img" aria-label={summary}>
        {columns.map((column, ci) => (
          <div className="sq-heat-col" key={ci}>
            {column.map((cell, ri) => (
              <HeatCell key={ri} cell={cell} />
            ))}
          </div>
        ))}
      </div>
      <details className="sq-chart-table">
        <summary>View as table</summary>
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Minutes</th>
            </tr>
          </thead>
          <tbody>
            {seriesDays(from, to, days).map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day}</th>
                <td>{d.minutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function HeatCell({ cell }: { cell: HeatmapCell }) {
  if (cell.day === null) return <span className="sq-heat-cell sq-heat-pad" aria-hidden="true" />;
  const level = heatLevel(cell.minutes);
  return (
    <span
      className={`sq-heat-cell sq-heat-l${level}`}
      title={`${cell.day} — ${cell.minutes} min`}
    />
  );
}

function dayCount(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  );
}

/**
 * Every day in the window, zeros included — the table is complete, not
 * sampled, and a line built from this never skips a quiet day.
 */
export function seriesDays(from: string, to: string, days: DayMinutes[]): DayMinutes[] {
  const map = new Map(days.map((d) => [d.day, d.minutes]));
  const out: DayMinutes[] = [];
  for (
    let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`);
    t <= end;
    t += 86_400_000
  ) {
    const day = dayKey(new Date(t));
    out.push({ day, minutes: map.get(day) ?? 0 });
  }
  return out;
}

/* --- trend line ----------------------------------------------------------- */

export function TrendChart({
  points,
  label,
  max = 100,
  unit = "%",
  columnLabel = "Score",
  emptyText = "Nothing to chart yet — the line appears after the first data point.",
}: {
  points: { day: string; value: number }[];
  label: string;
  /** Y-axis ceiling; ticks read 0, max/2, max, each with `unit`. */
  max?: number;
  unit?: string;
  columnLabel?: string;
  emptyText?: string;
}) {
  if (points.length === 0) {
    return <p className="sq-chart-empty">{emptyText}</p>;
  }

  const W = 560;
  const H = 140;
  const pad = { l: 40, r: 8, t: 10, b: 20 };
  const x = (i: number): number =>
    points.length === 1
      ? (pad.l + (W - pad.r)) / 2
      : pad.l + (i * (W - pad.l - pad.r)) / (points.length - 1);
  const y = (value: number): number =>
    pad.t + (1 - Math.max(0, Math.min(max, value)) / max) * (H - pad.t - pad.b);

  const first = points[0] ?? { day: "", value: 0 };
  const last = points[points.length - 1] ?? first;
  const mean = points.reduce((sum, p) => sum + p.value, 0) / points.length;
  const summary = `${label}: ${points.length} point${points.length === 1 ? "" : "s"} from ${first.day} to ${last.day}, averaging ${Math.round(mean)}${unit}, latest ${Math.round(last.value)}${unit}.`;

  return (
    <div className="sq-trend-wrap">
      <svg className="sq-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        {[0, max / 2, max].map((tick) => (
          <g key={tick}>
            <line className="sq-trend-grid" x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} />
            <text className="sq-trend-tick" x={2} y={y(tick) + 4}>
              {tick}
              {unit}
            </text>
          </g>
        ))}
        <polyline
          className="sq-trend-line"
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
        />
        {points.map((p, i) => (
          <circle key={i} className="sq-trend-dot" cx={x(i)} cy={y(p.value)} r={3} />
        ))}
        <text className="sq-trend-tick" x={pad.l} y={H - 4}>
          {shortDay(first.day)}
        </text>
        <text className="sq-trend-tick" x={W - pad.r} y={H - 4} textAnchor="end">
          {shortDay(last.day)}
        </text>
      </svg>
      <details className="sq-chart-table">
        <summary>View as table</summary>
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">{columnLabel}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <th scope="row">{p.day}</th>
                <td>
                  {Math.round(p.value)}
                  {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
