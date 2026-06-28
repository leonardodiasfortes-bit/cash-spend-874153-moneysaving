import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import {
  Building2,
  CreditCard,
  Wallet,
  PiggyBank,
  TrendingUp,
  Plus,
  Trash2,
  Loader2,
  Pencil,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { brl, ACCOUNT_LABELS, type Account, type AccountType } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ACCOUNT_ICONS: Record<AccountType, React.ReactNode> = {
  checking: <Building2 className="h-5 w-5" />,
  savings: <PiggyBank className="h-5 w-5" />,
  credit_card: <CreditCard className="h-5 w-5" />,
  wallet: <Wallet className="h-5 w-5" />,
  investment: <TrendingUp className="h-5 w-5" />,
};

const ACCOUNT_COLORS: Record<AccountType, string> = {
  checking: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  savings: "bg-green-500/15 text-green-600 dark:text-green-400",
  credit_card: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  wallet: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  investment: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome da conta").max(60),
  type: z.enum(["checking", "savings", "credit_card", "wallet", "investment"]),
  balance: z.coerce.number().finite("Informe um saldo válido"),
  credit_limit: z.union([z.null(), z.coerce.number().nonnegative()]),
});

type FormState = {
  name: string;
  type: AccountType;
  balance: string;
  credit_limit: string;
};

function AccountForm({
  userId,
  initial,
  onClose,
}: {
  userId: string;
  initial?: Account;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>({
    name: initial?.name ?? "",
    type: initial?.type ?? "checking",
    balance: initial != null ? String(initial.balance) : "",
    credit_limit: initial?.credit_limit != null ? String(initial.credit_limit) : "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({
        name: form.name,
        type: form.type,
        balance: form.balance || "0",
        credit_limit:
        (form.type === "credit_card" || form.type === "investment") && form.credit_limit
          ? form.credit_limit
          : null,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);

      if (initial) {
        const { error } = await supabase
          .from("accounts")
          .update(parsed.data)
          .eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("accounts")
          .insert({ ...parsed.data, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(initial ? "Conta atualizada!" : "Conta adicionada!");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof FormState) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label>Nome</Label>
        <Input
          value={form.name}
          onChange={(e) => set("name")(e.target.value)}
          placeholder="Ex: Nubank, Bradesco..."
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Tipo</Label>
        <Select value={form.type} onValueChange={(v) => set("type")(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ACCOUNT_LABELS) as AccountType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {ACCOUNT_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{form.type === "credit_card" ? "Fatura atual (R$)" : "Saldo atual (R$)"}</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={form.balance}
            onChange={(e) => set("balance")(e.target.value)}
            placeholder="0,00"
          />
        </div>
        {form.type === "credit_card" && (
          <div className="space-y-2">
            <Label>Limite total (R$)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={form.credit_limit}
              onChange={(e) => set("credit_limit")(e.target.value)}
              placeholder="0,00"
            />
          </div>
        )}
        {form.type === "investment" && (
          <div className="space-y-2">
            <Label>Taxa de rendimento (% a.m.)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              value={form.credit_limit}
              onChange={(e) => set("credit_limit")(e.target.value)}
              placeholder="Ex: 0.8"
            />
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AccountCard({ account, userId }: { account: Account; userId: string }) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounts").delete().eq("id", account.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Conta removida.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isCard = account.type === "credit_card";
  const available =
    isCard && account.credit_limit != null ? account.credit_limit - account.balance : null;

  return (
    <div className="rounded-2xl border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl grid place-items-center ${ACCOUNT_COLORS[account.type]}`}>
            {ACCOUNT_ICONS[account.type]}
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{account.name}</p>
            <p className="text-xs text-muted-foreground">{ACCOUNT_LABELS[account.type]}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Editar conta</DialogTitle>
                <DialogDescription>Atualize as informações da conta.</DialogDescription>
              </DialogHeader>
              <AccountForm userId={userId} initial={account} onClose={() => setEditOpen(false)} />
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover conta?</AlertDialogTitle>
                <AlertDialogDescription>
                  A conta <strong>{account.name}</strong> será removida permanentemente. As
                  transações associadas não serão excluídas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Remover"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {isCard && account.credit_limit != null ? (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Fatura</span>
            <span>Limite: {brl(account.credit_limit)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-purple-500 transition-all"
              style={{
                width: `${Math.min(100, (account.balance / account.credit_limit) * 100)}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-sm font-medium">
            <span className="text-destructive">{brl(account.balance)}</span>
            <span className="text-muted-foreground text-xs self-end">
              Disponível: {brl(available ?? 0)}
            </span>
          </div>
        </div>
      ) : account.type === "investment" ? (
        <div className="space-y-1">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {brl(Number(account.balance))}
          </p>
          {account.credit_limit != null && account.credit_limit > 0 && (
            <div className="flex items-center justify-between text-xs mt-2">
              <span className="text-muted-foreground">{account.credit_limit}% a.m.</span>
              <span className="text-income font-semibold">
                +{brl(Number(account.balance) * (account.credit_limit / 100))}/mês
              </span>
            </div>
          )}
        </div>
      ) : (
        <p
          className={`text-2xl font-semibold tracking-tight tabular-nums ${
            account.balance < 0 ? "text-destructive" : ""
          }`}
        >
          {brl(account.balance)}
        </p>
      )}
    </div>
  );
}

export function AccountsTab({ userId }: { userId: string }) {
  const [addOpen, setAddOpen] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Account[];
    },
  });

  const totalBalance = accounts
    .filter((a) => a.type !== "credit_card")
    .reduce((sum, a) => sum + Number(a.balance), 0);

  const totalDebt = accounts
    .filter((a) => a.type === "credit_card")
    .reduce((sum, a) => sum + Number(a.balance), 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs text-muted-foreground mb-1">Saldo total (contas)</p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {brl(totalBalance)}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs text-muted-foreground mb-1">Fatura total (cartões)</p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums text-destructive">
              {brl(totalDebt)}
            </p>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Contas & Cartões</h2>
          <p className="text-xs text-muted-foreground">{accounts.length} conta(s) cadastrada(s)</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Nova conta
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nova conta</DialogTitle>
              <DialogDescription>Adicione uma conta bancária, cartão ou carteira.</DialogDescription>
            </DialogHeader>
            <AccountForm userId={userId} onClose={() => setAddOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 py-16 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3">
            <CreditCard className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Nenhuma conta cadastrada</p>
          <p className="text-xs text-muted-foreground mt-1">
            Adicione suas contas bancárias e cartões de crédito.
          </p>
          <Button size="sm" className="mt-4 gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Adicionar conta
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <AccountCard key={acc.id} account={acc} userId={userId} />
          ))}
        </div>
      )}
    </div>
  );
}
