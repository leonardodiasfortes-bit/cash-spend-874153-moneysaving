import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp, Plus } from "lucide-react";

import { brl, type Account } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  accounts: Account[];
  onAddAccount: () => void;
}

function monthlyReturn(acc: Account): number {
  if (!acc.credit_limit || acc.credit_limit <= 0) return 0;
  return Number(acc.balance) * (acc.credit_limit / 100);
}

export function InvestmentsTab({ accounts, onAddAccount }: Props) {
  const investments = accounts.filter((a) => a.type === "investment");

  const totalInvested = investments.reduce((s, a) => s + Number(a.balance), 0);
  const totalMonthly = investments.reduce((s, a) => s + monthlyReturn(a), 0);
  const totalAnnual = totalMonthly * 12;
  const blendedRate = totalInvested > 0 ? (totalMonthly / totalInvested) * 100 : 0;

  const [withdrawal, setWithdrawal] = useState("");
  const [months, setMonths] = useState(60);

  const projection = useMemo(() => {
    const w = parseFloat(withdrawal) || 0;
    let balance = totalInvested;
    const rate = blendedRate / 100;
    const rows = [];

    for (let i = 0; i <= months; i++) {
      const income = balance * rate;
      rows.push({ mes: i, saldo: Math.max(0, balance), rendimento: income });
      balance = balance + income - w;
      if (balance <= 0) {
        for (let j = i + 1; j <= months; j++) rows.push({ mes: j, saldo: 0, rendimento: 0 });
        break;
      }
    }
    return rows;
  }, [totalInvested, blendedRate, withdrawal, months]);

  const depleted = projection[projection.length - 1].saldo === 0;
  const depletionMonth = projection.findIndex((r) => r.saldo === 0);
  const maxWithdrawal = totalMonthly;
  const w = parseFloat(withdrawal) || 0;

  if (investments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card/50 py-16 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3">
          <TrendingUp className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Nenhum investimento cadastrado</p>
        <p className="text-xs text-muted-foreground mt-1">
          Crie uma conta do tipo "Investimento" em Contas & Cartões.
        </p>
        <Button size="sm" className="mt-4 gap-2" onClick={onAddAccount}>
          <Plus className="h-4 w-4" /> Adicionar investimento
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total investido" value={brl(totalInvested)} tone="neutral" />
        <SummaryCard
          label="Renda mensal est."
          value={brl(totalMonthly)}
          tone="income"
          sub={`${blendedRate.toFixed(2)}% a.m. ponderado`}
        />
        <SummaryCard label="Renda anual est." value={brl(totalAnnual)} tone="income" />
        <SummaryCard
          label="Retirada máx. sustentável"
          value={brl(maxWithdrawal)}
          tone="income"
          sub="preserva o principal"
        />
      </div>

      {/* Per-account list */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b bg-muted/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Carteira de investimentos
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Conta</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Saldo</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Taxa a.m.</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Renda/mês</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Renda/ano</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {investments.map((a) => {
              const mr = monthlyReturn(a);
              return (
                <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium">{a.name}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{brl(Number(a.balance))}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-income">
                    {a.credit_limit ? `${a.credit_limit}%` : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-income">
                    {mr > 0 ? brl(mr) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-income">
                    {mr > 0 ? brl(mr * 12) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/30 font-semibold">
              <td className="px-5 py-2.5 text-xs uppercase">Total</td>
              <td className="px-5 py-2.5 text-right tabular-nums">{brl(totalInvested)}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-income">
                {blendedRate.toFixed(2)}%
              </td>
              <td className="px-5 py-2.5 text-right tabular-nums text-income">{brl(totalMonthly)}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-income">{brl(totalAnnual)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Projection simulator */}
      <div className="rounded-2xl border bg-card p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold">Simulador de retirada</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quanto tempo o patrimônio dura com uma retirada mensal fixa?
          </p>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Retirada mensal (R$)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={withdrawal}
              onChange={(e) => setWithdrawal(e.target.value)}
              placeholder={brl(maxWithdrawal)}
              className="w-44 h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Horizonte (meses)</Label>
            <Input
              type="number"
              min={12}
              max={480}
              step={12}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-28 h-8 text-sm"
            />
          </div>

          <div className="flex gap-4 text-xs ml-auto">
            {w > 0 && w <= maxWithdrawal && (
              <span className="text-income font-medium">
                Principal preservado — renda perpétua de {brl(w)}/mês
              </span>
            )}
            {w > maxWithdrawal && !depleted && (
              <span className="text-warning font-medium">
                Patrimônio crescendo abaixo do ideal mas sustentável no período
              </span>
            )}
            {depleted && depletionMonth > 0 && (
              <span className="text-expense font-medium">
                Patrimônio se esgota no mês {depletionMonth} ({Math.floor(depletionMonth / 12)} anos e{" "}
                {depletionMonth % 12} meses)
              </span>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projection} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="mes"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                tickFormatter={(v) => (v % 12 === 0 ? `${v / 12}a` : "")}
              />
              <YAxis
                tickFormatter={(v) =>
                  v >= 1_000_000
                    ? `${(v / 1_000_000).toFixed(1)}M`
                    : v >= 1000
                    ? `${(v / 1000).toFixed(0)}k`
                    : String(v)
                }
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
                formatter={(v: number, name: string) => [
                  brl(v),
                  name === "saldo" ? "Saldo" : "Rendimento",
                ]}
                labelFormatter={(l) => `Mês ${l} (${Math.floor(Number(l) / 12)}a ${Number(l) % 12}m)`}
              />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Line
                type="monotone"
                dataKey="saldo"
                name="saldo"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="rendimento"
                name="rendimento"
                stroke="var(--income)"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 bg-primary" /> Saldo patrimonial
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t border-dashed border-income" /> Rendimento mensal
          </span>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "neutral" | "income";
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums tracking-tight", tone === "income" && "text-income")}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
