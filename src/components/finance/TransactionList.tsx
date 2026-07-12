import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, AlertTriangle, Clock, Check, Pencil, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { brl, dueAlert, fmtDate, rowTone, type Category, type Transaction } from "@/lib/finance";
import { getPersonMap, personLabel } from "@/lib/family";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TransactionEditDialog } from "./TransactionEditDialog";

interface Props {
  transactions: Transaction[];
  categories: Category[];
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function TransactionList({ transactions, categories, selectedIds, onToggleSelect }: Props) {
  const [editing, setEditing] = useState<Transaction | null>(null);
  const qc = useQueryClient();
  const cats = new Map(categories.map((c) => [c.id, c]));
  const personMap = getPersonMap();
  const selectionMode = !!onToggleSelect;

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Removido");
    },
  });

  const togglePaid = useMutation({
    mutationFn: async (tx: Transaction) => {
      const { error } = await supabase
        .from("transactions")
        .update({ status: tx.status === "paid" ? "pending" : "paid" })
        .eq("id", tx.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
  });

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Nenhuma transação por aqui. Adicione a primeira!
      </div>
    );
  }

  return (
    <>
    {editing && (
      <TransactionEditDialog
        tx={editing}
        categories={categories}
        open={!!editing}
        onClose={() => setEditing(null)}
      />
    )}
    <ul className="divide-y divide-border">
      {transactions.map((tx) => {
        const cat = tx.category_id ? cats.get(tx.category_id) : null;
        const alert = dueAlert(tx);
        const isIncome = tx.type === "income";
        const person = personMap[tx.id];
        const selected = selectionMode && selectedIds?.has(tx.id);
        const tone = rowTone(tx);
        const highlight = selected
          ? "bg-primary/5"
          : tone === "paid"
          ? "bg-income/10"
          : tone === "danger"
          ? "bg-expense/10"
          : "";

        return (
          <li
            key={tx.id}
            className={cn(
              "flex items-center gap-3 py-3 group transition-colors",
              highlight && "rounded-xl px-2",
              highlight,
            )}
          >
            {selectionMode && (
              <input
                type="checkbox"
                checked={selectedIds?.has(tx.id) ?? false}
                onChange={() => onToggleSelect?.(tx.id)}
                onClick={(e) => e.stopPropagation()}
                className="cursor-pointer accent-primary h-4 w-4 shrink-0"
              />
            )}
            <div
              className={cn(
                "h-10 w-10 rounded-xl grid place-items-center shrink-0",
                isIncome ? "bg-income/15 text-income" : "bg-expense/15 text-expense",
              )}
            >
              {isIncome ? (
                <ArrowUpRight className="h-5 w-5" />
              ) : (
                <ArrowDownRight className="h-5 w-5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm truncate">{tx.description}</p>
                {person && (
                  <Badge variant="outline" className="text-[10px] font-medium gap-1 border-primary/40 text-primary">
                    {personLabel(person)}
                  </Badge>
                )}
                {cat && (
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {cat.icon} {cat.name}
                  </Badge>
                )}
                {alert === "overdue" && (
                  <Badge className="bg-expense text-expense-foreground gap-1 text-[10px]">
                    <AlertTriangle className="h-3 w-3" /> Atrasada
                  </Badge>
                )}
                {alert === "soon" && (
                  <Badge className="bg-warning text-warning-foreground gap-1 text-[10px]">
                    <Clock className="h-3 w-3" /> Vence em breve
                  </Badge>
                )}
                {tx.type === "expense" && tx.status === "paid" && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Check className="h-3 w-3" /> Paga
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fmtDate(tx.transaction_date)}
                {tx.due_date && ` · venc. ${fmtDate(tx.due_date)}`}
              </p>
            </div>

            <div className="text-right">
              <p
                className={cn(
                  "font-semibold tabular-nums text-sm",
                  isIncome ? "text-income" : "text-expense",
                )}
              >
                {isIncome ? "+" : "−"} {brl(Number(tx.amount))}
              </p>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
              {tx.type === "expense" && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  title={tx.status === "paid" ? "Marcar pendente" : "Marcar paga"}
                  onClick={() => togglePaid.mutate(tx)}
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Editar"
                onClick={() => setEditing(tx)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-expense"
                title="Excluir"
                onClick={() => del.mutate(tx.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}
