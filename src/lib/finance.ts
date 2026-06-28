import { format, isAfter, isBefore, addDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export type TxType = "income" | "expense";
export type ExpenseStatus = "paid" | "pending";

export interface Category {
  id: string;
  name: string;
  type: TxType;
  icon: string | null;
  is_default: boolean;
  user_id: string | null;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TxType;
  amount: number;
  description: string;
  category_id: string | null;
  transaction_date: string;
  due_date: string | null;
  status: ExpenseStatus | null;
  created_at: string;
}

export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtDate = (d: string | Date, p = "dd 'de' MMM") =>
  format(typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d, p, {
    locale: ptBR,
  });

export function monthRange(ref = new Date()) {
  return { start: startOfMonth(ref), end: endOfMonth(ref) };
}

/** Returns: "overdue" | "soon" | null */
export function dueAlert(tx: Transaction): "overdue" | "soon" | null {
  if (tx.type !== "expense" || tx.status === "paid" || !tx.due_date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(tx.due_date + "T00:00:00");
  if (isBefore(due, today)) return "overdue";
  if (isBefore(due, addDays(today, 4))) return "soon";
  return null;
}

export function isAfterDate(a: Date, b: Date) {
  return isAfter(a, b);
}
