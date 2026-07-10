import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PiggyBank, Loader2, Check, RotateCcw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { brl, fmtDate, type Account } from "@/lib/finance";
import { getAllocation, saveAllocation, type MonthAllocation } from "@/lib/allocation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  month: string; // "yyyy-MM"
  monthLabel: string;
  surplus: number; // receitas − despesas do mês
  investments: Account[];
}

const rate = (acc: Account) => Number(acc.credit_limit ?? 0) / 100;

export function MonthAllocationCard({ month, monthLabel, surplus, investments }: Props) {
  const qc = useQueryClient();
  const [alloc, setAlloc] = useState<MonthAllocation>(() => getAllocation(month));
  const [amount, setAmount] = useState("");

  // Reload the stored intention whenever the selected month changes.
  useEffect(() => {
    setAlloc(getAllocation(month));
  }, [month]);

  // Keep the aporte amount pre-filled with the month's surplus until applied.
  useEffect(() => {
    if (!alloc.applied) setAmount(surplus > 0 ? surplus.toFixed(2) : "");
  }, [month, surplus, alloc.applied]);

  function update(next: Partial<MonthAllocation>) {
    setAlloc((prev) => {
      const merged = { ...prev, ...next };
      saveAllocation(month, merged);
      return merged;
    });
  }

  const accountId = alloc.accountId ?? investments[0]?.id ?? null;
  const selectedAcc = investments.find((a) => a.id === accountId) ?? null;
  const aporteVal = parseFloat((amount || "0").replace(",", ".")) || 0;
  const yieldNow = selectedAcc ? Number(selectedAcc.balance) * rate(selectedAcc) : 0;
  const yieldAfter = selectedAcc ? (Number(selectedAcc.balance) + aporteVal) * rate(selectedAcc) : 0;

  const aporte = useMutation({
    mutationFn: async () => {
      if (!selectedAcc) throw new Error("Escolha a conta de rendimento.");
      if (aporteVal <= 0) throw new Error("Informe um valor maior que zero.");
      const { error } = await supabase
        .from("accounts")
        .update({ balance: Number(selectedAcc.balance) + aporteVal })
        .eq("id", selectedAcc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      update({
        directed: true,
        accountId: selectedAcc!.id,
        applied: {
          amount: aporteVal,
          accountId: selectedAcc!.id,
          date: new Date().toISOString().slice(0, 10),
        },
      });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(`${brl(aporteVal)} direcionado para ${selectedAcc!.name}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const undo = useMutation({
    mutationFn: async () => {
      const ap = alloc.applied;
      if (!ap) return;
      const acc = investments.find((a) => a.id === ap.accountId);
      if (acc) {
        const { error } = await supabase
          .from("accounts")
          .update({ balance: Number(acc.balance) - ap.amount })
          .eq("id", acc.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      update({ applied: undefined });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Aporte desfeito.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applied = alloc.applied;
  const appliedAcc = applied ? investments.find((a) => a.id === applied.accountId) : null;

  if (investments.length === 0) return null;

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary grid place-items-center">
          <PiggyBank className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold leading-none">Direcionar saldo do mês</h2>
          <p className="text-xs text-muted-foreground mt-0.5 capitalize">{monthLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo do mês</p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              surplus >= 0 ? "text-income" : "text-expense"
            }`}
          >
            {brl(surplus)}
          </p>
        </div>
      </div>

      {applied ? (
        <div className="flex items-center gap-3 rounded-xl border border-income/30 bg-income/10 px-4 py-3">
          <Check className="h-4 w-4 text-income shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-medium text-income">{brl(applied.amount)}</span> direcionado para{" "}
            <span className="font-medium">{appliedAcc?.name ?? "conta removida"}</span>
            <span className="text-muted-foreground"> · {fmtDate(applied.date)}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={undo.isPending}
            onClick={() => undo.mutate()}
          >
            {undo.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Desfazer
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-2.5">
            <Label htmlFor="direct-toggle" className="text-sm font-normal cursor-pointer">
              Direcionar este saldo para a conta de rendimento?
            </Label>
            <Switch
              id="direct-toggle"
              checked={alloc.directed}
              onCheckedChange={(v) =>
                update({ directed: v, accountId: alloc.accountId ?? investments[0]?.id ?? null })
              }
            />
          </div>

          {alloc.directed && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Conta de rendimento</Label>
                  <Select value={accountId ?? ""} onValueChange={(v) => update({ accountId: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {investments.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor a aportar (R$)</Label>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="h-9"
                  />
                </div>
              </div>

              {selectedAcc && aporteVal > 0 && (
                <p className="text-xs text-muted-foreground">
                  Rendimento mensal de <span className="font-medium">{selectedAcc.name}</span>:{" "}
                  {brl(yieldNow)} → <span className="text-income font-medium">{brl(yieldAfter)}</span> após o aporte.
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={aporte.isPending || aporteVal <= 0 || !selectedAcc}
                  onClick={() => aporte.mutate()}
                >
                  {aporte.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PiggyBank className="h-4 w-4" />
                  )}
                  Aportar {aporteVal > 0 ? brl(aporteVal) : ""}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
