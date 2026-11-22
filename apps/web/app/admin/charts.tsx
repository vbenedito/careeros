/**
 * ADM-20: the charts of /admin. Hand-written inline SVG in server components: no library, no
 * client JavaScript. Every SVG scales with its box (`viewBox`, width 100%); numbers, labels and
 * legends are HTML text beside it, so they wrap and zoom and never clip. Colours are design
 * tokens only (`fill-chart-1`, `stroke-card`, ...). Segments are separated by a 2 px stroke in the
 * card colour, drawn with `vector-effect: non-scaling-stroke` so it stays 2 px at any width.
 */
import { LEDGER_MODELS, type LedgerModel } from "@careeros/shared";
import { Swatch } from "@/app/admin/panel-parts";
import { segmentLengths } from "@/lib/admin/chart-geometry";
import type { DailyCostView } from "@/lib/admin/daily-view";
import { formatTokens } from "@/lib/admin/sessions-view";

export const MODEL_FILL: Record<LedgerModel, string> = {
  haiku: "fill-chart-1",
  sonnet: "fill-chart-2",
  opus: "fill-chart-3",
};
export const MODEL_SWATCH: Record<LedgerModel, string> = {
  haiku: "bg-chart-1",
  sonnet: "bg-chart-2",
  opus: "bg-chart-3",
};

/**
 * Smallest drawn size of a segment with a value above 0: 3 px of column height (the chart is
 * h-40 = 160 px for 100 units, so 1.6 px per unit) or 4 px of bar width, each plus the 2 px
 * card-colour stroke that eats 1 px on both edges. The bar is measured against a 240 px box,
 * the narrowest it gets on a phone.
 */
const MIN_COLUMN_UNITS = (3 + 2) / 1.6;
const MIN_BAR_UNITS = ((4 + 2) / 240) * 100;

const GAP = { strokeWidth: 2, vectorEffect: "non-scaling-stroke" } as const;

/** Day labels shown under the columns: today (last) and every fourth column before it. */
const LABELLED = new Set([1, 5, 9, 13]);

/** ADM-10a: one stacked column per day, haiku at the bottom, opus on top. */
export function CostChart({ view }: { view: DailyCostView }) {
  const n = view.days.length;
  const W = n * 10;
  const H = 100;
  const y = (v: number) => H - (v / view.top) * H;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div
          aria-hidden="true"
          className="relative h-40 w-[5ch] shrink-0 text-right text-xs text-muted-foreground tabular-nums"
        >
          {view.ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 leading-none"
              style={{ top: `${(y(t) / H) * 100}%` }}
            >
              {formatTokens(t, true)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <svg
            role="img"
            aria-label={view.headline}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block h-40 w-full overflow-visible"
          >
            {view.ticks.map((t) => (
              <line
                key={t}
                x1={0}
                x2={W}
                y1={y(t)}
                y2={y(t)}
                className="stroke-border"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {view.days.map((day, i) => {
              const lengths = segmentLengths(
                LEDGER_MODELS.map((m) => day.byModel[m]),
                (day.total / view.top) * H,
                MIN_COLUMN_UNITS,
              );
              let top = H;
              return (
                <g key={day.date}>
                  {LEDGER_MODELS.map((m, k) => {
                    const height = lengths[k] ?? 0;
                    if (height === 0) return null;
                    top -= height;
                    return (
                      <rect
                        key={m}
                        x={i * 10 + 1.5}
                        y={top}
                        width={7}
                        height={height}
                        className={`${MODEL_FILL[m]} stroke-card`}
                        {...GAP}
                      >
                        <title>{`${day.label}, ${m}: ${formatTokens(day.byModel[m])} tokens`}</title>
                      </rect>
                    );
                  })}
                </g>
              );
            })}
          </svg>
          <div aria-hidden="true" className="relative mt-1 h-4 text-xs text-muted-foreground">
            {view.days.map((day, i) =>
              LABELLED.has(i) ? (
                <span
                  key={day.date}
                  className={`absolute whitespace-nowrap ${i === n - 1 ? "right-0" : "-translate-x-1/2"}`}
                  style={i === n - 1 ? undefined : { left: `${((i + 0.5) / n) * 100}%` }}
                >
                  {day.label}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {LEDGER_MODELS.map((m) => (
          <li key={m} className="flex items-center gap-1.5">
            <Swatch className={MODEL_SWATCH[m]} />
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface StackSegment {
  key: string;
  label: string;
  count: number;
  /** `fill-*` and `bg-*` classes of the segment and its legend swatch. */
  fill: string;
  swatch: string;
}

/** ADM-12: one bar split in segments, width = share of the total; the legend repeats every count. */
export function StackedBar({ segments, label }: { segments: StackSegment[]; label: string }) {
  const total = segments.reduce((n, s) => n + s.count, 0);
  const widths = segmentLengths(
    segments.map((s) => s.count),
    100,
    MIN_BAR_UNITS,
  );
  let x = 0;
  return (
    <div className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        className="block h-4 w-full"
      >
        {segments.map((s, k) => {
          const width = widths[k] ?? 0;
          if (s.count === 0 || total === 0 || width === 0) return null;
          const rect = (
            <rect
              key={s.key}
              x={x}
              y={0}
              width={width}
              height={10}
              className={`${s.fill} stroke-card`}
              {...GAP}
            >
              <title>{`${s.label}: ${s.count}`}</title>
            </rect>
          );
          x += width;
          return rect;
        })}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <Swatch className={s.swatch} />
            <span>
              {s.label} <span className="tabular-nums">{s.count}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One horizontal bar on a shared scale (ADM-19): a track and a bar whose length is `value / max`.
 * It is drawn in percentages of its own box, not in a scaled `viewBox`, because a bar with a
 * count above 0 must be at least 4 px long and a pixel floor cannot be written in viewBox units.
 */
export function HBar({
  value,
  max,
  fill,
  title,
  label,
}: {
  value: number;
  max: number;
  fill: string;
  title: string;
  /** The bar's text alternative, e.g. "x:one: 3 records". */
  label: string;
}) {
  const percent = max > 0 ? (value / max) * 100 : 0;
  return (
    <svg role="img" aria-label={label} width="100%" height={12} className="block min-w-0 flex-1">
      <rect width="100%" height={12} rx={2} className="fill-muted" />
      {value > 0 && (
        <rect
          width={`${percent}%`}
          height={12}
          rx={2}
          className={fill}
          style={{ width: `max(4px, ${percent}%)` }}
        >
          <title>{title}</title>
        </rect>
      )}
    </svg>
  );
}
