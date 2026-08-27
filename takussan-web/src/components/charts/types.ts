export type ChartSeries = {
  name: string;
  values: number[];
  color?: string; // Classe Tailwind sur jeton, p. ex. 'stroke-chart-1'
};

export type ChartData = {
  labels: string[];
  series: ChartSeries[];
};
