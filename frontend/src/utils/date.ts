export function currentYearRange() {
  const now = new Date();
  const year = now.getFullYear();
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`
  };
}

export function formatDateYYYYMMDDLocal(value: Date | string | number): string {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';

  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
