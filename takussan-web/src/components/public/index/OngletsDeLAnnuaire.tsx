'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition, type MouseEvent } from 'react';

import { BarreDeChargement } from '@/components/shared/BarreDeChargement';
import { LienLocalise } from '@/components/shared/LienLocalise';
import type { Locale } from '@/i18n/config';
import { hrefLocalise } from '@/i18n/navigation';
import type { RessourceDeProfil } from '@/lib/queries/public-profiles';

export type OngletDeLAnnuaire = {
  readonly cible: RessourceDeProfil;
  /** Sans langue : `LienLocalise` et `hrefLocalise` l'ajoutent. */
  readonly href: string;
  readonly libelle: string;
  readonly compte: number | null;
  readonly actif: boolean;
};

/**
 * Les onglets Agences · Agents de l'annuaire — TCK-2521.
 *
 * Ce sont de VRAIS liens (`aria-current="page"`, un `href` par onglet) : l'URL choisit l'onglet, la
 * page reste rendue côté serveur (AC3), un clic molette ou ⌘-clic ouvre l'autre onglet ailleurs.
 *
 * ⚠ Ce composant n'existe que pour le retour du clic (revue du 2026-11-09). La page attend trois
 * appels à l'API et n'a pas de `loading.tsx` (le 404 du site public en dépend) : entre le clic et
 * la réponse, rien ne bougeait. Un clic simple passe donc par `useTransition`, comme les filtres
 * (`ProfileFilters`) : l'onglet demandé montre un indicateur, une barre court en haut de l'écran, et
 * la `<nav>` porte `data-en-cours`, que `IndexDeProfils` lit pour estomper la liste périmée.
 */
export function OngletsDeLAnnuaire({
  onglets,
  aria,
}: {
  readonly onglets: readonly OngletDeLAnnuaire[];
  readonly aria: string;
}) {
  const t = useTranslations('publicProfileIndex.filters');
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [enCours, demarrer] = useTransition();
  const [demande, setDemande] = useState<RessourceDeProfil | null>(null);

  function ouvrir(evenement: MouseEvent<HTMLAnchorElement>, onglet: OngletDeLAnnuaire) {
    // Clic modifié ou bouton du milieu : le navigateur fait ce qu'on lui demande (nouvel onglet…).
    if (
      onglet.actif ||
      evenement.defaultPrevented ||
      evenement.button !== 0 ||
      evenement.metaKey ||
      evenement.ctrlKey ||
      evenement.shiftKey ||
      evenement.altKey
    ) {
      return;
    }
    evenement.preventDefault();
    setDemande(onglet.cible);
    demarrer(() => router.push(hrefLocalise(onglet.href, locale)));
  }

  return (
    <nav
      aria-label={aria}
      aria-busy={enCours}
      data-en-cours={enCours || undefined}
      className="-mx-4 flex border-b border-border px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:shrink-0 lg:rounded-full lg:border-0 lg:bg-muted lg:p-1"
    >
      {enCours && <BarreDeChargement libelle={t('loading')} position="ecran" />}
      {onglets.map((onglet) => (
        <LienLocalise
          key={onglet.cible}
          href={onglet.href}
          aria-current={onglet.actif ? 'page' : undefined}
          onClick={(e) => ouvrir(e, onglet)}
          className={
            'relative flex h-11 flex-1 items-center justify-center gap-1.5 text-[0.9375rem] font-medium outline-none transition-colors focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-primary ' +
            'lg:h-auto lg:flex-none lg:rounded-full lg:px-5 lg:py-2 ' +
            (onglet.actif
              ? 'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary lg:bg-card lg:shadow-sm lg:after:hidden'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          {enCours && demande === onglet.cible && (
            <Loader2 data-attente="onglet" className="size-3.5 animate-spin" aria-hidden />
          )}
          {onglet.libelle}
          {onglet.compte !== null && (
            <span className="text-[0.8125rem] font-normal tabular-nums text-muted-foreground">{onglet.compte}</span>
          )}
        </LienLocalise>
      ))}
    </nav>
  );
}
