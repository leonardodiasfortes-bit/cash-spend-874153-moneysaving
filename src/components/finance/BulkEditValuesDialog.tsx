import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Banknote } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { brl, type Transaction } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  transactions: Transaction[];
  onClose: () => void;
  onDone: () => void;
}

export function BulkEditValuesDialog({ open, transactions, onClose, onDone }: Props) {
  const [rows, setRows] = useState<Record<string, { amount: string; discount: string }>>({});
  const [pct, setPct] = useState("");
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      const next: Record<string, { amount: string; discount: string }> = {};
      for (const t of transactions) {
        next[t.id] = { amount: String(t.amount), discount: String(t.discount ?? 0) };
      }
      setRows(next);
      setPct("");
    }
  }, [open, transactions]);

  function setRow(id: string, field: "amount" | "discount", value: string) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  function applyDiscountPct() {
    const p = parseFloat(pct.replace(",", "."));
    if (!p || p <= 0) return;
    setRows((prev) => {
      const next = { ...prev };
      for (const t of transactions) {
        const amount = parseFloat(next[t.id]?.amount?.replace(",", ".") ?? String(t.amount));
        next[t.id] = { ...next[t.id], discount: ((amount * p) / 100).toFixed(2) };
      }
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const changed = transactions.filter((t) => {
        const r = rows[t.id];
        if (!r) return false;
        return (
          parseFloat(r.amount.replace(",", ".")) !== Number(t.amount) ||
          parseFloat(r.discount.replace(",", ".") || "0") !== Number(t.discount ?? 0)
        );
      });
      if (changed.length === 0) throw new Error("Nenhuma alteração para salvar.");

      for (const t of changed) {
        const r = rows[t.id];
        const amount = parseFloat(r.amount.replace(",", "."));
        const discount = parseFloat(r.discount.replace(",", ".") || "0");
        if (!amount || amount <= 0) throw new Error(`Valor inválido em "${t.description}".`);
        if (discount < 0) throw new Error(`Desconto inválido em "${t.description}".`);
        if (discount > amount) throw new Error(`Desconto maior que o valor em "${t.description}".`);
      }

      await Promise.all(
        changed.map(async (t) => {
          const r = rows[t.id];
          const { error } = await supabase
            .from("transactions")
            .update({
              amount: parseFloat(r.amount.replace(",", ".")),
              discount: parseFloat(r.discount.replace(",", ".") || "0"),
            })
            .eq("id", t.id);
          if (error) throw error;
        }),
      );
      return changed.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(`${count} transação(ões) atualizada(s).`);
      onClose();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-4 w-4" /> Editar valores em lote
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-2 rounded-xl border bg-muted/30 p-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Aplicar desconto (%) a todos</Label>
            <Input
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="Ex: 10"
              inputMode="decimal"
              className="h-8 text-sm"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={applyDiscountPct}>
            Aplicar
          </Button>
        </div>

        <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
          {transactions.map((t) => {
            const r = rows[t.id];
            if (!r) return null;
            const amount = parseFloat(r.amount.replace(",", ".")) || 0;
            const discount = parseFloat(r.discount.replace(",", ".")) || 0;
            return (
              <div key={t.id} className="rounded-xl border p-2.5 space-y-2">
                <p className="text-xs font-medium truncate">{t.description}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                    <Input
                      value={r.amount}
                      onChange={(e) => setRow(t.id, "amount", e.target.value)}
                      inputMode="decimal"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Desconto (R$)</Label>
                    <Input
                      value={r.discount}
                      onChange={(e) => setRow(t.id, "discount", e.target.value)}
                      inputMode="decimal"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                {discount > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Valor líquido: {brl(amount - discount)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
