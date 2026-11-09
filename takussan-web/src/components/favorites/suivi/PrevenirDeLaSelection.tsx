'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, ChevronRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PublicSearchAlertForm } from '@/components/favorites/PublicSearchAlertForm';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { alerteDeLaSelection } from '@/lib/favoris-suivi';
import type { PropertyListItem } from '@/types/property';

export interface PrevenirDeLaSelectionProps {
  /** La sélection de l'appareil, plus récent d'abord. */
  readonly biens: readonly PropertyListItem[];
}

/**
 * TCK-2508 — « Prévenez-moi quand un bien comme ceux-ci arrive à Mermoz » (maquette `?p=favoris&a=a`,
 * écran anonyme) : l'alerte SANS compte de TCK-599 (ADR-0050 §4), par `PublicSearchAlertForm`, tel
 * quel — un contact, un consentement explicite, rien ne part avant la confirmation.
 *
 * « Comme ceux-ci » : le quartier le plus représenté de la sélection, et sa transaction quand elle
 * est commune ({@link alerteDeLaSelection}). Rien n'est rendu quand aucun bien ne dit où il est.
 */
export function PrevenirDeLaSelection({ biens }: PrevenirDeLaSelectionProps) {
  const t = useTranslations('favorites.suivi.prevenir');
  const tAlerte = useTranslations('search.publicAlert');
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);

  const alerte = alerteDeLaSelection(biens);
  if (!alerte) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        data-testid="prevenir-de-la-selection"
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:max-w-xl"
      >
        <span
          className="inline-flex size-10 flex-none items-center justify-center rounded-xl bg-muted text-primary-deep"
          aria-hidden="true"
        >
          <Bell className="size-5" />
        </span>
        <span className="min-w-0 flex-1 text-[15px] leading-snug text-foreground">
          {t.rich('declencheur', {
            lieu: alerte.lieu,
            geste: (morceau) => <span className="font-medium">{morceau}</span>,
          })}
        </span>
        <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
      </button>

      <Sheet open={ouvert} onOpenChange={setOuvert}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-popover px-4 pb-7 pt-5 lg:bottom-8 lg:mx-auto lg:max-w-md lg:rounded-3xl"
        >
          <div className="flex items-start justify-between gap-3">
            <SheetTitle className="font-display text-xl font-semibold tracking-[-0.02em]">
              {t('titre', { lieu: alerte.lieu })}
            </SheetTitle>
            <SheetClose
              aria-label={t('fermer')}
              className="-m-2 inline-flex size-11 flex-none items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" aria-hidden="true" />
            </SheetClose>
          </div>
          <SheetDescription className="mb-4 mt-1 text-sm text-muted-foreground">{tAlerte('dialogBody')}</SheetDescription>
          <PublicSearchAlertForm
            criteria={alerte.criteria as Record<string, unknown>}
            name={t('nom', { lieu: alerte.lieu })}
            loginHref={`/auth/login?redirect=${encodeURIComponent(pathname)}`}
            onClose={() => setOuvert(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
