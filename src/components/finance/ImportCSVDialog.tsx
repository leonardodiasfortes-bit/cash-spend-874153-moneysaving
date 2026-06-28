import { useRef, useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileText, Loader2, X, AlertCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { type Category } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

function parseBRLAmount(raw: string): number {
  const clean = raw.replace(/\s/g, "").replace(/"/g, "");
  const neg = clean.includes("-");
  const digits = clean.replace(/[^0-9,]/g, "");
  const norm = digits.replace(/\./g, "").replace(",", ".");
  const val = parseFloat(norm) || 0;
  return neg ? -val : val;
}

interface RawRow {
  date: string;
  title: string;
  amount: number;
}

function parseNubankCSV(text: string): RawRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const rows: RawRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCSVLine(line);
    if (cols.length < 3) continue;
    const amount = parseBRLAmount(cols[2]);
    rows.push({ date: cols[0].trim(), title: cols[1].trim(), amount });
  }
  return rows;
}

// ── Category suggestion ───────────────────────────────────────────────────────

const KEYWORD_MAP: { keywords: string[]; cat: string }[] = [
  { keywords: ["mercado", "supermerc", "hortifrut", "carrefour", "extra", "atacad"], cat: "Alimentação" },
  { keywords: ["restaur", "lanchon", "pizza", "burger", "mcdon", "ifood", "caf", "hamburguer", "churrascaria"], cat: "Alimentação" },
  { keywords: ["posto", "shell", "ipiranga", "combustiv", "estacionam", "gasolineira"], cat: "Transporte" },
  { keywords: ["uber", "99pop", "cabify", "onibus", "metro", "trem"], cat: "Transporte" },
  { keywords: ["farmacia", "drogasil", "raia", "droga", "ultrafarma", "panvell"], cat: "Saúde" },
  { keywords: ["hospital", "clinica", "medico", "plano de saude", "unimed"], cat: "Saúde" },
  { keywords: ["shopee", "amazon", "mercadol", "magalu", "americanas", "shein", "aliexpress", "anker"], cat: "Compras" },
  { keywords: ["netflix", "spotify", "youtube", "prime", "disney", "hbo", "maxim", "globoplay", "deezer"], cat: "Lazer" },
  { keywords: ["academia", "gym", "fitness", "soccer", "esporte", "beach tennis", "swim"], cat: "Lazer" },
  { keywords: ["escola", "faculdade", "curso", "udemy", "alura", "coursera", "duolingo"], cat: "Educação" },
  { keywords: ["aluguel", "condomin", "agua", "energia", "eletric", "gas", "internet", "tim", "claro", "vivo", "oi"], cat: "Moradia" },
  { keywords: ["juliana", "pix", "transferencia"], cat: "Outras Despesas" },
];

function suggestCategoryId(title: string, categories: Category[]): string | null {
  const t = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const rule of KEYWORD_MAP) {
    if (rule.keywords.some((k) => t.includes(k))) {
      const found = categories.find((c) => c.name === rule.cat && c.type === "expense");
      if (found) return found.id;
    }
  }
  return null;
}

// ── Import row interface ──────────────────────────────────────────────────────

interface ImportRow extends RawRow {
  id: number;
  selected: boolean;
  categoryId: string | null;
  isPayment: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
}

export function ImportCSVDialog({ open, onClose, userId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [filename, setFilename] = useState("");
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  const expenseCategories = categories.filter((c) => c.type === "expense");

  function handleFile(file: File) {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseNubankCSV(text);
      if (!parsed.length) { toast.error("Nenhuma transação encontrada no arquivo."); return; }
      const mapped: ImportRow[] = parsed.map((r, i) => {
        const isPayment = r.amount < 0 || r.title.toLowerCase().includes("pagamento recebido");
        return {
          ...r,
          id: i,
          selected: !isPayment,
          categoryId: isPayment ? null : suggestCategoryId(r.title, categories),
          isPayment,
        };
      });
      setRows(mapped);
    };
    reader.readAsText(file, "utf-8");
  }

  function toggle(id: number) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, selected: !r.selected } : r));
  }

  function setCategory(id: number, catId: string) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, categoryId: catId } : r));
  }

  function toggleAll(val: boolean) {
    setRows((prev) => prev.map((r) => r.isPayment ? r : { ...r, selected: val }));
  }

  const selected = rows.filter((r) => r.selected);
  const allSelected = selected.length === rows.filter((r) => !r.isPayment).length;

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selected.length) throw new Error("Nenhuma transação selecionada.");
      const payload = selected.map((r) => ({
        type: "expense" as const,
        amount: Math.abs(r.amount),
        description: r.title,
        category_id: r.categoryId,
        transaction_date: r.date,
        status: "paid" as const,
        user_id: userId,
      }));
      const BATCH = 100;
      for (let i = 0; i < payload.length; i += BATCH) {
        const { error } = await supabase.from("transactions").insert(payload.slice(i, i + BATCH));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(`${selected.length} transações importadas!`);
      setRows([]);
      setFilename("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleClose() {
    setRows([]);
    setFilename("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Importar extrato Nubank (CSV)
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Drop zone */}
          {!rows.length ? (
            <label
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 py-12 cursor-pointer hover:bg-muted/40 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">Arraste o CSV do Nubank aqui</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Exporte em: Nubank app → Cartão de crédito → Exportar fatura
                </p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
          ) : (
            <>
              {/* File info + select all */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{filename}</span>
                  <span>·</span>
                  <span>{rows.length} linhas</span>
                  <span>·</span>
                  <span className="text-foreground font-medium">{selected.length} selecionadas</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs"
                    onClick={() => toggleAll(!allSelected)}>
                    {allSelected ? "Desmarcar todas" : "Selecionar todas"}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => { setRows([]); setFilename(""); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Table */}
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="w-8 px-3 py-2 text-left"></th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Data</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Descrição</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Categoria</th>
                      <th className="px-3 py-2 text-right text-muted-foreground font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          row.isPayment
                            ? "opacity-40 bg-muted/20"
                            : row.selected
                            ? "bg-background hover:bg-muted/30"
                            : "bg-muted/10 opacity-60"
                        }`}
                      >
                        <td className="px-3 py-2">
                          {row.isPayment ? (
                            <span title="Pagamento — ignorado">
                              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={() => toggle(row.id)}
                              className="cursor-pointer accent-primary"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {row.date}
                        </td>
                        <td className="px-3 py-2 max-w-[220px] truncate" title={row.title}>
                          {row.title}
                        </td>
                        <td className="px-3 py-2 min-w-[140px]">
                          {!row.isPayment && row.selected && (
                            <Select
                              value={row.categoryId ?? ""}
                              onValueChange={(v) => setCategory(row.id, v)}
                            >
                              <SelectTrigger className="h-7 text-xs border-none bg-muted/40 focus:ring-0">
                                <SelectValue placeholder="Categoria…" />
                              </SelectTrigger>
                              <SelectContent>
                                {expenseCategories.map((c) => (
                                  <SelectItem key={c.id} value={c.id} className="text-xs">
                                    {c.icon} {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {row.isPayment ? (
                            <span className="text-income text-[10px]">pagamento</span>
                          ) : (
                            <span className="text-expense">
                              R$ {Math.abs(row.amount).toFixed(2).replace(".", ",")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {rows.length > 0 && (
          <div className="px-6 py-4 border-t bg-muted/20 shrink-0 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Total selecionado:{" "}
              <strong className="text-foreground">
                R$ {selected.reduce((s, r) => s + Math.abs(r.amount), 0).toFixed(2).replace(".", ",")}
              </strong>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => importMutation.mutate()}
                disabled={!selected.length || importMutation.isPending}
              >
                {importMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Importando…</>
                ) : (
                  `Importar ${selected.length} transações`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
