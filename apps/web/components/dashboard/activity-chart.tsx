"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ActivityBar, formatMinutesTick, minBarSize } from "@/lib/dashboard/activity";

/** DASH-08: study time per day of the period; today's bar in the primary colour. */
export function ActivityChart({ bars, className }: { bars: ActivityBar[]; className?: string }) {
  const total = Math.round(bars.reduce((sum, b) => sum + b.minutes, 0));
  return (
    <Card className={className} aria-labelledby="activity-title">
      <CardHeader>
        <CardTitle id="activity-title">Study activity</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Screen readers get the values as a list; the chart itself is decorative (EXT-UI-09 spirit). */}
        <ul className="sr-only">
          {bars.map((b) => (
            <li key={b.day}>{b.tooltip}</li>
          ))}
        </ul>
        <div
          className="h-64"
          aria-hidden="true"
          data-testid="activity-chart"
          data-total-minutes={total}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bars}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              // The hidden list above is the accessible version; no focusable, unnamed SVG.
              accessibilityLayer={false}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                width={52}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tickFormatter={formatMinutesTick}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                content={({ active, payload }) => {
                  const bar = payload?.[0]?.payload as ActivityBar | undefined;
                  if (!active || !bar) return null;
                  return (
                    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                      {bar.tooltip}
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="minutes"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
                minPointSize={minBarSize}
              >
                {bars.map((b) => (
                  <Cell
                    key={b.day}
                    fill={
                      b.isToday
                        ? "var(--primary)"
                        : "color-mix(in oklch, var(--primary) 35%, transparent)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
