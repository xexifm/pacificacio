const OFFICIAL_HOLIDAYS = [
  // 2024
  '2024-01-01',
  '2024-01-06',
  '2024-03-29',
  '2024-04-01',
  '2024-05-01',
  '2024-05-20',
  '2024-05-31',
  '2024-06-24',
  '2024-08-15',
  '2024-09-11',
  '2024-10-12',
  '2024-11-01',
  '2024-12-06',
  '2024-12-25',
  '2024-12-26',
  
  // 2025
  '2025-01-01',
  '2025-01-06',
  '2025-04-18',
  '2025-04-21',
  '2025-05-01',
  '2025-06-09',
  '2025-06-20',
  '2025-06-24',
  '2025-08-15',
  '2025-09-11',
  '2025-11-01',
  '2025-12-06',
  '2025-12-08',
  '2025-12-25',
  '2025-12-26',
  
  // 2026
  '2026-01-01',
  '2026-01-06',
  '2026-04-03',
  '2026-04-06',
  '2026-05-01',
  '2026-08-15',
  '2026-09-11',
  '2026-10-12',
  '2026-12-08',
  '2026-12-25',
  '2026-12-26',
];

export function isHoliday(date: Date): boolean {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  return OFFICIAL_HOLIDAYS.includes(dateStr);
}

export function isWorkingDay(date: Date): boolean {
  const dayOfWeek = date.getUTCDay();
  
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  if (isHoliday(date)) {
    return false;
  }
  
  return true;
}

export function getDayType(date: Date): 'working' | 'holiday' {
  return isWorkingDay(date) ? 'working' : 'holiday';
}

export const DAY_TYPE_COLORS = {
  working: 'hsl(var(--chart-1))',
  holiday: 'hsl(142, 76%, 36%)',
};
