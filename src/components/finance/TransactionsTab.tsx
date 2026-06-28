import { useMemo, useState } from "react";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Search, X, FileUp, CheckSquare, Trash2, Tag, Square, User } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { monthRange, brl, type Category, type Transaction } from "@/lib/finance";
import { getMembers, getPersonMap, savePersons } from "@/lib/family";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TransactionList } from "./TransactionList";
import { ImportCSVDialog } from "./ImportCSVDialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  transactions: Transaction[];
  categories: Category[];
  isLoading: boolean;
  userId: string;
}

export function TransactionsTab({ transactions, categories, isLoading, userId }: Props) {
  const [refDate, setRefDate] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [personFilter, setPersonFilter] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCatOpen, setBulkCatOpen] = useState(false);
  const [bulkCatId, setBulkCatId] = useState("");
  const NOBODY = "__none__";
  const [bulkPersonOpen, setBulkPersonOpen] = useState(false);
  const [bulkPerson, setBulkPerson] = useState(NOBODY);
  const members = getMembers();
  const personMap = getPersonMap();
  const qc = useQueryClient();

  const filtered = useMemo(() => {
    let list = transactions;
    if (refDate) {
      const { start, end } = monthRange(refDate);
      list = list.filter((t) => {
        const d = new Date(t.transaction_date + "T00:00:00");
        return d >= start && d <= end;
      });
    }
    if (typeFilter !== "all") list = list.filter((t) => t.type === typeFilter);
    if (personFilter) list = list.filter((t) => personMap[t.id] === personFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) => t.description.toLowerCase().includes(q) || brl(Number(t.amount)).includes(q),
      );
    }
    return list;
  }, [transactions, refDate, search, typeFilter, personFilter]);

  const monthLabel = refDate
    ? format(refDate, "MMMM 'de' yyyy", { locale: ptBR })
    : "Todos os meses";

  const totalIncome = filtered.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  // ── Selection helpers ────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((t) => t.id)));
    }
  }

  function applyBulkPerson() {
    savePersons(selectedArr, bulkPerson === NOBODY ? null : bulkPerson);
    qc.invalidateQueries({ queryKey: ["transactions"] });
    toast.success(`"Quem?" atualizado em ${selectedArr.length} transação(ões).`);
    setBulkPersonOpen(false);
    exitSelectionMode();
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  // ── Bulk delete ──────────────────────────────────────────────────────────────

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("transactions").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(`${ids.length} transação(ões) removida(s).`);
      exitSelectionMode();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Bulk category ────────────────────────────────────────────────────────────

  const bulkCategory = useMutation({
    mutationFn: async ({ ids, catId }: { ids: string[]; catId: string }) => {
      const { error } = await supabase
        .from("transactions")
        .update({ category_id: catId })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, { ids }) => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(`Categoria atualizada em ${ids.length} transação(ões).`);
      setBulkCatOpen(false);
      exitSelectionMode();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedArr = Array.from(selectedIds);
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <div className="space-y-4">
      <ImportCSVDialog open={importOpen} onClose={() => setImportOpen(false)} userId={userId} />

      {/* Bulk category dialog */}
      <Dialog open={bulkCatOpen} onOpenChange={(v) => !v && setBulkCatOpen(false)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Alterar categoria</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Aplicar a <strong>{selectedArr.length}</strong> transação(ões) selecionada(s).
          </p>
          <Select value={bulkCatId} onValueChange={setBulkCatId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a categoria…" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBulkCatOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={!bulkCatId || bulkCategory.isPending}
              onClick={() => bulkCategory.mutate({ ids: selectedArr, catId: bulkCatId })}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk person dialog */}
      {members.length > 0 && (
        <Dialog open={bulkPersonOpen} onOpenChange={(v) => !v && setBulkPersonOpen(false)}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>Alterar Quem?</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Aplicar a <strong>{selectedArr.length}</strong> transação(ões) selecionada(s).
            </p>
            <Select value={bulkPerson} onValueChange={setBulkPerson}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a pessoa…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOBODY}>— Ninguém —</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setBulkPersonOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={applyBulkPerson}>Aplicar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Month nav */}
        <div className="flex items-center gap-0.5 rounded-xl border bg-card px-1 py-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setRefDate((d) => addMonths(d ?? new Date(), -1))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <button
            className="text-xs font-medium px-2 min-w-[130px] text-center capitalize hover:text-primary transition-colors"
            onClick={() => setRefDate(null)}
            title="Clique para ver todos os meses"
          >
            {monthLabel}
          </button>
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setRefDate((d) => addMonths(d ?? new Date(), 1))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Type toggle */}
        <div className="flex rounded-xl border bg-card overflow-hidden text-xs">
          {(["all", "income", "expense"] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 transition-colors ${typeFilter === t ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground"}`}>
              {t === "all" ? "Todos" : t === "income" ? "Receitas" : "Despesas"}
            </button>
          ))}
        </div>

        {/* Person filter */}
        {members.length > 0 && (
          <div className="flex rounded-xl border bg-card overflow-hidden text-xs">
            <button onClick={() => setPersonFilter("")}
              className={`px-3 py-1.5 transition-colors ${personFilter === "" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground"}`}>
              Todos
            </button>
            {members.map((m) => (
              <button key={m} onClick={() => setPersonFilter(personFilter === m ? "" : m)}
                className={`px-3 py-1.5 transition-colors ${personFilter === m ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground"}`}>
                {m}
              </button>
            ))}
          </div>
        )}

        {/* Import + Select buttons */}
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setImportOpen(true)}>
          <FileUp className="h-3.5 w-3.5" /> Importar extrato
        </Button>
        <Button
          variant={selectionMode ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          {selectionMode ? "Cancelar seleção" : "Selecionar"}
        </Button>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar descrição ou valor…" className="pl-8 h-8 text-xs" />
          {search && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}>
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Summary row */}
      <div className="flex gap-4 text-xs text-muted-foreground px-1">
        <span><strong className="text-foreground">{filtered.length}</strong> lançamento(s)</span>
        <span className="text-income font-medium">+{brl(totalIncome)}</span>
        <span className="text-expense font-medium">−{brl(totalExpense)}</span>
        <span className={`font-semibold ${totalIncome - totalExpense >= 0 ? "text-income" : "text-expense"}`}>
          = {brl(totalIncome - totalExpense)}
        </span>
      </div>

      {/* Batch action bar */}
      {selectionMode && (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5 sticky top-0 z-10 shadow-sm">
          <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {allSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
            {allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
          </button>
          <span className="text-xs font-medium text-foreground ml-1">
            {selectedIds.size > 0 ? `${selectedIds.size} selecionada(s)` : "Clique nas transações para selecionar"}
          </span>
          {selectedIds.size > 0 && (
            <>
              <div className="ml-auto flex items-center gap-2">
                {members.length > 0 && (
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                    onClick={() => { setBulkPerson(NOBODY); setBulkPersonOpen(true); }}>
                    <User className="h-3.5 w-3.5" /> Alterar Quem?
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                  onClick={() => { setBulkCatId(""); setBulkCatOpen(true); }}>
                  <Tag className="h-3.5 w-3.5" /> Alterar categoria
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs text-expense hover:text-expense border-expense/30 hover:bg-expense/10">
                      <Trash2 className="h-3.5 w-3.5" /> Excluir {selectedIds.size}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir {selectedIds.size} transação(ões)?</AlertDialogTitle>
                      <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => bulkDelete.mutate(selectedArr)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          )}
        </div>
      )}

      {/* List */}
      <div className="rounded-2xl border bg-card p-4">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <TransactionList
            transactions={filtered}
            categories={categories}
            selectedIds={selectionMode ? selectedIds : undefined}
            onToggleSelect={selectionMode ? toggleSelect : undefined}
          />
        )}
      </div>
    </div>
  );
}
