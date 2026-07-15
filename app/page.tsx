"use client";

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import FileUploadZone from '@/components/FileUploadZone';
import FileInfo from '@/components/FileInfo';
import DataPreview from '@/components/DataPreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, RotateCcw, CheckCircle, AlertCircle, Trash2, RefreshCw, Lock, LogOut, Settings, FileSpreadsheet } from 'lucide-react';
import { transformCSV, transformedRowsToCSV, downloadCSV, TransformedRow, transformExcel, isExcelFile } from '@/lib/csvTransformer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { CameraSettings } from '@/lib/schema';

const CAMERAS = ['CT10', 'CT11', 'CT12', 'CT13', 'CT14', 'CT15', 'CT16', 'CT17', 'CT18', 'CT19', 'CT20', 'CT21', 'CT22', 'CT23'];
const NEIGHBOURHOODS = ['Pedró', 'Gavarra'];

function AdminLoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetRequest, setShowResetRequest] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest('POST', '/api/admin/login', { password });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Contrasenya incorrecta');
      }

      const { token } = await response.json();
      localStorage.setItem('adminToken', token);
      onLogin(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error d\'autenticació');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetRequest = async () => {
    try {
      await apiRequest('POST', '/api/admin/request-reset', {});
      setResetRequested(true);
    } catch (err) {
      setError('Error enviant sol·licitud de restabliment');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Lock className="w-12 h-12 mx-auto text-primary mb-4" />
          <CardTitle>Accés d'administrador</CardTitle>
          <CardDescription>
            Introdueix la contrasenya per accedir a la pàgina de càrrega de dades.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showResetRequest ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Contrasenya</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Introdueix la contrasenya"
                  required
                  data-testid="input-admin-password"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
                data-testid="button-admin-login"
              >
                {isLoading ? 'Accedint...' : 'Accedir'}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm"
                onClick={() => setShowResetRequest(true)}
                data-testid="button-forgot-password"
              >
                Has oblidat la contrasenya?
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              {resetRequested ? (
                <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    Si l'email d'administrador està configurat, rebràs un enllaç per restablir la contrasenya.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    S'enviarà un enllaç de restabliment a l'email de l'administrador configurat.
                  </p>
                  <Button 
                    onClick={handleResetRequest}
                    className="w-full"
                    data-testid="button-request-reset"
                  >
                    Sol·licitar restabliment
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setShowResetRequest(false);
                  setResetRequested(false);
                }}
              >
                Tornar a l'inici de sessió
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface BollardSettings {
  bollardStartDatePedro: string | null;
  bollardStartDateGavarra: string | null;
}

function CameraSettingsPanel({ token }: { token: string }) {
  const { toast } = useToast();
  
  const { data: cameraSettings, isLoading } = useQuery<CameraSettings[]>({
    queryKey: ['/api/admin/camera-settings'],
    queryFn: async () => {
      const response = await fetch('/api/admin/camera-settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch camera settings');
      return response.json();
    }
  });

  const { data: bollardSettings } = useQuery<BollardSettings>({
    queryKey: ['/api/bollard-settings'],
  });

  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});
  const [localCameraTypes, setLocalCameraTypes] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [bollardPedro, setBollardPedro] = useState('');
  const [bollardGavarra, setBollardGavarra] = useState('');
  const [hasBollardChanges, setHasBollardChanges] = useState(false);

  useEffect(() => {
    if (cameraSettings) {
      const settingsMap: Record<string, string> = {};
      const typesMap: Record<string, string> = {};
      cameraSettings.forEach(s => {
        settingsMap[s.cameraId] = s.neighbourhood;
        typesMap[s.cameraId] = s.cameraType || 'Càmera';
      });
      CAMERAS.forEach(cam => {
        if (!settingsMap[cam]) {
          settingsMap[cam] = cam.startsWith('CT1') && parseInt(cam.slice(2)) <= 15 ? 'Pedró' : 'Gavarra';
        }
        if (!typesMap[cam]) {
          typesMap[cam] = 'Càmera';
        }
      });
      setLocalSettings(settingsMap);
      setLocalCameraTypes(typesMap);
    }
  }, [cameraSettings]);

  useEffect(() => {
    if (bollardSettings) {
      setBollardPedro(bollardSettings.bollardStartDatePedro || '');
      setBollardGavarra(bollardSettings.bollardStartDateGavarra || '');
    }
  }, [bollardSettings]);

  const updateMutation = useMutation({
    mutationFn: async (settings: { cameraId: string; neighbourhood: string }[]) => {
      const response = await fetch('/api/admin/camera-settings', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(settings)
      });
      if (!response.ok) throw new Error('Failed to update camera settings');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Configuració guardada', description: 'Les assignacions de càmera s\'han actualitzat.' });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/camera-settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/camera-settings'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const updateBollardMutation = useMutation({
    mutationFn: async (settings: BollardSettings) => {
      const response = await fetch('/api/admin/bollard-settings', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(settings)
      });
      if (!response.ok) throw new Error('Failed to update bollard settings');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Configuració guardada', description: 'Les dates dels pilones s\'han actualitzat.' });
      setHasBollardChanges(false);
      queryClient.invalidateQueries({ queryKey: ['/api/bollard-settings'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const handleNeighbourhoodChange = (cameraId: string, neighbourhood: string) => {
    setLocalSettings(prev => ({ ...prev, [cameraId]: neighbourhood }));
    setHasChanges(true);
  };

  const handleCameraTypeChange = (cameraId: string, cameraType: string) => {
    setLocalCameraTypes(prev => ({ ...prev, [cameraId]: cameraType }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const settings = Object.entries(localSettings).map(([cameraId, neighbourhood]) => ({
      cameraId,
      neighbourhood,
      cameraType: localCameraTypes[cameraId] || 'Càmera',
    }));
    updateMutation.mutate(settings);
  };

  const handleSaveBollard = () => {
    updateBollardMutation.mutate({
      bollardStartDatePedro: bollardPedro || null,
      bollardStartDateGavarra: bollardGavarra || null,
    });
  };

  const getDisplayName = (cameraId: string): string | null => {
    const setting = cameraSettings?.find(s => s.cameraId === cameraId);
    return setting?.displayName || null;
  };

  if (isLoading) {
    return <div className="text-center py-4 text-muted-foreground">Carregant configuració...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium mb-3">Assignació de càmeres a barris</h4>
        <div className="flex items-center gap-3 px-0 mb-1">
          <div className="flex-1 min-w-0" />
          <span className="w-28 text-xs text-muted-foreground text-center">Tipus dispositiu</span>
          <span className="w-28 text-xs text-muted-foreground text-center">Barri</span>
        </div>
        <div className="space-y-2">
          {CAMERAS.map(cam => {
            const displayName = getDisplayName(cam);
            return (
              <div key={cam} className="flex items-center gap-3 py-1 border-b border-border/50 last:border-0">
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-sm font-medium">{cam}</span>
                  {displayName && (
                    <span className="text-muted-foreground text-xs ml-2 truncate" title={displayName}>
                      — {displayName}
                    </span>
                  )}
                </div>
                <Select
                  value={localCameraTypes[cam] || 'Càmera'}
                  onValueChange={(value) => handleCameraTypeChange(cam, value)}
                >
                  <SelectTrigger className="w-28" data-testid={`select-camera-type-${cam}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pilona">Pilona</SelectItem>
                    <SelectItem value="Càmera">Càmera</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={localSettings[cam] || 'Pedró'}
                  onValueChange={(value) => handleNeighbourhoodChange(cam, value)}
                >
                  <SelectTrigger className="w-28" data-testid={`select-camera-${cam}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NEIGHBOURHOODS.map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
        
        {hasChanges && (
          <Button 
            onClick={handleSave} 
            disabled={updateMutation.isPending}
            className="mt-3"
            data-testid="button-save-camera-settings"
          >
            {updateMutation.isPending ? 'Guardant...' : 'Guardar canvis de càmeres'}
          </Button>
        )}
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-3">Data d'activació dels pilones</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Indica la primera data en què els pilones van estar actius (aixecats) per cada barri.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="bollard-pedro" className="text-sm">Pedró</Label>
            <Input
              id="bollard-pedro"
              type="date"
              value={bollardPedro}
              onChange={(e) => {
                setBollardPedro(e.target.value);
                setHasBollardChanges(true);
              }}
              className="mt-1"
              data-testid="input-bollard-pedro"
            />
          </div>
          <div>
            <Label htmlFor="bollard-gavarra" className="text-sm">Gavarra</Label>
            <Input
              id="bollard-gavarra"
              type="date"
              value={bollardGavarra}
              onChange={(e) => {
                setBollardGavarra(e.target.value);
                setHasBollardChanges(true);
              }}
              className="mt-1"
              data-testid="input-bollard-gavarra"
            />
          </div>
        </div>
        
        {hasBollardChanges && (
          <Button 
            onClick={handleSaveBollard} 
            disabled={updateBollardMutation.isPending}
            className="mt-3"
            data-testid="button-save-bollard-settings"
          >
            {updateBollardMutation.isPending ? 'Guardant...' : 'Guardar dates de pilones'}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  const [file, setFile] = useState<File | null>(null);
  const [transformedData, setTransformedData] = useState<TransformedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('adminToken');
      if (!storedToken) {
        setIsCheckingAuth(false);
        return;
      }

      try {
        const response = await fetch('/api/admin/session', {
          headers: { 'Authorization': `Bearer ${storedToken}` }
        });
        const { authenticated } = await response.json();
        
        if (authenticated) {
          setAdminToken(storedToken);
        } else {
          localStorage.removeItem('adminToken');
        }
      } catch {
        localStorage.removeItem('adminToken');
      }
      
      setIsCheckingAuth(false);
    };

    checkAuth();
  }, []);

  const handleLogout = async () => {
    if (adminToken) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });
      } catch {}
    }
    localStorage.removeItem('adminToken');
    setAdminToken(null);
  };

  const CHUNK_SIZE = 10_000;

  const saveToDatabase = useCallback(async (data: TransformedRow[]) => {
    if (!adminToken) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    setUploadProgress(null);

    try {
      const dbRecords = data.map(row => ({
        camera: row.camera,
        datahora: row.datahora,
        tipusVehicle: row.tipusVehicle,
        valor: row.valor,
        dateTime: row.dateTime ? row.dateTime.toISOString() : new Date().toISOString(),
        neighbourhood: row.neighbourhood || null,
      }));

      const totalChunks = Math.ceil(dbRecords.length / CHUNK_SIZE);
      console.log(`[Client] Uploading ${dbRecords.length} records in ${totalChunks} chunks of ${CHUNK_SIZE}...`);

      let totalInserted = 0;
      let totalSkipped = 0;

      for (let i = 0; i < totalChunks; i++) {
        const chunk = dbRecords.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        setUploadProgress({ current: i + 1, total: totalChunks });

        const response = await fetch('/api/traffic-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
          },
          body: JSON.stringify(chunk),
        });

        if (!response.ok) {
          let errorMsg = 'Error del servidor';
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorData.message || `HTTP ${response.status}`;
          } catch {}
          throw new Error(`Error en el lot ${i + 1} de ${totalChunks}: ${errorMsg}`);
        }

        const result = await response.json() as { inserted: number; skipped: number };
        totalInserted += result.inserted;
        totalSkipped += result.skipped;
        console.log(`[Client] Chunk ${i + 1}/${totalChunks}: ${result.inserted} inserted, ${result.skipped} skipped`);
      }

      console.log(`[Client] Upload complete: ${totalInserted} inserted, ${totalSkipped} skipped`);
      setUploadProgress(null);
      setSuccess(
        `Base de dades actualitzada: ${totalInserted.toLocaleString()} nous registres afegits, ${totalSkipped.toLocaleString()} registres duplicats omesos.`
      );

      queryClient.invalidateQueries({ queryKey: ['/api/traffic-data'] });
      queryClient.invalidateQueries({ queryKey: ['/api/data-coverage'] });
    } catch (err) {
      console.error('[Client] Error saving to database:', err);
      setUploadProgress(null);
      setSuccess(null);
      setError(err instanceof Error ? err.message : 'Error guardant a la base de dades');
    } finally {
      setIsSaving(false);
    }
  }, [adminToken]);

  const processFile = useCallback(async (selectedFile: File) => {
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setImportErrors([]);
    
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      
      if (isExcelFile(selectedFile)) {
        console.log('[Client] Detected Excel file, attempting Excel import...');
        const excelResult = transformExcel(arrayBuffer);
        
        if (excelResult.format === 'excel') {
          if (excelResult.data.length > 0) {
            console.log(`[Client] Excel import successful: ${excelResult.data.length} records`);
            setTransformedData(excelResult.data);

            if (excelResult.errors.length > 0) {
              setImportErrors(excelResult.errors.slice(0, 10));
            }

            await saveToDatabase(excelResult.data);
          } else if (excelResult.errors.length > 0) {
            setImportErrors(excelResult.errors);
            throw new Error('El fitxer Excel té errors de validació i no s\'han pogut importar dades.');
          } else {
            throw new Error('El fitxer Excel no conté dades vàlides.');
          }
          return;
        }
      }
      
      const encodings = [
        { name: 'utf-8', label: 'UTF-8' },
        { name: 'iso-8859-1', label: 'ISO-8859-1' },
        { name: 'windows-1252', label: 'Windows-1252' }
      ];
      
      let csvText = '';
      let detectedEncoding = '';
      let bestResult = { text: '', recordCount: 0, encoding: '' };
      
      for (const { name, label } of encodings) {
        try {
          const decoder = new TextDecoder(name, { fatal: true });
          const decodedText = decoder.decode(arrayBuffer);
          
          const testTransform = transformCSV(decodedText);
          
          if (testTransform.length > bestResult.recordCount) {
            bestResult = {
              text: decodedText,
              recordCount: testTransform.length,
              encoding: label
            };
          }
          
          if (testTransform.length > 0) {
            csvText = decodedText;
            detectedEncoding = label;
            break;
          }
        } catch {
          continue;
        }
      }
      
      if (!csvText && bestResult.recordCount > 0) {
        csvText = bestResult.text;
        detectedEncoding = bestResult.encoding;
      }
      
      if (!csvText) {
        const decoder = new TextDecoder('utf-8', { fatal: false });
        csvText = decoder.decode(arrayBuffer);
        detectedEncoding = 'UTF-8 (amb caràcters no vàlids)';
      }
      
      console.log('[Client] Starting CSV transformation...');
      console.log('[Client] Detected encoding:', detectedEncoding);
      const transformed = transformCSV(csvText);
      
      if (transformed.length === 0) {
        // Log first few lines of the file to help diagnose
        const firstLines = csvText.split('\n').slice(0, 6);
        console.error('[Client] CSV parse failed. First lines of file:');
        firstLines.forEach((line, i) => console.error(`  Line ${i}: ${JSON.stringify(line)}`));
        throw new Error('No s\'han pogut extreure dades del fitxer CSV o Excel');
      }
      
      console.log(`[Client] CSV transformation complete: ${transformed.length} records generated`);
      setTransformedData(transformed);

      await saveToDatabase(transformed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error processant el fitxer');
      setTransformedData([]);
    } finally {
      setIsProcessing(false);
    }
  }, [saveToDatabase]);

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    processFile(selectedFile);
  }, [processFile]);

  const handleClear = useCallback(() => {
    setFile(null);
    setTransformedData([]);
    setError(null);
    setSuccess(null);
    setImportErrors([]);
  }, []);

  const handleDownloadExcel = useCallback(async () => {
    if (!adminToken) return;
    
    setIsDownloadingExcel(true);
    try {
      const response = await fetch('/api/export-excel', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      if (!response.ok) {
        throw new Error('Error descarregant Excel');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const contentDisposition = response.headers.get('content-disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `transit_cornella_${new Date().toISOString().slice(0, 10)}.xlsx`;
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Descàrrega completada',
        description: 'El fitxer Excel s\'ha descarregat correctament.',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error descarregant Excel',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingExcel(false);
    }
  }, [adminToken, toast]);

  const handleDownload = useCallback(() => {
    if (transformedData.length === 0) return;
    
    const csvContent = transformedRowsToCSV(transformedData);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    downloadCSV(csvContent, `vehicles_transformades_${timestamp}.csv`);
    
    setSuccess('Fitxer descarregat correctament!');
    setTimeout(() => setSuccess(null), 3000);
  }, [transformedData]);

  const handleClearData = useCallback(async () => {
    if (!adminToken) return;
    
    setIsClearing(true);
    try {
      const response = await fetch('/api/admin/clear-data', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      if (!response.ok) throw new Error('Failed to clear data');
      
      const result = await response.json() as { deleted: number };
      
      toast({
        title: 'Dades esborrades',
        description: `S'han eliminat ${result.deleted.toLocaleString()} registres de la base de dades.`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/traffic-data'] });
      queryClient.invalidateQueries({ queryKey: ['/api/data-coverage'] });
      queryClient.invalidateQueries({ queryKey: ['/api/detailed-data-coverage'] });
      
      setTransformedData([]);
      setFile(null);
      setSuccess(null);
      setConfirmDeleteText('');
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error esborrant les dades',
        variant: 'destructive',
      });
    } finally {
      setIsClearing(false);
    }
  }, [toast, adminToken]);

  const handleRefreshData = useCallback(async () => {
    if (!adminToken) return;
    
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/admin/refresh-data', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      if (!response.ok) throw new Error('Failed to refresh data');
      
      toast({
        title: 'Dades actualitzades',
        description: 'Les dades derivades s\'han recalculat correctament.',
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/traffic-data'] });
      queryClient.invalidateQueries({ queryKey: ['/api/data-coverage'] });
      queryClient.invalidateQueries({ queryKey: ['/api/detailed-data-coverage'] });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error actualitzant les dades',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [toast, adminToken]);

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!adminToken) {
    return <AdminLoginForm onLogin={(token) => setAdminToken(token)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-foreground mb-2">
              Secció administrador
            </h1>
            <p className="text-muted-foreground">
              Gestiona les dades de trànsit, configuració de càmeres i paràmetres d'anàlisi. Puja fitxers CSV o Excel per afegir nous registres.
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleLogout}
            className="gap-2"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            Tancar sessió
          </Button>
        </header>

        <div className="space-y-8">
          {!file ? (
            <section>
              <FileUploadZone onFileSelect={handleFileSelect} disabled={isProcessing} />
            </section>
          ) : (
            <section>
              <FileInfo
                fileName={file.name}
                fileSize={file.size}
                onClear={handleClear}
              />
            </section>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription data-testid="alert-error">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-200" data-testid="alert-success">
                {success}
              </AlertDescription>
            </Alert>
          )}

          {importErrors.length > 0 && (
            <Alert variant="destructive" className="bg-amber-50 dark:bg-amber-950/20 border-amber-500/50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-2">Advertències d'importació:</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {importErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
                {importErrors.length === 10 && (
                  <p className="text-xs mt-2 italic">Només es mostren les primeres 10 advertències.</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {(isProcessing || isSaving) && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-4 text-sm text-muted-foreground">
                {isProcessing
                  ? 'Processant fitxer...'
                  : uploadProgress
                    ? `Pujant lot ${uploadProgress.current} de ${uploadProgress.total}...`
                    : 'Preparant dades per pujar...'}
              </p>
              {isSaving && uploadProgress && (
                <div className="mt-3 max-w-xs mx-auto">
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Math.round((uploadProgress.current / uploadProgress.total) * 100)}% completat
                  </p>
                </div>
              )}
            </div>
          )}

          {transformedData.length > 0 && !isProcessing && (
            <>
              <section>
                <DataPreview data={transformedData} />
              </section>

              <section className="flex flex-wrap gap-4 justify-center">
                <Button
                  onClick={handleDownload}
                  size="lg"
                  className="gap-2"
                  data-testid="button-download"
                >
                  <Download className="w-5 h-5" />
                  Descarregar CSV Transformat
                </Button>
                
                <Button
                  variant="outline"
                  onClick={handleClear}
                  size="lg"
                  className="gap-2"
                  data-testid="button-reset"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reiniciar
                </Button>
              </section>
            </>
          )}

          <section className="mt-12 pt-8 border-t border-border">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-5 h-5" />
              <h2 className="text-xl font-semibold text-foreground">
                Accions d'administració
              </h2>
            </div>
            
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Assignació de càmeres a barris</CardTitle>
                  <CardDescription>
                    Configura quin barri correspon a cada càmera. Aquests canvis afectaran les analítiques.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CameraSettingsPanel token={adminToken} />
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-4">
                <Button
                  onClick={handleDownloadExcel}
                  disabled={isDownloadingExcel}
                  className="gap-2"
                  data-testid="button-download-excel"
                >
                  <FileSpreadsheet className={`w-4 h-4 ${isDownloadingExcel ? 'animate-pulse' : ''}`} />
                  {isDownloadingExcel ? 'Descarregant...' : 'Descarregar dades'}
                </Button>

                <Button
                  onClick={handleRefreshData}
                  disabled={isRefreshing}
                  className="gap-2 bg-green-600 text-white hover:bg-green-700"
                  data-testid="button-refresh-data"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Actualitzant...' : 'Actualitzar dades'}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="gap-2"
                      disabled={isClearing}
                      data-testid="button-clear-data"
                    >
                      <Trash2 className="w-4 h-4" />
                      {isClearing ? 'Esborrant...' : 'Esborra dades'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirmar esborrat de dades</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-4">
                        <p>
                          Aquesta acció eliminarà <strong>TOTES</strong> les dades de trànsit de la base de dades.
                          Les analítiques quedaran buides fins que es tornin a pujar dades.
                        </p>
                        <p className="text-destructive font-medium">
                          Aquesta acció no es pot desfer.
                        </p>
                        <div className="pt-2">
                          <Label htmlFor="confirm-delete">
                            Escriu <strong>ESBORRAR</strong> per confirmar:
                          </Label>
                          <Input
                            id="confirm-delete"
                            value={confirmDeleteText}
                            onChange={(e) => setConfirmDeleteText(e.target.value)}
                            placeholder="ESBORRAR"
                            className="mt-2"
                            data-testid="input-confirm-delete"
                          />
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setConfirmDeleteText('')}>
                        Cancel·lar
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleClearData}
                        disabled={confirmDeleteText !== 'ESBORRAR'}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid="button-confirm-clear"
                      >
                        Sí, esborra totes les dades
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
