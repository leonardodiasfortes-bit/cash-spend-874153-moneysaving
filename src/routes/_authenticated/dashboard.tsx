import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  LogOut,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Route as AuthLayoutRoute } from "./route";
import {
  brl,
  dueAlert,
  monthRange,
  type Category,
  type Transaction,
} from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { TransactionForm } from "@/components/finance/TransactionForm";
import { TransactionList } from "@/components/finance/TransactionList";
import { DailyCashFlow, ExpenseByCategory } from "@/components/finance/Charts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Painel — Finanças" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = AuthLayoutRoute.useRouteContext();
  const navigate = useNavigate();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Transaction[];
    },
  });

  const stats = useMemo(() => {
    const { start, end } = monthRange();
    let income = 0;
    let expense = 0;
    let balance = 0;
    let alerts = 0;
    const monthTx: Transaction[] = [];

    for (const t of transactions) {
      const d = new Date(t.transaction_date + "T00:00:00");
      const amount = Number(t.amount);
      if (t.type === "income") balance += amount;
      else balance -= amount;
      if (d >= start && d <= end) {
        monthTx.push(t);
        if (t.type === "income") income += amount;
        else expense += amount;
      }
      if (dueAlert(t)) alerts++;
    }
    return { income, expense, balance, alerts, monthTx };
  }, [transactions]);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Até logo!");
    navigate({ to: "/auth", replace: true });
  }

  const monthLabel = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-sidebar/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary grid place-items-center">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold leading-none">Finanças</h1>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <TransactionForm userId={user.id} />
          <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <section>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
            Resumo · {monthLabel}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Saldo total"
              value={brl(stats.balance)}
              icon={<Wallet className="h-5 w-5" />}
              tone={stats.balance >= 0 ? "primary" : "expense"}
            />
            <StatCard
              label="Receitas do mês"
              value={brl(stats.income)}
              icon={<TrendingUp className="h-5 w-5" />}
              tone="income"
            />
            <StatCard
              label="Despesas do mês"
              value={brl(stats.expense)}
              icon={<TrendingDown className="h-5 w-5" />}
              tone="expense"
            />
          </div>

          {stats.alerts > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-warning-foreground/90">
                Você tem <strong>{stats.alerts}</strong> despesa(s) atrasada(s) ou próximas do
                vencimento.
              </span>
            </div>
          )}
        </section>

        {/* Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 rounded-2xl border bg-card p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold">Fluxo de caixa diário</h2>
              <span className="text-xs text-muted-foreground">{monthLabel}</span>
            </div>
            <DailyCashFlow transactions={stats.monthTx} />
          </div>
          <div className="lg:col-span-2 rounded-2xl border bg-card p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold">Despesas por categoria</h2>
              <span className="text-xs text-muted-foreground">{monthLabel}</span>
            </div>
            <ExpenseByCategory transactions={stats.monthTx} categories={categories} />
          </div>
        </section>

        {/* Timeline */}
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Histórico</h2>
            <span className="text-xs text-muted-foreground">
              {transactions.length} transação(ões)
            </span>
          </div>
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : (
            <TransactionList transactions={transactions} categories={categories} />
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "primary" | "income" | "expense";
}) {
  const toneClass = {
    primary: "bg-primary/15 text-primary",
    income: "bg-income/15 text-income",
    expense: "bg-expense/15 text-expense",
  }[tone];

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className={`h-9 w-9 rounded-lg grid place-items-center ${toneClass}`}>{icon}</div>
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}
