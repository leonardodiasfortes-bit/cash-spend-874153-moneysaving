import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Lock } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { type Category } from "@/lib/finance";
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
import { Badge } from "@/components/ui/badge";

const COMMON_ICONS = [
  "💰","💼","📈","✨","🏦","🎁","🍔","🛒","🚗","🏠","🎮","⚕️","📚","🛍️",
  "📄","📦","✈️","🎵","💡","🔧","🐾","👕","🍕","☕","🏋️","💊","🎓","🏖️",
];

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(40),
  type: z.enum(["income", "expense"]),
  icon: z.string().max(4).nullable(),
});

interface Props {
  userId: string;
}

function CategoryForm({
  userId,
  defaultType,
  onClose,
}: {
  userId: string;
  defaultType: "income" | "expense";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">(defaultType);
  const [icon, setIcon] = useState("📦");

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({ name, type, icon });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const { error } = await supabase
        .from("categories")
        .insert({ ...parsed.data, user_id: userId, is_default: false });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Categoria criada!");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label>Tipo</Label>
        <div className="flex rounded-lg border overflow-hidden text-sm">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 py-1.5 transition-colors ${
                type === t ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground"
              }`}
            >
              {t === "income" ? "Receita" : "Despesa"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Academia"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Ícone</Label>
          <div className="h-10 w-12 border rounded-md flex items-center justify-center text-xl cursor-pointer select-none">
            {icon}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Escolha um ícone</Label>
        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
          {COMMON_ICONS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setIcon(em)}
              className={`h-8 w-8 rounded-lg text-base flex items-center justify-center transition-colors ${
                icon === em ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-muted"
              }`}
            >
              {em}
            </button>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CategoryGroup({
  title,
  categories,
  userId,
  addType,
}: {
  title: string;
  categories: Category[];
  userId: string;
  addType: "income" | "expense";
}) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Categoria removida.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova
        </Button>
      </div>

      <div className="divide-y divide-border">
        {categories.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">Nenhuma categoria.</p>
        ) : (
          categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 px-5 py-3 group">
              <span className="text-lg w-7 text-center">{cat.icon ?? "📦"}</span>
              <span className="flex-1 text-sm font-medium">{cat.name}</span>
              {cat.is_default ? (
                <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                  <Lock className="h-2.5 w-2.5" /> Padrão
                </Badge>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-expense transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover categoria?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Transações já lançadas mantêm o vínculo mas a categoria não aparecerá mais.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => del.mutate(cat.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ))
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova categoria de {addType === "income" ? "receita" : "despesa"}</DialogTitle>
          </DialogHeader>
          <CategoryForm userId={userId} defaultType={addType} onClose={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CategoriesTab({ userId }: Props) {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  const income = categories.filter((c) => c.type === "income");
  const expense = categories.filter((c) => c.type === "expense");

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Categorias padrão não podem ser removidas. Crie categorias personalizadas para organizar melhor seus lançamentos.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategoryGroup title="Receitas" categories={income} userId={userId} addType="income" />
        <CategoryGroup title="Despesas" categories={expense} userId={userId} addType="expense" />
      </div>
    </div>
  );
}
