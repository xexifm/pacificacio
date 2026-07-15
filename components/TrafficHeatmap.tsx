"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";

interface HeatmapDay {
  date: string; // YYYY-MM-DD
  total: number;
}

interface TrafficHeatmapProps {
  data: HeatmapDay[];
}

// Monday-first weekday order (getUTCDay: 0=Sun … 6=Sat).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS: Record<number, string> = {
  1: "Dl", 2: "Dt", 3: "Dc", 4: "Dj", 5: "Dv", 6: "Ds", 0: "Dg",
};
const MONTH_LABELS = [
  "Gen", "Feb", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Oct", "Nov", "Des",
];

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

export default function TrafficHeatmap({ data }: TrafficHeatmapProps) {
  const { cells, maxAvg } = useMemo(() => {
    // Accumulate sum/count of daily totals per (weekday, month).
    const acc = new Map<string, { sum: number; count: number }>();
    for (const d of data) {
      const dt = new Date(`${d.date}T12:00:00Z`);
      const wd = dt.getUTCDay();
      const mo = dt.getUTCMonth();
      const key = `${wd}-${mo}`;
      const cur = acc.get(key) ?? { sum: 0, count: 0 };
      cur.sum += d.total;
      cur.count += 1;
      acc.set(key, cur);
    }

    const cellMap = new Map<string, number>();
    let max = 0;
    acc.forEach(({ sum, count }, key) => {
      const avg = count > 0 ? sum / count : 0;
      cellMap.set(key, avg);
      if (avg > max) max = avg;
    });

    return { cells: cellMap, maxAvg: max };
  }, [data]);

  if (data.length === 0) {
    return null;
  }

  const colorFor = (avg: number | undefined) => {
    if (avg === undefined) return { background: "transparent" };
    const alpha = maxAvg > 0 ? 0.12 + 0.88 * (avg / maxAvg) : 0.12;
    return { backgroundColor: `rgba(166, 26, 47, ${alpha.toFixed(3)})` };
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Patró setmanal i estacional
          </h3>
          <p className="text-xs text-muted-foreground">
            Mitjana de vehicles per dia, segons dia de la setmana i mes
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Menys</span>
          <div className="flex h-3">
            {[0.15, 0.35, 0.55, 0.75, 1].map((a) => (
              <div key={a} className="w-4 h-3" style={{ backgroundColor: `rgba(166,26,47,${a})` }} />
            ))}
          </div>
          <span>Més</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse" data-testid="heatmap-table">
          <thead>
            <tr>
              <th className="w-8" />
              {MONTH_LABELS.map((m) => (
                <th
                  key={m}
                  className="px-1 pb-1 text-[10px] font-medium text-muted-foreground text-center min-w-[38px]"
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAY_ORDER.map((wd) => (
              <tr key={wd}>
                <td className="pr-2 text-[10px] font-medium text-muted-foreground text-right">
                  {WEEKDAY_LABELS[wd]}
                </td>
                {MONTH_LABELS.map((_, mo) => {
                  const avg = cells.get(`${wd}-${mo}`);
                  const dark = avg !== undefined && maxAvg > 0 && avg / maxAvg > 0.55;
                  return (
                    <td key={mo} className="p-0.5">
                      <div
                        className="h-7 min-w-[38px] rounded-sm flex items-center justify-center text-[9px] font-medium border border-border/40"
                        style={colorFor(avg)}
                        title={
                          avg !== undefined
                            ? `${WEEKDAY_LABELS[wd]} · ${MONTH_LABELS[mo]}: ${Math.round(avg).toLocaleString("ca-ES")} v/d`
                            : "Sense dades"
                        }
                      >
                        <span className={dark ? "text-white" : "text-foreground/80"}>
                          {avg !== undefined ? fmt(avg) : ""}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
