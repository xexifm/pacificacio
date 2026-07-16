"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowDown, ArrowUp, Minus, AlertTriangle, ChevronDown, ChevronUp, ShieldCheck, Video } from "lucide-react";
import { computeImpact, deltaVerdict, type NeighbourhoodImpact, type DeviceComparison } from "@/lib/impact";
import type { SchedulesMap } from "@/lib/schedule";
import type { TrafficData, CameraSettings, BollardSettings } from "@/lib/types";

interface ImpactPanelProps {
  trafficData: TrafficData[];
  cameraSettings: CameraSettings[];
  bollardSettings: BollardSettings | undefined;
  schedules: SchedulesMap;
}

const fmt = (n: number) => Math.round(n).toLocaleString("ca-ES");
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function DeltaBadge({ pct, size = "sm" }: { pct: number | null; size?: "sm" | "lg" }) {
  const v = deltaVerdict(pct);
  const color =
    v === "reduction" ? "text-green-600 dark:text-green-400"
    : v === "increase" ? "text-red-600 dark:text-red-400"
    : "text-muted-foreground";
  const Icon = v === "reduction" ? ArrowDown : v === "increase" ? ArrowUp : Minus;
  const text = pct === null ? "N/D" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
  return (
    <span className={`inline-flex items-center gap-1 font-bold ${color} ${size === "lg" ? "text-3xl" : "text-sm"}`}>
      {pct !== null && <Icon className={size === "lg" ? "w-6 h-6" : "w-3.5 h-3.5"} />}
      {text}
    </span>
  );
}

function MiniBars({ before, after, pct }: { before: number; after: number; pct: number | null }) {
  const max = Math.max(before, after, 1);
  const v = deltaVerdict(pct);
  const afterColor = v === "reduction" ? "bg-green-500" : v === "increase" ? "bg-red-500" : "bg-muted-foreground";
  return (
    <div className="space-y-0.5 mt-1">
      <div className="flex items-center gap-2">
        <span className="w-12 text-[10px] text-muted-foreground shrink-0">Abans</span>
        <div className="flex-1 bg-muted rounded-sm h-2.5 overflow-hidden">
          <div className="h-full bg-muted-foreground/60 rounded-sm" style={{ width: `${(before / max) * 100}%` }} />
        </div>
        <span className="w-14 text-[10px] font-medium text-right shrink-0">{fmt(before)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 text-[10px] text-muted-foreground shrink-0">Després</span>
        <div className="flex-1 bg-muted rounded-sm h-2.5 overflow-hidden">
          <div className={`h-full ${afterColor} rounded-sm`} style={{ width: `${(after / max) * 100}%` }} />
        </div>
        <span className="w-14 text-[10px] font-medium text-right shrink-0">{fmt(after)}</span>
      </div>
    </div>
  );
}

function DeviceBlock({
  icon, title, subtitle, comp, primary,
}: { icon: React.ReactNode; title: string; subtitle: string; comp: DeviceComparison; primary?: boolean }) {
  const hasData = comp.camerasCount > 0;
  return (
    <div className={`rounded-lg border p-3 ${primary ? "border-primary/30 bg-primary/5" : "border-border"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <span className="text-[10px] text-muted-foreground">· {subtitle}</span>
      </div>
      {hasData ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <DeltaBadge pct={comp.deltaPct} size={primary ? "lg" : "sm"} />
            <span className="text-[11px] text-muted-foreground">
              {fmt(comp.before.avgPerDay)} → {fmt(comp.after.avgPerDay)} v/dia
            </span>
          </div>
          <MiniBars before={comp.before.avgPerDay} after={comp.after.avgPerDay} pct={comp.deltaPct} />
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground py-1">Sense dades suficients.</p>
      )}
    </div>
  );
}

function NeighbourhoodCard({ n }: { n: NeighbourhoodImpact }) {
  const cotxes = n.pilona.byVehicleDelta["Cotxe"];
  return (
    <Card className="p-4 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-foreground">{n.neighbourhood}</h3>
          <p className="text-[11px] text-muted-foreground">Mesures actives des del {fmtDate(n.interventionDate)}</p>
        </div>
        {n.seasonalityWarning && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400" title="Els períodes comparats cobreixen mesos diferents; interpreteu amb cautela.">
            <AlertTriangle className="w-3 h-3" /> estacionalitat
          </span>
        )}
      </div>

      <DeviceBlock
        primary
        icon={<ShieldCheck className="w-4 h-4 text-primary" />}
        title="Punts amb pilona"
        subtitle="dies amb barrera aixecada"
        comp={n.pilona}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <DeviceBlock
          icon={<Video className="w-3.5 h-3.5 text-muted-foreground" />}
          title="Punts sense pilona"
          subtitle="càmeres (control), festius"
          comp={n.camera}
        />
        <DeviceBlock
          icon={<Minus className="w-3.5 h-3.5 text-muted-foreground" />}
          title="Dies laborables"
          subtitle="control"
          comp={n.working}
        />
      </div>

      {cotxes && (
        <div className="flex items-center justify-between text-xs rounded border border-border px-2 py-1.5">
          <span className="text-muted-foreground">Cotxes als punts amb pilona (festius)</span>
          <DeltaBadge pct={cotxes.deltaPct} />
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-auto pt-1 border-t border-border/50">
        {n.pilona.camerasCount} {n.pilona.camerasCount === 1 ? "pilona" : "pilones"} ·{" "}
        {n.camera.camerasCount} {n.camera.camerasCount === 1 ? "càmera" : "càmeres"}
        {n.camerasExcluded.length > 0 && ` · ${n.camerasExcluded.length} excloses`}
      </p>
    </Card>
  );
}

export default function ImpactPanel({ trafficData, cameraSettings, bollardSettings, schedules }: ImpactPanelProps) {
  const [includeUnreliable, setIncludeUnreliable] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);

  const dates = useMemo(
    () => ({
      "Pedró": bollardSettings?.bollardStartDatePedro ?? null,
      "Gavarra": bollardSettings?.bollardStartDateGavarra ?? null,
    }),
    [bollardSettings],
  );

  const impact = useMemo(
    () => computeImpact(trafficData, cameraSettings, schedules, dates, { reliableOnly: !includeUnreliable }),
    [trafficData, cameraSettings, schedules, dates, includeUnreliable],
  );

  const missingDates = !dates["Pedró"] || !dates["Gavarra"];

  return (
    <Card className="p-4 border-primary/30">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
        <div>
          <h2 className="text-lg font-bold text-foreground">Impacte de les mesures de pacificació</h2>
          <p className="text-xs text-muted-foreground">
            Abans/després de l'activació · efecte a les pilones vs punts de control · independent dels filtres
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={includeUnreliable} onCheckedChange={(v) => setIncludeUnreliable(v === true)} data-testid="toggle-include-unreliable" />
          Incloure càmeres no fiables
        </label>
      </div>

      {missingDates && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 my-2 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Falta la data d'activació d'algun barri. Configura-la a{" "}
            <Link href="/configuracio" className="underline font-medium">Configuració</Link>.
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

      <Collapsible open={tableOpen} onOpenChange={setTableOpen} className="mt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Detall per punt de control</p>
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
                  <th className="text-left p-1.5 font-medium">Punt</th>
                  <th className="text-left p-1.5 font-medium">Ubicació</th>
                  <th className="text-left p-1.5 font-medium">Tipus</th>
                  <th className="text-left p-1.5 font-medium">Barri</th>
                  <th className="text-right p-1.5 font-medium">Festius (abans→després)</th>
                  <th className="text-right p-1.5 font-medium">Δ festius</th>
                  <th className="text-right p-1.5 font-medium">Δ laborables</th>
                </tr>
              </thead>
              <tbody>
                {impact.byCamera.map((c) => (
                  <tr key={c.camera} className={`border-b border-border/40 ${!c.reliable ? "opacity-50" : ""}`} data-testid={`impact-row-${c.camera}`}>
                    <td className="p-1.5 font-mono font-medium">
                      {c.camera}
                      {!c.reliable && <span className="ml-1 text-[9px] text-amber-600">(no fiable)</span>}
                    </td>
                    <td className="p-1.5 max-w-[220px] truncate" title={c.displayName ?? ""}>{c.displayName ?? "—"}</td>
                    <td className="p-1.5">
                      <span className={`inline-flex items-center gap-1 ${c.hasPilona ? "text-primary" : "text-muted-foreground"}`}>
                        {c.hasPilona ? <ShieldCheck className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                        {c.cameraType}
                      </span>
                    </td>
                    <td className="p-1.5">{c.neighbourhood}</td>
                    <td className="p-1.5 text-right">{c.festiu ? `${fmt(c.festiu.before.avgPerDay)} → ${fmt(c.festiu.after.avgPerDay)}` : "—"}</td>
                    <td className="p-1.5 text-right">{c.festiu ? <DeltaBadge pct={c.festiu.deltaPct} /> : <span className="text-muted-foreground text-[10px]">dades insuf.</span>}</td>
                    <td className="p-1.5 text-right">{c.working ? <DeltaBadge pct={c.working.deltaPct} /> : <span className="text-muted-foreground text-[10px]">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <p className="text-[10px] text-muted-foreground/80 mt-3 leading-relaxed">
        Metodologia: es comparen dies equivalents abans i després de l'activació, amb la mitjana de vehicles per dia
        de cada punt (normalitza la cobertura). Als <strong>punts amb pilona</strong> es compten només els dies que
        la barrera està aixecada segons el seu horari configurat; els <strong>punts sense pilona</strong> (càmeres)
        serveixen de control per veure desviaments de trànsit. Només s'hi inclouen punts amb prou dies a banda i
        banda. Resultats descriptius, no causals.
      </p>
    </Card>
  );
}
