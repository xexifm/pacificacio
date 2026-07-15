"use client";

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format, isWeekend, getDay } from 'date-fns';
import { ca } from 'date-fns/locale';
import { isHoliday } from '@/lib/holidays';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface DataCoverageDetail {
  camera: string;
  date: string;
  totalVehicles: number;
  vehicleBreakdown: Record<string, number>;
}

interface BollardSettings {
  bollardStartDatePedro: string | null;
  bollardStartDateGavarra: string | null;
}

interface CameraSetting {
  cameraId: string;
  neighbourhood: string | null;
}

interface DateRange {
  from?: Date;
  to?: Date;
}

interface DataCoverageTableProps {
  selectedVehicleTypes?: string[];
  selectedNeighbourhood?: string;
  selectedCameras?: string[];
  dateRange?: DateRange;
  cameraToNeighbourhood?: Record<string, string>;
}

type DayCategory = 'working' | 'holiday_down' | 'holiday_up';

const DAY_CATEGORY_COLORS: Record<DayCategory, string> = {
  working: '#3b82f6',
  holiday_down: '#22c55e',
  holiday_up: '#ef4444',
};

function normalizeToDateOnly(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
}

function getDayCategory(date: Date, neighbourhood: string | undefined, bollardSettings: BollardSettings | undefined): DayCategory {
  const normalizedDate = normalizeToDateOnly(date);
  const dayOfWeek = getDay(normalizedDate);
  const isWeekendDay = isWeekend(normalizedDate);
  const isHolidayDay = isHoliday(normalizedDate);

  if (!isWeekendDay && !isHolidayDay) {
    return 'working';
  }

  if (!bollardSettings || !neighbourhood) {
    return 'holiday_down';
  }

  const bollardStartDate = neighbourhood === 'Pedró' 
    ? bollardSettings.bollardStartDatePedro 
    : neighbourhood === 'Gavarra' 
      ? bollardSettings.bollardStartDateGavarra 
      : null;

  if (!bollardStartDate) {
    return 'holiday_down';
  }

  const dateStr = format(normalizedDate, 'yyyy-MM-dd');
  return dateStr >= bollardStartDate ? 'holiday_up' : 'holiday_down';
}

export default function DataCoverageTable({ 
  selectedVehicleTypes = [], 
  selectedNeighbourhood = 'all',
  selectedCameras = [],
  dateRange,
  cameraToNeighbourhood: externalCameraMapping
}: DataCoverageTableProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: rawCoverage = [], isLoading } = useQuery<DataCoverageDetail[]>({
    queryKey: ['/api/detailed-data-coverage'],
  });

  const { data: bollardSettings } = useQuery<BollardSettings>({
    queryKey: ['/api/bollard-settings'],
  });

  const { data: cameraSettings = [] } = useQuery<CameraSetting[]>({
    queryKey: ['/api/camera-settings'],
  });

  const cameraToNeighbourhood = useMemo(() => {
    if (externalCameraMapping && Object.keys(externalCameraMapping).length > 0) {
      return externalCameraMapping;
    }
    const mapping: Record<string, string> = {};
    cameraSettings.forEach(s => {
      if (s.neighbourhood) {
        mapping[s.cameraId] = s.neighbourhood;
      }
    });
    return mapping;
  }, [cameraSettings, externalCameraMapping]);

  const getUTCDateKey = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const coverage = useMemo(() => {
    let filtered = rawCoverage;

    // Filter by date range
    if (dateRange?.from) {
      const startDateKey = format(dateRange.from, 'yyyy-MM-dd');
      const endDateKey = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : startDateKey;
      
      filtered = filtered.filter(item => {
        const itemDateKey = item.date.split('T')[0];
        return itemDateKey >= startDateKey && itemDateKey <= endDateKey;
      });
    }

    // Filter by neighbourhood
    if (selectedNeighbourhood !== 'all') {
      filtered = filtered.filter(item => {
        const camNeighbourhood = cameraToNeighbourhood[item.camera];
        return camNeighbourhood === selectedNeighbourhood;
      });
    }

    // Filter by selected cameras
    if (selectedCameras.length > 0) {
      filtered = filtered.filter(item => selectedCameras.includes(item.camera));
    }

    // Filter by vehicle types
    if (selectedVehicleTypes.length > 0) {
      filtered = filtered.map(item => {
        const filteredBreakdown: Record<string, number> = {};
        let filteredTotal = 0;

        selectedVehicleTypes.forEach(vehicleType => {
          if (item.vehicleBreakdown[vehicleType]) {
            const count = Number(item.vehicleBreakdown[vehicleType]);
            filteredBreakdown[vehicleType] = count;
            filteredTotal += count;
          }
        });

        return {
          ...item,
          totalVehicles: filteredTotal,
          vehicleBreakdown: filteredBreakdown,
        };
      }).filter(item => item.totalVehicles > 0);
    }

    return filtered;
  }, [rawCoverage, selectedVehicleTypes, selectedNeighbourhood, selectedCameras, dateRange, cameraToNeighbourhood]);

  const tableData = useMemo(() => {
    if (coverage.length === 0) return { cameras: [], dates: [], grid: new Map() };

    const allCameras = Array.from(new Set(coverage.map(c => c.camera))).sort();
    const allDatesSet = new Set<string>();
    
    coverage.forEach(c => {
      allDatesSet.add(c.date);
    });
    
    const allDates = Array.from(allDatesSet).sort();
    
    const grid = new Map<string, DataCoverageDetail>();
    coverage.forEach(c => {
      grid.set(`${c.camera}-${c.date}`, c);
    });

    return { cameras: allCameras, dates: allDates, grid };
  }, [coverage]);

  if (isLoading) {
    return (
      <Card className="p-4">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Cobertura de Dades per Càmera
        </h3>
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
        </div>
      </Card>
    );
  }

  if (tableData.cameras.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Cobertura de Dades per Càmera
        </h3>
        <p className="text-sm text-muted-foreground text-center py-2">
          No hi ha dades disponibles
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Cobertura de Dades per Càmera
            </h3>
            <p className="text-xs text-muted-foreground">
              {tableData.cameras.length} càmeres · {tableData.dates.length} dates
            </p>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" data-testid="button-toggle-coverage">
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="ml-1 text-sm">{isOpen ? 'Amagar' : 'Mostrar'}</span>
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="mt-4">
            <div className="flex gap-3 mb-3 text-xs flex-wrap">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: DAY_CATEGORY_COLORS.working }}></div>
                <span className="text-muted-foreground">Laborable</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: DAY_CATEGORY_COLORS.holiday_down }}></div>
                <span className="text-muted-foreground">Festiu (pilones baixats)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: DAY_CATEGORY_COLORS.holiday_up }}></div>
                <span className="text-muted-foreground">Festiu (pilones aixecats)</span>
              </div>
            </div>
            
            <TooltipProvider delayDuration={200}>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full border-collapse text-xs" data-testid="table-data-coverage">
                  <thead className="sticky top-0 z-20">
                    <tr>
                      <th className="border border-border bg-muted p-1 text-left font-medium sticky left-0 z-30 min-w-[80px]">
                        Data
                      </th>
                      {tableData.cameras.map(camera => {
                        const neighbourhood = cameraToNeighbourhood[camera];
                        return (
                          <th
                            key={camera}
                            className="border border-border bg-muted p-1 text-center font-medium min-w-[60px]"
                            data-testid={`header-camera-${camera}`}
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-xs font-bold">{camera}</span>
                              {neighbourhood && (
                                <span className="text-[9px] text-muted-foreground font-normal">{neighbourhood}</span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.dates.map(date => {
                      const dateObj = new Date(date);
                      const dayOfWeek = format(dateObj, 'EEEE', { locale: ca });
                      const capitalizedDayOfWeek = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);
                      return (
                        <tr key={date}>
                          <td className="border border-border p-1 font-medium sticky left-0 bg-background z-10 whitespace-nowrap text-xs">
                            <div className="flex flex-col">
                              <span>{format(dateObj, 'dd/MM/yy', { locale: ca })}</span>
                              <span className="text-[9px] text-muted-foreground font-normal">{capitalizedDayOfWeek}</span>
                            </div>
                          </td>
                          {tableData.cameras.map(camera => {
                            const key = `${camera}-${date}`;
                            const cellData = tableData.grid.get(key);
                            const neighbourhood = cameraToNeighbourhood[camera];
                            const dayCategory = getDayCategory(dateObj, neighbourhood, bollardSettings);
                            
                            const bgClasses = {
                              working: 'bg-blue-100 dark:bg-blue-900/40',
                              holiday_down: 'bg-green-100 dark:bg-green-900/40',
                              holiday_up: 'bg-red-100 dark:bg-red-900/40',
                            };
                            
                            if (!cellData) {
                              return (
                                <td
                                  key={key}
                                  className="border border-border p-1 text-center bg-muted/30"
                                  data-testid={`cell-${camera}-${date}`}
                                >
                                  -
                                </td>
                              );
                            }

                            const vehicleTypes = Object.keys(cellData.vehicleBreakdown).sort();
                            
                            return (
                              <td
                                key={key}
                                className={`border border-border p-1 text-center font-medium ${bgClasses[dayCategory]}`}
                                data-testid={`cell-${camera}-${date}`}
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help inline-block w-full text-xs">
                                      {cellData.totalVehicles >= 1000 
                                        ? `${(cellData.totalVehicles / 1000).toFixed(1)}k`
                                        : cellData.totalVehicles}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs" side="top" sideOffset={5}>
                                    <div className="space-y-1">
                                      <p className="font-semibold text-sm mb-2">
                                        {camera} - {format(dateObj, 'dd MMM yyyy', { locale: ca })}
                                      </p>
                                      {vehicleTypes.map(vehicleType => (
                                        <div key={vehicleType} className="flex justify-between gap-4 text-sm">
                                          <span>{vehicleType}:</span>
                                          <span className="font-medium">{cellData.vehicleBreakdown[vehicleType].toLocaleString('ca-ES')}</span>
                                        </div>
                                      ))}
                                      <div className="border-t pt-1 mt-1 flex justify-between gap-4 text-sm font-semibold">
                                        <span>Total:</span>
                                        <span>{cellData.totalVehicles.toLocaleString('ca-ES')}</span>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TooltipProvider>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}