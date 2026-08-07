import type { LucideIcon } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TopListChartProps {
  title: string;
  icon: LucideIcon;
  data: [string, number][];
  emptyLabel?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: { value: number; payload: { name: string } }[];
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]!;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-soft-lg">
      <p className="font-medium text-card-foreground">{entry.payload.name}</p>
      <p className="mt-0.5 text-muted-foreground">
        {entry.value} candidate{entry.value === 1 ? '' : 's'}
      </p>
    </div>
  );
}

/** A single-series "top N" horizontal bar chart -- one hue (no legend needed,
 * since there's only one measure per category), rounded data-ends, recessive
 * grid, hover tooltip. Colors reference the app's HSL design tokens directly
 * so the chart follows light/dark mode automatically. */
export function TopListChart({ title, icon: Icon, data, emptyLabel }: TopListChartProps) {
  const chartData = data.slice(0, 8).map(([name, count]) => ({ name, count }));
  const hasData = chartData.length > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                  tickFormatter={(value: string) => (value.length > 16 ? `${value.slice(0, 15)}…` : value)}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-16 text-center text-xs text-muted-foreground">{emptyLabel ?? 'No data yet'}</p>
        )}
      </CardContent>
    </Card>
  );
}
