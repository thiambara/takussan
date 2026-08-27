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
 * ⚠ **Les trois tons ont changé de jeton à la fusion de TCK-381, et le point 1 ci-dessus a
 * gouverné la forme retenue.** TCK-374 avait traduit `success` par `bg-accent/10` et `warning`
 * par `bg-chart-3/15` — le premier est l'accent de MARQUE, le second un jeton de SÉRIE de
 * graphique : deux emprunts, faute d'un jeton qui dise l'état. TCK-381 a créé `--success`,
 * `--info` et repris `--warning` de TCK-358 exactement pour ça (cf. leur docblock dans
 * `globals.css`, qui porte les contrastes mesurés dans les deux thèmes) ; les tons les prennent
 * désormais.
 *
 * Ce que la fusion N'A PAS repris de TCK-381 : l'encre assortie (`text-success`, `text-warning`,
 * `text-destructive`) qu'il posait sur le conteneur. C'est la déclaration morte du point 1, sous
 * un autre nom — les quatre nœuds de texte de la tuile fixent tous leur propre couleur, aucun
 * n'hérite de celle du conteneur. *Une mesure ne cesse pas de valoir parce que la valeur a
 * changé.*
 *
 * `--chart-3` n'a donc plus aucune occurrence DANS CE PÉRIMÈTRE hors des séries, et son exemption
 * dans `SURFACES` de `scripts/check-chart-contrast.mjs` est tombée avec lui — cette garde-là fait
 * échouer une exemption qui ne correspond plus à rien.
 *
 * ⚠ **Ce paragraphe a écrit « plus AUCUNE occurrence » pendant une journée, et c'était faux d'une
 * occurrence** : `components/profile/ProfileBadge.tsx` rend `bg-chart-3/20 text-chart-3`. Elle
 * échappait au constat pour la raison exacte qui la rend coûteuse — elle est hors du périmètre de
 * la garde, qui ne lit que `components/charts` et `components/reporting`. *Un « aucune » vérifié
 * dans le périmètre d'une garde est un « aucune dans ce périmètre ».* (Mesuré en implémentant
 * TCK-404, 2026-08-27.)
 *
 * `--chart-3` n'est plus écarté des séries : TCK-404 a corrigé sa valeur claire (2,57:1 → 3,55:1)
 * et l'ordre de `./palette` est redevenu `1,2,3,4,5`.
 */
const accents: Record<NonNullable<Props['accent']>, string> = {
  default: 'bg-card',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
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
