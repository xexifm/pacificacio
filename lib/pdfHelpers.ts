// Shared drawing primitives for the PDF reports (detailed + executive).
// Extracted from pdfReport.ts so both reports share one corporate visual language.

import type jsPDF from "jspdf";

export type RGB = [number, number, number];

// Institutional colour of the Ajuntament de Cornellà de Llobregat (escut red).
export const CORPORATE: RGB = [166, 26, 47];
export const NAVY: RGB = CORPORATE; // accent name used throughout the reports
export const BLUE: RGB = [59, 130, 246];
export const GREEN: RGB = [34, 197, 94];
export const RED: RGB = [239, 68, 68];
export const INK: RGB = [18, 28, 50];
export const MUTED: RGB = [120, 132, 155];

export const MONTH_CA = [
  "Gener", "Febrer", "Març", "Abril", "Maig", "Juny",
  "Juliol", "Agost", "Setembre", "Octubre", "Novembre", "Desembre",
];
export const MONTH_CA_SHORT = [
  "Gen", "Feb", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Oct", "Nov", "Des",
];

// ── colour setters ──
export function sc(pdf: jsPDF, rgb: RGB) { pdf.setTextColor(rgb[0], rgb[1], rgb[2]); }
export function sf(pdf: jsPDF, rgb: RGB) { pdf.setFillColor(rgb[0], rgb[1], rgb[2]); }
export function sd(pdf: jsPDF, rgb: RGB) { pdf.setDrawColor(rgb[0], rgb[1], rgb[2]); }
export function resetColor(pdf: jsPDF) { pdf.setTextColor(0, 0, 0); pdf.setDrawColor(0, 0, 0); }

// ── images ──
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function resizeToDataURL(
  img: HTMLImageElement, maxDim: number, fmt: "jpeg" | "png", quality = 0.8,
): string {
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(nw, nh));
  const c = document.createElement("canvas");
  c.width = Math.round(nw * scale);
  c.height = Math.round(nh * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(fmt === "jpeg" ? "image/jpeg" : "image/png", quality);
}

// ── chrome / components ──
export function drawPageFooter(pdf: jsPDF, pw: number, ph: number, pageNum: number, attribution: string) {
  sd(pdf, [210, 215, 230]);
  pdf.setLineWidth(0.2);
  pdf.line(10, ph - 8, pw - 10, ph - 8);
  pdf.setFontSize(6);
  pdf.setFont("helvetica", "normal");
  sc(pdf, [185, 190, 205]);
  pdf.text(`Pàgina ${pageNum}`, pw / 2, ph - 4.5, { align: "center" });
  pdf.text(attribution, pw - 10, ph - 4.5, { align: "right" });
  resetColor(pdf);
}

export function drawSectionHeader(pdf: jsPDF, title: string, y: number, margin: number, cw: number): number {
  sf(pdf, NAVY);
  pdf.rect(margin, y, cw, 10, "F");
  sc(pdf, [255, 255, 255]);
  pdf.setFontSize(11.5);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, margin + 4, y + 7);
  resetColor(pdf);
  return y + 14;
}

export function drawKPICard(
  pdf: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string, color: RGB, sublabel?: string,
) {
  sf(pdf, [248, 249, 252]);
  sd(pdf, [215, 222, 238]);
  pdf.rect(x, y, w, h, "FD");
  sf(pdf, color);
  pdf.rect(x, y, w, 3.5, "F");
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "normal");
  sc(pdf, [105, 118, 145]);
  pdf.text(label, x + 4, y + 12);
  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");
  sc(pdf, INK);
  pdf.text(value, x + 4, y + 29);
  if (sublabel) {
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "normal");
    sc(pdf, [138, 148, 168]);
    pdf.text(sublabel, x + 4, y + 37);
  }
  resetColor(pdf);
}

export function drawStatBox(
  pdf: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string, sub: string, color: RGB,
) {
  sf(pdf, [249, 251, 255]);
  sd(pdf, [215, 222, 238]);
  pdf.rect(x, y, w, h, "FD");
  sf(pdf, color);
  pdf.rect(x, y, 3, h, "F");
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "bold");
  sc(pdf, color);
  pdf.text(label, x + 6, y + 7.5);
  pdf.setFontSize(15);
  pdf.setFont("helvetica", "bold");
  sc(pdf, INK);
  pdf.text(value, x + 6, y + 20);
  pdf.setFontSize(6.5);
  pdf.setFont("helvetica", "normal");
  sc(pdf, [130, 142, 165]);
  pdf.text(sub, x + 6, y + 27);
  resetColor(pdf);
}

export function drawCompRow(
  pdf: jsPDF, x: number, y: number, descW: number, rowH: number,
  desc: string, val: string, valColor: RGB, alt: boolean,
) {
  if (alt) { sf(pdf, [245, 247, 253]); pdf.rect(x, y, descW + 50, rowH, "F"); }
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  sc(pdf, [55, 65, 90]);
  pdf.text(desc, x + 2, y + rowH - 2);
  pdf.setFont("helvetica", "bold");
  sc(pdf, valColor);
  pdf.text(val, x + descW + 2, y + rowH - 2);
  resetColor(pdf);
}

export function drawHBar(
  pdf: jsPDF, x: number, y: number, barH: number,
  label: string, value: number, maxValue: number,
  barAreaX: number, barAreaW: number, color: RGB, pct: string,
) {
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  sc(pdf, [48, 58, 82]);
  pdf.text(label, x, y + barH - 1);
  sf(pdf, [228, 233, 246]);
  pdf.rect(barAreaX, y, barAreaW, barH, "F");
  const fw = maxValue > 0 ? (value / maxValue) * barAreaW : 0;
  sf(pdf, color);
  pdf.rect(barAreaX, y, fw, barH, "F");
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "bold");
  sc(pdf, [38, 48, 72]);
  pdf.text(`${value.toLocaleString()} (${pct})`, barAreaX + barAreaW + 2, y + barH - 1);
  resetColor(pdf);
}
