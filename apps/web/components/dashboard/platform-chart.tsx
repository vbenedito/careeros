"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlatformSlice } from "@/lib/dashboard/platforms";

/** DASH-09: share of the period per platform (top 5 + Other), with a legend. */
export function PlatformChart({
  slices,
  className,
}: {
  slices: PlatformSlice[];
  className?: string;
}) {
  return (
    <Card className={className} aria-labelledby="platform-title">
      <CardHeader>
        <CardTitle id="platform-title">Time by platform</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {slices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No study time in this period yet.</p>
        ) : (
          <>
            <div className="h-48" aria-hidden="true" data-testid="platform-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer={false}>
                  <Pie
                    data={slices}
                    dataKey="seconds"
                    nameKey="name"
                    innerRadius="60%"
                    outerRadius="90%"
                    paddingAngle={slices.length > 1 ? 2 : 0}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {slices.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      const slice = payload?.[0]?.payload as PlatformSlice | undefined;
                      if (!active || !slice) return null;
                      return (
                        <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                          {slice.name} · {slice.duration} · {slice.percent}%
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* The legend is the accessible version of the chart. */}
            <ul className="flex flex-col gap-2 text-sm" data-testid="platform-legend">
              {slices.map((s) => (
                <li key={s.name} className="flex items-center gap-2" data-percent={s.percent}>
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate" title={s.name}>
                    {s.name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{s.duration}</span>
                  <span className="w-10 text-right tabular-nums">{s.percent}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
