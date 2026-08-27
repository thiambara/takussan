import { cn } from '@/lib/utils';

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  trend?: 'up' | 'down' | 'flat';
  accent?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
};

/**
 * Le ton de la tuile, sur les jetons du design system (TCK-374).
 *
 * ⚠ Les trois tons portaient une palette Tailwind brute — fonds emerald / amber / rose en échelon
 * 50, encre assortie en échelon 900 — dans un fichier de `src/components/charts`, donc dans le
 * périmètre de l'AC2 du ticket. Deux mesures gouvernent la traduction retenue :
 *
 *   1. **L'encre en échelon 900 ne servait à rien.** Les trois enfants de la tuile fixent leur propre
 *      couleur (`text-muted-foreground` pour le libellé et l'indice, `text-foreground` pour la
 *      valeur) : la couleur du conteneur n'était héritée par aucun d'eux. Elle est donc retirée
 *      plutôt que traduite — traduire une déclaration morte, c'est la faire vivre.
 *   2. **Les `-50` ne se retournaient pas en thème sombre.** `#ecfdf5` reste `#ecfdf5` sous
 *      `.dark`, avec `text-foreground` à `#fcf9f3` par-dessus : 1,08:1. Un jeton avec canal alpha
 *      (`/10`) se pose sur `--card` et suit le thème par construction.
 *
 * `--chart-3` porte l'ambre de la charte. Il est écarté des SÉRIES pour son contraste en clair
 * (cf. `./palette`), mais ici il n'est qu'un FOND derrière `text-foreground` : à 15 % sur blanc il
 * rend 16,3:1 avec l'encre, et le seuil de 3:1 des objets graphiques ne s'y applique pas.
 */
const accents: Record<NonNullable<Props['accent']>, string> = {
  default: 'bg-card',
  success: 'bg-accent/10',
  warning: 'bg-chart-3/15',
  danger: 'bg-destructive/10',
};

const trendMarks: Record<NonNullable<Props['trend']>, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

/**
 * Reusable KPI tile used by every dashboard (TCK-032).
 */
export function StatCard({ label, value, hint, trend, accent = 'default', className }: Props) {
  return (
    <div className={cn('rounded-2xl p-6', accents[accent], className)}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 flex items-baseline gap-2 text-2xl font-bold text-foreground">
        {value}
        {trend && (
          <span aria-hidden className="text-sm text-muted-foreground">
            {trendMarks[trend]}
          </span>
        )}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
