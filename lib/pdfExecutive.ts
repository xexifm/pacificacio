// Executive impact report for the mayor: "are the traffic-calming measures
// working?". Short (~10-12 pages), fully vector-drawn (no html2canvas), corporate.
// It is self-contained: given the raw data it computes the impact, the monthly
// evolution and the coverage matrix itself, independent of the dashboard filters.

import { format } from "date-fns";
import {
  type RGB, NAVY, GREEN, RED, MUTED, INK, MONTH_CA_SHORT,
  sc, sf, sd, resetColor, loadImage, resizeToDataURL,
  drawPageFooter, drawSectionHeader, drawKPICard,
} from "@/lib/pdfHelpers";
import { computeImpact, deltaVerdict, MIN_DAYS_PER_SIDE, type NeighbourhoodImpact } from "@/lib/impact";
import type { SchedulesMap } from "@/lib/schedule";
import type { TrafficData, CameraSettings, BollardSettings } from "@/lib/types";

export interface ExecutiveReportInput {
  trafficData: TrafficData[];
  cameraSettings: CameraSettings[];
  bollardSettings?: BollardSettings;
  schedules: SchedulesMap;
  attribution: string;
  escutSrc: string;
}

const W = 210;
const H = 297;
const M = 15;
const CW = W - 2 * M;

const fmt = (n: number) => Math.round(n).toLocaleString("ca-ES");
const deltaStr = (pct: number | null) =>
  pct === null ? "N/D" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
const deltaColor = (pct: number | null): RGB => {
  const v = deltaVerdict(pct);
  return v === "reduction" ? GREEN : v === "increase" ? RED : MUTED;
};
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function monthLabel(key: string): string {
  const m = parseInt(key.slice(5, 7), 10) - 1;
  return `${MONTH_CA_SHORT[m]} ${key.slice(2, 4)}`;
}

export async function generateExecutiveReport(input: ExecutiveReportInput): Promise<void> {
  const { trafficData, cameraSettings, bollardSettings, schedules, attribution, escutSrc } = input;

  const dates: Record<string, string | null> = {
    "Pedró": bollardSettings?.bollardStartDatePedro ?? null,
    "Gavarra": bollardSettings?.bollardStartDateGavarra ?? null,
  };
  const impact = computeImpact(trafficData, cameraSettings, schedules, dates, { reliableOnly: true });

  const reliableSet = new Set(cameraSettings.filter((c) => c.reliable !== false).map((c) => c.cameraId));

  // ── Derived aggregates ─────────────────────────────────────────────────────
  const allDates = trafficData.map((r) => r.datahora.slice(0, 10)).sort();
  const dateFrom = allDates[0] ?? "";
  const dateTo = allDates[allDates.length - 1] ?? "";
  const distinctDays = new Set(allDates).size;
  const totalVehicles = trafficData.reduce((s, r) => s + r.valor, 0);

  // Monthly registered volume (reliable cameras).
  const monthlyMap = new Map<string, number>();
  const coverage = new Map<string, Map<string, Set<string>>>(); // camera -> month -> set of days
  for (const r of trafficData) {
    const date = r.datahora.slice(0, 10);
    const month = date.slice(0, 7);
    if (reliableSet.has(r.camera)) {
      monthlyMap.set(month, (monthlyMap.get(month) || 0) + r.valor);
    }
    if (!coverage.has(r.camera)) coverage.set(r.camera, new Map());
    const cm = coverage.get(r.camera)!;
    if (!cm.has(month)) cm.set(month, new Set());
    cm.get(month)!.add(date);
  }
  const monthKeys = Array.from(monthlyMap.keys()).sort();
  const monthly = monthKeys.map((k) => ({ key: k, label: monthLabel(k), total: monthlyMap.get(k)! }));

  // All months in range (for the coverage matrix columns).
  const allMonths: string[] = [];
  if (dateFrom && dateTo) {
    let y = parseInt(dateFrom.slice(0, 4)), m = parseInt(dateFrom.slice(5, 7));
    const ey = parseInt(dateTo.slice(0, 4)), em = parseInt(dateTo.slice(5, 7));
    while (y < ey || (y === ey && m <= em)) {
      allMonths.push(`${y}-${String(m).padStart(2, "0")}`);
      m++; if (m > 12) { m = 1; y++; }
    }
  }

  // ── PDF scaffold ───────────────────────────────────────────────────────────
  const { default: JsPDF } = await import("jspdf");
  const pdf = new JsPDF("p", "mm", "a4", true);
  let yPos = M;
  let pageNum = 1;

  const addPage = () => {
    drawPageFooter(pdf, W, H, pageNum, attribution);
    pdf.addPage();
    pageNum++;
    yPos = M;
  };
  const needPage = (space: number) => {
    if (yPos + space > H - M - 12) addPage();
  };

  // ══ PAGE 1 · COVER ═════════════════════════════════════════════════════════
  try {
    const img = await loadImage(escutSrc);
    const ar = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
    const lH = 32;
    const lW = lH * ar;
    const data = resizeToDataURL(img, 500, "png");
    pdf.addImage(data, "PNG", (W - lW) / 2, 34, lW, lH);
  } catch { /* skip */ }

  sd(pdf, NAVY); pdf.setLineWidth(1); pdf.line(M, 82, W - M, 82); pdf.setLineWidth(0.2);
  pdf.setFontSize(21); pdf.setFont("helvetica", "bold"); sc(pdf, NAVY);
  pdf.text("INFORME EXECUTIU", W / 2, 98, { align: "center" });
  pdf.setFontSize(14);
  pdf.text("Impacte de les mesures de pacificació del trànsit", W / 2, 108, { align: "center" });
  pdf.setFontSize(11); pdf.setFont("helvetica", "normal"); sc(pdf, [70, 90, 125]);
  pdf.text("Cornellà de Llobregat · Barris de Pedró i Gavarra", W / 2, 117, { align: "center" });
  sd(pdf, NAVY); pdf.setLineWidth(1); pdf.line(M, 123, W - M, 123); pdf.setLineWidth(0.2);

  // Info box
  const boxY = 135;
  sf(pdf, [248, 250, 254]); sd(pdf, [210, 220, 240]);
  pdf.rect(M, boxY, CW, 56, "FD");
  sf(pdf, NAVY); pdf.rect(M, boxY, CW, 8, "F");
  sc(pdf, [255, 255, 255]); pdf.setFontSize(8.5); pdf.setFont("helvetica", "bold");
  pdf.text("PARÀMETRES DE L'ANÀLISI", M + 4, boxY + 5.5);
  const info: [string, string][] = [
    ["Data d'activació · Pedró", dates["Pedró"] ? fmtDate(dates["Pedró"]!) : "no configurada"],
    ["Data d'activació · Gavarra", dates["Gavarra"] ? fmtDate(dates["Gavarra"]!) : "no configurada"],
    ["Període de dades analitzat", dateFrom && dateTo ? `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}` : "—"],
    ["Dies i registres", `${distinctDays.toLocaleString("ca-ES")} dies · ${totalVehicles.toLocaleString("ca-ES")} vehicles`],
  ];
  let iy = boxY + 16;
  info.forEach(([k, v]) => {
    pdf.setFontSize(8.5); pdf.setFont("helvetica", "bold"); sc(pdf, [75, 95, 135]);
    pdf.text(`${k}:`, M + 4, iy);
    pdf.setFont("helvetica", "normal"); sc(pdf, [28, 38, 60]);
    pdf.text(v, M + 68, iy);
    iy += 9;
  });
  resetColor(pdf);

  sf(pdf, NAVY); pdf.rect(0, H - 16, W, 16, "F");
  sc(pdf, [255, 255, 255]); pdf.setFontSize(8); pdf.setFont("helvetica", "bold");
  pdf.text(`Generat el ${format(new Date(), "dd/MM/yyyy 'a les' HH:mm")}`, W / 2, H - 9.5, { align: "center" });
  pdf.text("Ajuntament de Cornellà de Llobregat", W / 2, H - 4.5, { align: "center" });
  resetColor(pdf);

  // ══ PAGE 2 · EXECUTIVE SUMMARY ═════════════════════════════════════════════
  addPage();
  yPos = drawSectionHeader(pdf, "1. RESUM EXECUTIU", yPos, M, CW);

  const pedro = impact.byNeighbourhood.find((n) => n.neighbourhood === "Pedró");
  const gavarra = impact.byNeighbourhood.find((n) => n.neighbourhood === "Gavarra");
  const workingDeltas = impact.byNeighbourhood.map((n) => n.working.deltaPct).filter((d): d is number => d !== null);
  const globalWorking = workingDeltas.length ? workingDeltas.reduce((a, b) => a + b, 0) / workingDeltas.length : null;

  const cardW = (CW - 8) / 2, cardH = 46;
  drawKPICard(pdf, M, yPos, cardW, cardH, "PILONES · PEDRÓ (dies amb barrera)",
    pedro ? deltaStr(pedro.pilona.deltaPct) : "N/D", pedro ? deltaColor(pedro.pilona.deltaPct) : MUTED,
    pedro ? `${fmt(pedro.pilona.before.avgPerDay)} → ${fmt(pedro.pilona.after.avgPerDay)} v/dia` : "sense dades");
  drawKPICard(pdf, M + cardW + 8, yPos, cardW, cardH, "PILONES · GAVARRA (dies amb barrera)",
    gavarra ? deltaStr(gavarra.pilona.deltaPct) : "N/D", gavarra ? deltaColor(gavarra.pilona.deltaPct) : MUTED,
    gavarra ? `${fmt(gavarra.pilona.before.avgPerDay)} → ${fmt(gavarra.pilona.after.avgPerDay)} v/dia` : "sense dades");
  yPos += cardH + 8;
  drawKPICard(pdf, M, yPos, cardW, cardH, "LABORABLES (mitjana dels barris)",
    globalWorking !== null ? deltaStr(globalWorking) : "N/D", globalWorking !== null ? deltaColor(globalWorking) : MUTED,
    "variació en dies laborables");
  drawKPICard(pdf, M + cardW + 8, yPos, cardW, cardH, "VOLUM ANALITZAT",
    totalVehicles.toLocaleString("ca-ES"), NAVY, `${distinctDays.toLocaleString("ca-ES")} dies de dades`);
  yPos += cardH + 10;

  // Auto conclusions
  pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); sc(pdf, NAVY);
  pdf.text("Conclusions principals", M, yPos); yPos += 6; resetColor(pdf);

  const bullets = buildConclusions(impact);
  pdf.setFontSize(9); sc(pdf, [40, 50, 75]);
  bullets.forEach((b) => {
    needPage(14);
    pdf.setFont("helvetica", "bold"); sf(pdf, NAVY);
    pdf.circle(M + 1.5, yPos - 1.2, 0.8, "F");
    pdf.setFont("helvetica", "normal"); sc(pdf, [40, 50, 75]);
    const lines = pdf.splitTextToSize(b, CW - 6);
    pdf.text(lines, M + 5, yPos);
    yPos += lines.length * 4.6 + 3;
  });
  resetColor(pdf);

  // ══ PER-NEIGHBOURHOOD PAGES ════════════════════════════════════════════════
  for (const n of impact.byNeighbourhood) {
    addPage();
    yPos = drawSectionHeader(pdf, `2. IMPACTE AL BARRI DE ${n.neighbourhood.toUpperCase()}`, yPos, M, CW);
    drawNeighbourhoodPage(pdf, n);
  }

  // ══ PER-CAMERA TABLE ═══════════════════════════════════════════════════════
  addPage();
  yPos = drawSectionHeader(pdf, "3. IMPACTE PER PUNT DE CONTROL", yPos, M, CW);
  yPos = drawCameraTable(pdf, impact.byCamera, yPos, addPage, needPage);

  // ══ MONTHLY EVOLUTION ══════════════════════════════════════════════════════
  addPage();
  yPos = drawSectionHeader(pdf, "4. EVOLUCIÓ MENSUAL DEL VOLUM", yPos, M, CW);
  yPos = drawMonthlyChart(pdf, monthly, dates, yPos);

  // ══ METHODOLOGY + COVERAGE ═════════════════════════════════════════════════
  addPage();
  yPos = drawSectionHeader(pdf, "5. METODOLOGIA I QUALITAT DE LES DADES", yPos, M, CW);
  yPos = drawMethodology(pdf, yPos);
  yPos = drawCoverageMatrix(pdf, cameraSettings, coverage, allMonths, reliableSet, yPos, addPage, needPage);

  drawPageFooter(pdf, W, H, pageNum, attribution);
  pdf.save(`informe_executiu_pacificacio_${format(new Date(), "yyyy-MM-dd")}.pdf`);

  // ── nested drawing helpers (share yPos via closure where noted) ─────────────

  function drawNeighbourhoodPage(p: typeof pdf, n: NeighbourhoodImpact) {
    pdf.setFontSize(9); pdf.setFont("helvetica", "italic"); sc(pdf, MUTED);
    pdf.text(`Mesures actives des del ${fmtDate(n.interventionDate)}. `
      + `${n.pilona.camerasCount} pilones i ${n.camera.camerasCount} càmeres de control incloses. `
      + `Els "punts amb pilona" es comparen només els dies que la barrera està aixecada; `
      + `els "punts sense pilona" (càmeres) serveixen de control.`, M, yPos, { maxWidth: CW });
    yPos += 12; resetColor(p);

    // Paired before/after bars: pilona (treatment), càmera (control), working.
    const groups: { title: string; c: NeighbourhoodImpact["pilona"] }[] = [
      { title: "Punts AMB pilona — dies amb barrera aixecada (efecte directe)", c: n.pilona },
      { title: "Punts SENSE pilona — càmeres de control (festius)", c: n.camera },
      { title: "Dies laborables — control", c: n.working },
    ];
    for (const g of groups) {
      needPage(40);
      pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); sc(pdf, NAVY);
      pdf.text(g.title, M, yPos); yPos += 6; resetColor(p);

      const max = Math.max(g.c.before.avgPerDay, g.c.after.avgPerDay, 1);
      const barAreaX = M + 26, barAreaW = CW - 26 - 40, barH = 8;
      // before
      drawBar(p, M, yPos, "Abans", g.c.before.avgPerDay, max, barAreaX, barAreaW, barH, [140, 150, 170]);
      yPos += barH + 3;
      drawBar(p, M, yPos, "Després", g.c.after.avgPerDay, max, barAreaX, barAreaW, barH, deltaColor(g.c.deltaPct));
      yPos += barH + 2;
      // delta
      pdf.setFontSize(11); pdf.setFont("helvetica", "bold"); sc(pdf, deltaColor(g.c.deltaPct));
      pdf.text(`Variació: ${deltaStr(g.c.deltaPct)}`, M + 26, yPos + 3);
      resetColor(p); yPos += 9;
    }

    // Vehicle breakdown table (pilona up-days).
    yPos += 2;
    needPage(10 + Object.keys(n.pilona.byVehicleDelta).length * 6);
    pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); sc(pdf, NAVY);
    pdf.text("Desglossament per tipus de vehicle (punts amb pilona)", M, yPos); yPos += 6; resetColor(p);

    const cols = [55, 40, 40, 40];
    sf(p, [228, 234, 248]); pdf.rect(M, yPos, CW, 7, "F");
    pdf.setFontSize(8); pdf.setFont("helvetica", "bold"); sc(pdf, NAVY);
    ["Tipus de vehicle", "Abans (v/dia)", "Després (v/dia)", "Variació"].forEach((h, i) => {
      let x = M + 2; for (let j = 0; j < i; j++) x += cols[j];
      pdf.text(h, x, yPos + 5);
    });
    yPos += 7;
    const vehicles = Object.entries(n.pilona.byVehicleDelta).sort((a, b) => b[1].before - a[1].before);
    vehicles.forEach(([v, d], i) => {
      if (i % 2 === 0) { sf(p, [247, 249, 254]); pdf.rect(M, yPos, CW, 6.5, "F"); }
      pdf.setFontSize(8); pdf.setFont("helvetica", "normal"); sc(pdf, [48, 58, 82]);
      pdf.text(v, M + 2, yPos + 4.5);
      pdf.text(fmt(d.before), M + 2 + cols[0], yPos + 4.5);
      pdf.text(fmt(d.after), M + 2 + cols[0] + cols[1], yPos + 4.5);
      pdf.setFont("helvetica", "bold"); sc(pdf, deltaColor(d.deltaPct));
      pdf.text(deltaStr(d.deltaPct), M + 2 + cols[0] + cols[1] + cols[2], yPos + 4.5);
      sc(pdf, [48, 58, 82]);
      yPos += 6.5;
    });
    resetColor(p);

    if (n.seasonalityWarning) {
      yPos += 4; needPage(10);
      pdf.setFontSize(7.5); pdf.setFont("helvetica", "italic"); sc(pdf, [180, 130, 20]);
      pdf.text("Avís: els períodes abans/després cobreixen mesos diferents; part de la variació pot ser estacional.", M, yPos, { maxWidth: CW });
      resetColor(p); yPos += 6;
    }
  }

  function drawBar(
    p: typeof pdf, x: number, y: number, label: string, value: number, max: number,
    barAreaX: number, barAreaW: number, barH: number, color: RGB,
  ) {
    pdf.setFontSize(8); pdf.setFont("helvetica", "normal"); sc(p, [48, 58, 82]);
    pdf.text(label, x, y + barH - 2);
    sf(p, [232, 236, 246]); pdf.rect(barAreaX, y, barAreaW, barH, "F");
    sf(p, color); pdf.rect(barAreaX, y, max > 0 ? (value / max) * barAreaW : 0, barH, "F");
    pdf.setFontSize(8); pdf.setFont("helvetica", "bold"); sc(p, INK);
    pdf.text(`${fmt(value)} v/dia`, barAreaX + barAreaW + 2, y + barH - 2);
    resetColor(p);
  }
}

// ── standalone drawing helpers (no yPos closure) ─────────────────────────────

function buildConclusions(impact: { byNeighbourhood: NeighbourhoodImpact[] }): string[] {
  const out: string[] = [];
  if (impact.byNeighbourhood.length === 0) {
    return ["No hi ha prou dades ni dates d'activació configurades per avaluar l'impacte de les mesures."];
  }
  for (const n of impact.byNeighbourhood) {
    const v = deltaVerdict(n.pilona.deltaPct);
    const abs = n.pilona.deltaPct !== null ? Math.abs(n.pilona.deltaPct).toFixed(1) : "";
    const range = `${fmt(n.pilona.before.avgPerDay)} → ${fmt(n.pilona.after.avgPerDay)} vehicles/dia`;
    if (v === "reduction") {
      out.push(`Al barri de ${n.neighbourhood}, als punts amb pilona el trànsit els dies amb barrera aixecada s'ha reduït un ${abs}% coincidint amb l'activació de les mesures (${range}).`);
    } else if (v === "increase") {
      out.push(`Al barri de ${n.neighbourhood}, als punts amb pilona el trànsit ha augmentat un ${abs}% respecte al període anterior (${range}).`);
    } else if (v === "no-change") {
      out.push(`Al barri de ${n.neighbourhood}, als punts amb pilona el trànsit s'ha mantingut pràcticament estable (${deltaStr(n.pilona.deltaPct)}).`);
    } else {
      out.push(`Al barri de ${n.neighbourhood} no hi ha prou dades comparables per quantificar l'efecte de les pilones.`);
    }
    const cotxes = n.pilona.byVehicleDelta["Cotxe"];
    if (cotxes && cotxes.deltaPct !== null) {
      const cv = deltaVerdict(cotxes.deltaPct);
      if (cv === "reduction") out.push(`   › En concret, els cotxes als punts amb pilona han baixat un ${Math.abs(cotxes.deltaPct).toFixed(1)}%.`);
      else if (cv === "increase") out.push(`   › Els cotxes als punts amb pilona han pujat un ${cotxes.deltaPct.toFixed(1)}%.`);
    }
    // Contrast with the control points (cameras without a bollard).
    if (n.camera.camerasCount > 0 && n.camera.deltaPct !== null) {
      const cv = deltaVerdict(n.camera.deltaPct);
      const ctxt = cv === "reduction" ? "també baixa" : cv === "increase" ? "puja (possible desviament)" : "es manté estable";
      out.push(`   › Als punts sense pilona (càmeres de control) el trànsit ${ctxt} (${deltaStr(n.camera.deltaPct)}), fet que ajuda a distingir l'efecte directe de la barrera.`);
    }
    if (n.working.deltaPct !== null) {
      const wv = deltaVerdict(n.working.deltaPct);
      const wtxt = wv === "reduction" ? "una reducció" : wv === "increase" ? "un augment" : "estabilitat";
      out.push(`   › En dies laborables (control) el barri mostra ${wtxt} del ${deltaStr(n.working.deltaPct)}.`);
    }
  }
  return out;
}

function drawCameraTable(
  pdf: any, cameras: any[], startY: number, addPage: () => void, needPage: (n: number) => void,
): number {
  let yPos = startY;
  const cols = [15, 50, 18, 22, 28, 27, 20]; // Punt, Ubicació, Barri, Tipus, Δ festius, Δ laborables, Fiable
  const headers = ["Punt", "Ubicació", "Barri", "Tipus", "Δ festius", "Δ laborables", "Fiable"];

  const drawHeader = () => {
    sf(pdf, [228, 234, 248]); pdf.rect(M, yPos, CW, 7, "F");
    pdf.setFontSize(7.5); pdf.setFont("helvetica", "bold"); sc(pdf, NAVY);
    let x = M + 2;
    headers.forEach((h, i) => { pdf.text(h, x, yPos + 5); x += cols[i]; });
    yPos += 7; resetColor(pdf);
  };
  drawHeader();

  // reliable first, then unreliable
  const ordered = [...cameras].sort((a, b) => Number(b.reliable) - Number(a.reliable));
  ordered.forEach((c, i) => {
    if (yPos + 6.5 > H - M - 14) { addPage(); yPos = M; drawHeader(); }
    if (i % 2 === 0) { sf(pdf, [247, 249, 254]); pdf.rect(M, yPos, CW, 6.5, "F"); }
    const dim: RGB = c.reliable ? [40, 50, 75] : [165, 172, 188];
    pdf.setFontSize(7.5); pdf.setFont("helvetica", "normal");
    let x = M + 2;
    sc(pdf, dim); pdf.setFont("helvetica", "bold"); pdf.text(c.camera, x, yPos + 4.5); x += cols[0];
    pdf.setFont("helvetica", "normal");
    const loc = (c.displayName ?? "—").slice(0, 42);
    pdf.text(loc, x, yPos + 4.5); x += cols[1];
    pdf.text(c.neighbourhood, x, yPos + 4.5); x += cols[2];
    pdf.text(c.hasPilona ? "Pilona" : "Càmera", x, yPos + 4.5); x += cols[3];
    // deltas
    const hd = c.festiu ? deltaStr(c.festiu.deltaPct) : "—";
    const wd = c.working ? deltaStr(c.working.deltaPct) : "—";
    pdf.setFont("helvetica", "bold");
    sc(pdf, c.festiu && c.reliable ? deltaColor(c.festiu.deltaPct) : dim); pdf.text(hd, x, yPos + 4.5); x += cols[4];
    sc(pdf, c.working && c.reliable ? deltaColor(c.working.deltaPct) : dim); pdf.text(wd, x, yPos + 4.5); x += cols[5];
    pdf.setFont("helvetica", "normal"); sc(pdf, c.reliable ? GREEN : [180, 130, 20]);
    pdf.text(c.reliable ? "Sí" : "No", x, yPos + 4.5);
    resetColor(pdf);
    yPos += 6.5;
  });
  yPos += 5;
  pdf.setFontSize(7.5); pdf.setFont("helvetica", "italic"); sc(pdf, MUTED);
  pdf.text("Les càmeres marcades com a no fiables (en gris) s'exclouen dels indicadors de titular. \"—\" indica dades insuficients per comparar (menys de "
    + `${MIN_DAYS_PER_SIDE} dies a algun costat).`, M, yPos, { maxWidth: CW });
  resetColor(pdf);
  return yPos + 8;
}

function drawMonthlyChart(
  pdf: any, monthly: { key: string; label: string; total: number }[], dates: Record<string, string | null>, startY: number,
): number {
  let yPos = startY;
  if (monthly.length === 0) {
    pdf.setFontSize(9); pdf.setFont("helvetica", "italic"); sc(pdf, MUTED);
    pdf.text("Sense dades mensuals disponibles.", M, yPos); resetColor(pdf);
    return yPos + 8;
  }
  const chartX = M + 4, chartW = CW - 8, chartY = yPos, chartH = 90;
  const maxVal = Math.max(...monthly.map((m) => m.total), 1);
  const baseline = chartY + chartH;

  // axis
  sd(pdf, [200, 208, 224]); pdf.setLineWidth(0.3);
  pdf.line(chartX, chartY, chartX, baseline);
  pdf.line(chartX, baseline, chartX + chartW, baseline);
  // y ticks
  pdf.setFontSize(6.5); pdf.setFont("helvetica", "normal"); sc(pdf, MUTED);
  for (let t = 0; t <= 4; t++) {
    const yy = baseline - (chartH * t) / 4;
    const val = (maxVal * t) / 4;
    pdf.text(val >= 1000 ? `${Math.round(val / 1000)}k` : String(Math.round(val)), chartX - 2, yy + 1, { align: "right" });
    sd(pdf, [235, 238, 246]); pdf.line(chartX, yy, chartX + chartW, yy);
  }

  const barGap = chartW / monthly.length;
  const barW = Math.min(barGap * 0.7, 8);
  monthly.forEach((m, i) => {
    const bx = chartX + i * barGap + (barGap - barW) / 2;
    const bh = (m.total / maxVal) * chartH;
    sf(pdf, [59, 130, 246]); pdf.rect(bx, baseline - bh, barW, bh, "F");
    if (i % Math.ceil(monthly.length / 12) === 0) {
      pdf.setFontSize(5.5); sc(pdf, MUTED);
      pdf.text(m.label, bx + barW / 2, baseline + 4, { align: "center", angle: 0 });
    }
  });

  // activation lines
  const drawActivation = (dateStr: string | null, label: string) => {
    if (!dateStr) return;
    const key = dateStr.slice(0, 7);
    const idx = monthly.findIndex((m) => m.key === key);
    if (idx < 0) return;
    const lx = chartX + idx * barGap + barGap / 2;
    sd(pdf, [166, 26, 47]); pdf.setLineWidth(0.6);
    pdf.setLineDashPattern([1.2, 1.2], 0);
    pdf.line(lx, chartY - 2, lx, baseline);
    pdf.setLineDashPattern([], 0); pdf.setLineWidth(0.3);
    sc(pdf, [166, 26, 47]); pdf.setFontSize(6.5); pdf.setFont("helvetica", "bold");
    pdf.text(label, lx, chartY - 3, { align: "center" });
  };
  drawActivation(dates["Pedró"], "Pedró");
  drawActivation(dates["Gavarra"], "Gavarra");
  resetColor(pdf);

  yPos = baseline + 10;
  pdf.setFontSize(7.5); pdf.setFont("helvetica", "italic"); sc(pdf, MUTED);
  pdf.text("Volum total mensual registrat (càmeres fiables). Les línies verticals marquen l'activació de les mesures a cada barri. "
    + "El volum brut depèn també de la cobertura de dades; els indicadors d'impacte de les seccions anteriors ja normalitzen aquest efecte.", M, yPos, { maxWidth: CW });
  resetColor(pdf);
  return yPos + 12;
}

function drawMethodology(pdf: any, startY: number): number {
  let yPos = startY;
  const paras = [
    "Aquest informe compara el trànsit abans i després de l'activació de les mesures de pacificació a cada barri. Per evitar biaixos, només es comparen dies equivalents: dies laborables amb dies laborables i dies festius (caps de setmana i festius oficials) amb dies festius.",
    "Per a cada càmera es calcula la mitjana de vehicles per dia (suma de vehicles dividida pels dies amb dades), de manera que les diferències de cobertura entre períodes no distorsionen el resultat. Una càmera només s'inclou en una comparació si disposa d'un mínim de "
      + `${MIN_DAYS_PER_SIDE} dies amb dades a banda i banda de la data d'activació.`,
    "L'indicador de cada barri és la suma de les mitjanes per càmera de les càmeres que compleixen aquest criteri i que estan marcades com a fiables. Un valor negatiu indica una reducció del trànsit.",
    "Limitacions: es tracta d'una anàlisi descriptiva i comparativa, no d'un model causal. Factors externs (estacionalitat, obres, meteorologia, canvis en la xarxa viària) poden influir en els resultats. Quan els períodes comparats cobreixen mesos molt diferents, s'indica amb un avís d'estacionalitat.",
  ];
  pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); sc(pdf, [45, 55, 80]);
  paras.forEach((t) => {
    const lines = pdf.splitTextToSize(t, CW);
    pdf.text(lines, M, yPos);
    yPos += lines.length * 4.6 + 3;
  });
  resetColor(pdf);
  return yPos + 4;
}

function drawCoverageMatrix(
  pdf: any, cameras: CameraSettings[], coverage: Map<string, Map<string, Set<string>>>,
  months: string[], reliableSet: Set<string>, startY: number, addPage: () => void, needPage: (n: number) => void,
): number {
  let yPos = startY;
  needPage(20);
  pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); sc(pdf, NAVY);
  pdf.text("Cobertura de dades per càmera i mes", M, yPos); yPos += 5;
  pdf.setFontSize(7.5); pdf.setFont("helvetica", "italic"); sc(pdf, MUTED);
  pdf.text("Percentatge de dies amb dades a cada mes. Com més fosc, més cobertura.", M, yPos); yPos += 5;
  resetColor(pdf);

  const daysInMonth = (key: string) => {
    const y = parseInt(key.slice(0, 4)), m = parseInt(key.slice(5, 7));
    return new Date(y, m, 0).getDate();
  };

  const labelW = 16;
  const colW = Math.min((CW - labelW) / Math.max(months.length, 1), 8);
  const rowH = 5.5;
  const ordered = [...cameras].sort(
    (a, b) => parseInt(a.cameraId.replace(/\D/g, "")) - parseInt(b.cameraId.replace(/\D/g, "")),
  );

  // header row: month labels (every 2nd)
  pdf.setFontSize(5); sc(pdf, MUTED);
  months.forEach((mo, i) => {
    if (i % 2 === 0) pdf.text(monthLabel(mo).replace(" ", "\n"), M + labelW + i * colW + colW / 2, yPos, { align: "center" });
  });
  yPos += 5;

  ordered.forEach((c) => {
    if (yPos + rowH > H - M - 12) { addPage(); yPos = M; }
    pdf.setFontSize(6.5); pdf.setFont("helvetica", c.reliable ? "bold" : "normal");
    sc(pdf, c.reliable ? INK : [165, 172, 188]);
    pdf.text(c.cameraId, M, yPos + rowH - 1.5);
    const cm = coverage.get(c.cameraId);
    months.forEach((mo, i) => {
      const days = cm?.get(mo)?.size ?? 0;
      const frac = Math.min(1, days / daysInMonth(mo));
      const x = M + labelW + i * colW;
      if (frac > 0) {
        const alpha = 0.15 + 0.85 * frac;
        // Emulate opacity by mixing the corporate red toward white.
        const mix = (ch: number) => Math.round(255 - (255 - ch) * alpha);
        pdf.setFillColor(mix(166), mix(26), mix(47));
        pdf.rect(x, yPos, colW - 0.6, rowH - 0.6, "F");
      } else {
        sf(pdf, [242, 244, 248]); pdf.rect(x, yPos, colW - 0.6, rowH - 0.6, "F");
      }
    });
    yPos += rowH;
  });
  resetColor(pdf);
  return yPos + 6;
}
