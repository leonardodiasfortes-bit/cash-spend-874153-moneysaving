const KEY = "ff_month_allocations";

export interface MonthAllocation {
  /** User intention: should this month's surplus go to a yield account? */
  directed: boolean;
  /** Chosen investment account for the aporte. */
  accountId: string | null;
  /** Set once the aporte is actually executed (balance increased). */
  applied?: { amount: number; accountId: string; date: string };
}

const EMPTY: MonthAllocation = { directed: false, accountId: null };

export function getAllocations(): Record<string, MonthAllocation> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** month key = "yyyy-MM" */
export function getAllocation(month: string): MonthAllocation {
  return getAllocations()[month] ?? { ...EMPTY };
}

export function saveAllocation(month: string, alloc: MonthAllocation): void {
  const all = getAllocations();
  all[month] = alloc;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore (SSR / storage disabled) */
  }
}
