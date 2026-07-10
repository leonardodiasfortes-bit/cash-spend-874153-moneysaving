import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileJson, FileText, Shield, Loader2 } from "lucide-react";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { brl, netAmount, type Account, type Category, type Transaction } from "@/lib/finance";
import { Button } from "@/components/ui/button";

interface Props {
  userId: string;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(";"),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = String(r[h] ?? "").replace(/"/g, '""');
          return v.includes(";") || v.includes('"') || v.includes("\n") ? `"${v}"` : v;
        })
        .join(";"),
    ),
  ];
  return lines.join("\n");
}

export function ExportData({ userId }: Props) {
  const [exporting, setExporting] = useState(false);

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("transaction_date", { ascending: true });
      if (error) throw error;
      return data as Transaction[];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").order("name");
      if (error) throw error;
      return data as Account[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  const stamp = format(new Date(), "yyyy-MM-dd");

  async function exportJSON() {
    setExporting(true);
    try {
      const backup = {
        exported_at: new Date().toISOString(),
        user_id: userId,
        transactions,
        accounts,
        categories: categories.filter((c) => !c.is_default),
      };
      downloadFile(
        JSON.stringify(backup, null, 2),
        `financas-backup-${stamp}.json`,
        "application/json",
      );
    } finally {
      setExporting(false);
    }
  }

  function exportTransactionsCSV() {
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const rows = transactions.map((t) => ({
      data: t.transaction_date,
      vencimento: t.due_date ?? "",
      tipo: t.type === "income" ? "Receita" : "Despesa",
      descricao: t.description,
      categoria: t.category_id ? (catMap.get(t.category_id) ?? "") : "",
      valor: Number(t.amount).toFixed(2).replace(".", ","),
      desconto: Number(t.discount ?? 0).toFixed(2).replace(".", ","),
      valor_liquido: netAmount(t).toFixed(2).replace(".", ","),
      status: t.status ?? "",
    }));
    downloadFile(toCSV(rows), `transacoes-${stamp}.csv`, "text/csv;charset=utf-8;");
  }

  function exportAccountsCSV() {
    const rows = accounts.map((a) => ({
      nome: a.name,
      tipo: a.type,
      saldo: Number(a.balance).toFixed(2).replace(".", ","),
      limite_taxa: a.credit_limit != null ? String(a.credit_limit).replace(".", ",") : "",
    }));
    downloadFile(toCSV(rows), `contas-${stamp}.csv`, "text/csv;charset=utf-8;");
  }

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Backup & exportação
        </p>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Baixe seus dados periodicamente como proteção. O backup JSON contém todas as transações,
          contas e categorias e pode ser usado para restaurar os dados em outro sistema.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ExportCard
            icon={<FileJson className="h-5 w-5" />}
            title="Backup completo"
            sub={`${transactions.length} transações · ${accounts.length} contas`}
            tone="primary"
            onClick={exportJSON}
            loading={exporting}
          />
          <ExportCard
            icon={<FileText className="h-5 w-5" />}
            title="Transações CSV"
            sub="Abre no Excel / Sheets"
            tone="neutral"
            onClick={exportTransactionsCSV}
          />
          <ExportCard
            icon={<FileText className="h-5 w-5" />}
            title="Contas CSV"
            sub="Saldos e limites"
            tone="neutral"
            onClick={exportAccountsCSV}
          />
        </div>
      </div>
    </div>
  );
}

function ExportCard({
  icon,
  title,
  sub,
  tone,
  onClick,
  loading,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  tone: "primary" | "neutral";
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/40 disabled:opacity-60 ${
        tone === "primary" ? "border-primary/30 bg-primary/5" : ""
      }`}
    >
      <div
        className={`h-9 w-9 rounded-lg grid place-items-center shrink-0 ${
          tone === "primary" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <Download className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}
