import { useState, useRef, useEffect } from "react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, Send, Key, Loader2, User, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

import { brl, netAmount, type Account, type Category, type Transaction } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const API_KEY_STORAGE = "gemini_api_key";

const PRESETS = [
  "Como está minha saúde financeira geral?",
  "Onde estou gastando mais e o que posso cortar?",
  "Minha taxa de poupança é adequada?",
  "Analise meu fluxo de caixa dos últimos meses.",
  "Quais são meus maiores riscos financeiros?",
  "Dê sugestões para aumentar meu patrimônio líquido.",
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
}

function buildContext(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
): string {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const now = new Date();

  const monthSummaries = Array.from({ length: 6 }, (_, i) => {
    const ref = subMonths(now, i);
    const start = startOfMonth(ref);
    const end = endOfMonth(ref);
    const label = format(ref, "MMM/yyyy", { locale: ptBR });

    const monthTx = transactions.filter((t) => {
      const d = new Date((t.due_date ?? t.transaction_date) + "T00:00:00");
      return d >= start && d <= end;
    });

    const income = monthTx
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + netAmount(t), 0);
    const expense = monthTx
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + netAmount(t), 0);

    const byCategory: Record<string, number> = {};
    for (const t of monthTx.filter((x) => x.type === "expense")) {
      const cat = t.category_id ? (catMap.get(t.category_id) ?? "Sem categoria") : "Sem categoria";
      byCategory[cat] = (byCategory[cat] ?? 0) + netAmount(t);
    }

    const topCats = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `  - ${k}: ${brl(v)}`)
      .join("\n");

    return `${label}: Receitas ${brl(income)} | Despesas ${brl(expense)} | Resultado ${brl(income - expense)}\n  Top gastos:\n${topCats || "  (sem dados)"}`;
  });

  const totalBalance = accounts
    .filter((a) => a.type !== "credit_card")
    .reduce((s, a) => s + Number(a.balance), 0);
  const totalDebt = accounts
    .filter((a) => a.type === "credit_card")
    .reduce((s, a) => s + Number(a.balance), 0);
  const totalInvested = accounts
    .filter((a) => a.type === "investment")
    .reduce((s, a) => s + Number(a.balance), 0);
  const monthlyReturns = accounts
    .filter((a) => a.type === "investment" && a.credit_limit)
    .reduce((s, a) => s + Number(a.balance) * ((a.credit_limit ?? 0) / 100), 0);

  const accountLines = accounts
    .map(
      (a) =>
        `  - ${a.name} (${a.type}): ${brl(Number(a.balance))}${
          a.type === "investment" && a.credit_limit ? ` @ ${a.credit_limit}% a.m.` : ""
        }`,
    )
    .join("\n");

  return `CONTEXTO FINANCEIRO — dados reais do usuário:

CONTAS E PATRIMÔNIO:
${accountLines}
Saldo líquido em contas: ${brl(totalBalance)}
Dívida em cartões: ${brl(totalDebt)}
Total investido: ${brl(totalInvested)}
Renda passiva mensal (investimentos): ${brl(monthlyReturns)}
Patrimônio líquido estimado: ${brl(totalBalance + totalInvested - totalDebt)}

RESUMO DOS ÚLTIMOS 6 MESES:
${monthSummaries.join("\n\n")}

TOTAL DE TRANSAÇÕES NA BASE: ${transactions.length}`;
}

function buildSystemPrompt(): string {
  return `Você é um analista financeiro pessoal experiente e empático, especializado em finanças domésticas brasileiras.
Você analisa os dados reais do usuário e fornece insights concretos, práticos e personalizados — não genéricos.
Responda sempre em português do Brasil, de forma clara e direta.
Use números reais dos dados fornecidos para embasar cada ponto.
Seja honesto sobre problemas mas construtivo nas sugestões.
Use formatação com bullet points e seções quando ajudar a organizar a resposta.`;
}

export function AIAnalysisTab({ transactions, categories, accounts }: Props) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? "");
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyInput, setKeyInput] = useState(apiKey);
  const [showKeySection, setShowKeySection] = useState(!apiKey);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function saveKey() {
    const k = keyInput.trim();
    setApiKey(k);
    localStorage.setItem(API_KEY_STORAGE, k);
    setShowKeySection(false);
  }

  async function send(userMessage: string) {
    if (!apiKey) { setShowKeySection(true); return; }
    if (!userMessage.trim() || loading) return;

    const context = buildContext(transactions, categories, accounts);
    const systemPrompt = buildSystemPrompt();

    const newMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const apiMessages = newMessages.map((m, idx) => ({
      role: m.role,
      content:
        m.role === "user" && idx === 0
          ? `${systemPrompt}\n\n${context}\n\n---\nPergunta: ${m.content}`
          : m.content,
    }));

    try {
      // Convert history to Gemini format (role: "user" | "model")
      const geminiContents = apiMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: geminiContents,
            generationConfig: { maxOutputTokens: 1500 },
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `Erro ${res.status}`);
      }

      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "(sem resposta)";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Erro ao contatar a API: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
      {/* API Key section */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <button
          className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-muted/30 transition-colors"
          onClick={() => setShowKeySection((v) => !v)}
        >
          <Key className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium flex-1">
            {apiKey ? "Chave Gemini configurada" : "Configurar chave Gemini (gratuita)"}
          </span>
          <span
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-medium",
              apiKey
                ? "bg-income/15 text-income"
                : "bg-warning/15 text-warning-foreground",
            )}
          >
            {apiKey ? "Ativa" : "Necessária"}
          </span>
          {showKeySection ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {showKeySection && (
          <div className="px-5 pb-4 space-y-3 border-t">
            <p className="text-xs text-muted-foreground pt-3">
              A chave é armazenada <strong>apenas no seu navegador</strong>. O Gemini tem{" "}
              <strong>free tier generoso</strong> (1.500 req/dia grátis). Obtenha em{" "}
              <span className="font-mono text-primary">aistudio.google.com</span> → Get API key.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={keyVisible ? "text" : "password"}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Cole aqui sua chave do Google AI Studio…"
                  className="pr-16 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setKeyVisible((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {keyVisible ? "Ocultar" : "Ver"}
                </button>
              </div>
              <Button size="sm" onClick={saveKey}>Salvar</Button>
            </div>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 rounded-2xl border bg-card flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="text-center space-y-4 py-6">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Analista Financeiro IA</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Faço análises personalizadas com seus dados reais. Escolha uma pergunta ou escreva a sua.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    disabled={!apiKey || loading}
                    className="px-3 py-1.5 rounded-xl border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    {p}
                  </button>
                ))}
              </div>
              {!apiKey && (
                <p className="text-xs text-warning font-medium">
                  Configure sua chave Gemini acima para começar.
                </p>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}
            >
              <div
                className={cn(
                  "h-8 w-8 rounded-xl grid place-items-center shrink-0",
                  m.role === "user" ? "bg-primary/15 text-primary" : "bg-muted",
                )}
              >
                {m.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted rounded-tl-sm",
                )}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-xl bg-muted grid place-items-center shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analisando seus dados…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Presets in footer when conversation started */}
        {messages.length > 0 && (
          <div className="border-t px-4 py-2 flex gap-1.5 overflow-x-auto scrollbar-none">
            {PRESETS.slice(0, 4).map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                disabled={loading || !apiKey}
                className="shrink-0 px-2.5 py-1 rounded-lg border text-[11px] text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t p-3 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send(input))}
            placeholder={apiKey ? "Pergunte algo sobre suas finanças…" : "Configure a chave Gemini para começar"}
            disabled={!apiKey || loading}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={() => send(input)}
            disabled={!input.trim() || !apiKey || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
