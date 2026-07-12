import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Plus, RefreshCw, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { offsetDate, type Category, type RecurrenceType } from "@/lib/finance";
import { savePersons, savePerson, SHARED_PERSON } from "@/lib/family";
import { fetchMembers, type Member } from "@/lib/members";
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

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  none: "Não repete",
  monthly: "Mensal",
  yearly: "Anual",
  installment: "Parcelado",
};

export function TransactionForm({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [transactionDate, setTransactionDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<"paid" | "pending">("pending");

  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("none");
  const [installmentTotal, setInstallmentTotal] = useState(2);
  const [monthsAhead, setMonthsAhead] = useState(12);
  const [yearsAhead, setYearsAhead] = useState(2);

  const [selectedPerson, setSelectedPerson] = useState("");
  const [newMember, setNewMember] = useState("");

  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: memberRows = [] } = useQuery<Member[]>({
    queryKey: ["members"],
    queryFn: fetchMembers,
    retry: false,
  });
  const members = memberRows.map((m) => m.name);

  const addMemberMutation = useMutation({
    mutationFn: async (nm: string) => {
      const n = nm.trim();
      if (!n) throw new Error("Informe um nome.");
      const { error } = await supabase.from("members").insert({ user_id: userId, name: n });
      if (error) {
        if ((error.message ?? "").includes("duplicate")) throw new Error("Essa pessoa já existe.");
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      setNewMember("");
    },
    onError: (e: Error) => toast.error(e.message),
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
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);

      const base = { ...parsed.data, user_id: userId };

      if (recurrenceType === "none") {
        const { data, error } = await supabase
          .from("transactions")
          .insert(base)
          .select("id");
        if (error) throw error;
        if (data?.[0]?.id && selectedPerson) savePerson(data[0].id, selectedPerson);
        return;
      }

      const count =
        recurrenceType === "installment"
          ? installmentTotal
          : recurrenceType === "monthly"
          ? monthsAhead
          : yearsAhead;

      const rows = Array.from({ length: count }, (_, i) => ({
        ...base,
        description:
          recurrenceType === "installment"
            ? `${base.description} ${i + 1}/${count}`
            : base.description,
        transaction_date: offsetDate(base.transaction_date, recurrenceType, i),
        due_date: base.due_date ? offsetDate(base.due_date, recurrenceType, i) : null,
        status: base.status ? (i === 0 ? base.status : "pending") : null,
      }));

      const { data, error } = await supabase
        .from("transactions")
        .insert(rows)
        .select("id");
      if (error) throw error;
      if (data && selectedPerson) savePersons(data.map((r) => r.id), selectedPerson);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      const label =
        recurrenceType === "none"
          ? "Transação adicionada!"
          : recurrenceType === "installment"
          ? `${installmentTotal} parcelas criadas!`
          : recurrenceType === "monthly"
          ? `${monthsAhead} lançamentos mensais criados!`
          : `${yearsAhead} lançamentos anuais criados!`;
      toast.success(label);
      setOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function resetForm() {
    setAmount("");
    setDescription("");
    setCategoryId("");
    setDueDate("");
    setRecurrenceType("none");
    setInstallmentTotal(2);
    setMonthsAhead(12);
    setYearsAhead(2);
    setSelectedPerson("");
  }

  const recurrenceCount =
    recurrenceType === "installment"
      ? installmentTotal
      : recurrenceType === "monthly"
      ? monthsAhead
      : recurrenceType === "yearly"
      ? yearsAhead
      : 0;

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

          {/* Família */}
          <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs font-medium">Quem?</Label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedPerson(selectedPerson === SHARED_PERSON ? "" : SHARED_PERSON)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  selectedPerson === SHARED_PERSON
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                Compartilhado
              </button>
              {members.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedPerson(selectedPerson === m ? "" : m)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    selectedPerson === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <Input
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMemberMutation.mutate(newMember))}
                placeholder="+ Adicionar pessoa"
                className="h-7 text-xs"
              />
              <button
                type="button"
                onClick={() => addMemberMutation.mutate(newMember)}
                disabled={addMemberMutation.isPending || !newMember.trim()}
                className="text-xs text-primary hover:underline px-1 shrink-0 disabled:opacity-50"
              >
                OK
              </button>
            </div>
          </div>

          {/* Recorrência */}
          <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs font-medium">Recorrência</Label>
            </div>

            <Select
              value={recurrenceType}
              onValueChange={(v) => setRecurrenceType(v as RecurrenceType)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RECURRENCE_LABELS) as RecurrenceType[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {RECURRENCE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {recurrenceType === "installment" && (
              <div className="space-y-1">
                <Label className="text-xs">Total de parcelas</Label>
                <Input
                  type="number"
                  min={2}
                  max={120}
                  value={installmentTotal}
                  onChange={(e) => setInstallmentTotal(Number(e.target.value))}
                  className="h-8 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Criará {installmentTotal} parcelas: "{description || "Nome"} 1/{installmentTotal}", "2/{installmentTotal}"…
                </p>
              </div>
            )}

            {recurrenceType === "monthly" && (
              <div className="space-y-1">
                <Label className="text-xs">Repetir por quantos meses</Label>
                <Input
                  type="number"
                  min={2}
                  max={120}
                  value={monthsAhead}
                  onChange={(e) => setMonthsAhead(Number(e.target.value))}
                  className="h-8 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  {monthsAhead} lançamentos mensais serão criados automaticamente.
                </p>
              </div>
            )}

            {recurrenceType === "yearly" && (
              <div className="space-y-1">
                <Label className="text-xs">Repetir por quantos anos</Label>
                <Input
                  type="number"
                  min={2}
                  max={10}
                  value={yearsAhead}
                  onChange={(e) => setYearsAhead(Number(e.target.value))}
                  className="h-8 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  {yearsAhead} lançamentos anuais serão criados automaticamente.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : recurrenceType !== "none" ? (
                `Criar ${recurrenceCount} lançamentos`
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
