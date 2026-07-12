import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Trash2,
  Users,
  User,
  Check,
  Loader2,
  Database,
  Copy,
  ShoppingCart,
  X,
  Download,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/finance";
import { getMembers } from "@/lib/family";
import { fetchMembers, type Member } from "@/lib/members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
}

type Kind = "owned" | "planned";

interface InvItem {
  id: string;
  kind: Kind;
  name: string;
  category: string | null;
  quantity: number;
  estimated_value: number;
  shared: boolean;
  purchased: boolean;
  person: string | null;
}

// "Uso" sentinels — the rest of the values are member names (Léo, Paola…).
const SHARED = "__shared__";
const INDIVIDUAL = "__individual__";

const INVENTORY_SQL = `create table if not exists public.inventory (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  kind            text not null default 'owned' check (kind in ('owned','planned')),
  name            text not null,
  category        text,
  quantity        integer not null default 1 check (quantity >= 0),
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  shared          boolean not null default false,
  purchased       boolean not null default false,
  person          text,
  notes           text,
  created_at      timestamptz not null default now()
);
alter table public.inventory enable row level security;
grant select, insert, update, delete on public.inventory to authenticated;
grant all on public.inventory to service_role;
drop policy if exists "inv_own" on public.inventory;
create policy "inv_own" on public.inventory
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.members enable row level security;
grant select, insert, update, delete on public.members to authenticated;
grant all on public.members to service_role;
drop policy if exists "members_own" on public.members;
create policy "members_own" on public.members
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());`;

function isMissingTable(err: unknown): boolean {
  const m = (err as { message?: string })?.message?.toLowerCase() ?? "";
  return m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache");
}

export function InventoryTab({ userId }: Props) {
  const qc = useQueryClient();
  const [view, setView] = useState<Kind>("owned");
  const [sqlOpen, setSqlOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // add form
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [value, setValue] = useState("");
  const [usage, setUsage] = useState<string>(SHARED);

  // people management
  const [newMember, setNewMember] = useState("");

  const { data: all = [], error, isLoading } = useQuery<InvItem[]>({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as InvItem[];
    },
    retry: false,
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["members"],
    queryFn: fetchMembers,
    retry: false,
  });

  const memberNames = useMemo(() => members.map((m) => m.name), [members]);
  const localToImport = useMemo(
    () => getMembers().filter((n) => !memberNames.includes(n)),
    [memberNames],
  );

  const tableMissing = !!error && isMissingTable(error);
  const items = useMemo(() => all.filter((i) => i.kind === view), [all, view]);

  const totals = useMemo(() => {
    const relevant = view === "planned" ? items.filter((i) => !i.purchased) : items;
    const total = relevant.reduce((s, i) => s + i.quantity * Number(i.estimated_value), 0);
    const sharedVal = relevant
      .filter((i) => i.shared)
      .reduce((s, i) => s + i.quantity * Number(i.estimated_value), 0);
    return { count: relevant.length, total, sharedVal, personalVal: total - sharedVal };
  }, [items, view]);

  function resetForm() {
    setName("");
    setCategory("");
    setQuantity("1");
    setValue("");
    setUsage(SHARED);
  }

  function usageOf(item: InvItem): string {
    if (item.shared) return SHARED;
    return item.person && memberNames.includes(item.person) ? item.person : INDIVIDUAL;
  }

  const add = useMutation({
    mutationFn: async () => {
      const nm = name.trim();
      if (!nm) throw new Error("Informe o nome.");
      const q = parseInt(quantity) || 1;
      const val = parseFloat((value || "0").replace(",", ".")) || 0;
      const isShared = usage === SHARED;
      const person = isShared || usage === INDIVIDUAL ? null : usage;
      const { error } = await supabase.from("inventory").insert({
        user_id: userId,
        kind: view,
        name: nm,
        category: view === "owned" ? category.trim() || null : null,
        quantity: q,
        estimated_value: val,
        shared: isShared,
        person,
      });
      if (error) {
        if (isMissingTable(error)) throw new Error("Rode o SQL do inventário no Supabase primeiro.");
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      resetForm();
      toast.success(view === "owned" ? "Item adicionado." : "Compra planejada adicionada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async ({
      id,
      changes,
    }: {
      id: string;
      changes: { shared?: boolean; purchased?: boolean; person?: string | null };
    }) => {
      const { error } = await supabase.from("inventory").update(changes).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMember = useMutation({
    mutationFn: async (nm: string) => {
      const n = nm.trim();
      if (!n) throw new Error("Informe um nome.");
      const { error } = await supabase.from("members").insert({ user_id: userId, name: n });
      if (error) {
        if (isMissingTable(error)) throw new Error("Rode o SQL de pessoas no Supabase primeiro.");
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

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const importMembers = useMutation({
    mutationFn: async () => {
      if (localToImport.length === 0) throw new Error("Nada para importar.");
      const { error } = await supabase
        .from("members")
        .insert(localToImport.map((n) => ({ user_id: userId, name: n })));
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      toast.success("Pessoas importadas deste navegador.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function setUsageFor(item: InvItem, val: string) {
    const nextShared = val === SHARED;
    const person = val === SHARED || val === INDIVIDUAL ? null : val;
    patch.mutate({ id: item.id, changes: { shared: nextShared, person } });
  }

  function copySql() {
    navigator.clipboard.writeText(INVENTORY_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Setup gate (só aparece se a tabela ainda não existir) ──────────────────
  if (tableMissing) {
    return (
      <div className="rounded-2xl border bg-card overflow-hidden max-w-3xl">
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-warning/10">
          <Database className="h-4 w-4 text-warning" />
          <p className="text-xs font-semibold uppercase tracking-wide">Pré-requisito do inventário</p>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Crie as tabelas do inventário no seu Supabase para ativar esta aba.
            Em <span className="font-mono">supabase.com</span> → seu projeto → <strong>SQL Editor</strong> →
            cole o SQL → <strong>RUN</strong>. Depois recarregue a página.
          </p>
          <div className="flex items-center justify-between">
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => setSqlOpen((v) => !v)}
            >
              {sqlOpen ? "Ocultar SQL" : "Ver SQL"}
            </button>
            <button onClick={copySql} className="flex items-center gap-1 text-xs text-primary hover:underline">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado!" : "Copiar SQL"}
            </button>
          </div>
          {sqlOpen && (
            <pre className="text-[11px] bg-muted/50 rounded-xl p-3 overflow-x-auto max-h-72 leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {INVENTORY_SQL}
            </pre>
          )}
        </div>
      </div>
    );
  }

  const isOwned = view === "owned";

  const usageOptions = (
    <>
      <SelectItem value={SHARED} className="text-xs">Compartilhado</SelectItem>
      <SelectItem value={INDIVIDUAL} className="text-xs">Individual</SelectItem>
      {memberNames.map((m) => (
        <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b overflow-x-auto scrollbar-none">
        <button
          onClick={() => setView("owned")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors shrink-0",
            isOwned ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Package className="h-3.5 w-3.5" /> Meus itens
        </button>
        <button
          onClick={() => setView("planned")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors shrink-0",
            !isOwned ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <ShoppingCart className="h-3.5 w-3.5" /> Compras planejadas
        </button>
      </div>

      {/* People management */}
      <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-medium">Pessoas</Label>
          <span className="text-[11px] text-muted-foreground">— sincronizadas entre aparelhos</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {members.map((m) => (
            <span
              key={m.id}
              className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs text-primary"
            >
              {m.name}
              <button
                onClick={() => removeMember.mutate(m.id)}
                className="text-primary/60 hover:text-expense"
                title="Remover"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {members.length === 0 && (
            <span className="text-xs text-muted-foreground">Nenhuma pessoa cadastrada.</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMember.mutate(newMember))}
            placeholder="+ Adicionar pessoa (ex: Léo)"
            className="h-8 text-xs w-48"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={addMember.isPending || !newMember.trim()}
            onClick={() => addMember.mutate(newMember)}
          >
            Adicionar
          </Button>
          {localToImport.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              disabled={importMembers.isPending}
              onClick={() => importMembers.mutate()}
              title={`Importar: ${localToImport.join(", ")}`}
            >
              {importMembers.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Importar deste navegador ({localToImport.length})
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground px-1">
        <span><strong className="text-foreground">{totals.count}</strong> {isOwned ? "item(ns)" : "a comprar"}</span>
        <span>{isOwned ? "Valor estimado" : "Total a comprar"}: <strong className="text-foreground">{brl(totals.total)}</strong></span>
        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Compartilhado: {brl(totals.sharedVal)}</span>
        <span className="flex items-center gap-1"><User className="h-3 w-3" /> Individual: {brl(totals.personalVal)}</span>
      </div>

      {/* Add form */}
      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5 w-full sm:flex-1 sm:min-w-[140px]">
          <Label className="text-xs">{isOwned ? "Item" : "Produto"}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={isOwned ? "Ex: Furadeira" : "Ex: Aspirador"} className="h-9" />
        </div>
        {isOwned && (
          <div className="space-y-1.5 w-full sm:w-32">
            <Label className="text-xs">Categoria</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex: Ferramentas" className="h-9" />
          </div>
        )}
        <div className="flex gap-2">
          <div className="space-y-1.5 w-20">
            <Label className="text-xs">Qtd.</Label>
            <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5 flex-1 sm:w-28">
            <Label className="text-xs">Valor est. (R$)</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal"
              placeholder="0,00" className="h-9" />
          </div>
        </div>
        <div className="space-y-1.5 w-full sm:w-44">
          <Label className="text-xs">Uso</Label>
          <Select value={usage} onValueChange={setUsage}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{usageOptions}</SelectContent>
          </Select>
        </div>
        <Button size="sm" className="h-9 w-full sm:w-auto gap-1.5"
          disabled={add.isPending || !name.trim()} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Adicionar
        </Button>
      </div>

      {/* List */}
      <div className="rounded-2xl border bg-card p-2">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {isOwned ? "Nenhum item cadastrado ainda." : "Nenhuma compra planejada."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((it) => {
              const line = it.quantity * Number(it.estimated_value);
              return (
                <li
                  key={it.id}
                  className={cn(
                    "flex flex-wrap items-center gap-2 px-2 py-2.5 sm:px-3",
                    it.purchased && "opacity-60",
                  )}
                >
                  <div
                    className={cn(
                      "h-9 w-9 rounded-xl grid place-items-center shrink-0",
                      isOwned ? "bg-primary/10 text-primary" : "bg-warning/15 text-warning",
                    )}
                  >
                    {isOwned ? <Package className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                  </div>

                  <div className="flex-1 min-w-[120px]">
                    <p className={cn("text-sm font-medium truncate", it.purchased && "line-through")}>
                      {it.name}
                      {it.quantity > 1 && <span className="text-muted-foreground font-normal"> ×{it.quantity}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {it.category ? `${it.category} · ` : ""}
                      {brl(Number(it.estimated_value))} un{it.quantity > 1 ? ` · ${brl(line)} total` : ""}
                    </p>
                  </div>

                  {/* Uso: Compartilhado / Individual / membro */}
                  <Select value={usageOf(it)} onValueChange={(v) => setUsageFor(it, v)}>
                    <SelectTrigger className="h-7 w-auto min-w-[7rem] text-xs gap-1 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>{usageOptions}</SelectContent>
                  </Select>

                  {/* Purchased toggle (planned only) */}
                  {!isOwned && (
                    <button
                      title={it.purchased ? "Marcar como não comprada" : "Marcar como comprada"}
                      onClick={() => patch.mutate({ id: it.id, changes: { purchased: !it.purchased } })}
                      className={cn(
                        "flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium border transition-colors shrink-0",
                        it.purchased
                          ? "border-income/40 text-income bg-income/5"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <Check className="h-3 w-3" /> {it.purchased ? "Comprada" : "Comprar"}
                    </button>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-expense shrink-0"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(it.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
