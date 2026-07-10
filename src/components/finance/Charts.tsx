import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
} from "recharts";
import { eachDayOfInterval, format } from "date-fns";

import { brl, netAmount, type Category, type Transaction, monthRange } from "@/lib/finance";

const CHART_COLORS = [
  "#22c55e", // green
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#f97316", // orange
  "#84cc16", // lime
];

export function DailyCashFlow({
  transactions,
  refDate,
}: {
  transactions: Transaction[];
  refDate?: Date;
}) {
  const data = useMemo(() => {
    const { start, end } = monthRange(refDate);
    const days = eachDayOfInterval({ start, end });
    return days.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      const day = format(d, "dd");
      let income = 0;
      let expense = 0;
      for (const t of transactions) {
        const refStr = t.due_date ?? t.transaction_date;
        if (refStr === key) {
          if (t.type === "income") income += netAmount(t);
          else expense += netAmount(t);
        }
      }
      return { day, income, expense };
    });
  }, [transactions, refDate]);

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString())}
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v: number) => brl(v)}
            labelFormatter={(l) => `Dia ${l}`}
          />
          <Bar dataKey="income" name="Receitas" fill="var(--income)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Despesas" fill="var(--expense)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExpenseByCategory({
  transactions,
  categories,
}: {
  transactions: Transaction[];
  categories: Category[];
}) {
  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const key = t.category_id ?? "uncategorized";
      map.set(key, (map.get(key) ?? 0) + netAmount(t));
    }
    const catMap = new Map(categories.map((c) => [c.id, c]));
    return Array.from(map.entries())
      .map(([id, value]) => ({
        name: catMap.get(id)?.name ?? "Sem categoria",
        icon: catMap.get(id)?.icon ?? "",
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, categories]);

  if (data.length === 0) {
    return (
      <div className="h-72 grid place-items-center text-sm text-muted-foreground">
        Sem despesas este mês.
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
            stroke="var(--card)"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v: number) => brl(v)}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value) => {
              const item = data.find((d) => d.name === value);
              return `${item?.icon ?? ""} ${value}`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
