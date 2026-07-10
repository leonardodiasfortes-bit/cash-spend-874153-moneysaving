import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, Plus, Trash2, Loader2, Copy, Check, Database } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  userId: string;
}

interface WaContact {
  id: string;
  phone: string;
  label: string | null;
  verified: boolean;
  alerts_enabled: boolean;
}

// The generated Supabase types don't include wa_contacts (table lives only in
// the user's own DB after they run the SQL below), so we access it untyped.
const sb = supabase as unknown as {
  from: (t: string) => any;
};

const WA_SQL = `create table if not exists public.wa_contacts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  phone          text not null unique,
  label          text,
  verified       boolean not null default false,
  alerts_enabled boolean not null default true,
  created_at     timestamptz not null default now()
);
alter table public.wa_contacts enable row level security;
grant select, insert, update, delete on public.wa_contacts to authenticated;
grant all on public.wa_contacts to service_role;
drop policy if exists "wa_own" on public.wa_contacts;
create policy "wa_own" on public.wa_contacts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());`;

function isMissingTable(err: unknown): boolean {
  const m = (err as { message?: string })?.message?.toLowerCase() ?? "";
  return m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache");
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
      }
      className="flex items-center gap-1 text-xs text-primary hover:underline"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado!" : "Copiar SQL"}
    </button>
  );
}

export function WhatsAppSettings({ userId }: Props) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [sqlOpen, setSqlOpen] = useState(false);

  const { data: contacts = [], error, isLoading } = useQuery<WaContact[]>({
    queryKey: ["wa_contacts"],
    queryFn: async () => {
      const { data, error } = await sb.from("wa_contacts").select("*").order("created_at");
      if (error) throw error;
      return data as WaContact[];
    },
    retry: false,
  });

  const tableMissing = !!error && isMissingTable(error);

  const add = useMutation({
    mutationFn: async () => {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 12 || digits.length > 13) {
        throw new Error("Número inválido. Use DDI+DDD+número, ex: 5511999998888.");
      }
      const { error } = await sb
        .from("wa_contacts")
        .insert({ user_id: userId, phone: digits, label: label.trim() || null });
      if (error) {
        if (isMissingTable(error)) throw new Error("Rode o SQL da integração no Supabase primeiro.");
        if ((error.message ?? "").includes("duplicate")) throw new Error("Esse número já está cadastrado.");
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa_contacts"] });
      setPhone("");
      setLabel("");
      toast.success("Número cadastrado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("wa_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa_contacts"] });
      toast.success("Número removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
        <MessageCircle className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Integração WhatsApp
        </p>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning-foreground font-medium">
          Em configuração
        </span>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Cadastre os números que vão <strong>receber alertas</strong> de vencimento e{" "}
          <strong>lançar por áudio</strong>. O envio/recebimento em si vem nas próximas fases (ver{" "}
          <span className="font-mono">docs/whatsapp-integration-plan.md</span>). Este passo é só o
          cadastro dos números — não depende de credenciais da Meta.
        </p>

        {/* Pré-requisito: criar a tabela no Supabase */}
        {tableMissing && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-warning shrink-0" />
              <p className="text-xs font-medium">
                Pré-requisito: crie a tabela <span className="font-mono">wa_contacts</span> no seu Supabase.
              </p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Em <span className="font-mono">supabase.com</span> → seu projeto → <strong>SQL Editor</strong> →
              cole o SQL e clique em <strong>RUN</strong>. Depois recarregue esta página.
            </p>
            <div className="flex items-center justify-between">
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                onClick={() => setSqlOpen((v) => !v)}
              >
                {sqlOpen ? "Ocultar SQL" : "Ver SQL"}
              </button>
              <CopyButton text={WA_SQL} />
            </div>
            {sqlOpen && (
              <pre className="text-[11px] bg-muted/50 rounded-xl p-3 overflow-x-auto max-h-56 leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {WA_SQL}
              </pre>
            )}
          </div>
        )}

        {/* Erro inesperado (não é tabela faltando) */}
        {error && !tableMissing && (
          <p className="text-xs text-expense">
            Erro ao carregar os números: {(error as Error).message}
          </p>
        )}

        {/* Lista de números cadastrados */}
        {!tableMissing && (
          <>
            {isLoading ? (
              <div className="py-4 text-center text-xs text-muted-foreground">Carregando…</div>
            ) : contacts.length > 0 ? (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border px-3 py-2"
                  >
                    <MessageCircle className="h-4 w-4 text-income shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium tabular-nums">+{c.phone}</p>
                      {c.label && <p className="text-xs text-muted-foreground">{c.label}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-expense"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum número cadastrado ainda.</p>
            )}

            {/* Adicionar número */}
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <div className="space-y-1.5 flex-1 min-w-[180px]">
                <Label className="text-xs">Número (DDI+DDD+número)</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="5511999998888"
                  inputMode="numeric"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5 w-32">
                <Label className="text-xs">Nome (opcional)</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Léo"
                  className="h-9"
                />
              </div>
              <Button
                size="sm"
                className="h-9 gap-1.5"
                disabled={add.isPending || !phone.trim()}
                onClick={() => add.mutate()}
              >
                {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
