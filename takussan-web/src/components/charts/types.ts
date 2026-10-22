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

/**
 * Une série de `LineChart` admet un point absent (P127.02, TCK-1355) : `null` est un mois sans rien
 * à mesurer — un portefeuille sans bien à occuper —, et le tracé s'y coupe. `BarChart` n'en admet
 * pas : une barre absente et une barre à zéro s'y confondraient.
 */
export type LineChartSeries = Omit<ChartSeries, 'values'> & { values: (number | null)[] };

export type LineChartData = {
  labels: string[];
  series: LineChartSeries[];
};
