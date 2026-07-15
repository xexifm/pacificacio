"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Info } from "lucide-react";
import { getCameraSettings, getBollardSettings } from "@/lib/dataStore";
import type { CameraSettings, BollardSettings } from "@/lib/types";

const NEIGHBOURHOODS = ["Pedró", "Gavarra"];
const DEVICE_TYPES = ["Pilona", "Càmera"];

export default function Configuracio() {
  const { data: cameraSettings = [], isLoading } = useQuery<CameraSettings[]>({
    queryKey: ["camera-settings"],
    queryFn: getCameraSettings,
  });
  const { data: bollard } = useQuery<BollardSettings>({
    queryKey: ["bollard-settings"],
    queryFn: getBollardSettings,
  });

  const [cameras, setCameras] = useState<CameraSettings[]>([]);
  const [pedro, setPedro] = useState("");
  const [gavarra, setGavarra] = useState("");

  useEffect(() => {
    if (cameraSettings.length > 0) setCameras(cameraSettings.map((c) => ({ ...c })));
  }, [cameraSettings]);

  useEffect(() => {
    if (bollard) {
      setPedro(bollard.bollardStartDatePedro ?? "");
      setGavarra(bollard.bollardStartDateGavarra ?? "");
    }
  }, [bollard]);

  const sortedCameras = useMemo(
    () =>
      [...cameras].sort(
        (a, b) => parseInt(a.cameraId.replace(/\D/g, "")) - parseInt(b.cameraId.replace(/\D/g, "")),
      ),
    [cameras],
  );

  const update = (cameraId: string, patch: Partial<CameraSettings>) => {
    setCameras((prev) => prev.map((c) => (c.cameraId === cameraId ? { ...c, ...patch } : c)));
  };

  const handleDownload = () => {
    const out = {
      cameras: sortedCameras.map((c) => ({
        cameraId: c.cameraId,
        displayName: c.displayName ?? null,
        neighbourhood: c.neighbourhood,
        cameraType: c.cameraType || "Càmera",
      })),
      bollard: {
        bollardStartDatePedro: pedro || null,
        bollardStartDateGavarra: gavarra || null,
      },
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "settings.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground mb-2">Configuració</h1>
          <p className="text-muted-foreground text-sm">
            Ajusta l'assignació de càmeres a barris, el tipus de dispositiu i les dates
            d'activació de les pilones. Aquests valors afecten les analítiques.
          </p>
        </header>

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Aquesta és una app estàtica: els canvis es descarreguen com a{" "}
            <code className="font-mono">settings.json</code>. Per publicar-los, substitueix{" "}
            <code className="font-mono">public/data/settings.json</code> al repositori amb el
            fitxer descarregat i fes-hi commit — GitHub Pages es tornarà a desplegar
            automàticament.
          </AlertDescription>
        </Alert>

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">Carregant configuració...</div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Assignació de càmeres</CardTitle>
                <CardDescription>Barri i tipus de dispositiu per a cada càmera.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 min-w-0" />
                  <span className="w-28 text-xs text-muted-foreground text-center">Tipus dispositiu</span>
                  <span className="w-28 text-xs text-muted-foreground text-center">Barri</span>
                </div>
                <div className="space-y-2">
                  {sortedCameras.map((cam) => (
                    <div
                      key={cam.cameraId}
                      className="flex items-center gap-3 py-1 border-b border-border/50 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-sm font-medium">{cam.cameraId}</span>
                        {cam.displayName && (
                          <span
                            className="text-muted-foreground text-xs ml-2 truncate"
                            title={cam.displayName}
                          >
                            — {cam.displayName}
                          </span>
                        )}
                      </div>
                      <Select
                        value={cam.cameraType || "Càmera"}
                        onValueChange={(v) => update(cam.cameraId, { cameraType: v })}
                      >
                        <SelectTrigger className="w-28" data-testid={`select-type-${cam.cameraId}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DEVICE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={cam.neighbourhood}
                        onValueChange={(v) => update(cam.cameraId, { neighbourhood: v })}
                      >
                        <SelectTrigger className="w-28" data-testid={`select-nb-${cam.cameraId}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NEIGHBOURHOODS.map((n) => (
                            <SelectItem key={n} value={n}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Data d'activació de les pilones</CardTitle>
                <CardDescription>
                  Primera data en què les pilones van estar actives (aixecades) per cada barri.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="pedro" className="text-sm">
                      Pedró
                    </Label>
                    <Input
                      id="pedro"
                      type="date"
                      value={pedro}
                      onChange={(e) => setPedro(e.target.value)}
                      className="mt-1"
                      data-testid="input-bollard-pedro"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gavarra" className="text-sm">
                      Gavarra
                    </Label>
                    <Input
                      id="gavarra"
                      type="date"
                      value={gavarra}
                      onChange={(e) => setGavarra(e.target.value)}
                      className="mt-1"
                      data-testid="input-bollard-gavarra"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div>
              <Button onClick={handleDownload} className="gap-2" data-testid="button-download-settings">
                <Download className="w-4 h-4" />
                Descarrega settings.json
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
