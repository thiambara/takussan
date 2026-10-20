'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { BookmarkPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CLES_DE_RECHERCHE, SEARCH_FILTER_KEYS, type SearchFilters } from '@/types/search';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// TCK-1037 (P69.04) — le dialogue tire zod, react-hook-form et le formulaire d'alerte : il se
// charge au premier clic, hors du JS initial de la liste (`zod-hors-des-pages-publiques.test.ts`).
const SaveSearchDialog = dynamic(() => import('./SaveSearchDialog').then((m) => m.SaveSearchDialog));

/**
 * "Save this search" CTA + naming modal — Wave 3 / TCK-047, revu par TCK-599.
 *
 * Lives on the results page next to the active-filter pills. On click:
 * 1. If logged out → TCK-599 (V13) : the dialog offers « Me prévenir des nouveaux biens »
 *    without an account ({@link PublicSearchAlertForm}), plus the login link that leads back
 *    to saving the search.
 * 2. Otherwise → open a compact dialog to name the saved search. On
 *    submit, POST `/api/saved-searches` with the current filters.
 *
 * TCK-599 (C6) — l'honnêteté du libellé voulue par TCK-552 est préservée : « Sauvegarder la
 * recherche » reste le geste, et l'alerte est une case DÉCOCHÉE. La confirmation dit exactement
 * ce qui a été créé — une recherche seule, ou une recherche avec son alerte quotidienne et les
 * canaux par lesquels l'API dit qu'elle arrivera (`alert_channels`), jamais une supposition.
 *
 * Kept under `components/favorites/**` since saved searches are a
 * bookmark-flavoured feature that sits next to favorites in the sidebar.
 */
export interface SaveSearchButtonProps {
  readonly filters: SearchFilters;
  readonly activeCount: number;
  readonly className?: string;
  /**
   * TCK-635 — la forme de l'en-tête des résultats : une icône et « Sauvegarder », et une infobulle
   * qui dit ce que fait le geste. Le nom accessible reste « Sauvegarder la recherche » (il CONTIENT
   * le mot affiché). Sans critère, le bouton n'est pas `disabled` mais `aria-disabled` : un bouton
   * désactivé ne reçoit pas le survol, et l'infobulle qui explique pourquoi ne s'ouvrirait jamais.
   */
  readonly compact?: boolean;
}

/**
 * TCK-340 — troisième définition des clés à ignorer, et la seule des trois qui avait DÉRIVÉ.
 *
 * Elle écartait `page` et `per_page` mais gardait `sort` : le tri finissait donc dans le
 * `criteria` d'une recherche sauvegardée, où il n'a rien à faire — ce n'est pas un critère,
 * c'est une préférence d'affichage, et le digest de notification côté serveur l'apparie contre
 * des biens neufs où l'ordre n'a aucun sens. Les deux autres définitions (`IGNORED_KEYS` et
 * `HIDDEN_FROM_TAGS`) écartaient bien les trois.
 *
 * Le critère est maintenant le RÔLE déclaré dans la table, pas une liste recopiée.
 */
export function filtersToCriteria(filters: SearchFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CLES_DE_RECHERCHE) {
    if (SEARCH_FILTER_KEYS[key].role !== 'filtre') continue;
    const value = filters[key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

export function SaveSearchButton({
  filters,
  activeCount,
  className = '',
  compact = false,
}: SaveSearchButtonProps) {
  const t = useTranslations('search.saveSearch');
  const [open, setOpen] = useState(false);
  // TCK-1037 — le dialogue n'est chargé, donc monté, qu'à la première ouverture ; il reste monté
  // ensuite (animation de fermeture). `ouverture` le remet à neuf à chaque ouverture.
  const [dejaOuvert, setDejaOuvert] = useState(false);
  const [ouverture, setOuverture] = useState(0);

  function handleOpen() {
    setDejaOuvert(true);
    setOuverture((n) => n + 1);
    setOpen(true);
  }

  return (
    <>
      {compact ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t('trigger')}
                aria-disabled={activeCount === 0 || undefined}
                onClick={() => {
                  if (activeCount > 0) handleOpen();
                }}
                className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50 lg:h-8 ${className}`}
              />
            }
          >
            <BookmarkPlus className="size-4" aria-hidden />
            <span className="max-lg:sr-only">{t('triggerShort')}</span>
          </TooltipTrigger>
          <TooltipContent>{activeCount > 0 ? t('triggerHint') : t('triggerHintEmpty')}</TooltipContent>
        </Tooltip>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          disabled={activeCount === 0}
          className={`inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        >
          <BookmarkPlus className="w-4 h-4" />
          <span>{t('trigger')}</span>
        </button>
      )}

      {dejaOuvert ? (
        <SaveSearchDialog
          open={open}
          onOpenChange={setOpen}
          filters={filters}
          criteria={filtersToCriteria(filters)}
          ouverture={ouverture}
        />
      ) : null}
    </>
  );
}
