import { useMemo, useState } from "react";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import { monthRange, brl, type Category, type Transaction } from "@/lib/finance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TransactionList } from "./TransactionList";

interface Props {
  transactions: Transaction[];
  categories: Category[];
  isLoading: boolean;
}

export function TransactionsTab({ transactions, categories, isLoading }: Props) {
  const [refDate, setRefDate] = useState<Date | null>(null); // null = todos
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");

  const filtered = useMemo(() => {
    let list = transactions;

    if (refDate) {
      const { start, end } = monthRange(refDate);
      list = list.filter((t) => {
        const d = new Date(t.transaction_date + "T00:00:00");
        return d >= start && d <= end;
      });
    }

    if (typeFilter !== "all") {
      list = list.filter((t) => t.type === typeFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          brl(Number(t.amount)).includes(q),
      );
    }

    return list;
  }, [transactions, refDate, search, typeFilter]);

  const monthLabel = refDate
    ? format(refDate, "MMMM 'de' yyyy", { locale: ptBR })
    : "Todos os meses";

  const totalIncome = filtered
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = filtered
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Month nav */}
        <div className="flex items-center gap-0.5 rounded-xl border bg-card px-1 py-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setRefDate((d) => addMonths(d ?? new Date(), -1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <button
            className="text-xs font-medium px-2 min-w-[130px] text-center capitalize hover:text-primary transition-colors"
            onClick={() => setRefDate(null)}
            title="Clique para ver todos os meses"
          >
            {monthLabel}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setRefDate((d) => addMonths(d ?? new Date(), 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Type toggle */}
        <div className="flex rounded-xl border bg-card overflow-hidden text-xs">
          {(["all", "income", "expense"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 transition-colors ${
                typeFilter === t
                  ? "bg-primary text-primary-foreground font-medium"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              {t === "all" ? "Todos" : t === "income" ? "Receitas" : "Despesas"}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar descrição ou valor…"
            className="pl-8 h-8 text-xs"
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Summary row */}
      <div className="flex gap-4 text-xs text-muted-foreground px-1">
        <span>
          <strong className="text-foreground">{filtered.length}</strong> lançamento(s)
        </span>
        <span className="text-income font-medium">+{brl(totalIncome)}</span>
        <span className="text-expense font-medium">−{brl(totalExpense)}</span>
        <span className={`font-semibold ${totalIncome - totalExpense >= 0 ? "text-income" : "text-expense"}`}>
          = {brl(totalIncome - totalExpense)}
        </span>
      </div>

      {/* List */}
      <div className="rounded-2xl border bg-card p-4">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <TransactionList transactions={filtered} categories={categories} />
        )}
      </div>
    </div>
  );
}
