import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { type Category, type Transaction } from "@/lib/finance";
import { getMembers, getPersonMap, savePerson } from "@/lib/family";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const schema = z.object({
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  description: z.string().trim().min(1, "Descreva a transação"),
  category_id: z.string().uuid().nullable(),
  transaction_date: z.string().min(1),
  due_date: z.string().nullable(),
  status: z.enum(["paid", "pending"]).nullable(),
});

interface Props {
  tx: Transaction;
  categories: Category[];
  open: boolean;
  onClose: () => void;
}

export function TransactionEditDialog({ tx, categories, open, onClose }: Props) {
  const [amount, setAmount] = useState(String(tx.amount));
  const [description, setDescription] = useState(tx.description);
  const [categoryId, setCategoryId] = useState(tx.category_id ?? "");
  const [transactionDate, setTransactionDate] = useState(tx.transaction_date);
  const [dueDate, setDueDate] = useState(tx.due_date ?? "");
  const [status, setStatus] = useState<"paid" | "pending">(tx.status ?? "pending");
  const [person, setPerson] = useState(() => getPersonMap()[tx.id] ?? "");

  const members = getMembers();

  useEffect(() => {
    if (open) {
      setAmount(String(tx.amount));
      setDescription(tx.description);
      setCategoryId(tx.category_id ?? "");
      setTransactionDate(tx.transaction_date);
      setDueDate(tx.due_date ?? "");
      setStatus(tx.status ?? "pending");
      setPerson(getPersonMap()[tx.id] ?? "");
    }
  }, [open, tx]);

  const qc = useQueryClient();
  const filtered = categories.filter((c) => c.type === tx.type);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({
        amount,
        description,
        category_id: categoryId || null,
        transaction_date: transactionDate,
        due_date: tx.type === "expense" ? dueDate || null : null,
        status: tx.type === "expense" ? status : null,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);

      const { error } = await supabase
        .from("transactions")
        .update(parsed.data)
        .eq("id", tx.id);
      if (error) throw error;
    },
    onSuccess: () => {
      savePerson(tx.id, person);
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transação atualizada!");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar transação</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Data de lançamento</Label>
              <Input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {members.length > 0 && (
            <div className="space-y-2">
              <Label>Quem?</Label>
              <Select value={person} onValueChange={setPerson}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a pessoa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Ninguém —</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {filtered.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="mr-2">{c.icon}</span>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tx.type === "expense" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Paga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
