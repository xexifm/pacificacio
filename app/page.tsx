"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type TrafficData, type CameraSettings } from '@/lib/types';
import { getTrafficData, getCameraSettings, getBollardSettings, getSchedules } from '@/lib/dataStore';
import type { SchedulesMap } from '@/lib/schedule';
import { asset } from '@/lib/paths';
import { NEIGHBOURHOODS } from '@/lib/neighbourhoods';
import {
  type DayCategory,
  DAY_CATEGORY_COLORS,
  normalizeToDateOnly,
  getUTCDateKey,
  getDayCategory,
} from '@/lib/analytics';
import { VEHICLE_TYPES } from '@/lib/vehicleTypes';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, BarChart3, ChevronDown, Download, Loader2, AlertTriangle, FileText } from 'lucide-react';
import { Tooltip as UITooltip, TooltipContent as UITooltipContent, TooltipTrigger as UITooltipTrigger } from '@/components/ui/tooltip';
import { format, startOfYear, endOfYear } from 'date-fns';
import { ca } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import DataCoverageTable from '@/components/DataCoverageTable';
import TrafficHeatmap from '@/components/TrafficHeatmap';
import ImpactPanel from '@/components/ImpactPanel';
import { ATTRIBUTION } from '@/lib/attribution';
import { buildFilterQuery, parseFilterQuery } from '@/lib/urlFilters';

const cornellaLogo = asset('/assets/escut-cornella.svg');
const bollardImage = asset('/assets/bollard.jpg');

type Granularity = 'day' | 'week' | 'month';
const AGG_FILL = '#3b82f6';

function mondayOf(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00.000Z`);
  const diff = (d.getUTCDay() + 6) % 7; // 0 for Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function bucketKey(dateISO: string, g: Granularity): string {
  if (g === 'day') return dateISO;
  if (g === 'week') return mondayOf(dateISO);
  return dateISO.slice(0, 7); // month
}

function bucketLabel(key: string, g: Granularity): string {
  if (g === 'month') return format(new Date(`${key}-01T12:00:00.000Z`), 'MMM yyyy', { locale: ca });
  return format(new Date(`${key}T12:00:00.000Z`), 'dd MMM yy', { locale: ca });
}

const UNRELIABLE_CAMERA_MSG =
  "Les dades d'aquesta càmera no són fiables i no haurien d'usar-se per a estudis de mobilitat o anàlisis similars.";

type BollardSettings = {
  bollardStartDatePedro: string | null;
  bollardStartDateGavarra: string | null;
};

export default function Analytics() {
  const [selectedNeighbourhood, setSelectedNeighbourhood] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<string[]>([]);
  const [selectedCameras, setSelectedCameras] = useState<string[]>([]);
  const [selectedDeviceType, setSelectedDeviceType] = useState<string>('all');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingExec, setIsGeneratingExec] = useState(false);
  const [chartGranularity, setChartGranularity] = useState<Granularity>('month');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(undefined);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  // Initialise filter state from the URL once, on mount (client only, so it does
  // not cause a hydration mismatch with the static server render).
  useEffect(() => {
    const parsed = parseFilterQuery(window.location.search);
    if (parsed.neighbourhood) setSelectedNeighbourhood(parsed.neighbourhood);
    if (parsed.deviceType) setSelectedDeviceType(parsed.deviceType);
    if (parsed.cameras) setSelectedCameras(parsed.cameras);
    if (parsed.vehicles) setSelectedVehicleTypes(parsed.vehicles);
    if (parsed.dateRange) setDateRange(parsed.dateRange);
    setFiltersHydrated(true);
  }, []);

  // Reflect the active filters back into the URL so the view is shareable.
  useEffect(() => {
    if (!filtersHydrated) return;
    const query = buildFilterQuery({
      neighbourhood: selectedNeighbourhood,
      deviceType: selectedDeviceType,
      cameras: selectedCameras,
      vehicles: selectedVehicleTypes,
      dateRange,
    });
    window.history.replaceState(null, '', `${window.location.pathname}${query}`);
  }, [filtersHydrated, selectedNeighbourhood, selectedDeviceType, selectedCameras, selectedVehicleTypes, dateRange]);

  const { data: trafficData = [], isLoading } = useQuery<TrafficData[]>({
    queryKey: ['traffic-data'],
    queryFn: getTrafficData,
  });

  const { data: cameraSettings = [] } = useQuery<CameraSettings[]>({
    queryKey: ['camera-settings'],
    queryFn: getCameraSettings,
  });

  const { data: schedules = {} } = useQuery<SchedulesMap>({
    queryKey: ['schedules'],
    queryFn: getSchedules,
  });

  const { data: bollardSettings } = useQuery<BollardSettings>({
    queryKey: ['bollard-settings'],
    queryFn: getBollardSettings,
  });

  const cameraToNeighbourhood = useMemo(() => {
    const mapping: Record<string, string> = {};
    cameraSettings.forEach(s => {
      mapping[s.cameraId] = s.neighbourhood;
    });
    return mapping;
  }, [cameraSettings]);

  const cameraToType = useMemo(() => {
    const mapping: Record<string, string> = {};
    cameraSettings.forEach(s => {
      mapping[s.cameraId] = s.cameraType || 'Càmera';
    });
    return mapping;
  }, [cameraSettings]);

  const unreliableCameras = useMemo(() => {
    return new Set(cameraSettings.filter(s => s.reliable === false).map(s => s.cameraId));
  }, [cameraSettings]);

  const data = useMemo(() => {
    // Parse dateTime from datahora ("YYYY-MM-DD HH:MM") because the DB dateTime field
    // comes back as null via JSON serialization (Drizzle produces Invalid Date from the
    // Neon HTTP driver response, and JSON.stringify(Invalid Date) = null).
    // datahora is always stored in a reliable, well-defined format — use it as ground truth.
    const result = trafficData.map(row => {
      const [datePart, timePart] = row.datahora.split(' ');
      let parsedDate: Date | null = null;
      if (datePart) {
        const candidate = new Date(`${datePart}T${timePart ?? '00:00'}:00.000Z`);
        if (!isNaN(candidate.getTime())) {
          parsedDate = candidate;
        }
      }

      const dynamicNeighbourhood = cameraToNeighbourhood[row.camera] || row.neighbourhood || undefined;

      return {
        camera: row.camera,
        datahora: row.datahora,
        tipusVehicle: row.tipusVehicle,
        valor: row.valor,
        dateTime: parsedDate,
        neighbourhood: dynamicNeighbourhood,
      };
    });

    return result;
  }, [trafficData, cameraToNeighbourhood]);

  const filteredData = useMemo(() => {
    const result = data.filter(row => {
      if (selectedNeighbourhood !== 'all' && row.neighbourhood !== selectedNeighbourhood) {
        return false;
      }

      if (selectedVehicleTypes.length > 0 && !selectedVehicleTypes.includes(row.tipusVehicle)) {
        return false;
      }

      if (selectedCameras.length > 0 && !selectedCameras.includes(row.camera)) {
        return false;
      }

      if (selectedDeviceType !== 'all') {
        const deviceType = cameraToType[row.camera] || 'Càmera';
        if (deviceType !== selectedDeviceType) {
          return false;
        }
      }

      if (dateRange?.from || dateRange?.to) {
        // Use datahora for date comparison — it's always "YYYY-MM-DD HH:MM" so slice(0,10) is safe
        const rowDateKey = row.datahora.slice(0, 10);
        if (dateRange?.from) {
          const fromDateKey = format(dateRange.from, 'yyyy-MM-dd');
          if (rowDateKey < fromDateKey) {
            return false;
          }
        }
        if (dateRange?.to) {
          const toDateKey = format(dateRange.to, 'yyyy-MM-dd');
          if (rowDateKey > toDateKey) {
            return false;
          }
        }
      }

      return true;
    });
    
    return result;
  }, [data, selectedNeighbourhood, dateRange, selectedVehicleTypes, selectedCameras, selectedDeviceType, cameraToType]);

  const chartData = useMemo(() => {
    const grouped = new Map<string, { total: number; dateObj: Date; neighbourhoods: Set<string> }>();

    filteredData.forEach(row => {
      if (row.dateTime) {
        const dateKey = getUTCDateKey(row.dateTime);
        const existing = grouped.get(dateKey);
        if (existing) {
          existing.total += row.valor;
          if (row.neighbourhood) {
            existing.neighbourhoods.add(row.neighbourhood);
          }
        } else {
          const neighbourhoods = new Set<string>();
          if (row.neighbourhood) {
            neighbourhoods.add(row.neighbourhood);
          }
          const normalizedDate = normalizeToDateOnly(row.dateTime);
          grouped.set(dateKey, { 
            total: row.valor, 
            dateObj: normalizedDate,
            neighbourhoods
          });
        }
      }
    });

    return Array.from(grouped.entries())
      .map(([date, { total, dateObj, neighbourhoods }]) => {
        let dayCategory: DayCategory;
        if (selectedNeighbourhood !== 'all') {
          dayCategory = getDayCategory(dateObj, selectedNeighbourhood, bollardSettings);
        } else if (neighbourhoods.size === 0) {
          dayCategory = getDayCategory(dateObj, undefined, bollardSettings);
        } else if (neighbourhoods.size === 1) {
          dayCategory = getDayCategory(dateObj, Array.from(neighbourhoods)[0], bollardSettings);
        } else {
          const categories = Array.from(neighbourhoods).map(n => getDayCategory(dateObj, n, bollardSettings));
          if (categories.includes('holiday_up')) {
            dayCategory = 'holiday_up';
          } else if (categories.includes('holiday_down')) {
            dayCategory = 'holiday_down';
          } else {
            dayCategory = 'working';
          }
        }
        
        return {
          date,
          total,
          displayDate: format(dateObj, 'dd MMM yyyy', { locale: ca }),
          dayCategory,
          fill: DAY_CATEGORY_COLORS[dayCategory],
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredData, bollardSettings, selectedNeighbourhood]);

  // Chart data bucketed by the selected granularity (daily bars over 2 years are
  // illegible; monthly is the default for presentation). Day mode keeps day-type
  // colours; week/month aggregate into a single neutral colour.
  const displayChartData = useMemo(() => {
    if (chartGranularity === 'day') {
      return chartData.map(d => ({ key: d.date, total: d.total, displayDate: d.displayDate, fill: d.fill }));
    }
    const buckets = new Map<string, number>();
    chartData.forEach(d => {
      const k = bucketKey(d.date, chartGranularity);
      buckets.set(k, (buckets.get(k) || 0) + d.total);
    });
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, total]) => ({ key: k, total, displayDate: bucketLabel(k, chartGranularity), fill: AGG_FILL }));
  }, [chartData, chartGranularity]);

  // X positions (bucket labels) where the activation ReferenceLines should sit.
  const activationMarkers = useMemo(() => {
    const markers: { x: string; label: string }[] = [];
    const add = (dateStr: string | null | undefined, label: string) => {
      if (!dateStr) return;
      const k = bucketKey(dateStr, chartGranularity);
      const bucket = displayChartData.find(d => d.key === k);
      if (bucket) markers.push({ x: bucket.displayDate, label });
    };
    add(bollardSettings?.bollardStartDatePedro, 'Pedró');
    add(bollardSettings?.bollardStartDateGavarra, 'Gavarra');
    return markers;
  }, [displayChartData, bollardSettings, chartGranularity]);

  // Computed on demand (only when the detailed report is generated) so this heavy
  // aggregation stays off the dashboard's render path.
  const computeNeighbourhoodAverages = useCallback(() => {
    // When multiple cameras are selected, we calculate per-camera averages first,
    // then sum them. This ensures CT10 avg + CT11 avg = combined avg.
    
    // Step 1: Group data by camera -> neighbourhood -> dateKey
    // Structure: Map<camera, Map<neighbourhood, Map<dateKey, { total, dayCategory, byVehicle }>>>
    const byCameraNeighbourhoodDate = new Map<string, Map<string, Map<string, {
      total: number;
      dayCategory: DayCategory;
      byVehicle: Record<string, number>;
    }>>>();

    filteredData.forEach(row => {
      if (row.dateTime && row.neighbourhood && (row.neighbourhood === 'Pedró' || row.neighbourhood === 'Gavarra')) {
        const dateKey = getUTCDateKey(row.dateTime);
        const camera = row.camera;
        
        if (!byCameraNeighbourhoodDate.has(camera)) {
          byCameraNeighbourhoodDate.set(camera, new Map());
        }
        const cameraData = byCameraNeighbourhoodDate.get(camera)!;
        
        if (!cameraData.has(row.neighbourhood)) {
          cameraData.set(row.neighbourhood, new Map());
        }
        const neighbourhoodData = cameraData.get(row.neighbourhood)!;
        
        const existing = neighbourhoodData.get(dateKey);
        if (existing) {
          existing.total += row.valor;
          existing.byVehicle[row.tipusVehicle] = (existing.byVehicle[row.tipusVehicle] || 0) + row.valor;
        } else {
          const normalizedDate = normalizeToDateOnly(row.dateTime);
          const dayCategory = getDayCategory(normalizedDate, row.neighbourhood, bollardSettings);
          neighbourhoodData.set(dateKey, {
            total: row.valor,
            dayCategory,
            byVehicle: { [row.tipusVehicle]: row.valor }
          });
        }
      }
    });

    // Step 2: Calculate per-camera averages for each neighbourhood and day category
    interface CameraStats {
      working: { total: number; days: number; byVehicle: Record<string, { total: number; days: number }> };
      holidayDown: { total: number; days: number; byVehicle: Record<string, { total: number; days: number }> };
      holidayUp: { total: number; days: number; byVehicle: Record<string, { total: number; days: number }> };
    }
    
    const createEmptyCameraStats = (): CameraStats => ({
      working: { total: 0, days: 0, byVehicle: {} },
      holidayDown: { total: 0, days: 0, byVehicle: {} },
      holidayUp: { total: 0, days: 0, byVehicle: {} }
    });

    // Per-camera stats: Map<camera, Map<neighbourhood, CameraStats>>
    const perCameraStats = new Map<string, Map<string, CameraStats>>();

    byCameraNeighbourhoodDate.forEach((neighbourhoods, camera) => {
      if (!perCameraStats.has(camera)) {
        perCameraStats.set(camera, new Map());
      }
      const cameraStatsMap = perCameraStats.get(camera)!;

      neighbourhoods.forEach((dates, neighbourhood) => {
        if (!cameraStatsMap.has(neighbourhood)) {
          cameraStatsMap.set(neighbourhood, createEmptyCameraStats());
        }
        const stats = cameraStatsMap.get(neighbourhood)!;

        dates.forEach(({ total, dayCategory, byVehicle }) => {
          let target: { total: number; days: number; byVehicle: Record<string, { total: number; days: number }> };
          if (dayCategory === 'working') {
            target = stats.working;
          } else if (dayCategory === 'holiday_down') {
            target = stats.holidayDown;
          } else {
            target = stats.holidayUp;
          }

          target.total += total;
          target.days += 1;

          Object.entries(byVehicle).forEach(([vehicle, count]) => {
            if (!target.byVehicle[vehicle]) {
              target.byVehicle[vehicle] = { total: 0, days: 0 };
            }
            target.byVehicle[vehicle].total += count;
            target.byVehicle[vehicle].days += 1;
          });
        });
      });
    });

    // Step 3: Calculate per-camera averages, then sum across cameras
    const calcCameraAvg = (total: number, days: number) => days > 0 ? total / days : 0;

    interface NeighbourhoodResult {
      workingAvg: number;
      workingByVehicle: Record<string, number>;
      workingDays: number;
      holidayDownAvg: number;
      holidayDownByVehicle: Record<string, number>;
      holidayDownDays: number;
      holidayUpAvg: number;
      holidayUpByVehicle: Record<string, number>;
      holidayUpDays: number;
    }

    const results: Record<string, NeighbourhoodResult> = {
      'Pedró': {
        workingAvg: 0, workingByVehicle: {}, workingDays: 0,
        holidayDownAvg: 0, holidayDownByVehicle: {}, holidayDownDays: 0,
        holidayUpAvg: 0, holidayUpByVehicle: {}, holidayUpDays: 0
      },
      'Gavarra': {
        workingAvg: 0, workingByVehicle: {}, workingDays: 0,
        holidayDownAvg: 0, holidayDownByVehicle: {}, holidayDownDays: 0,
        holidayUpAvg: 0, holidayUpByVehicle: {}, holidayUpDays: 0
      }
    };

    // Track max days across cameras for display (use the camera with most days)
    const maxDays: Record<string, { working: number; holidayDown: number; holidayUp: number }> = {
      'Pedró': { working: 0, holidayDown: 0, holidayUp: 0 },
      'Gavarra': { working: 0, holidayDown: 0, holidayUp: 0 }
    };

    // Sum per-camera averages for each neighbourhood
    perCameraStats.forEach((neighbourhoods) => {
      neighbourhoods.forEach((stats, neighbourhood) => {
        if (neighbourhood === 'Pedró' || neighbourhood === 'Gavarra') {
          // Working days
          results[neighbourhood].workingAvg += calcCameraAvg(stats.working.total, stats.working.days);
          maxDays[neighbourhood].working = Math.max(maxDays[neighbourhood].working, stats.working.days);
          
          Object.entries(stats.working.byVehicle).forEach(([vehicle, { total, days }]) => {
            results[neighbourhood].workingByVehicle[vehicle] = 
              (results[neighbourhood].workingByVehicle[vehicle] || 0) + calcCameraAvg(total, days);
          });

          // Holiday down
          results[neighbourhood].holidayDownAvg += calcCameraAvg(stats.holidayDown.total, stats.holidayDown.days);
          maxDays[neighbourhood].holidayDown = Math.max(maxDays[neighbourhood].holidayDown, stats.holidayDown.days);
          
          Object.entries(stats.holidayDown.byVehicle).forEach(([vehicle, { total, days }]) => {
            results[neighbourhood].holidayDownByVehicle[vehicle] = 
              (results[neighbourhood].holidayDownByVehicle[vehicle] || 0) + calcCameraAvg(total, days);
          });

          // Holiday up
          results[neighbourhood].holidayUpAvg += calcCameraAvg(stats.holidayUp.total, stats.holidayUp.days);
          maxDays[neighbourhood].holidayUp = Math.max(maxDays[neighbourhood].holidayUp, stats.holidayUp.days);
          
          Object.entries(stats.holidayUp.byVehicle).forEach(([vehicle, { total, days }]) => {
            results[neighbourhood].holidayUpByVehicle[vehicle] = 
              (results[neighbourhood].holidayUpByVehicle[vehicle] || 0) + calcCameraAvg(total, days);
          });
        }
      });
    });

    // Round the averages and set the day counts
    (['Pedró', 'Gavarra'] as const).forEach(neighbourhood => {
      results[neighbourhood].workingAvg = Math.round(results[neighbourhood].workingAvg);
      results[neighbourhood].workingDays = maxDays[neighbourhood].working;
      Object.keys(results[neighbourhood].workingByVehicle).forEach(v => {
        results[neighbourhood].workingByVehicle[v] = Math.round(results[neighbourhood].workingByVehicle[v]);
      });

      results[neighbourhood].holidayDownAvg = Math.round(results[neighbourhood].holidayDownAvg);
      results[neighbourhood].holidayDownDays = maxDays[neighbourhood].holidayDown;
      Object.keys(results[neighbourhood].holidayDownByVehicle).forEach(v => {
        results[neighbourhood].holidayDownByVehicle[v] = Math.round(results[neighbourhood].holidayDownByVehicle[v]);
      });

      results[neighbourhood].holidayUpAvg = Math.round(results[neighbourhood].holidayUpAvg);
      results[neighbourhood].holidayUpDays = maxDays[neighbourhood].holidayUp;
      Object.keys(results[neighbourhood].holidayUpByVehicle).forEach(v => {
        results[neighbourhood].holidayUpByVehicle[v] = Math.round(results[neighbourhood].holidayUpByVehicle[v]);
      });
    });

    return results;
  }, [filteredData, bollardSettings]);

  const totalVehicles = useMemo(() => {
    return filteredData.reduce((sum, row) => sum + row.valor, 0);
  }, [filteredData]);

  const availableCameras = useMemo(() => {
    const cameras = new Set<string>();
    data.forEach(row => cameras.add(row.camera));
    return Array.from(cameras).sort((a, b) => {
      const numA = parseInt(a.replace('CT', ''));
      const numB = parseInt(b.replace('CT', ''));
      return numA - numB;
    });
  }, [data]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    data.forEach(row => years.add(row.datahora.slice(0, 4)));
    return Array.from(years).sort();
  }, [data]);

  const yearQuickButtons = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 3, currentYear - 2, currentYear - 1, currentYear];
  }, []);

  const isPendingRangeFullYear = (year: number): boolean => {
    if (!pendingRange?.from || !pendingRange?.to) return false;
    const expectedFrom = startOfYear(new Date(year, 0, 1));
    const expectedTo = endOfYear(new Date(year, 0, 1));
    return pendingRange.from.getTime() === expectedFrom.getTime() &&
      pendingRange.to.getTime() === expectedTo.getTime();
  };

  const handleYearQuickSelect = (year: number) => {
    const from = startOfYear(new Date(year, 0, 1));
    const to = endOfYear(new Date(year, 0, 1));
    setPendingRange({ from, to });
  };

  const formatPendingRangeHeader = (): string => {
    if (!pendingRange?.from) return 'Totes les dates';
    const fromStr = format(pendingRange.from, "d MMM yyyy", { locale: ca });
    if (!pendingRange.to || pendingRange.to.getTime() === pendingRange.from.getTime()) return fromStr;
    const toStr = format(pendingRange.to, "d MMM yyyy", { locale: ca });
    return `${fromStr} – ${toStr}`;
  };

  const handleClearFilters = () => {
    setSelectedNeighbourhood('all');
    setDateRange(undefined);
    setSelectedVehicleTypes([]);
    setSelectedCameras([]);
    setSelectedDeviceType('all');
    setPendingRange(undefined);
    setCalendarOpen(false);
  };

  const handleClearDateFilter = () => {
    setPendingRange(undefined);
    setDateRange(undefined);
    setCalendarOpen(false);
  };

  const handleCalendarOpenChange = (open: boolean) => {
    if (open) setPendingRange(dateRange);
    setCalendarOpen(open);
  };

  const handleApplyDate = () => {
    setDateRange(pendingRange);
    setCalendarOpen(false);
  };

  const handleToggleVehicleType = (vehicleType: string) => {
    setSelectedVehicleTypes(prev => 
      prev.includes(vehicleType)
        ? prev.filter(t => t !== vehicleType)
        : [...prev, vehicleType]
    );
  };

  const handleToggleCamera = (camera: string) => {
    setSelectedCameras(prev => 
      prev.includes(camera)
        ? prev.filter(c => c !== camera)
        : [...prev, camera]
    );
  };

  const generateExecutivePDF = useCallback(async () => {
    setIsGeneratingExec(true);
    try {
      // Executive report is independent of the active filters (headline figures).
      const { generateExecutiveReport } = await import('@/lib/pdfExecutive');
      await generateExecutiveReport({
        trafficData,
        cameraSettings,
        bollardSettings,
        schedules,
        attribution: ATTRIBUTION,
        escutSrc: cornellaLogo,
      });
    } catch (error) {
      console.error('Error generating executive PDF:', error);
    } finally {
      setIsGeneratingExec(false);
    }
  }, [trafficData, cameraSettings, bollardSettings, schedules]);

  const generatePDF = useCallback(async () => {
    if (filteredData.length === 0) return;
    setIsGeneratingPDF(true);
    try {
      // Load the report generator (and its heavy jsPDF/html2canvas deps) on demand.
      const { generateAnalyticsReport } = await import('@/lib/pdfReport');
      // Heavy per-neighbourhood aggregation is computed here, on demand.
      const neighbourhoodAverages = computeNeighbourhoodAverages();
      const calcReduction = (downAvg: number, upAvg: number) =>
        downAvg === 0 ? null : Math.round((upAvg / downAvg) * 100 * 100) / 100;
      const bollardReduction = {
        'Pedró': calcReduction(neighbourhoodAverages['Pedró'].holidayDownAvg, neighbourhoodAverages['Pedró'].holidayUpAvg),
        'Gavarra': calcReduction(neighbourhoodAverages['Gavarra'].holidayDownAvg, neighbourhoodAverages['Gavarra'].holidayUpAvg),
      };
      await generateAnalyticsReport({
        filteredData,
        chartData,
        totalVehicles,
        neighbourhoodAverages,
        bollardReduction,
        bollardSettings,
        selectedNeighbourhood,
        dateRange,
        selectedVehicleTypes,
        selectedCameras,
        selectedDeviceType,
        availableCameras,
        cameraToNeighbourhood,
        vehicleTypes: VEHICLE_TYPES,
        chartRef,
        attribution: ATTRIBUTION,
        cornellaLogoSrc: cornellaLogo,
        bollardImageSrc: bollardImage,
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [filteredData, chartData, totalVehicles, computeNeighbourhoodAverages, bollardSettings, selectedNeighbourhood, dateRange, selectedVehicleTypes, selectedCameras, selectedDeviceType, availableCameras, cameraToNeighbourhood]);


  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-9 w-44" />
          </div>
          <Skeleton className="h-28 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
          <Skeleton className="h-72 w-full" />
          <p className="text-center text-sm text-muted-foreground pt-2">Carregant dades…</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8 text-center">
          <BarChart3 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            No hi ha dades disponibles
          </h2>
          <p className="text-muted-foreground">
            Primer transforma un fitxer CSV per veure les analítiques
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-4 flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-semibold text-foreground">
            Analítiques de Trànsit
          </h1>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={generateExecutivePDF}
              disabled={isGeneratingExec}
              data-testid="button-download-executive"
            >
              {isGeneratingExec ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generant...</>
              ) : (
                <><FileText className="w-4 h-4 mr-2" />Informe executiu</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={generatePDF}
              disabled={filteredData.length === 0 || isGeneratingPDF}
              data-testid="button-download-pdf"
            >
              {isGeneratingPDF ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generant...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" />Informe detallat</>
              )}
            </Button>
          </div>
        </header>

        <div className="space-y-4">
          <ImpactPanel
            trafficData={trafficData}
            cameraSettings={cameraSettings}
            bollardSettings={bollardSettings}
            schedules={schedules}
          />
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Filtres</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Barri</label>
                <Select value={selectedNeighbourhood} onValueChange={setSelectedNeighbourhood}>
                  <SelectTrigger data-testid="select-neighbourhood">
                    <SelectValue placeholder="Selecciona barri" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tots els barris</SelectItem>
                    {NEIGHBOURHOODS.map(neighbourhood => (
                      <SelectItem key={neighbourhood} value={neighbourhood}>
                        {neighbourhood}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tipus de dispositiu</label>
                <Select value={selectedDeviceType} onValueChange={setSelectedDeviceType}>
                  <SelectTrigger data-testid="select-device-type">
                    <SelectValue placeholder="Tots els dispositius" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tots</SelectItem>
                    <SelectItem value="Pilona">Pilona</SelectItem>
                    <SelectItem value="Càmera">Càmera</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Càmera</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-cameras"
                    >
                      {selectedCameras.length === 0 ? (
                        <span className="text-muted-foreground">Totes les càmeres</span>
                      ) : selectedCameras.length === 1 ? (
                        selectedCameras[0]
                      ) : (
                        `${selectedCameras.length} seleccionades`
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-4" align="start">
                    <div className="space-y-3">
                      <div className="font-medium text-sm">Selecciona càmeres</div>
                      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                        {availableCameras.map(camera => {
                          const unreliable = unreliableCameras.has(camera);
                          return (
                            <div key={camera} className="flex items-center space-x-2">
                              <Checkbox
                                id={`camera-${camera}`}
                                checked={selectedCameras.includes(camera)}
                                onCheckedChange={() => handleToggleCamera(camera)}
                                data-testid={`checkbox-camera-${camera}`}
                              />
                              <label
                                htmlFor={`camera-${camera}`}
                                className={`flex items-center gap-1 text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer ${unreliable ? 'text-red-600 dark:text-red-400' : ''}`}
                              >
                                <span>
                                  {camera}
                                  {cameraToNeighbourhood[camera] && (
                                    <span className={`ml-1 ${unreliable ? 'text-red-400 dark:text-red-500' : 'text-muted-foreground'}`}>
                                      ({cameraToNeighbourhood[camera].charAt(0)})
                                    </span>
                                  )}
                                </span>
                                {unreliable && (
                                  <UITooltip>
                                    <UITooltipTrigger asChild>
                                      <AlertTriangle
                                        className="h-3 w-3 text-red-500 dark:text-red-400 flex-shrink-0"
                                        data-testid={`icon-unreliable-${camera}`}
                                      />
                                    </UITooltipTrigger>
                                    <UITooltipContent className="max-w-[220px] text-xs" side="right">
                                      {UNRELIABLE_CAMERA_MSG}
                                    </UITooltipContent>
                                  </UITooltip>
                                )}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tipus de vehicle</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-vehicle-types"
                    >
                      {selectedVehicleTypes.length === 0 ? (
                        <span className="text-muted-foreground">Tots els tipus</span>
                      ) : selectedVehicleTypes.length === 1 ? (
                        selectedVehicleTypes[0]
                      ) : (
                        `${selectedVehicleTypes.length} seleccionats`
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] p-4" align="start">
                    <div className="space-y-3">
                      <div className="font-medium text-sm">Selecciona tipus de vehicle</div>
                      {VEHICLE_TYPES.map(vehicleType => (
                        <div key={vehicleType} className="flex items-center space-x-2">
                          <Checkbox
                            id={`vehicle-${vehicleType}`}
                            checked={selectedVehicleTypes.includes(vehicleType)}
                            onCheckedChange={() => handleToggleVehicleType(vehicleType)}
                            data-testid={`checkbox-${vehicleType}`}
                          />
                          <label
                            htmlFor={`vehicle-${vehicleType}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {vehicleType}
                          </label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5 xl:col-span-2">
                <label className="text-sm font-medium text-foreground">Data</label>
                <Popover open={calendarOpen} onOpenChange={handleCalendarOpenChange}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-date-range"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <span className="truncate">{format(dateRange.from, 'dd/MM/yyyy')} – {format(dateRange.to, 'dd/MM/yyyy')}</span>
                        ) : (
                          <span>{format(dateRange.from, 'dd/MM/yyyy')}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">Totes les dates</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 overflow-hidden" align="start">
                    <div className="bg-primary text-primary-foreground px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide opacity-80 mb-0.5">
                        {pendingRange?.from && pendingRange?.to ? 'Interval seleccionat' : 'Rang de dates'}
                      </p>
                      <p className="text-base font-semibold" data-testid="text-pending-range-header">
                        {formatPendingRangeHeader()}
                      </p>
                    </div>

                    <div className="border-b px-3 py-2 flex gap-1.5">
                      {yearQuickButtons.map(year => {
                        const isActive = isPendingRangeFullYear(year);
                        return (
                          <button
                            key={year}
                            type="button"
                            onClick={() => handleYearQuickSelect(year)}
                            className={`flex-1 text-sm font-medium py-1 rounded-md border transition-colors ${
                              isActive
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                            }`}
                            data-testid={`button-year-${year}`}
                          >
                            {year}
                          </button>
                        );
                      })}
                    </div>

                    <Calendar
                      mode="range"
                      selected={pendingRange}
                      onSelect={setPendingRange}
                      numberOfMonths={2}
                      captionLayout="dropdown"
                      fromYear={availableYears.length > 0 ? parseInt(availableYears[0]) : 2023}
                      toYear={availableYears.length > 0 ? parseInt(availableYears[availableYears.length - 1]) : new Date().getFullYear()}
                      locale={ca}
                      initialFocus
                    />

                    <div className="border-t px-3 py-2 flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearDateFilter}
                        data-testid="button-clear-date"
                      >
                        Netejar
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleApplyDate}
                        data-testid="button-apply-date"
                      >
                        Aplicar
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-end">
                <Button
                  variant="destructive"
                  onClick={handleClearFilters}
                  className="w-full"
                  data-testid="button-clear-filters"
                >
                  Esborrar filtres
                </Button>
              </div>
            </div>
          </Card>


          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-base font-semibold text-foreground">
                Total de Vehicles per Data
              </h3>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="inline-flex rounded-md border border-border overflow-hidden" data-testid="granularity-toggle">
                  {(['day', 'week', 'month'] as Granularity[]).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setChartGranularity(g)}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                        chartGranularity === g
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      data-testid={`granularity-${g}`}
                    >
                      {g === 'day' ? 'Dia' : g === 'week' ? 'Setmana' : 'Mes'}
                    </button>
                  ))}
                </div>
                {chartGranularity === 'day' && (
                  <div className="flex gap-3 text-xs flex-wrap">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: DAY_CATEGORY_COLORS.working }}></div>
                      <span className="text-muted-foreground">Laborables</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: DAY_CATEGORY_COLORS.holiday_down }}></div>
                      <span className="text-muted-foreground">Festius baixats</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: DAY_CATEGORY_COLORS.holiday_up }}></div>
                      <span className="text-muted-foreground">Festius aixecats</span>
                    </div>
                  </div>
                )}
                <div className="text-right">
                  <span className="text-xs text-muted-foreground mr-2">Total:</span>
                  <span className="text-lg font-bold text-primary" data-testid="text-total-vehicles">
                    {totalVehicles.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {displayChartData.length > 0 ? (
              <div ref={chartRef}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={displayChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="displayDate"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      className="text-xs"
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis className="text-xs" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'total') {
                          return [value.toLocaleString() + ' vehicles', 'Total'];
                        }
                        return [value, name];
                      }}
                    />
                    {activationMarkers.map((m) => (
                      <ReferenceLine
                        key={m.label}
                        x={m.x}
                        stroke="#a61a2f"
                        strokeDasharray="4 3"
                        strokeWidth={1.5}
                        label={{ value: `Mesures ${m.label}`, position: 'top', fill: '#a61a2f', fontSize: 9 }}
                      />
                    ))}
                    <Bar
                      dataKey="total"
                      radius={[4, 4, 0, 0]}
                    >
                      {displayChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No hi ha dades per mostrar amb els filtres seleccionats
              </div>
            )}
          </Card>

          <Card className="p-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-semibold text-foreground">Resum</h3>
              <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Registres:</span>
                  <span className="font-semibold text-foreground" data-testid="text-filtered-records">
                    {filteredData.length.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Dies:</span>
                  <span className="font-semibold text-foreground">{chartData.length}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Barri:</span>
                  <span className="font-semibold text-foreground">
                    {selectedNeighbourhood === 'all' ? 'Tots' : selectedNeighbourhood}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Mitjana/dia:</span>
                  <span className="font-semibold text-foreground">
                    {chartData.length > 0 ? Math.round(totalVehicles / chartData.length).toLocaleString() : 0}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <TrafficHeatmap data={chartData} />

          <DataCoverageTable
            selectedVehicleTypes={selectedVehicleTypes}
            selectedNeighbourhood={selectedNeighbourhood}
            selectedCameras={selectedCameras}
            dateRange={dateRange}
            cameraToNeighbourhood={cameraToNeighbourhood}
          />
        </div>
      </div>
    </div>
  );
}
