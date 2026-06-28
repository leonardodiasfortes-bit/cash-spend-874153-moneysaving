import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  LogOut,
  AlertTriangle,
  LayoutDashboard,
  CreditCard,
  BarChart2,
  List,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Tag,
  BrainCircuit,
  Settings,
} from "lucide-react";
import { addMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Route as AuthLayoutRoute } from "./route";
import {
  brl,
  dueAlert,
  monthRange,
  type Account,
  type Category,
  type Transaction,
} from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { TransactionForm } from "@/components/finance/TransactionForm";
import { TransactionList } from "@/components/finance/TransactionList";
import { DailyCashFlow, ExpenseByCategory } from "@/components/finance/Charts";
import { AccountsTab } from "@/components/finance/AccountsTab";
import { ReportsTab } from "@/components/finance/ReportsTab";
import { TransactionsTab } from "@/components/finance/TransactionsTab";
import { InvestmentsTab } from "@/components/finance/InvestmentsTab";
import { CategoriesTab } from "@/components/finance/CategoriesTab";
import { AIAnalysisTab } from "@/components/finance/AIAnalysisTab";
import { SettingsTab } from "@/components/finance/SettingsTab";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Painel — Finanças" }],
  }),
  component: Dashboard,
});

type Tab = "overview" | "transactions" | "accounts" | "investments" | "categories" | "reports" | "ai" | "settings";

function Dashboard() {
  const { user } = AuthLayoutRoute.useRouteContext();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Account[];
    },
  });

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
    const { start, end } = monthRange(selectedMonth);
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
  }, [transactions, selectedMonth]);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Até logo!");
    navigate({ to: "/auth", replace: true });
  }

  const monthLabel = format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR });

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

        {/* Tab nav */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1 -mb-px">
          <TabButton
            active={tab === "overview"}
            onClick={() => setTab("overview")}
            icon={<LayoutDashboard className="h-3.5 w-3.5" />}
            label="Painel"
          />
          <TabButton
            active={tab === "transactions"}
            onClick={() => setTab("transactions")}
            icon={<List className="h-3.5 w-3.5" />}
            label="Transações"
          />
          <TabButton
            active={tab === "accounts"}
            onClick={() => setTab("accounts")}
            icon={<CreditCard className="h-3.5 w-3.5" />}
            label="Contas & Cartões"
          />
          <TabButton
            active={tab === "investments"}
            onClick={() => setTab("investments")}
            icon={<Landmark className="h-3.5 w-3.5" />}
            label="Investimentos"
          />
          <TabButton
            active={tab === "categories"}
            onClick={() => setTab("categories")}
            icon={<Tag className="h-3.5 w-3.5" />}
            label="Categorias"
          />
          <TabButton
            active={tab === "reports"}
            onClick={() => setTab("reports")}
            icon={<BarChart2 className="h-3.5 w-3.5" />}
            label="Relatórios"
          />
          <TabButton
            active={tab === "ai"}
            onClick={() => setTab("ai")}
            icon={<BrainCircuit className="h-3.5 w-3.5" />}
            label="IA"
          />
          <TabButton
            active={tab === "settings"}
            onClick={() => setTab("settings")}
            icon={<Settings className="h-3.5 w-3.5" />}
            label="Configurações"
          />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {tab === "overview" ? (
          <>
            {/* Stats */}
            <section>
              <div className="flex items-center gap-1 mb-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Resumo</p>
                <div className="ml-auto flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setSelectedMonth((m) => addMonths(m, -1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs font-medium px-1 capitalize min-w-[130px] text-center">
                    {monthLabel}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setSelectedMonth((m) => addMonths(m, 1))}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
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
                <DailyCashFlow transactions={stats.monthTx} refDate={selectedMonth} />
              </div>
              <div className="lg:col-span-2 rounded-2xl border bg-card p-5">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-sm font-semibold">Despesas por categoria</h2>
                  <span className="text-xs text-muted-foreground">{monthLabel}</span>
                </div>
                <ExpenseByCategory transactions={stats.monthTx} categories={categories} />
              </div>
            </section>

            {/* Quick list - top 5 do mês */}
            <section className="rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold">Últimas do mês</h2>
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => setTab("transactions")}
                >
                  Ver todas →
                </button>
              </div>
              {isLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
              ) : (
                <TransactionList
                  transactions={stats.monthTx.slice(0, 8)}
                  categories={categories}
                />
              )}
            </section>
          </>
        ) : tab === "transactions" ? (
          <TransactionsTab
            transactions={transactions}
            categories={categories}
            isLoading={isLoading}
          />
        ) : tab === "accounts" ? (
          <AccountsTab userId={user.id} />
        ) : tab === "investments" ? (
          <InvestmentsTab accounts={accounts} onAddAccount={() => setTab("accounts")} />
        ) : tab === "categories" ? (
          <CategoriesTab userId={user.id} />
        ) : tab === "reports" ? (
          <ReportsTab transactions={transactions} categories={categories} accounts={accounts} />
        ) : tab === "ai" ? (
          <AIAnalysisTab transactions={transactions} categories={categories} accounts={accounts} />
        ) : (
          <SettingsTab userId={user.id} />
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {icon}
      {label}
    </button>
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
