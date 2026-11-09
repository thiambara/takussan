import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Logo } from '@/components/brand/Logo';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';
import { cn } from '@/lib/utils';

import { PiedDeLien } from './PiedDeLien';

/**
 * TCK-2505 — la COQUE DE LIEN : l'enveloppe des pages qu'on ouvre depuis un SMS, un WhatsApp ou un
 * courriel (paiement d'une échéance, réclamation du Radar, document partagé, confirmation et
 * désinscription d'une alerte, désabonnement du résumé).
 *
 * Elle est NUE : ni la `Navbar` publique (recherche, favoris, comparateur), ni le `Footer` de la
 * marketplace. La barre d'onglets du téléphone et le dock du comparateur s'effacent d'eux-mêmes sur
 * ces chemins (`porteLaBarrePublique`, `estPageDeLien` de `@/lib/navigation/barre-publique`).
 *
 * - Téléphone : la page est la carte — l'en-tête de lien (`EnTeteDeLien`, posé par la page, qui seule
 *   connaît l'émetteur) colle en haut, une barre d'action éventuelle (`BasDeLien`) colle en bas.
 * - Bureau : un bandeau de marque, puis la même page dans une carte étroite centrée sur un fond uni,
 *   et le pied minimal dessous.
 *
 * Composant SERVEUR, sans état : `useTranslations` vaut des deux côtés, et ses enfants interactifs
 * portent leur propre `'use client'`.
 */
export function CoqueDeLien({
  children,
  largeur = 'carte',
  className,
}: {
  readonly children: ReactNode;
  /**
   * `carte` (défaut) : en bureau, une carte de 480 px sur fond uni. `large` : en bureau, la page en
   * pleine largeur (1120 px), pour une page à deux colonnes (la réclamation et son formulaire).
   */
  readonly largeur?: 'carte' | 'large';
  readonly className?: string;
}) {
  const tCommon = useTranslations('common');
  return (
    <div className={cn('flex min-h-dvh flex-col bg-background', largeur === 'carte' && 'lg:bg-muted')} data-coque-lien="">
      <div className={cn('hidden border-b border-border bg-card', largeur === 'carte' && 'lg:block')}>
        <div className="mx-auto flex h-16 max-w-[1120px] items-center px-8">
          <LienLocalise href="/" className="transition-opacity hover:opacity-80">
            <Logo nom={tCommon('appName')} />
          </LienLocalise>
        </div>
      </div>
      <main
        id={CONTENU_PRINCIPAL_ID}
        tabIndex={-1}
        className={cn('flex flex-1 flex-col focus:outline-none', largeur === 'carte' && 'lg:flex-none lg:px-4 lg:pt-12')}
      >
        <div
          className={cn(
            'flex flex-1 flex-col bg-background',
            largeur === 'carte' && [
              'lg:mx-auto lg:w-full lg:max-w-[480px] lg:flex-none lg:rounded-2xl lg:border lg:border-border',
              'lg:shadow-[0_24px_60px_-32px_color-mix(in_oklab,var(--shadow-color)_45%,transparent)]',
            ],
            className,
          )}
        >
          {children}
        </div>
      </main>
      <PiedDeLien />
    </div>
  );
}
