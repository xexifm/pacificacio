import { format } from 'date-fns';
import { ca } from 'date-fns/locale';
import type { RefObject } from 'react';
import {
  type RGB, NAVY, BLUE, GREEN, RED, MONTH_CA,
  sc, sf, sd, resetColor, loadImage, resizeToDataURL,
  drawPageFooter, drawSectionHeader, drawKPICard, drawStatBox, drawCompRow, drawHBar,
} from '@/lib/pdfHelpers';

// jsPDF and html2canvas are heavy (~1 MB combined). They are dynamically imported
// inside generateAnalyticsReport so they are only fetched when the user actually
// generates a report, keeping them out of the initial page bundle.

// ─── Types ────────────────────────────────────────────────────────────────────

type DayCategory = 'working' | 'holiday_down' | 'holiday_up';

export interface FilteredRow {
  camera: string;
  datahora: string;
  tipusVehicle: string;
  valor: number;
  dateTime: Date | null;
  neighbourhood?: string;
}

export interface ChartDay {
  date: string;
  total: number;
  displayDate: string;
  dayCategory: DayCategory;
  fill: string;
}

export interface NeighbourhoodResult {
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

export interface PDFReportInput {
  filteredData: FilteredRow[];
  chartData: ChartDay[];
  totalVehicles: number;
  neighbourhoodAverages: Record<string, NeighbourhoodResult>;
  bollardReduction: Record<string, number | null>;
  bollardSettings?: { bollardStartDatePedro: string | null; bollardStartDateGavarra: string | null };
  selectedNeighbourhood: string;
  dateRange?: { from?: Date; to?: Date };
  selectedVehicleTypes: string[];
  selectedCameras: string[];
  selectedDeviceType: string;
  availableCameras: string[];
  cameraToNeighbourhood: Record<string, string>;
  vehicleTypes: readonly string[];
  chartRef: RefObject<HTMLDivElement>;
  attribution: string;
  cornellaLogoSrc: string;
  bollardImageSrc: string;
}

// ─── Main report function ─────────────────────────────────────────────────────

export async function generateAnalyticsReport(input: PDFReportInput): Promise<void> {
  const {
    filteredData, chartData, totalVehicles, neighbourhoodAverages, bollardReduction,
    bollardSettings, selectedNeighbourhood, selectedVehicleTypes, selectedCameras,
    selectedDeviceType, availableCameras, cameraToNeighbourhood, vehicleTypes,
    chartRef, attribution, cornellaLogoSrc, bollardImageSrc,
  } = input;

  // Lazy-load the heavy PDF libraries only when a report is generated.
  const { default: JsPDF } = await import('jspdf');

  const pdf = new JsPDF('p', 'mm', 'a4', true);
  const W = 210;
  const H = 297;
  const M = 15;
  const CW = W - 2 * M;
  let yPos = M;
  let pageNum = 1;

  const addPage = () => {
    drawPageFooter(pdf, W, H, pageNum, attribution);
    pdf.addPage();
    pageNum++;
    yPos = M;
  };

  const needPage = (space: number) => {
    if (yPos + space > H - M - 10) addPage();
  };

  // ── Pre-compute derived values ─────────────────────────────────────────────

  const today = format(new Date(), 'yyyy-MM-dd');
  const numDays = chartData.length || 1;
  const dailyAvg = Math.round(totalVehicles / numDays);

  const workingDays   = chartData.filter(d => d.dayCategory === 'working');
  const downDays      = chartData.filter(d => d.dayCategory === 'holiday_down');
  const upDays        = chartData.filter(d => d.dayCategory === 'holiday_up');
  const gWorkingAvg   = workingDays.length > 0 ? Math.round(workingDays.reduce((s, d) => s + d.total, 0) / workingDays.length) : 0;
  const gDownAvg      = downDays.length > 0    ? Math.round(downDays.reduce((s, d) => s + d.total, 0)   / downDays.length)   : 0;
  const gUpAvg        = upDays.length > 0      ? Math.round(upDays.reduce((s, d) => s + d.total, 0)     / upDays.length)     : 0;

  const reductions = ([bollardReduction['Pedró'], bollardReduction['Gavarra']] as (number | null)[]).filter(r => r !== null) as number[];
  const avgBollardRatio = reductions.length > 0 ? Math.round(reductions.reduce((a, b) => a + b, 0) / reductions.length * 10) / 10 : null;

  const vehicleBreakdown: Record<string, number> = {};
  filteredData.forEach(row => {
    vehicleBreakdown[row.tipusVehicle] = (vehicleBreakdown[row.tipusVehicle] || 0) + row.valor;
  });
  const vehicleSorted = Object.entries(vehicleBreakdown).sort((a, b) => b[1] - a[1]);
  const maxVehicleVal = vehicleSorted.length > 0 ? vehicleSorted[0][1] : 1;

  const sortCam = (cams: string[]) => [...cams].sort((a, b) => parseInt(a.replace('CT', '')) - parseInt(b.replace('CT', '')));
  const explicitCameras = sortCam(selectedCameras.length > 0 ? selectedCameras : availableCameras).join(', ');
  const sortedFilteredDates = filteredData.map(d => d.dateTime).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime());
  const actualStart = sortedFilteredDates[0] ?? null;
  const actualEnd   = sortedFilteredDates[sortedFilteredDates.length - 1] ?? null;
  const explicitDateRange = actualStart && actualEnd
    ? `${format(actualStart, 'dd/MM/yyyy')} – ${format(actualEnd, 'dd/MM/yyyy')}`
    : 'Sense dades';
  const explicitVehicleTypes = selectedVehicleTypes.length > 0 ? selectedVehicleTypes.join(', ') : vehicleTypes.join(', ');
  const neighbourhoodText = selectedNeighbourhood === 'all' ? 'Tots els barris' : selectedNeighbourhood;
  const deviceTypeText = selectedDeviceType === 'all' ? 'Tots' : selectedDeviceType;

  // Advanced insight derivations
  const byQuarter: Record<string, { total: number; days: number }> = {};
  chartData.forEach(d => {
    const date = new Date(d.date + 'T12:00:00Z');
    const q = Math.ceil((date.getUTCMonth() + 1) / 3);
    const key = `${date.getUTCFullYear()} T${q}`;
    if (!byQuarter[key]) byQuarter[key] = { total: 0, days: 0 };
    byQuarter[key].total += d.total;
    byQuarter[key].days++;
  });
  const quarterRows = Object.entries(byQuarter).sort(([a], [b]) => a.localeCompare(b));

  const byYear: Record<string, { total: number; days: number }> = {};
  chartData.forEach(d => {
    const y = d.date.slice(0, 4);
    if (!byYear[y]) byYear[y] = { total: 0, days: 0 };
    byYear[y].total += d.total;
    byYear[y].days++;
  });
  const yearRows = Object.entries(byYear).sort(([a], [b]) => a.localeCompare(b));

  const byMonth: Record<string, { total: number; days: number; label: string }> = {};
  chartData.forEach(d => {
    const key = d.date.slice(0, 7);
    if (!byMonth[key]) {
      byMonth[key] = { total: 0, days: 0, label: `${MONTH_CA[parseInt(d.date.slice(5, 7)) - 1]} ${d.date.slice(0, 4)}` };
    }
    byMonth[key].total += d.total;
    byMonth[key].days++;
  });
  const monthRows = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b));

  const maxDay = chartData.length > 0 ? chartData.reduce((m, d) => d.total > m.total ? d : m, chartData[0]) : null;
  const nonZero = chartData.filter(d => d.total > 0);
  const minDay  = nonZero.length > 0 ? nonZero.reduce((m, d) => d.total < m.total ? d : m, nonZero[0]) : null;

  const byMonthOfYear: Record<number, { total: number; days: number }> = {};
  chartData.forEach(d => {
    const m = parseInt(d.date.slice(5, 7)) - 1;
    if (!byMonthOfYear[m]) byMonthOfYear[m] = { total: 0, days: 0 };
    byMonthOfYear[m].total += d.total;
    byMonthOfYear[m].days++;
  });
  const moyAvgs = Object.entries(byMonthOfYear).map(([m, { total, days }]) => ({
    month: parseInt(m), avg: days > 0 ? total / days : 0,
  })).sort((a, b) => a.month - b.month);
  const peakMonth   = moyAvgs.length >= 3 ? moyAvgs.reduce((mx, m) => m.avg > mx.avg ? m : mx, moyAvgs[0]) : null;
  const troughMonth = moyAvgs.length >= 3 ? moyAvgs.reduce((mn, m) => m.avg < mn.avg ? m : mn, moyAvgs[0]) : null;

  const dayCategories = new Map<string, DayCategory>();
  chartData.forEach(d => dayCategories.set(d.date, d.dayCategory));

  // ── SECTION 1: COVER PAGE ─────────────────────────────────────────────────

  try {
    const img = await loadImage(bollardImageSrc);
    const ar = img.width / img.height;
    const bH = H * 0.45;
    const bW = bH * ar;
    const bData = resizeToDataURL(img, 700, 'jpeg', 0.55);
    pdf.setGState(new (pdf as any).GState({ opacity: 0.10 }));
    pdf.addImage(bData, 'JPEG', (W - bW) / 2, H * 0.3, bW, bH);
    pdf.setGState(new (pdf as any).GState({ opacity: 1 }));
  } catch { /* skip */ }

  let logoW = 0;
  try {
    const img = await loadImage(cornellaLogoSrc);
    const ar = img.width / img.height;
    const lH = 28;
    logoW = lH * ar;
    const lData = resizeToDataURL(img, 400, 'png');
    pdf.addImage(lData, 'PNG', (W - logoW) / 2, 22, logoW, lH);
  } catch { /* skip */ }

  sd(pdf, NAVY);
  pdf.setLineWidth(1.0);
  pdf.line(M, 58, W - M, 58);
  pdf.setLineWidth(0.2);

  pdf.setFontSize(22);
  pdf.setFont('helvetica', 'bold');
  sc(pdf, NAVY);
  pdf.text("INFORME D'ANALÍTIQUES DE TRÀNSIT", W / 2, 72, { align: 'center' });
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  sc(pdf, [70, 90, 125]);
  pdf.text('Cornellà de Llobregat · Ajuntament', W / 2, 81, { align: 'center' });

  sd(pdf, NAVY);
  pdf.setLineWidth(1.0);
  pdf.line(M, 88, W - M, 88);
  pdf.setLineWidth(0.2);

  // Filter summary box
  const boxY = 96;
  sf(pdf, [248, 250, 254]);
  sd(pdf, [210, 220, 240]);
  pdf.rect(M, boxY, CW, 75, 'FD');
  sf(pdf, NAVY);
  pdf.rect(M, boxY, CW, 7.5, 'F');
  sc(pdf, [255, 255, 255]);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text('FILTRES APLICATS', M + 4, boxY + 5.5);

  let fY = boxY + 15;
  const filterDefs = [
    { label: 'Barri', value: neighbourhoodText },
    { label: 'Tipus de dispositiu', value: deviceTypeText },
    { label: 'Rang de dates', value: explicitDateRange },
  ];
  pdf.setFontSize(8);
  filterDefs.forEach(({ label, value }) => {
    pdf.setFont('helvetica', 'bold');
    sc(pdf, [75, 95, 135]);
    pdf.text(`${label}:`, M + 4, fY);
    pdf.setFont('helvetica', 'normal');
    sc(pdf, [28, 38, 60]);
    const v = pdf.splitTextToSize(value, CW - 48);
    pdf.text(v[0], M + 44, fY);
    fY += 7;
  });
  pdf.setFont('helvetica', 'bold');
  sc(pdf, [75, 95, 135]);
  pdf.text('Càmeres:', M + 4, fY);
  pdf.setFont('helvetica', 'normal');
  sc(pdf, [28, 38, 60]);
  const camLines2 = pdf.splitTextToSize(explicitCameras, CW - 50);
  pdf.text(camLines2.slice(0, 2).join(' / '), M + 44, fY);
  fY += 7;
  pdf.setFont('helvetica', 'bold');
  sc(pdf, [75, 95, 135]);
  pdf.text('Tipus de vehicle:', M + 4, fY);
  pdf.setFont('helvetica', 'normal');
  sc(pdf, [28, 38, 60]);
  const vtLines2 = pdf.splitTextToSize(explicitVehicleTypes, CW - 50);
  pdf.text(vtLines2[0], M + 44, fY);

  resetColor(pdf);

  // Cover footer strip
  sf(pdf, NAVY);
  pdf.rect(0, H - 16, W, 16, 'F');
  sc(pdf, [255, 255, 255]);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Generat: ${format(new Date(), "dd/MM/yyyy 'a les' HH:mm")}`, W / 2, H - 9, { align: 'center' });
  pdf.text('Ajuntament de Cornellà de Llobregat', W / 2, H - 4, { align: 'center' });
  resetColor(pdf);

  // ── SECTION 2: EXECUTIVE SUMMARY ─────────────────────────────────────────

  addPage();
  yPos = drawSectionHeader(pdf, '2. RESUM EXECUTIU', yPos, M, CW);

  const cardW = (CW - 8) / 2;
  const cardH = 50;
  const cardGap = 8;
  const r1Y = yPos + 3;
  const r2Y = r1Y + cardH + 8;

  drawKPICard(pdf, M,               r1Y, cardW, cardH, 'TOTAL DE VEHICLES',              totalVehicles.toLocaleString(), BLUE,  `en ${chartData.length} dies analitzats`);
  drawKPICard(pdf, M + cardW + cardGap, r1Y, cardW, cardH, 'MITJANA DIÀRIA',              `${dailyAvg.toLocaleString()} v/d`, GREEN, 'vehicles per dia');
  drawKPICard(pdf, M,               r2Y, cardW, cardH, 'DIES ANALITZATS',                 chartData.length.toString(), NAVY,  `en el rang seleccionat`);
  drawKPICard(pdf, M + cardW + cardGap, r2Y, cardW, cardH, 'RÀTIO PILONES (aixecades/baixades)',
    avgBollardRatio !== null ? `${avgBollardRatio}%` : 'N/A', RED,
    avgBollardRatio !== null ? '< 100% indica reducció de trànsit' : 'Dades insuficients');

  yPos = r2Y + cardH + 12;

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  sc(pdf, [120, 132, 155]);
  const kpiNote = 'Els indicadors clau resumeixen els resultats principals del periode i filtres actius. La ràtio de pilones compara el volum de trànsit en festius amb pilones aixecades respecte als festius amb pilones baixades: un valor inferior al 100% indica que les pilones redueixen efectivament el trànsit.';
  const kpiNoteLines = pdf.splitTextToSize(kpiNote, CW);
  pdf.text(kpiNoteLines, M, yPos);
  resetColor(pdf);

  // ── SECTION 3: GLOBAL SUMMARY ─────────────────────────────────────────────

  addPage();
  yPos = drawSectionHeader(pdf, '3. RESUM GLOBAL I COMPARATIVES', yPos, M, CW);

  const bW3 = (CW - 10) / 3;
  const bH3 = 36;
  const g3 = 5;

  drawStatBox(pdf, M,             yPos, bW3, bH3, 'LABORABLES',     `${gWorkingAvg.toLocaleString()} v/d`, `${workingDays.length} dies`, BLUE);
  drawStatBox(pdf, M + bW3 + g3, yPos, bW3, bH3, 'FESTIUS BAIXATS', `${gDownAvg.toLocaleString()} v/d`,   `${downDays.length} dies`, GREEN);
  drawStatBox(pdf, M + (bW3+g3)*2, yPos, bW3, bH3, 'FESTIUS AIXECATS', `${gUpAvg.toLocaleString()} v/d`,  `${upDays.length} dies`, RED);

  yPos += bH3 + 10;

  pdf.setFontSize(9.5);
  pdf.setFont('helvetica', 'bold');
  sc(pdf, NAVY);
  pdf.text('Comparatives de variació de trànsit', M, yPos);
  yPos += 7;
  resetColor(pdf);

  const compRows: { desc: string; val: string; color: RGB }[] = [];
  if (gWorkingAvg > 0) {
    const p1 = (gDownAvg - gWorkingAvg) / gWorkingAvg * 100;
    compRows.push({ desc: 'Festius baixats vs. Laborables — impacte festiu sense pilones', val: `${p1 >= 0 ? '+' : ''}${p1.toFixed(1)}%`, color: p1 >= 0 ? GREEN : RED });
    const p2 = (gUpAvg - gWorkingAvg) / gWorkingAvg * 100;
    compRows.push({ desc: 'Festius aixecats vs. Laborables — impacte festiu amb pilones', val: `${p2 >= 0 ? '+' : ''}${p2.toFixed(1)}%`, color: p2 >= 0 ? GREEN : RED });
  }
  if (gDownAvg > 0) {
    const p3 = (gUpAvg - gDownAvg) / gDownAvg * 100;
    compRows.push({ desc: 'Festius aixecats vs. Festius baixats — impacte real de les pilones', val: `${p3 >= 0 ? '+' : ''}${p3.toFixed(1)}%`, color: p3 < 0 ? GREEN : RED });
  }

  if (compRows.length === 0) {
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'italic');
    sc(pdf, [150, 160, 180]);
    pdf.text('Dades insuficients per calcular comparatives.', M, yPos);
    resetColor(pdf);
    yPos += 8;
  } else {
    compRows.forEach((row, i) => { drawCompRow(pdf, M, yPos, 135, 8, row.desc, row.val, row.color, i % 2 === 0); yPos += 8; });
  }

  yPos += 5;
  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'italic');
  sc(pdf, [128, 138, 160]);
  const compNote = 'Les comparatives mostren la diferència percentual entre categories de dies. Un valor negatiu a "Festius aixecats vs. Festius baixats" indica que les pilones redueixen efectivament el trànsit en dies festius respecte al seu comportament natural.';
  const compNoteLines = pdf.splitTextToSize(compNote, CW);
  pdf.text(compNoteLines, M, yPos);
  yPos += compNoteLines.length * 4.5 + 10;
  resetColor(pdf);

  // ── SECTION 4: ADVANCED INSIGHTS ─────────────────────────────────────────

  needPage(20);
  yPos = drawSectionHeader(pdf, '4. ANÀLISI AVANÇADA', yPos, M, CW);

  // Max / min
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  sc(pdf, NAVY);
  pdf.text('Màxims i mínims del periode', M, yPos);
  yPos += 5;
  resetColor(pdf);

  const hlH = 16;
  if (maxDay) {
    sf(pdf, [235, 242, 255]); sd(pdf, [208, 222, 250]);
    pdf.rect(M, yPos, CW / 2 - 4, hlH, 'FD');
    sf(pdf, BLUE); pdf.rect(M, yPos, 3, hlH, 'F');
    pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
    sc(pdf, NAVY); pdf.text('MÀXIM REGISTRAT', M + 6, yPos + 5.5);
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
    sc(pdf, [40, 50, 75]);
    pdf.text(`${maxDay.displayDate}`, M + 6, yPos + 10);
    pdf.setFont('helvetica', 'bold');
    sc(pdf, BLUE);
    pdf.text(`${maxDay.total.toLocaleString()} vehicles`, M + 6, yPos + 14.5);
  }
  if (minDay) {
    const minX = M + CW / 2 + 4;
    sf(pdf, [255, 242, 242]); sd(pdf, [248, 215, 215]);
    pdf.rect(minX, yPos, CW / 2 - 4, hlH, 'FD');
    sf(pdf, RED); pdf.rect(minX, yPos, 3, hlH, 'F');
    pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
    sc(pdf, [180, 20, 20]); pdf.text('MÍNIM REGISTRAT', minX + 6, yPos + 5.5);
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
    sc(pdf, [40, 50, 75]); pdf.text(`${minDay.displayDate}`, minX + 6, yPos + 10);
    pdf.setFont('helvetica', 'bold'); sc(pdf, RED);
    pdf.text(`${minDay.total.toLocaleString()} vehicles`, minX + 6, yPos + 14.5);
  }
  resetColor(pdf);
  yPos += hlH + 8;

  // Quarterly trend
  if (quarterRows.length > 0) {
    needPage(15 + quarterRows.length * 7);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); sc(pdf, NAVY);
    pdf.text('Tendència trimestral', M, yPos); yPos += 5; resetColor(pdf);

    const qCols = [32, 52, 25, 42];
    const qHdrs = ['Trimestre', 'Total vehicles', 'Dies', 'Mitjana/dia'];
    sf(pdf, [228, 234, 248]); pdf.rect(M, yPos, CW, 7, 'F');
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold'); sc(pdf, NAVY);
    let qx = M + 2;
    qHdrs.forEach((h, i) => { pdf.text(h, qx, yPos + 5); qx += qCols[i]; });
    yPos += 7;
    pdf.setFont('helvetica', 'normal'); sc(pdf, [48, 58, 82]);
    quarterRows.forEach(([key, { total, days }], i) => {
      if (i % 2 === 0) { sf(pdf, [247, 249, 254]); pdf.rect(M, yPos, CW, 6.5, 'F'); }
      pdf.setFontSize(7.5);
      const avg = days > 0 ? Math.round(total / days) : 0;
      qx = M + 2;
      [key, total.toLocaleString(), days.toString(), avg.toLocaleString()].forEach((v, ci) => { pdf.text(v, qx, yPos + 4.5); qx += qCols[ci]; });
      yPos += 6.5;
    });
    yPos += 8; resetColor(pdf);
  }

  // Year-over-year
  needPage(22 + yearRows.length * 7);
  pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); sc(pdf, NAVY);
  pdf.text('Comparació anual', M, yPos); yPos += 5; resetColor(pdf);

  if (yearRows.length < 2) {
    pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); sc(pdf, [148, 158, 178]);
    pdf.text('Dades insuficients per a la comparació any rere any.', M, yPos);
    resetColor(pdf); yPos += 8;
  } else {
    const yCols = [22, 52, 25, 42, 42];
    const yHdrs = ['Any', 'Total vehicles', 'Dies', 'Mitjana/dia', 'Variació %'];
    sf(pdf, [228, 234, 248]); pdf.rect(M, yPos, CW, 7, 'F');
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold'); sc(pdf, NAVY);
    let yx = M + 2;
    yHdrs.forEach((h, i) => { pdf.text(h, yx, yPos + 5); yx += yCols[i]; });
    yPos += 7;
    pdf.setFont('helvetica', 'normal'); sc(pdf, [48, 58, 82]);
    yearRows.forEach(([year, { total, days }], i) => {
      if (i % 2 === 0) { sf(pdf, [247, 249, 254]); pdf.rect(M, yPos, CW, 6.5, 'F'); }
      pdf.setFontSize(7.5);
      const avg = days > 0 ? Math.round(total / days) : 0;
      let pctStr = '—';
      if (i > 0) {
        const prev = yearRows[i - 1][1];
        const prevAvg = prev.days > 0 ? Math.round(prev.total / prev.days) : 0;
        if (prevAvg > 0) { const ch = (avg - prevAvg) / prevAvg * 100; pctStr = `${ch >= 0 ? '+' : ''}${ch.toFixed(1)}%`; }
      }
      yx = M + 2;
      [year, total.toLocaleString(), days.toString(), avg.toLocaleString(), pctStr].forEach((v, ci) => {
        if (ci === 4 && pctStr !== '—') sc(pdf, pctStr.startsWith('+') ? GREEN : RED);
        pdf.text(v, yx, yPos + 4.5);
        sc(pdf, [48, 58, 82]);
        yx += yCols[ci];
      });
      yPos += 6.5;
    });
    yPos += 8; resetColor(pdf);
  }

  // Monthly variation
  if (monthRows.length > 0) {
    needPage(20);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); sc(pdf, NAVY);
    pdf.text('Variació mensual', M, yPos); yPos += 5; resetColor(pdf);

    const mCols = [44, 52, 25, 42];
    const mHdrs = ['Mes', 'Total vehicles', 'Dies', 'Mitjana/dia'];
    sf(pdf, [228, 234, 248]); pdf.rect(M, yPos, CW, 7, 'F');
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold'); sc(pdf, NAVY);
    let mx2 = M + 2;
    mHdrs.forEach((h, i) => { pdf.text(h, mx2, yPos + 5); mx2 += mCols[i]; });
    yPos += 7;
    pdf.setFont('helvetica', 'normal'); sc(pdf, [48, 58, 82]);
    monthRows.forEach(([, { total, days, label }], i) => {
      needPage(7);
      if (i % 2 === 0) { sf(pdf, [247, 249, 254]); pdf.rect(M, yPos, CW, 6.5, 'F'); }
      pdf.setFontSize(7.5);
      const avg = days > 0 ? Math.round(total / days) : 0;
      mx2 = M + 2;
      [label, total.toLocaleString(), days.toString(), avg.toLocaleString()].forEach((v, ci) => { pdf.text(v, mx2, yPos + 4.5); mx2 += mCols[ci]; });
      yPos += 6.5;
    });
    yPos += 8; resetColor(pdf);
  }

  // Seasonality
  needPage(18);
  pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); sc(pdf, NAVY);
  pdf.text('Indicador d\'estacionalitat', M, yPos); yPos += 5; resetColor(pdf);

  if (!peakMonth || !troughMonth || moyAvgs.length < 3) {
    pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); sc(pdf, [148, 158, 178]);
    pdf.text('Dades insuficients per estimar l\'estacionalitat de manera fiable.', M, yPos);
    resetColor(pdf); yPos += 8;
  } else {
    const range2 = peakMonth.avg - troughMonth.avg;
    const seaPct = troughMonth.avg > 0 ? (range2 / troughMonth.avg * 100).toFixed(1) : 'N/A';
    const seaText = `El mes de màxima activitat és ${MONTH_CA[peakMonth.month]} (${Math.round(peakMonth.avg).toLocaleString()} v/d de mitjana). El mes de mínima activitat és ${MONTH_CA[troughMonth.month]} (${Math.round(troughMonth.avg).toLocaleString()} v/d). La variació estacional entre el mes pic i el mes vall és del ${seaPct}%.`;
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); sc(pdf, [50, 62, 88]);
    const seaLines = pdf.splitTextToSize(seaText, CW);
    pdf.text(seaLines, M, yPos);
    yPos += seaLines.length * 4.5 + 8;
    resetColor(pdf);
  }

  // ── SECTION 5: VEHICLE TYPE BREAKDOWN ────────────────────────────────────

  addPage();
  yPos = drawSectionHeader(pdf, '5. DESGLOSSAMENT PER TIPUS DE VEHICLE', yPos, M, CW);

  if (vehicleSorted.length === 0) {
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'italic'); sc(pdf, [148, 158, 178]);
    pdf.text('Sense dades per als filtres seleccionats.', M, yPos);
    resetColor(pdf); yPos += 10;
  } else {
    const barH2 = 9;
    const barGap2 = 4;
    const labelW = 28;
    const barAreaX2 = M + labelW;
    const barAreaW2 = CW - labelW - 48;
    const vColors: RGB[] = [BLUE, GREEN, RED, [245, 158, 11], [168, 85, 247], [156, 163, 175]];

    yPos += 3;
    vehicleSorted.forEach(([vehicle, total], i) => {
      needPage(barH2 + barGap2 + 5);
      const pct = totalVehicles > 0 ? `${(total / totalVehicles * 100).toFixed(1)}%` : '0%';
      drawHBar(pdf, M, yPos, barH2, vehicle, total, maxVehicleVal, barAreaX2, barAreaW2, vColors[i % vColors.length], pct);
      yPos += barH2 + barGap2;
    });

    yPos += 5;
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'italic'); sc(pdf, [128, 138, 160]);
    pdf.text(`Total: ${totalVehicles.toLocaleString()} vehicles. Les barres mostren el volum relatiu de cada tipus respecte al màxim registrat.`, M, yPos);
    resetColor(pdf);
  }

  // ── SECTION 6: NEIGHBOURHOOD ANALYSIS ────────────────────────────────────

  addPage();
  yPos = drawSectionHeader(pdf, '6. ANÀLISI PER BARRI', yPos, M, CW);

  const nbColW = (CW - 8) / 2;
  const nbGap = 8;
  const nbStartY = yPos;
  let maxNbEndY = yPos;

  (['Pedró', 'Gavarra'] as const).forEach((neighbourhood, colIdx) => {
    const stats = neighbourhoodAverages[neighbourhood];
    const reduction = bollardReduction[neighbourhood];
    const colX = M + colIdx * (nbColW + nbGap);
    let colY = nbStartY;

    const hasData = stats.workingDays > 0 || stats.holidayDownDays > 0 || stats.holidayUpDays > 0;

    // Column header
    sf(pdf, NAVY); pdf.rect(colX, colY, nbColW, 9, 'F');
    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); sc(pdf, [255, 255, 255]);
    pdf.text(neighbourhood, colX + nbColW / 2, colY + 6.5, { align: 'center' });
    colY += 9; resetColor(pdf);

    if (!hasData) {
      sf(pdf, [245, 246, 250]); sd(pdf, [215, 222, 238]);
      pdf.rect(colX, colY, nbColW, 22, 'FD');
      pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); sc(pdf, [148, 158, 178]);
      pdf.text('Sense dades per als filtres', colX + nbColW / 2, colY + 9, { align: 'center' });
      pdf.text('seleccionats.', colX + nbColW / 2, colY + 15, { align: 'center' });
      resetColor(pdf); colY += 24;
    } else {
      const bollardDate = neighbourhood === 'Pedró'
        ? bollardSettings?.bollardStartDatePedro
        : bollardSettings?.bollardStartDateGavarra;

      const statRowH = 20;
      const statRowGap = 2;
      [
        { label: 'LABORABLES', value: `${stats.workingAvg.toLocaleString()} v/d`, sub: `${stats.workingDays} dies`, color: BLUE },
        { label: 'FESTIUS BAIXATS', value: `${stats.holidayDownAvg.toLocaleString()} v/d`, sub: `${stats.holidayDownDays} dies`, color: GREEN },
        { label: 'FESTIUS AIXECATS', value: `${stats.holidayUpAvg.toLocaleString()} v/d`, sub: `${stats.holidayUpDays} dies`, color: RED },
      ].forEach(({ label, value, sub, color }) => {
        sf(pdf, [249, 251, 255]); sd(pdf, [215, 222, 238]);
        pdf.rect(colX, colY, nbColW, statRowH, 'FD');
        sf(pdf, color); pdf.rect(colX, colY, 3, statRowH, 'F');
        pdf.setFontSize(6.5); pdf.setFont('helvetica', 'bold'); sc(pdf, color);
        pdf.text(label, colX + 6, colY + 6.5);
        pdf.setFontSize(12); pdf.setFont('helvetica', 'bold'); sc(pdf, [18, 28, 50]);
        pdf.text(value, colX + 6, colY + 14.5);
        pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal'); sc(pdf, [130, 142, 165]);
        pdf.text(sub, colX + nbColW - 4, colY + 14.5, { align: 'right' });
        colY += statRowH + statRowGap;
        resetColor(pdf);
      });

      // Bollard reduction
      sf(pdf, [238, 244, 255]); sd(pdf, [198, 215, 245]);
      pdf.rect(colX, colY, nbColW, 15, 'FD');
      pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); sc(pdf, NAVY);
      pdf.text('Ràtio pilones (aixecades/baixades)', colX + 4, colY + 5.5);
      pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
      sc(pdf, reduction !== null && reduction < 100 ? GREEN : reduction !== null ? RED : [130, 142, 165]);
      pdf.text(reduction !== null ? `${reduction}%` : 'N/A', colX + 4, colY + 13);
      colY += 17; resetColor(pdf);

      if (bollardDate) {
        pdf.setFontSize(6.5); pdf.setFont('helvetica', 'italic'); sc(pdf, [155, 165, 188]);
        pdf.text(`Pilones actives des de: ${bollardDate}`, colX + 4, colY + 4);
        colY += 7; resetColor(pdf);
      }

      // Top 3 vehicle types
      const topVeh = Object.entries(stats.workingByVehicle)
        .sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (topVeh.length > 0) {
        colY += 2;
        pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); sc(pdf, [78, 90, 118]);
        pdf.text('Principals vehicles (avg/dia, laborables)', colX + 4, colY);
        colY += 4.5;
        pdf.setFont('helvetica', 'normal'); sc(pdf, [58, 70, 98]);
        topVeh.forEach(([v, avg]) => {
          pdf.setFontSize(7);
          pdf.text(`· ${v}: ${avg.toLocaleString()}`, colX + 6, colY);
          colY += 4.5;
        });
        resetColor(pdf);
      }
    }
    maxNbEndY = Math.max(maxNbEndY, colY);
  });

  yPos = maxNbEndY + 10;

  // ── SECTION 7: TIME-SERIES CHART ──────────────────────────────────────────

  addPage();
  yPos = drawSectionHeader(pdf, '7. EVOLUCIÓ TEMPORAL DEL TRÀNSIT', yPos, M, CW);

  // Legend
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
  const legItems: { color: RGB; label: string }[] = [
    { color: BLUE, label: 'Dies laborables' },
    { color: GREEN, label: 'Festius (pilones baixats)' },
    { color: RED, label: 'Festius (pilones aixecats)' },
  ];
  let legX = M;
  legItems.forEach(({ color, label }) => {
    sf(pdf, color); pdf.rect(legX, yPos - 2, 3.5, 3.5, 'F');
    sc(pdf, [55, 68, 95]); pdf.text(label, legX + 6, yPos + 0.5);
    legX += pdf.getTextWidth(label) + 14;
  });
  yPos += 10; resetColor(pdf);

  if (chartRef.current && chartData.length > 0) {
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(chartRef.current, {
        scale: 1.5, backgroundColor: '#ffffff', logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.82);
      const imgW = CW;
      const imgH = Math.min((canvas.height * imgW) / canvas.width, 120);
      needPage(imgH + 10);
      pdf.addImage(imgData, 'JPEG', M, yPos, imgW, imgH);
      yPos += imgH + 6;
    } catch {
      pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); sc(pdf, [175, 180, 195]);
      pdf.text('No s\'ha pogut capturar el gràfic.', M, yPos);
      resetColor(pdf); yPos += 10;
    }
  } else {
    pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); sc(pdf, [175, 180, 195]);
    pdf.text('Sense dades per mostrar el gràfic.', M, yPos);
    resetColor(pdf); yPos += 10;
  }

  pdf.setFontSize(7.5); pdf.setFont('helvetica', 'italic'); sc(pdf, [128, 138, 160]);
  pdf.text('El gràfic representa l\'evolució del total de vehicles per data, amb el codi de colors corresponent al tipus de dia.', M, yPos);
  resetColor(pdf);

  // ── SECTION 8: APPENDIX A — COVERAGE TABLE (LANDSCAPE, PAGE-SPLIT) ─────────

  // Build coverage data only from filteredData so neighbourhood / device-type /
  // camera / vehicle-type filters are all respected automatically.
  const coverageMap = new Map<string, Map<string, number>>();
  const coverageDates = new Set<string>();
  const coverageCameras = new Set<string>();
  filteredData.forEach(row => {
    if (row.dateTime && row.camera) {
      const dk = format(row.dateTime, 'yyyy-MM-dd');
      coverageDates.add(dk);
      coverageCameras.add(row.camera);
      if (!coverageMap.has(dk)) coverageMap.set(dk, new Map());
      coverageMap.get(dk)!.set(row.camera, (coverageMap.get(dk)!.get(row.camera) || 0) + row.valor);
    }
  });
  const sortedCovDates = Array.from(coverageDates).sort();
  // Sort cameras numerically (CT10, CT11 … CT23)
  const sortedCovCams = Array.from(coverageCameras).sort(
    (a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, ''))
  );

  // ── Layout constants ──
  const LS_W  = 297;
  const LS_H  = 210;
  const LS_M  = 10;   // margin left/right/top/bottom
  const LS_CW = LS_W - 2 * LS_M;  // 277 mm usable width

  const DATE_COL_W   = 32;        // fixed width for "Data / Dia" column
  const AVAIL_CAM_W  = LS_CW - DATE_COL_W; // width available for camera columns
  const MIN_CAM_COL  = 22;        // minimum camera column width for readability
  // Maximum cameras we can fit per landscape page without going below MIN_CAM_COL
  const MAX_CAMS_PER_PAGE = Math.max(1, Math.floor(AVAIL_CAM_W / MIN_CAM_COL));

  // Split cameras into chunks that each fit on one landscape page
  const camChunks: string[][] = [];
  for (let ci = 0; ci < sortedCovCams.length; ci += MAX_CAMS_PER_PAGE) {
    camChunks.push(sortedCovCams.slice(ci, ci + MAX_CAMS_PER_PAGE));
  }
  // If no cameras, create a dummy empty chunk so the "no data" message still renders
  if (camChunks.length === 0) camChunks.push([]);

  const ROW_H   = 6.5;
  const HDR_H   = 13;  // column-header row height
  const FOOT_H  = 12;  // space reserved at bottom for page footer

  // Helper: start the first landscape page (after closing the previous portrait section)
  drawPageFooter(pdf, W, H, pageNum, attribution);
  pdf.addPage([297, 210]);
  pageNum++;
  let lsY = LS_M;

  // ── Draw the ANNEX title bar (only once, on the first landscape page) ───────
  sf(pdf, NAVY); pdf.rect(LS_M, lsY, LS_CW, 10, 'F');
  sc(pdf, [255, 255, 255]); pdf.setFontSize(11.5); pdf.setFont('helvetica', 'bold');
  pdf.text('ANNEX A: COBERTURA DE DADES PER CÀMERA', LS_M + 4, lsY + 7);
  resetColor(pdf); lsY += 14;

  if (sortedCovDates.length === 0 || sortedCovCams.length === 0) {
    pdf.setFontSize(9); pdf.setFont('helvetica', 'italic'); sc(pdf, [148, 158, 178]);
    pdf.text('Sense dades de cobertura per als filtres seleccionats.', LS_M, lsY);
    resetColor(pdf);
    drawPageFooter(pdf, LS_W, LS_H, pageNum, attribution);
  } else {
    // Legend (shown once at the top of the first landscape page)
    pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); sc(pdf, [75, 90, 120]);
    pdf.text('Llegenda:', LS_M, lsY);
    let lx3 = LS_M + 24;
    ([{ color: BLUE, label: 'Laborable' }, { color: GREEN, label: 'Festiu baixat' }, { color: RED, label: 'Festiu aixecat' }] as { color: RGB; label: string }[]).forEach(({ color, label }) => {
      sf(pdf, color); pdf.rect(lx3, lsY - 2.5, 3, 3, 'F');
      sc(pdf, [60, 72, 100]); pdf.text(label, lx3 + 5, lsY);
      lx3 += pdf.getTextWidth(label) + 15;
    });
    lsY += 8; resetColor(pdf);

    // ── Iterate over camera-column chunks ─────────────────────────────────────
    camChunks.forEach((chunkCams, chunkIdx) => {
      const camColW = AVAIL_CAM_W / chunkCams.length; // distribute evenly within this chunk

      // For chunks after the first one, open a new landscape page with a continuation header
      if (chunkIdx > 0) {
        drawPageFooter(pdf, LS_W, LS_H, pageNum, attribution);
        pdf.addPage([297, 210]);
        pageNum++;
        lsY = LS_M;
        // Continuation sub-header
        sf(pdf, NAVY); pdf.rect(LS_M, lsY, LS_CW, 8, 'F');
        sc(pdf, [255, 255, 255]); pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
        const contLabel = `ANNEX A (cont.) — Càmeres ${chunkCams[0]} a ${chunkCams[chunkCams.length - 1]}`;
        pdf.text(contLabel, LS_M + 4, lsY + 5.5);
        resetColor(pdf); lsY += 11;
      }

      // ── Column-header row drawing function (called at top + after page breaks) ──
      const drawChunkHeader = () => {
        sf(pdf, [218, 228, 248]); sd(pdf, [195, 208, 238]);
        pdf.rect(LS_M, lsY, LS_CW, HDR_H, 'FD');
        pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); sc(pdf, NAVY);
        pdf.text('Data', LS_M + 3, lsY + 5.5);
        pdf.setFontSize(6);
        pdf.text('Dia set.', LS_M + 18, lsY + 5.5);
        let hx = LS_M + DATE_COL_W;
        chunkCams.forEach(cam => {
          const midX = hx + camColW / 2;
          pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); sc(pdf, NAVY);
          pdf.text(cam, midX, lsY + 5.5, { align: 'center' });
          const nb = cameraToNeighbourhood[cam];
          if (nb) {
            pdf.setFontSize(5.5); pdf.setFont('helvetica', 'normal'); sc(pdf, [100, 115, 148]);
            pdf.text(nb.slice(0, 9), midX, lsY + 10.5, { align: 'center' });
          }
          hx += camColW;
        });
        resetColor(pdf);
        lsY += HDR_H;
      };

      drawChunkHeader();
      let needsChunkHeader = false;

      // ── Date rows ─────────────────────────────────────────────────────────────
      sortedCovDates.forEach((dateStr, rowIndex) => {
        const spaceNeeded = ROW_H + (needsChunkHeader ? HDR_H + 2 : 0);
        if (lsY + spaceNeeded > LS_H - LS_M - FOOT_H) {
          drawPageFooter(pdf, LS_W, LS_H, pageNum, attribution);
          pdf.addPage([297, 210]);
          pageNum++;
          lsY = LS_M;
          needsChunkHeader = true;
        }
        if (needsChunkHeader) { drawChunkHeader(); needsChunkHeader = false; }

        const dateObj = new Date(dateStr + 'T12:00:00Z');
        const dayName = format(dateObj, 'EEEE', { locale: ca });
        // Truncate long day names to fit the narrow date column (max ~8 chars)
        const shortDay = (dayName.charAt(0).toUpperCase() + dayName.slice(1)).slice(0, 8);
        const dateDisplay = format(dateObj, 'dd/MM/yy');

        const dc = dayCategories.get(dateStr);
        const bgBase: RGB = dc === 'working'
          ? [234, 242, 255] : dc === 'holiday_down'
          ? [234, 250, 239] : dc === 'holiday_up'
          ? [255, 239, 239]
          : [248, 250, 255];
        const bgAlt: RGB = [
          Math.min(bgBase[0] + 7, 255),
          Math.min(bgBase[1] + 7, 255),
          Math.min(bgBase[2] + 7, 255),
        ];
        sf(pdf, rowIndex % 2 === 0 ? bgBase : bgAlt);
        pdf.rect(LS_M, lsY, LS_CW, ROW_H, 'F');
        sd(pdf, [212, 220, 240]);
        pdf.rect(LS_M, lsY, LS_CW, ROW_H, 'S');

        // Day-type accent stripe on the left
        const accentColor: RGB = dc === 'working' ? BLUE : dc === 'holiday_down' ? GREEN : dc === 'holiday_up' ? RED : [175, 182, 200];
        sf(pdf, accentColor); pdf.rect(LS_M, lsY, 2.5, ROW_H, 'F');

        pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal'); sc(pdf, [35, 45, 70]);
        pdf.text(dateDisplay, LS_M + 4, lsY + 4.5);
        pdf.setFontSize(6);
        pdf.text(shortDay, LS_M + 18, lsY + 4.5);

        // Camera-value cells
        let dx = LS_M + DATE_COL_W;
        const dMap = coverageMap.get(dateStr);
        chunkCams.forEach(cam => {
          const val = dMap?.get(cam);
          const midX = dx + camColW / 2;
          pdf.setFontSize(6.5);
          if (val !== undefined) {
            const vs = val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toString();
            sc(pdf, [28, 38, 62]);
            pdf.text(vs, midX, lsY + 4.5, { align: 'center' });
          } else {
            sc(pdf, [195, 202, 218]);
            pdf.text('—', midX, lsY + 4.5, { align: 'center' });
          }
          dx += camColW;
        });
        resetColor(pdf);
        lsY += ROW_H;
      });

      // Footer for the last page of this chunk (next chunk will open a new page)
      drawPageFooter(pdf, LS_W, LS_H, pageNum, attribution);
    });
  }

  // ── SECTION 9: FINAL NOTES (back to portrait) ────────────────────────────

  pdf.addPage();
  pageNum++;
  yPos = M;

  yPos = drawSectionHeader(pdf, '8. NOTES FINALS', yPos, M, CW);

  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); sc(pdf, [48, 58, 82]);
  const finalNotes = 'Les dades presentades en aquest informe provenen del sistema de recollida i processament de dades de l\'Ajuntament de Cornellà de Llobregat. Els resultats mostrats depenen directament dels filtres aplicats, el periode de temps analitzat i les condicions de captura de dades. Qualsevol interpretació ha de tenir en compte possibles incidències aïllades en el sistema de sensors o en el processament de la informació. Aquest informe ha estat generat automàticament i reflecteix l\'estat de les dades en el moment de la seva generació.';
  const fnLines = pdf.splitTextToSize(finalNotes, CW);
  pdf.text(fnLines, M, yPos);
  yPos += fnLines.length * 5 + 12;
  resetColor(pdf);

  // Metadata box
  sf(pdf, [244, 246, 252]); sd(pdf, [210, 218, 238]);
  pdf.rect(M, yPos, CW, 30, 'FD');
  pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold'); sc(pdf, [75, 88, 118]);
  pdf.text('Metadades de l\'informe', M + 4, yPos + 6);
  pdf.setFont('helvetica', 'normal'); sc(pdf, [98, 112, 145]);
  const meta = [
    `Data de generació: ${format(new Date(), "dd/MM/yyyy 'a les' HH:mm")}`,
    `Periode analitzat: ${explicitDateRange}`,
    `Total de registres filtrats: ${filteredData.length.toLocaleString()}`,
    `Dies analitzats: ${chartData.length}`,
  ];
  meta.forEach((line, i) => pdf.text(line, M + 4, yPos + 13 + i * 4.5));
  resetColor(pdf);
  yPos += 36;

  pdf.setFontSize(7); pdf.setFont('helvetica', 'italic'); sc(pdf, [182, 190, 208]);
  pdf.text(attribution, W / 2, yPos, { align: 'center' });
  resetColor(pdf);

  drawPageFooter(pdf, W, H, pageNum, attribution);

  pdf.save(`analytics_report_${today}.pdf`);
}
