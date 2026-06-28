import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Scale, ChevronLeft, ChevronRight } from "lucide-react";

import { brl, type Account, type Category, type Transaction } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type ReportView = "cashflow" | "dre" | "balance";
type DrePeriod = "monthly" | "annual";

interface Props {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
}

// ─── Fluxo de Caixa ──────────────────────────────────────────────────────────

function CashFlowView({ transactions }: { transactions: Transaction[] }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const data = useMemo(() => {
    let running = 0;
    // compute balance from all transactions BEFORE the selected year
    for (const t of transactions) {
      const d = new Date(t.transaction_date + "T00:00:00");
      if (d.getFullYear() < year) {
        running += t.type === "income" ? Number(t.amount) : -Number(t.amount);
      }
    }

    return MONTHS.map((label, m) => {
      const monthTx = transactions.filter((t) => {
        const d = new Date(t.transaction_date + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === m;
      });

      const income = monthTx
        .filter((t) => t.type === "income")
        .reduce((s, t) => s + Number(t.amount), 0);
      const expense = monthTx
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + Number(t.amount), 0);
      const net = income - expense;
      const openingBalance = running;
      running += net;

      return { label, income, expense, net, openingBalance, closingBalance: running };
    });
  }, [transactions, year]);

  const totalIncome = data.reduce((s, m) => s + m.income, 0);
  const totalExpense = data.reduce((s, m) => s + m.expense, 0);
  const totalNet = totalIncome - totalExpense;

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear((y) => y - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold w-12 text-center">{year}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setYear((y) => y + 1)}
          disabled={year >= currentYear}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="ml-auto flex gap-4 text-xs text-muted-foreground">
          <span className="text-income font-medium">Entradas: {brl(totalIncome)}</span>
          <span className="text-expense font-medium">Saídas: {brl(totalExpense)}</span>
          <span className={cn("font-semibold", totalNet >= 0 ? "text-income" : "text-expense")}>
            Resultado: {brl(totalNet)}
          </span>
        </div>
      </div>

      {/* Bar chart */}
      <div className="rounded-2xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Entradas × Saídas mensais</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => brl(v)}
              />
              <Bar dataKey="income" name="Entradas" fill="var(--income)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Saídas" fill="var(--expense)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Saldo acumulado */}
      <div className="rounded-2xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Saldo acumulado</h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis
                tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => brl(v)}
                labelFormatter={(l) => String(l)}
              />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Line
                type="monotone"
                dataKey="closingBalance"
                name="Saldo"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly table */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Mês</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Entradas</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Saídas</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Resultado</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Saldo Final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((m) => (
              <tr key={m.label} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5 font-medium">{m.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-income">
                  {m.income > 0 ? brl(m.income) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-expense">
                  {m.expense > 0 ? brl(m.expense) : "—"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right tabular-nums font-medium",
                    m.net > 0 ? "text-income" : m.net < 0 ? "text-expense" : "text-muted-foreground",
                  )}
                >
                  {m.net !== 0 ? (m.net > 0 ? "+" : "") + brl(m.net) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                  {brl(m.closingBalance)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/30 font-semibold">
              <td className="px-4 py-2.5 text-xs uppercase tracking-wide">Total {year}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-income">{brl(totalIncome)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-expense">{brl(totalExpense)}</td>
              <td
                className={cn(
                  "px-4 py-2.5 text-right tabular-nums",
                  totalNet >= 0 ? "text-income" : "text-expense",
                )}
              >
                {totalNet >= 0 ? "+" : ""}{brl(totalNet)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{brl(data[11].closingBalance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── DRE ─────────────────────────────────────────────────────────────────────

function DREView({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [period, setPeriod] = useState<DrePeriod>("monthly");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const { incomeRows, expenseRows, totalIncome, totalExpense, resultado } = useMemo(() => {
    const filtered = transactions.filter((t) => {
      const d = new Date(t.transaction_date + "T00:00:00");
      if (period === "annual") return d.getFullYear() === year;
      return d.getFullYear() === year && d.getMonth() === month;
    });

    const catMap = new Map(categories.map((c) => [c.id, c]));
    const incomeMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();

    for (const t of filtered) {
      const cat = t.category_id ? catMap.get(t.category_id) : null;
      const key = cat?.name ?? "Sem categoria";
      if (t.type === "income") {
        incomeMap.set(key, (incomeMap.get(key) ?? 0) + Number(t.amount));
      } else {
        expenseMap.set(key, (expenseMap.get(key) ?? 0) + Number(t.amount));
      }
    }

    const incomeRows = Array.from(incomeMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const expenseRows = Array.from(expenseMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const totalIncome = incomeRows.reduce((s, r) => s + r.value, 0);
    const totalExpense = expenseRows.reduce((s, r) => s + r.value, 0);

    return { incomeRows, expenseRows, totalIncome, totalExpense, resultado: totalIncome - totalExpense };
  }, [transactions, categories, period, year, month]);

  const periodLabel =
    period === "annual" ? String(year) : `${MONTHS_FULL[month]} de ${year}`;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border overflow-hidden text-sm">
          <button
            className={cn("px-3 py-1.5 transition-colors", period === "monthly" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            onClick={() => setPeriod("monthly")}
          >
            Mensal
          </button>
          <button
            className={cn("px-3 py-1.5 transition-colors", period === "annual" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            onClick={() => setPeriod("annual")}
          >
            Anual
          </button>
        </div>

        {period === "monthly" && (
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="h-8 rounded-lg border bg-background px-2 text-sm"
          >
            {MONTHS_FULL.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium w-12 text-center">{year}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear((y) => y + 1)} disabled={year >= currentYear}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* DRE Table */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b bg-muted/30">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            DRE — Demonstração de Resultado · {periodLabel}
          </p>
        </div>

        <div className="divide-y divide-border">
          {/* Receitas */}
          <div>
            <div className="px-5 py-2.5 bg-income/5">
              <p className="text-xs font-semibold uppercase tracking-wide text-income">Receitas</p>
            </div>
            {incomeRows.length === 0 ? (
              <p className="px-5 py-3 text-sm text-muted-foreground">Nenhuma receita no período.</p>
            ) : (
              incomeRows.map((r) => (
                <div key={r.name} className="flex justify-between px-5 py-2.5 text-sm hover:bg-muted/20">
                  <span className="text-muted-foreground">{r.name}</span>
                  <span className="tabular-nums font-medium text-income">{brl(r.value)}</span>
                </div>
              ))
            )}
            <div className="flex justify-between px-5 py-2.5 font-semibold text-sm border-t bg-income/5">
              <span>Total Receitas</span>
              <span className="tabular-nums text-income">{brl(totalIncome)}</span>
            </div>
          </div>

          {/* Despesas */}
          <div>
            <div className="px-5 py-2.5 bg-expense/5">
              <p className="text-xs font-semibold uppercase tracking-wide text-expense">Despesas</p>
            </div>
            {expenseRows.length === 0 ? (
              <p className="px-5 py-3 text-sm text-muted-foreground">Nenhuma despesa no período.</p>
            ) : (
              expenseRows.map((r) => (
                <div key={r.name} className="flex justify-between px-5 py-2.5 text-sm hover:bg-muted/20">
                  <span className="text-muted-foreground">{r.name}</span>
                  <span className="tabular-nums font-medium text-expense">({brl(r.value)})</span>
                </div>
              ))
            )}
            <div className="flex justify-between px-5 py-2.5 font-semibold text-sm border-t bg-expense/5">
              <span>Total Despesas</span>
              <span className="tabular-nums text-expense">({brl(totalExpense)})</span>
            </div>
          </div>

          {/* Resultado */}
          <div
            className={cn(
              "flex justify-between px-5 py-4 font-bold text-base",
              resultado >= 0 ? "bg-income/10" : "bg-expense/10",
            )}
          >
            <span>Resultado do Período</span>
            <div className="text-right">
              <p className={cn("tabular-nums", resultado >= 0 ? "text-income" : "text-expense")}>
                {resultado >= 0 ? "+" : ""}{brl(resultado)}
              </p>
              {totalIncome > 0 && (
                <p className="text-xs text-muted-foreground font-normal">
                  Margem: {((resultado / totalIncome) * 100).toFixed(1)}%
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Balanço Patrimonial ──────────────────────────────────────────────────────

function BalanceView({
  accounts,
  transactions,
}: {
  accounts: Account[];
  transactions: Transaction[];
}) {
  const { ativoGroups, totalAtivo, passivoGroups, totalPassivo, patrimonioLiquido } = useMemo(() => {
    const checking = accounts.filter((a) => a.type === "checking");
    const savings = accounts.filter((a) => a.type === "savings");
    const wallet = accounts.filter((a) => a.type === "wallet");
    const investments = accounts.filter((a) => a.type === "investment");
    const creditCards = accounts.filter((a) => a.type === "credit_card");

    const sumAccounts = (list: Account[]) => list.reduce((s, a) => s + Number(a.balance), 0);

    const disponivel = sumAccounts([...checking, ...savings, ...wallet]);
    const investimento = sumAccounts(investments);
    const totalAtivo = disponivel + investimento;

    const totalCartoes = sumAccounts(creditCards);
    const contasPendentes = transactions
      .filter((t) => t.type === "expense" && t.status === "pending")
      .reduce((s, t) => s + Number(t.amount), 0);
    const totalPassivo = totalCartoes + contasPendentes;

    return {
      ativoGroups: [
        { label: "Disponível", accounts: [...checking, ...savings, ...wallet], total: disponivel },
        { label: "Investimentos", accounts: investments, total: investimento },
      ],
      totalAtivo,
      passivoGroups: [
        { label: "Cartões de Crédito", accounts: creditCards, total: totalCartoes },
        { label: "Contas Pendentes", accounts: [], total: contasPendentes, note: true },
      ],
      totalPassivo,
      patrimonioLiquido: totalAtivo - totalPassivo,
    };
  }, [accounts, transactions]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ATIVO */}
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-income/5">
            <p className="text-xs font-semibold uppercase tracking-wide text-income">Ativo</p>
          </div>
          <div className="divide-y divide-border">
            {ativoGroups.map((group) => (
              <div key={group.label}>
                {group.accounts.length > 0 && (
                  <>
                    <p className="px-5 py-2 text-xs text-muted-foreground font-medium bg-muted/20">
                      {group.label}
                    </p>
                    {group.accounts.map((a) => (
                      <div key={a.id} className="flex justify-between px-5 py-2.5 text-sm">
                        <span>{a.name}</span>
                        <span className="tabular-nums font-medium">{brl(Number(a.balance))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between px-5 py-2 text-xs font-semibold text-muted-foreground border-t">
                      <span>Subtotal {group.label}</span>
                      <span className="tabular-nums">{brl(group.total)}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
            {accounts.length === 0 && (
              <p className="px-5 py-6 text-sm text-muted-foreground text-center">
                Cadastre contas na aba Contas & Cartões.
              </p>
            )}
          </div>
          <div className="flex justify-between px-5 py-3 font-bold text-sm border-t bg-income/5">
            <span>Total Ativo</span>
            <span className="tabular-nums text-income">{brl(totalAtivo)}</span>
          </div>
        </div>

        {/* PASSIVO */}
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-expense/5">
            <p className="text-xs font-semibold uppercase tracking-wide text-expense">Passivo</p>
          </div>
          <div className="divide-y divide-border">
            {passivoGroups.map((group) => (
              <div key={group.label}>
                {(group.accounts.length > 0 || group.total > 0) && (
                  <>
                    <p className="px-5 py-2 text-xs text-muted-foreground font-medium bg-muted/20">
                      {group.label}
                    </p>
                    {group.accounts.map((a) => (
                      <div key={a.id} className="flex justify-between px-5 py-2.5 text-sm">
                        <span>{a.name}</span>
                        <span className="tabular-nums font-medium text-expense">
                          ({brl(Number(a.balance))})
                        </span>
                      </div>
                    ))}
                    {group.note && group.total > 0 && (
                      <div className="flex justify-between px-5 py-2.5 text-sm">
                        <span className="text-muted-foreground">Despesas pendentes (todas)</span>
                        <span className="tabular-nums font-medium text-expense">
                          ({brl(group.total)})
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between px-5 py-2 text-xs font-semibold text-muted-foreground border-t">
                      <span>Subtotal {group.label}</span>
                      <span className="tabular-nums">({brl(group.total)})</span>
                    </div>
                  </>
                )}
              </div>
            ))}
            {totalPassivo === 0 && (
              <p className="px-5 py-6 text-sm text-muted-foreground text-center">
                Nenhum passivo registrado.
              </p>
            )}
          </div>
          <div className="flex justify-between px-5 py-3 font-bold text-sm border-t bg-expense/5">
            <span>Total Passivo</span>
            <span className="tabular-nums text-expense">({brl(totalPassivo)})</span>
          </div>
        </div>
      </div>

      {/* Patrimônio Líquido */}
      <div
        className={cn(
          "rounded-2xl border p-5 flex items-center justify-between",
          patrimonioLiquido >= 0 ? "bg-income/10 border-income/30" : "bg-expense/10 border-expense/30",
        )}
      >
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">
            Patrimônio Líquido
          </p>
          <p className="text-xs text-muted-foreground">Ativo − Passivo</p>
        </div>
        <p
          className={cn(
            "text-3xl font-bold tabular-nums tracking-tight",
            patrimonioLiquido >= 0 ? "text-income" : "text-expense",
          )}
        >
          {brl(patrimonioLiquido)}
        </p>
      </div>
    </div>
  );
}

// ─── ReportsTab (container) ───────────────────────────────────────────────────

export function ReportsTab({ transactions, categories, accounts }: Props) {
  const [view, setView] = useState<ReportView>("cashflow");

  const tabs: { id: ReportView; label: string; icon: React.ReactNode }[] = [
    { id: "cashflow", label: "Fluxo de Caixa", icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { id: "dre", label: "DRE", icon: <TrendingDown className="h-3.5 w-3.5" /> },
    { id: "balance", label: "Balanço", icon: <Scale className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
              view === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {view === "cashflow" && <CashFlowView transactions={transactions} />}
      {view === "dre" && <DREView transactions={transactions} categories={categories} />}
      {view === "balance" && <BalanceView accounts={accounts} transactions={transactions} />}
    </div>
  );
}
