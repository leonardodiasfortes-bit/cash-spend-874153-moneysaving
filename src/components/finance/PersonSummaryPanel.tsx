import { useMemo } from "react";
import { AlertTriangle, Clock } from "lucide-react";

import { brl, dueAlert, fmtDate, type Category, type Transaction } from "@/lib/finance";
import { cn } from "@/lib/utils";

const CAT_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#ec4899", "#f97316", "#84cc16",
];

interface Props {
  person: string;
  transactions: Transaction[];       // period-filtered + person-filtered (for stats & cats)
  allTransactions: Transaction[];    // all months for this person (for vencimentos)
  categories: Category[];
}

export function PersonSummaryPanel({ person, transactions, allTransactions, categories }: Props) {
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const income = useMemo(
    () => transactions.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0),
    [transactions],
  );
  const expense = useMemo(
    () => transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
    [transactions],
  );

  const catBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; icon: string; value: number }>();
    for (const t of transactions.filter((x) => x.type === "expense")) {
      const cat = t.category_id ? catMap.get(t.category_id) : null;
      const key = cat?.name ?? "Sem categoria";
      const existing = map.get(key);
      if (existing) existing.value += Number(t.amount);
      else map.set(key, { name: key, icon: cat?.icon ?? "❓", value: Number(t.amount) });
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [transactions, catMap]);

  const upcoming = useMemo(
    () =>
      allTransactions
        .filter((t) => t.type === "expense" && t.due_date && t.status !== "paid")
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
        .slice(0, 6),
    [allTransactions],
  );

  const maxCat = catBreakdown[0]?.value || 1;

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
        <span className="text-sm font-semibold">{person}</span>
        <span className="text-xs text-muted-foreground">· análise do período</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
        {/* Coluna 1: Resumo */}
        <div className="p-4 space-y-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Resumo</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Receitas</span>
            <span className="text-sm font-semibold text-income tabular-nums">{brl(income)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Despesas</span>
            <span className="text-sm font-semibold text-expense tabular-nums">{brl(expense)}</span>
          </div>
          <div className="border-t pt-2 flex items-center justify-between">
            <span className="text-xs font-medium">Saldo</span>
            <span
              className={cn(
                "text-sm font-bold tabular-nums",
                income - expense >= 0 ? "text-income" : "text-expense",
              )}
            >
              {brl(income - expense)}
            </span>
          </div>
        </div>

        {/* Coluna 2: Categorias */}
        <div className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-3">
            Despesas por categoria
          </p>
          {catBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem despesas no período.</p>
          ) : (
            <div className="space-y-2.5">
              {catBreakdown.slice(0, 5).map((item, i) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1">
                      <span>{item.icon}</span>
                      <span>{item.name}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground font-medium">
                      {brl(item.value)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(item.value / maxCat) * 100}%`,
                        background: CAT_COLORS[i % CAT_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Coluna 3: Vencimentos */}
        <div className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-3">
            Vencimentos pendentes
          </p>
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem vencimentos pendentes.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((t) => {
                const alert = dueAlert(t);
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between text-xs rounded-lg px-2.5 py-2 bg-muted/40"
                  >
                    <span className="truncate flex-1 mr-2">{t.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {alert === "overdue" && <AlertTriangle className="h-3 w-3 text-expense" />}
                      {alert === "soon" && <Clock className="h-3 w-3 text-warning" />}
                      <span
                        className={cn(
                          "font-medium tabular-nums",
                          alert === "overdue"
                            ? "text-expense"
                            : alert === "soon"
                            ? "text-warning"
                            : "text-muted-foreground",
                        )}
                      >
                        {fmtDate(t.due_date!)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
