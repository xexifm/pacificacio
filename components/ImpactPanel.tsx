"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowDown, ArrowUp, Minus, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { computeImpact, deltaVerdict, type NeighbourhoodImpact } from "@/lib/impact";
import type { TrafficData, CameraSettings, BollardSettings } from "@/lib/types";

interface ImpactPanelProps {
  trafficData: TrafficData[];
  cameraSettings: CameraSettings[];
  bollardSettings: BollardSettings | undefined;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ca-ES");
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function DeltaBadge({ pct, size = "sm" }: { pct: number | null; size?: "sm" | "lg" }) {
  const verdict = deltaVerdict(pct);
  const color =
    verdict === "reduction"
      ? "text-green-600 dark:text-green-400"
      : verdict === "increase"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  const Icon = verdict === "reduction" ? ArrowDown : verdict === "increase" ? ArrowUp : Minus;
  const text = pct === null ? "N/D" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
  return (
    <span className={`inline-flex items-center gap-1 font-bold ${color} ${size === "lg" ? "text-3xl" : "text-sm"}`}>
      {pct !== null && <Icon className={size === "lg" ? "w-6 h-6" : "w-3.5 h-3.5"} />}
      {text}
    </span>
  );
}

function MiniCompare({ label, before, after, pct }: { label: string; before: number; after: number; pct: number | null }) {
  const max = Math.max(before, after, 1);
  const verdict = deltaVerdict(pct);
  const afterColor =
    verdict === "reduction" ? "bg-green-500" : verdict === "increase" ? "bg-red-500" : "bg-muted-foreground";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <DeltaBadge pct={pct} />
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="w-12 text-[10px] text-muted-foreground shrink-0">Abans</span>
          <div className="flex-1 bg-muted rounded-sm h-3 overflow-hidden">
            <div className="h-full bg-muted-foreground/60 rounded-sm" style={{ width: `${(before / max) * 100}%` }} />
          </div>
          <span className="w-14 text-[10px] font-medium text-right shrink-0">{fmt(before)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 text-[10px] text-muted-foreground shrink-0">Després</span>
          <div className="flex-1 bg-muted rounded-sm h-3 overflow-hidden">
            <div className={`h-full ${afterColor} rounded-sm`} style={{ width: `${(after / max) * 100}%` }} />
          </div>
          <span className="w-14 text-[10px] font-medium text-right shrink-0">{fmt(after)}</span>
        </div>
      </div>
    </div>
  );
}

function NeighbourhoodCard({ n }: { n: NeighbourhoodImpact }) {
  const cotxes = n.holiday.byVehicleDelta["Cotxe"];
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-foreground">{n.neighbourhood}</h3>
          <p className="text-[11px] text-muted-foreground">
            Mesures actives des del {fmtDate(n.interventionDate)}
          </p>
        </div>
        {n.seasonalityWarning && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400" title="Els períodes comparats cobreixen mesos diferents; interpreteu amb cautela.">
            <AlertTriangle className="w-3 h-3" /> estacionalitat
          </span>
        )}
      </div>

      {/* Headline: holiday (bollards raised) effect */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="text-xs text-muted-foreground mb-1">Trànsit en festius (efecte pilones)</p>
        <DeltaBadge pct={n.holiday.deltaPct} size="lg" />
        <p className="text-[11px] text-muted-foreground mt-1">
          {fmt(n.holiday.before.avgPerDay)} → {fmt(n.holiday.after.avgPerDay)} vehicles/dia
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-border p-2">
          <p className="text-[10px] text-muted-foreground">Cotxes en festius</p>
          <DeltaBadge pct={cotxes?.deltaPct ?? null} />
        </div>
        <div className="rounded border border-border p-2">
          <p className="text-[10px] text-muted-foreground">Total laborables</p>
          <DeltaBadge pct={n.working.deltaPct} />
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <MiniCompare label="Festius" before={n.holiday.before.avgPerDay} after={n.holiday.after.avgPerDay} pct={n.holiday.deltaPct} />
        <MiniCompare label="Laborables" before={n.working.before.avgPerDay} after={n.working.after.avgPerDay} pct={n.working.deltaPct} />
      </div>

      <p className="text-[10px] text-muted-foreground mt-auto pt-1 border-t border-border/50">
        {n.holiday.before.days} dies abans · {n.holiday.after.days} dies després ·{" "}
        {n.camerasIncluded.length} {n.camerasIncluded.length === 1 ? "càmera" : "càmeres"}
        {n.camerasExcluded.length > 0 && ` · ${n.camerasExcluded.length} excloses`}
      </p>
    </Card>
  );
}

export default function ImpactPanel({ trafficData, cameraSettings, bollardSettings }: ImpactPanelProps) {
  const [includeUnreliable, setIncludeUnreliable] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);

  const dates = useMemo(
    () => ({
      Pedró: bollardSettings?.bollardStartDatePedro ?? null,
      Gavarra: bollardSettings?.bollardStartDateGavarra ?? null,
    }),
    [bollardSettings],
  );

  const impact = useMemo(
    () => computeImpact(trafficData, cameraSettings, dates, { reliableOnly: !includeUnreliable }),
    [trafficData, cameraSettings, dates, includeUnreliable],
  );

  const missingDates = !dates.Pedró || !dates.Gavarra;

  return (
    <Card className="p-4 border-primary/30">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
        <div>
          <h2 className="text-lg font-bold text-foreground">Impacte de les mesures de pacificació</h2>
          <p className="text-xs text-muted-foreground">
            Comparació abans/després de l'activació · període complet de dades · independent dels filtres
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox
            checked={includeUnreliable}
            onCheckedChange={(v) => setIncludeUnreliable(v === true)}
            data-testid="toggle-include-unreliable"
          />
          Incloure càmeres no fiables
        </label>
      </div>

      {missingDates && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 my-2 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Falta la data d'activació d'algun barri. Configura-la a{" "}
            <Link href="/configuracio" className="underline font-medium">Configuració</Link>{" "}
            perquè el càlcul d'impacte sigui complet.
          </span>
        </div>
      )}

      {impact.byNeighbourhood.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No hi ha prou dades ni dates d'activació per calcular l'impacte.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2" data-testid="impact-cards">
          {impact.byNeighbourhood.map((n) => (
            <NeighbourhoodCard key={n.neighbourhood} n={n} />
          ))}
        </div>
      )}

      {/* Per-camera detail */}
      <Collapsible open={tableOpen} onOpenChange={setTableOpen} className="mt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Detall per punt de control (càmera/pilona)</p>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" data-testid="toggle-impact-table">
              {tableOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="ml-1 text-sm">{tableOpen ? "Amagar" : "Mostrar"}</span>
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs border-collapse" data-testid="impact-table">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left p-1.5 font-medium">Càmera</th>
                  <th className="text-left p-1.5 font-medium">Ubicació</th>
                  <th className="text-left p-1.5 font-medium">Tipus</th>
                  <th className="text-left p-1.5 font-medium">Barri</th>
                  <th className="text-right p-1.5 font-medium">Festius (abans→després)</th>
                  <th className="text-right p-1.5 font-medium">Δ festius</th>
                  <th className="text-right p-1.5 font-medium">Laborables (abans→després)</th>
                  <th className="text-right p-1.5 font-medium">Δ laborables</th>
                </tr>
              </thead>
              <tbody>
                {impact.byCamera.map((c) => (
                  <tr
                    key={c.camera}
                    className={`border-b border-border/40 ${!c.reliable ? "opacity-50" : ""}`}
                    data-testid={`impact-row-${c.camera}`}
                  >
                    <td className="p-1.5 font-mono font-medium">
                      {c.camera}
                      {!c.reliable && <span className="ml-1 text-[9px] text-amber-600">(no fiable)</span>}
                    </td>
                    <td className="p-1.5 max-w-[220px] truncate" title={c.displayName ?? ""}>{c.displayName ?? "—"}</td>
                    <td className="p-1.5">{c.cameraType}</td>
                    <td className="p-1.5">{c.neighbourhood}</td>
                    <td className="p-1.5 text-right">
                      {c.holiday ? `${fmt(c.holiday.before.avgPerDay)} → ${fmt(c.holiday.after.avgPerDay)}` : "—"}
                    </td>
                    <td className="p-1.5 text-right">{c.holiday ? <DeltaBadge pct={c.holiday.deltaPct} /> : <span className="text-muted-foreground text-[10px]">dades insuf.</span>}</td>
                    <td className="p-1.5 text-right">
                      {c.working ? `${fmt(c.working.before.avgPerDay)} → ${fmt(c.working.after.avgPerDay)}` : "—"}
                    </td>
                    <td className="p-1.5 text-right">{c.working ? <DeltaBadge pct={c.working.deltaPct} /> : <span className="text-muted-foreground text-[10px]">dades insuf.</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <p className="text-[10px] text-muted-foreground/80 mt-3 leading-relaxed">
        Metodologia: es comparen dies equivalents (laborables amb laborables, festius amb festius) abans i
        després de l'activació, amb la mitjana de vehicles per dia de cada càmera (normalitza les diferències
        de cobertura). Només s'hi inclouen càmeres amb prou dies de dades a banda i banda. Els resultats
        coincideixen amb l'activació de les mesures, però són descriptius i no estableixen causalitat directa.
      </p>
    </Card>
  );
}
