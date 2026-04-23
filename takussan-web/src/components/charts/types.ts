export type ChartSeries = {
  name: string;
  values: number[];
  color?: string; // Tailwind class, e.g. 'stroke-emerald-500'
};

export type ChartData = {
  labels: string[];
  series: ChartSeries[];
};
