import { useRef, useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileText, Loader2, X, AlertCircle, CopyX, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { type Category, type Transaction } from "@/lib/finance";
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

interface RawRow { date: string; title: string; amount: number }

function parseNubankCSV(text: string): RawRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const rows: RawRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCSVLine(line);
    if (cols.length < 3) continue;
    rows.push({ date: cols[0].trim(), title: cols[1].trim(), amount: parseBRLAmount(cols[2]) });
  }
  return rows;
}

// ── Filename → due-date label (Nubank_YYYY-MM-DD.csv → "DD/mmm/YY") ─────────

const MONTHS_PT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

function extractLabel(filename: string): string {
  const m = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return filename.replace(/\.csv$/i, "");
  return `${m[3]}/${MONTHS_PT[parseInt(m[2]) - 1]}/${m[1].slice(2)}`;
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function fingerprint(date: string, description: string, amount: number): string {
  return `${date}|${description.trim().toLowerCase()}|${Math.abs(amount).toFixed(2)}`;
}

function buildExistingSet(transactions: Transaction[]): Set<string> {
  return new Set(transactions.map((t) =>
    fingerprint(t.transaction_date, t.description, Number(t.amount)),
  ));
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportRow extends RawRow {
  id: string;
  dueDate: string;
  selected: boolean;
  categoryId: string | null;
  isPayment: boolean;
  isDuplicate: boolean;
}

interface FileTab {
  id: string;
  filename: string;
  label: string;
  dueDate: string;
  rows: ImportRow[];
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { open: boolean; onClose: () => void; userId: string }

export function ImportCSVDialog({ open, onClose, userId }: Props) {
  const addFileRef = useRef<HTMLInputElement>(null);
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
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

  async function processFiles(files: FileList | File[], existingTabs: FileTab[]) {
    const fileArr = Array.from(files).filter(
      (f) => !existingTabs.some((t) => t.filename === f.name),
    );
    if (!fileArr.length) return;
    setChecking(true);

    const newTabs: FileTab[] = [];

    for (const file of fileArr) {
      const text = await file.text();
      const parsed = parseNubankCSV(text);
      if (!parsed.length) {
        toast.error(`Nenhuma transação em "${file.name}".`);
        continue;
      }

      // Due date from filename (e.g. Nubank_2026-08-02.csv → "2026-08-02")
      const dates = parsed.map((r) => r.date).sort();
      const dueDate = file.name.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? dates[dates.length - 1];

      // Query existing transactions on the due date (that's what we'll save)
      const { data: existing = [] } = await supabase
        .from("transactions")
        .select("transaction_date, description, amount")
        .eq("transaction_date", dueDate);

      const existingSet = buildExistingSet((existing ?? []) as Transaction[]);
      const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const rows: ImportRow[] = parsed.map((r, i) => {
        const isPayment = r.amount < 0 || r.title.toLowerCase().includes("pagamento recebido");
        // Fingerprint uses dueDate because that's the transaction_date we'll store
        const isDuplicate = !isPayment && existingSet.has(fingerprint(dueDate, r.title, r.amount));
        return {
          ...r,
          id: `${tabId}-${i}`,
          dueDate,
          selected: !isPayment && !isDuplicate,
          categoryId: isPayment ? null : suggestCategoryId(r.title, categories),
          isPayment,
          isDuplicate,
        };
      });

      newTabs.push({ id: tabId, filename: file.name, label: extractLabel(file.name), dueDate, rows });
    }

    if (newTabs.length) {
      setTabs((prev) => [...prev, ...newTabs]);
      setActiveTabId((prev) => prev ?? newTabs[0].id);
      const totalDups = newTabs.reduce((s, t) => s + t.rows.filter((r) => r.isDuplicate).length, 0);
      if (totalDups > 0) toast.warning(`${totalDups} transação(ões) já importadas foram desmarcadas.`);
    }

    setChecking(false);
  }

  function toggle(tabId: string, rowId: string) {
    setTabs((prev) =>
      prev.map((t) =>
        t.id !== tabId ? t :
          { ...t, rows: t.rows.map((r) => r.id === rowId ? { ...r, selected: !r.selected } : r) },
      ),
    );
  }

  function setCategory(tabId: string, rowId: string, catId: string) {
    setTabs((prev) =>
      prev.map((t) =>
        t.id !== tabId ? t :
          { ...t, rows: t.rows.map((r) => r.id === rowId ? { ...r, categoryId: catId } : r) },
      ),
    );
  }

  function toggleAll(tabId: string, val: boolean) {
    setTabs((prev) =>
      prev.map((t) =>
        t.id !== tabId ? t :
          { ...t, rows: t.rows.map((r) => r.isPayment ? r : { ...r, selected: val }) },
      ),
    );
  }

  function removeTab(tabId: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) setActiveTabId(next[0]?.id ?? null);
      return next;
    });
  }

  // Aggregated across all tabs
  const allSelected = tabs.flatMap((t) => t.rows.filter((r) => r.selected));
  const totalSelected = allSelected.length;
  const totalAmount = allSelected.reduce((s, r) => s + Math.abs(r.amount), 0);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeImportable = activeTab?.rows.filter((r) => !r.isPayment) ?? [];
  const activeSelected = activeTab?.rows.filter((r) => r.selected) ?? [];
  const activeDupCount = activeTab?.rows.filter((r) => r.isDuplicate).length ?? 0;
  const allSelectedInTab = activeImportable.length > 0 && activeSelected.length === activeImportable.length;

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!allSelected.length) throw new Error("Nenhuma transação selecionada.");
      const payload = allSelected.map((r) => ({
        type: "expense" as const,
        amount: Math.abs(r.amount),
        description: r.title,
        category_id: r.categoryId,
        transaction_date: r.dueDate,
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
      toast.success(`${totalSelected} transações importadas!`);
      handleClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleClose() {
    setTabs([]);
    setActiveTabId(null);
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
          {checking ? (
            <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              Verificando duplicatas…
            </div>
          ) : tabs.length === 0 ? (
            <label
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 py-12 cursor-pointer hover:bg-muted/40 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); processFiles(e.dataTransfer.files, tabs); }}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">Arraste os CSVs do Nubank aqui</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Múltiplos arquivos suportados · Nubank → Exportar fatura → CSV
                </p>
              </div>
              <input
                type="file" accept=".csv" multiple className="hidden"
                onChange={(e) => { if (e.target.files) processFiles(e.target.files, tabs); }}
              />
            </label>
          ) : (
            <>
              {/* Tab bar */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {tabs.map((t) => {
                  const tabSel = t.rows.filter((r) => r.selected).length;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTabId(t.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        t.id === activeTabId
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                      }`}
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      {t.label}
                      <span className="opacity-60">({tabSel})</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); removeTab(t.id); }}
                        onKeyDown={(e) => e.key === "Enter" && removeTab(t.id)}
                        className="ml-0.5 opacity-60 hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </button>
                  );
                })}
                <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground border border-dashed border-border hover:bg-muted/40 cursor-pointer transition-colors">
                  <Plus className="h-3 w-3" /> Adicionar
                  <input
                    ref={addFileRef}
                    type="file" accept=".csv" multiple className="hidden"
                    onChange={(e) => { if (e.target.files) processFiles(e.target.files, tabs); }}
                  />
                </label>
              </div>

              {activeTab && (
                <>
                  {/* File info bar */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="truncate max-w-[200px]" title={activeTab.filename}>{activeTab.filename}</span>
                      <span>·</span>
                      <span>{activeTab.rows.length} linhas</span>
                      <span>·</span>
                      <span className="text-foreground font-medium">{activeSelected.length} selecionadas</span>
                      <span>·</span>
                      <span className="text-primary font-medium">venc. {activeTab.dueDate}</span>
                      {activeDupCount > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-warning font-medium">
                            <CopyX className="h-3 w-3" />{activeDupCount} duplicada(s)
                          </span>
                        </>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0"
                      onClick={() => toggleAll(activeTab.id, !allSelectedInTab)}>
                      {allSelectedInTab ? "Desmarcar todas" : "Selecionar todas"}
                    </Button>
                  </div>

                  {/* Duplicate notice */}
                  {activeDupCount > 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning-foreground/90">
                      <CopyX className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
                      <span>
                        <strong>{activeDupCount}</strong> linha(s) já existem e foram desmarcadas.
                        Marque manualmente para importar mesmo assim.
                      </span>
                    </div>
                  )}

                  {/* Table */}
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="w-8 px-3 py-2" />
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Data compra</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Descrição</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Categoria</th>
                          <th className="px-3 py-2 text-right text-muted-foreground font-medium">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {activeTab.rows.map((row) => (
                          <tr
                            key={row.id}
                            className={`transition-colors ${
                              row.isPayment
                                ? "opacity-35 bg-muted/20"
                                : row.isDuplicate
                                ? "bg-warning/5"
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
                                  onChange={() => toggle(activeTab.id, row.id)}
                                  className="cursor-pointer accent-primary"
                                />
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{row.date}</td>
                            <td className="px-3 py-2 max-w-[200px]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="truncate" title={row.title}>{row.title}</span>
                                {row.isDuplicate && (
                                  <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-warning/20 text-warning border border-warning/30 whitespace-nowrap">
                                    já importado
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 min-w-[140px]">
                              {!row.isPayment && row.selected && (
                                <Select
                                  value={row.categoryId ?? "no-cat"}
                                  onValueChange={(v) => setCategory(activeTab.id, row.id, v === "no-cat" ? "" : v)}
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
                                <span className={row.isDuplicate ? "text-muted-foreground" : "text-expense"}>
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
            </>
          )}
        </div>

        {/* Footer */}
        {tabs.length > 0 && !checking && (
          <div className="px-6 py-4 border-t bg-muted/20 shrink-0 flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              <span>
                {tabs.length > 1 ? `${tabs.length} faturas · ` : ""}
                <strong className="text-foreground">{totalSelected}</strong> transação(ões) ·{" "}
                R$ <strong className="text-foreground">{totalAmount.toFixed(2).replace(".", ",")}</strong>
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleClose}>Cancelar</Button>
              <Button
                size="sm"
                onClick={() => importMutation.mutate()}
                disabled={!totalSelected || importMutation.isPending}
              >
                {importMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Importando…</>
                ) : (
                  `Importar ${totalSelected} transação(ões)`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
