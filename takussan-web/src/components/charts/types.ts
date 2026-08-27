import type { ChartSeriesColor } from './palette';

export type ChartSeries = {
  name: string;
  values: number[];
  /**
   * La couleur de la série, prise dans les jetons `--chart-*` et NULLE PART AILLEURS (TCK-374).
   *
   * Le type était `string` : n'importe quelle classe Tailwind y entrait, y compris une couleur de
   * palette brute. `@/components/charts/palette` porte l'union admise et la mesure de contraste
   * qui la justifie.
   */
  color?: ChartSeriesColor;
};

export type ChartData = {
  labels: string[];
  series: ChartSeries[];
};
