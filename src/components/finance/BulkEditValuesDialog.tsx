import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Banknote } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { type Transaction } from "@/lib/finance";
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
  const [rows, setRows] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      const next: Record<string, string> = {};
      for (const t of transactions) next[t.id] = String(t.amount);
      setRows(next);
    }
  }, [open, transactions]);

  function setRow(id: string, value: string) {
    setRows((prev) => ({ ...prev, [id]: value }));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const changed = transactions.filter((t) => {
        const raw = rows[t.id];
        if (raw == null) return false;
        return parseFloat(raw.replace(",", ".")) !== Number(t.amount);
      });
      if (changed.length === 0) throw new Error("Nenhuma alteração para salvar.");

      for (const t of changed) {
        const amount = parseFloat(rows[t.id].replace(",", "."));
        if (!amount || amount <= 0) throw new Error(`Valor inválido em "${t.description}".`);
      }

      await Promise.all(
        changed.map(async (t) => {
          const { error } = await supabase
            .from("transactions")
            .update({ amount: parseFloat(rows[t.id].replace(",", ".")) })
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-4 w-4" /> Editar valores em lote
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {transactions.map((t) => {
            const raw = rows[t.id];
            if (raw == null) return null;
            return (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border p-2.5">
                <p className="text-xs font-medium truncate flex-1">{t.description}</p>
                <div className="space-y-1 shrink-0">
                  <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                  <Input
                    value={raw}
                    onChange={(e) => setRow(t.id, e.target.value)}
                    inputMode="decimal"
                    className="h-8 text-sm w-32"
                  />
                </div>
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
