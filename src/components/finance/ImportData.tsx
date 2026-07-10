import { useRef, useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileJson } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { type Category, type Transaction, type Account } from "@/lib/finance";
import { Button } from "@/components/ui/button";

interface Backup {
  exported_at: string;
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
}

interface Props {
  userId: string;
}

interface Progress {
  categories: number;
  accounts: number;
  transactions: number;
  total_categories: number;
  total_accounts: number;
  total_transactions: number;
}

export function ImportData({ userId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [done, setDone] = useState(false);
  const qc = useQueryClient();

  const { data: existingCategories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*");
      if (error) throw error;
      return data as Category[];
    },
  });

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as Backup;
        if (!parsed.transactions || !Array.isArray(parsed.transactions)) {
          throw new Error("Arquivo inválido — não é um backup do sistema.");
        }
        setBackup(parsed);
        setDone(false);
        setProgress(null);
      } catch {
        toast.error("Arquivo JSON inválido.");
      }
    };
    reader.readAsText(file);
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!backup) return;

      // ── 1. Build category ID mapping (old UUID → new UUID) ──────────────
      // Match default categories by name; insert custom ones.
      const catIdMap = new Map<string, string>();

      // Map default categories by name from the existing DB
      for (const existing of existingCategories) {
        const fromBackup = [...(backup.categories ?? []), ...(backup.transactions
          .map((t) => ({ id: t.category_id, name: "" }))
          .filter((x) => x.id))] as Category[];
        // Find backup category with same name
        const match = (backup.categories ?? []).find(
          (bc) => bc.name === existing.name && bc.type === existing.type,
        );
        if (match) catIdMap.set(match.id, existing.id);
      }

      // Insert custom (non-default) categories from backup not yet mapped
      const customCats = (backup.categories ?? []).filter(
        (bc) => !bc.is_default && !catIdMap.has(bc.id),
      );

      setProgress({
        categories: 0,
        accounts: 0,
        transactions: 0,
        total_categories: customCats.length,
        total_accounts: backup.accounts.length,
        total_transactions: backup.transactions.length,
      });

      for (let i = 0; i < customCats.length; i++) {
        const bc = customCats[i];
        const { data, error } = await supabase
          .from("categories")
          .insert({ name: bc.name, type: bc.type, icon: bc.icon, user_id: userId, is_default: false })
          .select("id")
          .single();
        if (error) throw new Error(`Erro ao importar categoria "${bc.name}": ${error.message}`);
        catIdMap.set(bc.id, data.id);
        setProgress((p) => p && { ...p, categories: i + 1 });
      }

      // ── 2. Insert accounts ───────────────────────────────────────────────
      for (let i = 0; i < backup.accounts.length; i++) {
        const a = backup.accounts[i];
        const { error } = await supabase.from("accounts").insert({
          name: a.name,
          type: a.type,
          balance: a.balance,
          credit_limit: a.credit_limit,
          color: a.color,
          icon: a.icon,
          user_id: userId,
        });
        if (error) throw new Error(`Erro ao importar conta "${a.name}": ${error.message}`);
        setProgress((p) => p && { ...p, accounts: i + 1 });
      }

      // ── 3. Insert transactions in batches of 100 ─────────────────────────
      const BATCH = 100;
      let imported = 0;
      for (let i = 0; i < backup.transactions.length; i += BATCH) {
        const chunk = backup.transactions.slice(i, i + BATCH).map((t) => ({
          type: t.type,
          amount: t.amount,
          description: t.description,
          category_id: t.category_id ? (catIdMap.get(t.category_id) ?? null) : null,
          transaction_date: t.transaction_date,
          due_date: t.due_date,
          status: t.status,
          user_id: userId,
        }));
        const { error } = await supabase.from("transactions").insert(chunk);
        if (error) throw new Error(`Erro ao importar transações (lote ${i / BATCH + 1}): ${error.message}`);
        imported += chunk.length;
        setProgress((p) => p && { ...p, transactions: imported });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      setDone(true);
      toast.success("Importação concluída!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
        <Upload className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Importar backup
        </p>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Use após reconectar o app ao novo Supabase. As categorias padrão são mapeadas automaticamente
          pelo nome. Categorias customizadas e todas as transações/contas serão recriadas.
        </p>

        {/* Drop zone */}
        {!backup && !done && (
          <label
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 py-10 cursor-pointer hover:bg-muted/40 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
          >
            <FileJson className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">Arraste o arquivo JSON aqui</p>
              <p className="text-xs text-muted-foreground mt-0.5">ou clique para selecionar</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </label>
        )}

        {/* File loaded preview */}
        {backup && !done && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
              <p className="text-xs font-medium">Backup carregado</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="Transações" value={backup.transactions.length} />
                <Stat label="Contas" value={backup.accounts.length} />
                <Stat label="Categorias custom" value={(backup.categories ?? []).filter((c) => !c.is_default).length} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Exportado em: {new Date(backup.exported_at).toLocaleString("pt-BR")}
              </p>
            </div>

            {/* Progress */}
            {progress && (
              <div className="space-y-2">
                <ProgressRow
                  label="Categorias"
                  current={progress.categories}
                  total={progress.total_categories}
                />
                <ProgressRow
                  label="Contas"
                  current={progress.accounts}
                  total={progress.total_accounts}
                />
                <ProgressRow
                  label="Transações"
                  current={progress.transactions}
                  total={progress.total_transactions}
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setBackup(null); setProgress(null); }}
                disabled={importMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending}
                className="flex-1"
              >
                {importMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Importando…</>
                ) : (
                  "Importar agora"
                )}
              </Button>
            </div>
          </div>
        )}

        {done && (
          <div className="flex items-center gap-3 rounded-xl bg-income/10 border border-income/30 p-4">
            <CheckCircle2 className="h-5 w-5 text-income shrink-0" />
            <div>
              <p className="text-sm font-medium text-income">Importação concluída!</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Seus dados foram migrados para o novo Supabase com sucesso.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-background border p-2">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ProgressRow({ label, current, total }: { label: string; current: number; total: number }) {
  const pct = total === 0 ? 100 : Math.round((current / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{current}/{total}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
