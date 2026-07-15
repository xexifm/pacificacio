import { getCameraNeighbourhood } from './neighbourhoods';
import * as XLSX from 'xlsx';

export interface TransformedRow {
  camera: string;
  datahora: string;
  tipusVehicle: string;
  valor: number;
  dateTime?: Date;
  neighbourhood?: string;
}

export interface ExcelImportResult {
  data: TransformedRow[];
  format: 'csv' | 'excel';
  errors: string[];
}

const VEHICLE_TYPES = ['Camió', 'Autobús', 'Furgoneta', 'Cotxe', 'Moto', 'Desconegut'];
const VALID_CAMERAS = ['CT10', 'CT11', 'CT12', 'CT13', 'CT14', 'CT15', 'CT16', 'CT17', 'CT18', 'CT19', 'CT20', 'CT21', 'CT22', 'CT23'];

const EXCEL_HEADERS = ['camera', 'barri', 'date', 'time', 'vehicle_type', 'quantity'];

const MONTH_MAP: Record<string, number> = {
  'enero': 1, 'gener': 1,
  'febrero': 2, 'febrer': 2,
  'marzo': 3, 'març': 3,
  'abril': 4,
  'mayo': 5, 'maig': 5,
  'junio': 6, 'juny': 6,
  'julio': 7, 'juliol': 7,
  'agosto': 8, 'agost': 8,
  'septiembre': 9, 'setembre': 9,
  'octubre': 10,
  'noviembre': 11, 'novembre': 11,
  'diciembre': 12, 'desembre': 12,
};

function parseDateTime(dateTimeStr: string): Date | null {
  const match = dateTimeStr.match(/^(\d{1,2})\s+([a-zA-ZàèéíòóúüçÀÈÉÍÒÓÚÜÇ]+)\s+(\d{4})\s+(\d{1,2})h$/i);
  if (!match) return null;
  
  const [, day, monthName, year, hour] = match;
  const month = MONTH_MAP[monthName.toLowerCase()];
  
  if (!month) return null;
  
  return new Date(Date.UTC(parseInt(year), month - 1, parseInt(day), parseInt(hour), 0, 0));
}

function formatDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function isDateTimeString(str: string): boolean {
  const datePattern = /^\d{1,2}\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|gener|febrer|març|maig|juny|juliol|agost|setembre|octubre|novembre|desembre)\s+\d{4}\s+\d{1,2}h$/i;
  return datePattern.test(str.trim());
}

function isVehicleType(str: string): boolean {
  return VEHICLE_TYPES.some(type => str.trim() === type);
}

function isNumericValue(str: string): boolean {
  const trimmed = str.trim();
  return trimmed !== '' && !isNaN(parseInt(trimmed, 10));
}

// Long-format date parser: handles "YYYY-MM-DD HH:MM" (the format this app exports)
function parseLongFormatDate(datetimeStr: string): Date | null {
  const match = datetimeStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), 0));
}

// Detects and parses the normalized long-format CSV:
//   Càmera,Datahora,TipusVehicle,Valor
//   CT10,2024-02-15 13:00,Cotxe,31
// This is the same format produced by transformedRowsToCSV / the app's own CSV export.
function parseLongFormatCSV(csvText: string): TransformedRow[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  // Check header — must be exactly 4 comma-delimited columns with known names
  // Strip BOM (U+FEFF) that may appear at the start of UTF-8 files
  const firstLine = lines[0].replace(/^\uFEFF/, '');
  const headerCells = firstLine.split(',').map(h => h.trim().toLowerCase());
  if (headerCells.length !== 4) return [];

  // Normalize: strip BOM, accents are kept as-is for matching
  const [h0, h1, h2, h3] = headerCells;
  const LONG_FORMAT_HEADERS = [
    ['càmera', 'camera'],
    ['datahora'],
    ['tipusvehicle', 'tipus_vehicle'],
    ['valor'],
  ];
  const matches = [
    LONG_FORMAT_HEADERS[0].includes(h0),
    LONG_FORMAT_HEADERS[1].includes(h1),
    LONG_FORMAT_HEADERS[2].includes(h2),
    LONG_FORMAT_HEADERS[3].includes(h3),
  ];
  if (!matches.every(Boolean)) return [];

  console.log('[CSV] Detected long-format CSV (comma-delimited, 4-column)');
  console.log('[CSV] Headers:', [h0, h1, h2, h3]);

  const result: TransformedRow[] = [];
  let parseDateErrors = 0;
  let invalidCameraErrors = 0;
  let invalidValorErrors = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Split on comma but handle quoted fields (simple split is fine since no commas appear in values)
    const cells = line.split(',');
    if (cells.length < 4) continue;

    const camera = cells[0].trim();
    const datahora = cells[1].trim();
    const tipusVehicle = cells[2].trim();
    const valorStr = cells[3].trim();

    if (!camera || !datahora || !tipusVehicle || !valorStr) continue;

    if (!VALID_CAMERAS.includes(camera)) {
      invalidCameraErrors++;
      if (invalidCameraErrors <= 3) {
        console.warn(`[CSV] Row ${i + 1}: Invalid camera "${camera}"`);
      }
      continue;
    }

    const valor = parseInt(valorStr, 10);
    if (isNaN(valor) || valor < 0) {
      invalidValorErrors++;
      if (invalidValorErrors <= 3) {
        console.warn(`[CSV] Row ${i + 1}: Non-numeric valor "${valorStr}"`);
      }
      continue;
    }

    const dateTime = parseLongFormatDate(datahora);
    if (!dateTime) {
      parseDateErrors++;
      if (parseDateErrors <= 3) {
        console.warn(`[CSV] Row ${i + 1}: Cannot parse date "${datahora}" — expected YYYY-MM-DD HH:MM`);
      }
      continue;
    }

    result.push({
      camera,
      datahora,
      tipusVehicle,
      valor,
      dateTime,
      neighbourhood: getCameraNeighbourhood(camera),
    });
  }

  if (parseDateErrors > 3) console.warn(`[CSV] ... and ${parseDateErrors - 3} more date parse errors`);
  if (invalidCameraErrors > 3) console.warn(`[CSV] ... and ${invalidCameraErrors - 3} more invalid camera errors`);
  if (invalidValorErrors > 3) console.warn(`[CSV] ... and ${invalidValorErrors - 3} more invalid valor errors`);

  console.log(`[CSV] Long-format parse complete: ${result.length} rows read from ${lines.length - 1} data lines`);
  if (result.length > 0) {
    console.log('[CSV] First 5 rows:', result.slice(0, 5).map(r => `${r.camera} | ${r.datahora} | ${r.tipusVehicle} | ${r.valor}`));
  }

  return result;
}

export function transformCSV(csvText: string): TransformedRow[] {
  // Try long format first (comma-delimited, 4-column: Càmera,Datahora,TipusVehicle,Valor)
  const longFormatResult = parseLongFormatCSV(csvText);
  if (longFormatResult.length > 0) {
    return longFormatResult;
  }

  // Fall back to original wide format (semicolon-delimited, camera columns as headers)
  const lines = csvText.split('\n').filter(line => line.trim() && line.trim() !== ';;;;;;;;;;;;;');
  const result: TransformedRow[] = [];
  
  if (lines.length === 0) return result;
  
  const headerLine = lines[0];
  const cameras = headerLine.split(';').map(h => h.trim()).filter(h => h);
  
  console.log('[CSV] Falling back to wide-format parser (semicolon-delimited)');
  console.log('[CSV] Detected columns:', cameras);

  const cameraDateTimes: Map<string, string> = new Map();
  const cameraVehicleTypes: Map<string, string> = new Map();
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(';');
    
    if (cells.length !== cameras.length) continue;
    
    for (let colIndex = 0; colIndex < cells.length; colIndex++) {
      const cell = cells[colIndex].trim();
      const camera = cameras[colIndex];
      
      if (!cell || !camera) continue;
      
      if (isDateTimeString(cell)) {
        cameraDateTimes.set(camera, cell);
      } else if (isVehicleType(cell)) {
        cameraVehicleTypes.set(camera, cell);
      } else if (isNumericValue(cell)) {
        const dateTime = cameraDateTimes.get(camera);
        const vehicleType = cameraVehicleTypes.get(camera);
        
        if (dateTime && vehicleType) {
          const parsedDate = parseDateTime(dateTime);
          result.push({
            camera,
            datahora: dateTime,
            tipusVehicle: vehicleType,
            valor: parseInt(cell, 10),
            dateTime: parsedDate || undefined,
            neighbourhood: getCameraNeighbourhood(camera),
          });
        }
      }
    }
  }
  
  console.log(`[CSV] Wide-format parse complete: ${result.length} rows`);
  return result;
}

export function transformedRowsToCSV(rows: TransformedRow[]): string {
  const sortedRows = [...rows].sort((a, b) => {
    if (a.camera !== b.camera) {
      return a.camera.localeCompare(b.camera);
    }
    
    if (a.dateTime && b.dateTime) {
      return a.dateTime.getTime() - b.dateTime.getTime();
    }
    
    return a.datahora.localeCompare(b.datahora);
  });
  
  const header = 'Càmera,Datahora,TipusVehicle,Valor\n';
  const csvRows = sortedRows.map(row => {
    const formattedDate = row.dateTime ? formatDateTime(row.dateTime) : row.datahora;
    return `${row.camera},${formattedDate},${row.tipusVehicle},${row.valor}`;
  });
  return header + csvRows.join('\n');
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function hasExcelHeaders(headers: string[]): boolean {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
  return EXCEL_HEADERS.every(expected => normalizedHeaders.includes(expected));
}

function parseExcelDate(dateStr: string, timeStr: string): Date | null {
  try {
    const datePart = String(dateStr).trim();
    const timePart = String(timeStr).trim();
    
    const dateMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) return null;
    
    const [, year, month, day] = dateMatch;
    
    let hour = 0, minute = 0;
    if (timePart) {
      const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        hour = parseInt(timeMatch[1], 10);
        minute = parseInt(timeMatch[2], 10);
      }
    }
    
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), hour, minute, 0));
  } catch {
    return null;
  }
}

export function transformExcel(arrayBuffer: ArrayBuffer): ExcelImportResult {
  const errors: string[] = [];
  const data: TransformedRow[] = [];
  
  try {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
    
    if (jsonData.length < 2) {
      errors.push('El fitxer Excel no conté prou files.');
      return { data: [], format: 'excel', errors };
    }
    
    const headerRow = jsonData[0] as unknown[];
    const headers = headerRow.map(h => String(h || '').toLowerCase().trim());
    
    if (!hasExcelHeaders(headers)) {
      return { data: [], format: 'csv', errors: ['Format no reconegut com Excel exportat'] };
    }
    
    const cameraIdx = headers.indexOf('camera');
    const barriIdx = headers.indexOf('barri');
    const dateIdx = headers.indexOf('date');
    const timeIdx = headers.indexOf('time');
    const vehicleTypeIdx = headers.indexOf('vehicle_type');
    const quantityIdx = headers.indexOf('quantity');
    
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || !Array.isArray(row) || row.length === 0) continue;
      
      const camera = String(row[cameraIdx] || '').trim();
      const barri = String(row[barriIdx] || '').trim();
      const date = String(row[dateIdx] || '').trim();
      const time = String(row[timeIdx] || '').trim();
      const vehicleType = String(row[vehicleTypeIdx] || '').trim();
      const quantity = row[quantityIdx];
      
      if (!camera || !date || !vehicleType) {
        errors.push(`Fila ${i + 1}: Dades incompletes (camera, date, o vehicle_type falta)`);
        continue;
      }
      
      if (!VALID_CAMERAS.includes(camera)) {
        errors.push(`Fila ${i + 1}: Càmera invàlida "${camera}"`);
        continue;
      }
      
      const numQuantity = Number(quantity);
      if (isNaN(numQuantity) || numQuantity < 0) {
        errors.push(`Fila ${i + 1}: Quantitat invàlida "${quantity}"`);
        continue;
      }
      
      const parsedDate = parseExcelDate(date, time);
      if (!parsedDate) {
        errors.push(`Fila ${i + 1}: Format de data invàlid "${date} ${time}"`);
        continue;
      }
      
      const formattedDatehora = `${parsedDate.getUTCDate()} ${getMonthName(parsedDate.getUTCMonth())} ${parsedDate.getUTCFullYear()} ${parsedDate.getUTCHours()}h`;
      
      data.push({
        camera,
        datahora: formattedDatehora,
        tipusVehicle: vehicleType,
        valor: Math.round(numQuantity),
        dateTime: parsedDate,
        neighbourhood: barri || getCameraNeighbourhood(camera),
      });
    }
    
    return { data, format: 'excel', errors };
  } catch (err) {
    errors.push(`Error llegint Excel: ${err instanceof Error ? err.message : 'Error desconegut'}`);
    return { data: [], format: 'excel', errors };
  }
}

function getMonthName(monthIndex: number): string {
  const months = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];
  return months[monthIndex] || 'gener';
}

export function isExcelFile(file: File): boolean {
  const excelMimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ];
  return excelMimeTypes.includes(file.type) || 
         file.name.endsWith('.xlsx') || 
         file.name.endsWith('.xls');
}
