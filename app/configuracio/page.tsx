"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Info, Lock, Save, Check, AlertTriangle } from "lucide-react";
import {
  getCameraSettings, getBollardSettings, getSchedules,
  saveSettingsOverride, clearSettingsOverride, hasSettingsOverride,
} from "@/lib/dataStore";
import {
  DAY_KEYS, DAY_LABELS, DEFAULT_SCHEDULES, scheduleSummary,
  type SchedulesMap, type NamedSchedule, type DayKey, type TimeRange,
} from "@/lib/schedule";
import type { CameraSettings, BollardSettings } from "@/lib/types";

const NEIGHBOURHOODS = ["Pedró", "Gavarra"];
const DEVICE_TYPES = ["Pilona", "Càmera"];

// Client-side gate. This is NOT server security (a static site can't have that);
// it just keeps the config page out of casual reach so only the owner edits it.
// No external server is involved — the password is checked in the browser and the
// unlocked state is kept in sessionStorage for the tab's lifetime.
const CONFIG_PASSWORD = "CORNELLA";
const UNLOCK_KEY = "pacificacio-config-unlocked";

export default function Configuracio() {
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      setUnlocked(sessionStorage.getItem(UNLOCK_KEY) === "1");
    } catch {
      /* sessionStorage unavailable */
    }
    setChecked(true);
  }, []);

  const handleUnlock = () => {
    try {
      sessionStorage.setItem(UNLOCK_KEY, "1");
    } catch {
      /* ignore */
    }
    setUnlocked(true);
  };

  if (!checked) return null;
  if (!unlocked) return <PasswordGate onUnlock={handleUnlock} />;
  return <ConfigEditor />;
}

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value === CONFIG_PASSWORD) {
      onUnlock();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-lg">Configuració protegida</CardTitle>
          <CardDescription>Introdueix la contrasenya per accedir a la configuració.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input
              type="password"
              autoFocus
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(false); }}
              placeholder="Contrasenya"
              data-testid="input-config-password"
              aria-invalid={error}
            />
            {error && <p className="text-sm text-destructive" data-testid="config-password-error">Contrasenya incorrecta.</p>}
            <Button type="submit" className="w-full" data-testid="button-config-unlock">Entra</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigEditor() {
  const queryClient = useQueryClient();
  const { data: cameraSettings = [], isLoading } = useQuery<CameraSettings[]>({
    queryKey: ["camera-settings"], queryFn: getCameraSettings,
  });
  const { data: bollard } = useQuery<BollardSettings>({ queryKey: ["bollard-settings"], queryFn: getBollardSettings });
  const { data: loadedSchedules } = useQuery<SchedulesMap>({ queryKey: ["schedules"], queryFn: getSchedules });

  const [cameras, setCameras] = useState<CameraSettings[]>([]);
  const [pedro, setPedro] = useState("");
  const [gavarra, setGavarra] = useState("");
  const [schedules, setSchedules] = useState<SchedulesMap>(DEFAULT_SCHEDULES);
  const [saved, setSaved] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);

  useEffect(() => {
    if (cameraSettings.length > 0) setCameras(cameraSettings.map((c) => ({ ...c })));
  }, [cameraSettings]);
  useEffect(() => {
    if (bollard) { setPedro(bollard.bollardStartDatePedro ?? ""); setGavarra(bollard.bollardStartDateGavarra ?? ""); }
  }, [bollard]);
  useEffect(() => {
    if (loadedSchedules && Object.keys(loadedSchedules).length > 0) {
      setSchedules(JSON.parse(JSON.stringify(loadedSchedules)));
    }
  }, [loadedSchedules]);
  // Re-check once the published settings have actually loaded (the override is only
  // considered active when it matches the current published file).
  useEffect(() => { setHasOverride(hasSettingsOverride()); }, [cameraSettings, loadedSchedules]);

  const sortedCameras = useMemo(
    () => [...cameras].sort((a, b) => parseInt(a.cameraId.replace(/\D/g, "")) - parseInt(b.cameraId.replace(/\D/g, ""))),
    [cameras],
  );
  const scheduleIds = useMemo(() => Object.keys(schedules), [schedules]);

  const updateCamera = (cameraId: string, patch: Partial<CameraSettings>) =>
    setCameras((prev) => prev.map((c) => (c.cameraId === cameraId ? { ...c, ...patch } : c)));

  const updateDay = (schedId: string, day: DayKey, range: TimeRange | null) =>
    setSchedules((prev) => ({
      ...prev,
      [schedId]: { ...prev[schedId], hours: { ...prev[schedId].hours, [day]: range } },
    }));

  const buildSettings = () => ({
    cameras: sortedCameras.map((c) => ({
      cameraId: c.cameraId,
      displayName: c.displayName ?? null,
      neighbourhood: c.neighbourhood,
      cameraType: c.cameraType || "Càmera",
      reliable: c.reliable !== false,
      scheduleId: c.scheduleId || "generic",
    })),
    bollard: { bollardStartDatePedro: pedro || null, bollardStartDateGavarra: gavarra || null },
    schedules,
  });

  const handleSave = () => {
    saveSettingsOverride(buildSettings());
    setHasOverride(true);
    // Re-fetch everything that depends on settings so the dashboard reflects the change.
    queryClient.invalidateQueries();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    clearSettingsOverride();
    setHasOverride(false);
    queryClient.invalidateQueries();
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(buildSettings(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "settings.json";
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground mb-2">Configuració</h1>
          <p className="text-muted-foreground text-sm">
            Assignació de càmeres a barris, fiabilitat, dates d'activació i horaris de restricció.
            Aquests valors afecten l'anàlisi d'impacte.
          </p>
        </header>

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Prem <strong>Guardar canvis</strong> per aplicar els canvis en aquest dispositiu (es desen al
            navegador, sense servidors externs). Per fer-los públics per a tothom, prem
            <strong> Descarrega settings.json</strong>, substitueix
            <code className="font-mono"> public/data/settings.json</code> al repositori amb el fitxer
            descarregat i fes-hi commit.
          </AlertDescription>
        </Alert>

        {hasOverride && (
          <Alert className="mb-6 border-amber-500/50 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-500" data-testid="override-banner">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm flex flex-wrap items-center gap-2">
              <span>
                Estàs veient <strong>canvis locals guardats en aquest navegador</strong>, no els valors
                publicats al repositori. Descarta'ls per tornar a veure la configuració pública.
              </span>
              <Button
                onClick={handleReset}
                size="sm"
                variant="outline"
                className="h-7 border-amber-500/60"
                data-testid="button-discard-override"
              >
                Descarta els canvis locals
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">Carregant configuració...</div>
        ) : (
          <div className="space-y-6">
            {/* ── Cameras ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Punts de control (càmeres i pilones)</CardTitle>
                <CardDescription>
                  Barri, tipus de dispositiu, fiabilitat i l'horari de restricció que segueix cada punt
                  (pilones i càmeres). Les no fiables s'exclouen dels indicadors de titular.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left font-medium py-1">Punt</th>
                      <th className="text-center font-medium px-1">Fiable</th>
                      <th className="text-center font-medium px-1">Tipus</th>
                      <th className="text-center font-medium px-1">Barri</th>
                      <th className="text-center font-medium px-1">Horari restricció</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCameras.map((cam) => (
                      <tr key={cam.cameraId} className="border-b border-border/40 last:border-0">
                        <td className="py-1.5">
                          <span className="font-mono text-sm font-medium">{cam.cameraId}</span>
                          {cam.displayName && (
                            <span className="text-muted-foreground text-xs ml-2 hidden md:inline truncate" title={cam.displayName}>
                              — {cam.displayName}
                            </span>
                          )}
                        </td>
                        <td className="text-center px-1">
                          <Checkbox
                            checked={cam.reliable !== false}
                            onCheckedChange={(v) => updateCamera(cam.cameraId, { reliable: v === true })}
                            data-testid={`check-reliable-${cam.cameraId}`}
                          />
                        </td>
                        <td className="px-1">
                          <Select value={cam.cameraType || "Càmera"} onValueChange={(v) => updateCamera(cam.cameraId, { cameraType: v })}>
                            <SelectTrigger className="w-24 h-8" data-testid={`select-type-${cam.cameraId}`}><SelectValue /></SelectTrigger>
                            <SelectContent>{DEVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-1">
                          <Select value={cam.neighbourhood} onValueChange={(v) => updateCamera(cam.cameraId, { neighbourhood: v })}>
                            <SelectTrigger className="w-24 h-8" data-testid={`select-nb-${cam.cameraId}`}><SelectValue /></SelectTrigger>
                            <SelectContent>{NEIGHBOURHOODS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 text-center">
                          <Select value={cam.scheduleId || "generic"} onValueChange={(v) => updateCamera(cam.cameraId, { scheduleId: v })}>
                            <SelectTrigger className="w-44 h-8" data-testid={`select-schedule-${cam.cameraId}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {scheduleIds.map((id) => <SelectItem key={id} value={id}>{schedules[id].label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* ── Activation dates ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Data d'activació de les mesures</CardTitle>
                <CardDescription>Data de referència per a l'anàlisi d'impacte (abans/després) a cada barri.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="pedro" className="text-sm">Pedró</Label>
                    <Input id="pedro" type="date" value={pedro} onChange={(e) => setPedro(e.target.value)} className="mt-1" data-testid="input-bollard-pedro" />
                  </div>
                  <div>
                    <Label htmlFor="gavarra" className="text-sm">Gavarra</Label>
                    <Input id="gavarra" type="date" value={gavarra} onChange={(e) => setGavarra(e.target.value)} className="mt-1" data-testid="input-bollard-gavarra" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Schedules ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Horaris de restricció (dies i hores)</CardTitle>
                <CardDescription>
                  Defineix, per a cada horari estàndard, els dies i les hores en què el punt està en
                  restricció (pilona aixecada o càmera activa). Cada punt n'utilitza un. Per a l'anàlisi
                  (dades diàries), un dia compta com a restringit si ho està 12h o més.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {scheduleIds.map((id) => (
                  <ScheduleEditor
                    key={id}
                    schedId={id}
                    sched={schedules[id]}
                    onLabel={(label) => setSchedules((p) => ({ ...p, [id]: { ...p[id], label } }))}
                    onDay={(day, range) => updateDay(id, day, range)}
                  />
                ))}
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleSave} className="gap-2" data-testid="button-save-settings">
                {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? "Canvis guardats" : "Guardar canvis"}
              </Button>
              <Button onClick={handleDownload} variant="outline" className="gap-2" data-testid="button-download-settings">
                <Download className="w-4 h-4" /> Descarrega settings.json
              </Button>
              {hasOverride && (
                <Button onClick={handleReset} variant="ghost" className="gap-2 text-muted-foreground" data-testid="button-reset-settings">
                  Restaura els valors publicats
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleEditor({
  schedId, sched, onLabel, onDay,
}: { schedId: string; sched: NamedSchedule; onLabel: (l: string) => void; onDay: (day: DayKey, range: TimeRange | null) => void }) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="font-mono text-[11px] text-muted-foreground">{schedId}</span>
        <Input
          value={sched.label}
          onChange={(e) => onLabel(e.target.value)}
          className="h-8 max-w-md text-sm"
          data-testid={`schedule-label-${schedId}`}
        />
        <span className="text-xs text-muted-foreground">· {scheduleSummary(sched)}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {DAY_KEYS.map((day) => {
          const r = sched.hours[day] ?? null;
          const on = !!r;
          return (
            <div key={day} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={on}
                onCheckedChange={(v) => onDay(day, v === true ? { from: "00:00", to: "23:59" } : null)}
                data-testid={`sched-${schedId}-${day}`}
              />
              <span className="w-20 text-xs">{DAY_LABELS[day]}</span>
              <Input
                type="time" value={r?.from ?? "00:00"} disabled={!on}
                onChange={(e) => onDay(day, { from: e.target.value, to: r?.to ?? "23:59" })}
                className="h-7 w-24 text-xs"
              />
              <span className="text-muted-foreground text-xs">→</span>
              <Input
                type="time" value={r?.to ?? "23:59"} disabled={!on}
                onChange={(e) => onDay(day, { from: r?.from ?? "00:00", to: e.target.value })}
                className="h-7 w-24 text-xs"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
