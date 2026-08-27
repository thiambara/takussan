'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PaginationProps {
  readonly page: number;
  readonly lastPage: number;
  readonly onChange: (next: number) => void;
  /**
   * Remplace le « Page X sur Y » intégré par un résumé fourni par l'appelant — un compte de
   * résultats, une taille de page, les deux. **Sa présence bascule la disposition** : résumé à
   * gauche, la paire précédent/suivant groupée à droite. Sans lui, la disposition d'origine
   * (précédent · position · suivant) ne bouge pas.
   *
   * ⚠ Ajouté par TCK-380, et pour une raison précise : `PropertyPagination` — sept points d'appel
   * dans `/app` — rendait sa propre paire de boutons et recalculait `page ± 1`. Ce sont les DEUX
   * choses que cette primitive existe pour décider. Le reste (l'état dans l'URL, le sélecteur de
   * densité) n'est PAS de la duplication : c'est ce que le docblock ci-dessous appelle « trois et
   * pas une », et ça reste chez l'appelant.
   */
  readonly summary?: ReactNode;
  readonly className?: string;
}

/**
 * L'UNIQUE pagination des consoles `/admin` et `/super-admin`.
 *
 * Relevé le 2026-08-26 : le dépôt portait **cinq** paginations — `search/Pagination`,
 * `super-admin/Pagination`, `property-dashboard/PropertyPagination`, plus une réécriture en
 * fonction locale dans `admin/AuditTrail` et une autre dans `admin/TeamConsole`. Les deux
 * dernières rendaient le même « Précédent / Page X sur Y / Suivant » que celle-ci, à la classe
 * près. TCK-373 les ramène ici et le compte tombe à trois : celle-ci, celle de la recherche
 * publique (numérotée, avec ellipses) et celle du tableau de bord des biens (qui porte en plus le
 * sélecteur de densité et écrit la page dans l'URL).
 *
 * ⚠ **Depuis TCK-380, la troisième n'en est plus une.** `PropertyPagination` ne rend plus ni
 * boutons ni arithmétique de page : elle passe son résumé à `summary` et son `goTo` à `onChange`,
 * et ne garde que ce qui la distingue vraiment — l'écriture de la page dans l'URL. Le compte est
 * donc à DEUX composants qui dessinent une pagination, plus un adaptateur d'URL.
 *
 * **Trois et pas une** : ces trois-là ne sont pas la même chose sous trois noms. Celle-ci pilote
 * un état React, celle de la recherche est numérotée parce qu'on y saute de page en page, et
 * celle des biens est pilotée par l'URL. Fusionner les trois produirait un composant à trois
 * modes, c'est-à-dire trois composants dans un fichier.
 *
 * ## Ce qu'elle décide
 *
 * - **Elle ne rend rien sur une seule page.** Une pagination à une page est un contrôle qui ne
 *   contrôle rien ; l'afficher désactivé occupe une ligne et n'apprend rien.
 * - **La position est en `aria-live="polite"`** : à la navigation clavier, le changement de page
 *   ne déplace pas le focus, donc rien ne serait annoncé sans ça.
 * - Elle **borne** ce qu'elle émet (`Math.max(1, …)` / `Math.min(lastPage, …)`) plutôt que de
 *   compter sur ses boutons désactivés : un appelant qui la piloterait au clavier ou par un test
 *   ne peut pas la faire sortir de l'intervalle.
 *
 * Contrairement aux autres primitives de `console/`, celle-ci traduit elle-même
 * (`console.pagination`). C'est assumé : elle est intrinsèquement interactive, donc client dans
 * tous les cas — la raison qui interdit `useTranslations` à `DataTable` et `PageHeader` (rester
 * importables depuis un server component) ne s'applique pas ici, et trois libellés passés en
 * props à chacun des six appels auraient été trois occasions de les écrire différemment.
 */
export function Pagination({ page, lastPage, onChange, summary, className }: PaginationProps) {
  // Le hook se place AVANT la sortie anticipée : après, ce serait un hook conditionnel,
  // que le React Compiler (ADR-0015) refuse.
  const t = useTranslations('console.pagination');

  // ⚠ La sortie anticipée ne vaut QUE pour la forme sans résumé. Un appelant qui passe un résumé
  // y met un compte de résultats et un sélecteur de densité : les faire disparaître sur un jeu
  // qui tient en une page serait un changement de comportement, pas une simplification.
  if (lastPage <= 1 && !summary) return null;

  const precedent = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={page <= 1}
      onClick={() => onChange(Math.max(1, page - 1))}
    >
      <ChevronLeft aria-hidden />
      {t('previous')}
    </Button>
  );
  const suivant = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={page >= lastPage}
      onClick={() => onChange(Math.min(lastPage, page + 1))}
    >
      {t('next')}
      <ChevronRight aria-hidden />
    </Button>
  );

  if (summary) {
    return (
      <nav
        aria-label={t('aria')}
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground',
          className,
        )}
      >
        {summary}
        <div className="flex items-center gap-2">
          {precedent}
          {suivant}
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label={t('aria')}
      className={cn('flex items-center justify-between gap-3 text-sm text-muted-foreground', className)}
    >
      {precedent}
      <span aria-live="polite">
        {t('position', { page: String(page), lastPage: String(lastPage) })}
      </span>
      {suivant}
    </nav>
  );
}

export type { PaginationProps };
