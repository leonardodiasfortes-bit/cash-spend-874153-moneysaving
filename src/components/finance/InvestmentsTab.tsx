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
import { TrendingUp, Plus, ArrowDownToLine, Loader2, PiggyBank, ArrowRight } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { brl, monthlySurplus, type Account, type Category, type Transaction } from "@/lib/finance";
import { getAllocation } from "@/lib/allocation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  accounts: Account[];
  transactions: Transaction[];
  onAddAccount: () => void;
  onGoToAllocate: () => void;
  userId: string;
}

function monthlyReturn(acc: Account): number {
  if (!acc.credit_limit || acc.credit_limit <= 0) return 0;
  return Number(acc.balance) * (acc.credit_limit / 100);
}

export function InvestmentsTab({ accounts, transactions, onAddAccount, onGoToAllocate, userId }: Props) {
  const investments = accounts.filter((a) => a.type === "investment");
  const qc = useQueryClient();

  const totalInvested = investments.reduce((s, a) => s + Number(a.balance), 0);
  const totalMonthly = investments.reduce((s, a) => s + monthlyReturn(a), 0);
  const totalAnnual = totalInvested > 0 ? totalInvested * (Math.pow(1 + (totalMonthly / totalInvested), 12) - 1) : 0;
  const blendedRate = totalInvested > 0 ? (totalMonthly / totalInvested) * 100 : 0;

  // ── Conta transitória (previsão) ────────────────────────────────────────────
  // Soma o saldo positivo de cada mês (até o mês/ano de corte) ainda não
  // "direcionado" (aportado de verdade via MonthAllocationCard). É só uma
  // projeção — não altera nenhum saldo real até o usuário direcionar.
  const [transitoryCutoff, setTransitoryCutoff] = useState(() => format(new Date(), "yyyy-MM"));

  const pendingSurplusByMonth = useMemo(() => {
    const surplusByMonth = monthlySurplus(transactions);
    const pending = new Map<string, number>();
    for (const [month, surplus] of surplusByMonth) {
      if (surplus <= 0) continue;
      if (getAllocation(month).applied) continue;
      pending.set(month, surplus);
    }
    return pending;
    // `accounts` triggers a recompute whenever a real aporte/desfazer runs
    // (MonthAllocationCard), since that's the only thing that flips `.applied`
    // in localStorage — otherwise this memo would go stale after a direcionar.
  }, [transactions, accounts]);

  // Whether the feature has anything to show at all, independent of the cutoff
  // (so the card + selector never disappear just because the chosen cutoff
  // happens to exclude every pending month).
  const hasPendingSurplus = pendingSurplusByMonth.size > 0;

  const transitory = useMemo(() => {
    let sum = 0;
    for (const [month, surplus] of pendingSurplusByMonth) {
      if (month > transitoryCutoff) continue; // ignora lançamentos futuros além do corte
      sum += surplus;
    }
    return sum;
  }, [pendingSurplusByMonth, transitoryCutoff]);

  const transitoryMonthlyYield = transitory * (blendedRate / 100);

  const [withdrawal, setWithdrawal] = useState("");
  const [months, setMonths] = useState(60);

  // ── Retirada de rendimento ────────────────────────────────────────────────
  const [retiradaOpen, setRetiradaOpen] = useState(false);
  const [retAccId, setRetAccId] = useState("");
  const [retAmount, setRetAmount] = useState("");
  const [retDate, setRetDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [retDesc, setRetDesc] = useState("");

  // ── Rendimentos do mês ────────────────────────────────────────────────────
  const [rendimOpen, setRendimOpen] = useState(false);
  const [rendimMonth, setRendimMonth] = useState(format(new Date(), "yyyy-MM"));
  const [rendimAmounts, setRendimAmounts] = useState<Record<string, string>>({});

  function openRendimentos() {
    const defaults: Record<string, string> = {};
    for (const acc of investments) defaults[acc.id] = monthlyReturn(acc).toFixed(2);
    setRendimAmounts(defaults);
    setRendimMonth(format(new Date(), "yyyy-MM"));
    setRendimOpen(true);
  }

  const rendimMutation = useMutation({
    mutationFn: async () => {
      const [year, month] = rendimMonth.split("-").map(Number);
      const date = format(new Date(year, month, 0), "yyyy-MM-dd"); // last day of month
      const entries = investments
        .map((acc) => ({ acc, amount: parseFloat(rendimAmounts[acc.id]?.replace(",", ".") ?? "0") }))
        .filter((e) => e.amount > 0);
      if (entries.length === 0) throw new Error("Informe ao menos um valor.");
      const { error } = await supabase.from("transactions").insert(
        entries.map(({ acc, amount }) => ({
          type: "income" as const,
          amount,
          description: `Rendimento ${rendimMonth} — ${acc.name}`,
          category_id: investCatId,
          transaction_date: date,
          due_date: date,
          status: "paid" as const,
          user_id: userId,
        })),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Rendimentos lançados com sucesso!");
      setRendimOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  const investCatId = categories.find((c) => c.name === "Investimentos" && c.type === "income")?.id ?? null;

  const retiradaMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(retAmount.replace(",", "."));
      if (!amount || amount <= 0) throw new Error("Valor inválido.");
      const acc = investments.find((a) => a.id === retAccId);
      const desc = retDesc.trim() || `Retirada de rendimento${acc ? ` — ${acc.name}` : ""}`;
      const { error } = await supabase.from("transactions").insert({
        type: "income",
        amount,
        description: desc,
        category_id: investCatId,
        transaction_date: retDate,
        status: "paid",
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Retirada registrada como receita!");
      setRetiradaOpen(false);
      setRetAmount("");
      setRetDesc("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openRetirada(acc?: Account) {
    const a = acc ?? investments[0];
    setRetAccId(a?.id ?? "");
    setRetAmount(a ? monthlyReturn(a).toFixed(2) : "");
    setRetDate(format(new Date(), "yyyy-MM-dd"));
    setRetDesc("");
    setRetiradaOpen(true);
  }

  const projection = useMemo(() => {
    const w = parseFloat(withdrawal) || 0;
    const rate = blendedRate / 100;
    let balance = totalInvested;
    let balancePrevisto = totalInvested + transitory;
    const rows = [];

    for (let i = 0; i <= months; i++) {
      const income = balance * rate;
      const incomePrevisto = balancePrevisto * rate;
      rows.push({
        mes: i,
        saldo: Math.max(0, balance),
        rendimento: Math.max(0, income),
        saldoPrevisto: Math.max(0, balancePrevisto),
        rendimentoPrevisto: Math.max(0, incomePrevisto),
      });
      balance = Math.max(0, balance + income - w);
      balancePrevisto = Math.max(0, balancePrevisto + incomePrevisto - w);
    }
    return rows;
  }, [totalInvested, transitory, blendedRate, withdrawal, months]);

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
      {/* Rendimentos do mês dialog */}
      <Dialog open={rendimOpen} onOpenChange={(v) => !v && setRendimOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Lançar rendimentos do mês
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Registra os rendimentos reais como receita. O valor estimado já é preenchido; ajuste se necessário.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Mês de referência</Label>
              <Input type="month" value={rendimMonth} onChange={(e) => setRendimMonth(e.target.value)} />
            </div>
            {investments.map((acc) => (
              <div key={acc.id} className="space-y-1.5">
                <Label className="text-xs">
                  {acc.name}{" "}
                  <span className="text-muted-foreground font-normal">(est. {brl(monthlyReturn(acc))})</span>
                </Label>
                <Input
                  value={rendimAmounts[acc.id] ?? ""}
                  onChange={(e) =>
                    setRendimAmounts((prev) => ({ ...prev, [acc.id]: e.target.value }))
                  }
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRendimOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={rendimMutation.isPending} onClick={() => rendimMutation.mutate()}>
              {rendimMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lançar receitas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retirada dialog */}
      <Dialog open={retiradaOpen} onOpenChange={(v) => !v && setRetiradaOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4" /> Registrar retirada de rendimento
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Cria uma transação de receita com o valor retirado, compondo a renda do mês.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Investimento</Label>
              <Select value={retAccId} onValueChange={(v) => {
                setRetAccId(v);
                const a = investments.find((x) => x.id === v);
                if (a) setRetAmount(monthlyReturn(a).toFixed(2));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {investments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — renda est. {brl(monthlyReturn(a))}/mês
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor (R$)</Label>
                <Input value={retAmount} onChange={(e) => setRetAmount(e.target.value)}
                  placeholder="0,00" inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={retDate} onChange={(e) => setRetDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição (opcional)</Label>
              <Input value={retDesc} onChange={(e) => setRetDesc(e.target.value)}
                placeholder="Retirada de rendimento — automático" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRetiradaOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={retiradaMutation.isPending} onClick={() => retiradaMutation.mutate()}>
              {retiradaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar receita"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Conta transitória (previsão) */}
      {hasPendingSurplus && (
        <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0">
                <PiggyBank className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">Conta transitória</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                    Previsão
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Soma o saldo positivo dos meses ainda não direcionados — como se já estivesse reinvestido.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={onGoToAllocate}>
              <ArrowRight className="h-3.5 w-3.5" /> Direcionar agora
            </Button>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <Label className="text-xs text-muted-foreground shrink-0">Considerando até</Label>
            <Input
              type="month"
              value={transitoryCutoff}
              onChange={(e) => setTransitoryCutoff(e.target.value)}
              className="h-8 text-sm w-40"
            />
          </div>

          {transitory > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo (previsão)</p>
                <p className="text-lg font-semibold tabular-nums text-primary">{brl(transitory)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Taxa usada</p>
                <p className="text-lg font-semibold tabular-nums">{blendedRate.toFixed(2)}% a.m.</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rendimento est./mês</p>
                <p className="text-lg font-semibold tabular-nums text-income">{brl(transitoryMonthlyYield)}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-3">
              Nenhum saldo pendente até este mês — tente avançar a data acima.
            </p>
          )}
        </div>
      )}

      {/* Per-account list */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Carteira de investimentos
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={openRendimentos}>
              <TrendingUp className="h-3.5 w-3.5" /> Lançar rendimentos
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => openRetirada()}>
              <ArrowDownToLine className="h-3.5 w-3.5" /> Registrar retirada
            </Button>
          </div>
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
                  name === "saldo"
                    ? "Saldo"
                    : name === "rendimento"
                    ? "Rendimento"
                    : "Rendimento previsto",
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
              {transitory > 0 && (
                <Line
                  type="monotone"
                  dataKey="rendimentoPrevisto"
                  name="rendimentoPrevisto"
                  stroke="var(--primary)"
                  strokeOpacity={0.6}
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="2 3"
                />
              )}
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
          {transitory > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 border-t border-dotted border-primary/60" /> Rendimento previsto
              (com transitória)
            </span>
          )}
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
