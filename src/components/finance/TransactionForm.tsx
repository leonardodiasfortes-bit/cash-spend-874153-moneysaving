import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Category } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const schema = z
  .object({
    type: z.enum(["income", "expense"]),
    amount: z.coerce.number().positive("Informe um valor maior que zero"),
    description: z.string().trim().min(1, "Descreva a transação").max(200),
    category_id: z.string().uuid().nullable(),
    transaction_date: z.string().min(1),
    due_date: z.string().optional().nullable(),
    status: z.enum(["paid", "pending"]).optional().nullable(),
  })
  .refine((d) => d.type === "income" || d.status, {
    message: "Selecione o status da despesa",
    path: ["status"],
  });

export function TransactionForm({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [transactionDate, setTransactionDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<"paid" | "pending">("pending");

  const qc = useQueryClient();

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

  const filtered = categories.filter((c) => c.type === type);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({
        type,
        amount,
        description,
        category_id: categoryId || null,
        transaction_date: transactionDate,
        due_date: type === "expense" ? dueDate || null : null,
        status: type === "expense" ? status : null,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0].message);
      }
      const { error } = await supabase.from("transactions").insert({
        ...parsed.data,
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transação adicionada!");
      setOpen(false);
      setAmount("");
      setDescription("");
      setCategoryId("");
      setDueDate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2">
          <Plus className="h-4 w-4" /> Nova transação
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova transação</DialogTitle>
          <DialogDescription>Adicione uma receita ou despesa.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <Tabs value={type} onValueChange={(v) => setType(v as typeof type)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger
                value="income"
                className="data-[state=active]:bg-income/20 data-[state=active]:text-income"
              >
                Receita
              </TabsTrigger>
              <TabsTrigger
                value="expense"
                className="data-[state=active]:bg-expense/20 data-[state=active]:text-expense"
              >
                Despesa
              </TabsTrigger>
            </TabsList>
          </Tabs>

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
                placeholder="0,00"
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
              placeholder="Ex: Mercado do mês"
              required
            />
          </div>

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

          {type === "expense" && (
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
            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
