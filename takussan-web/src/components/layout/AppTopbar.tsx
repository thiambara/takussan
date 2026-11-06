'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { User } from '@/types/user';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { ProfileSwitcher } from '@/components/profile/ProfileSwitcher';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';
import { SearchAutocomplete } from '@/components/search/SearchAutocomplete';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/Logo';
import { PastilleCredits } from '@/components/credits/PastilleCredits';
import { voitLePortefeuille } from '@/lib/navigation/acces-app';

/**
 * TCK-371 (revue adverse) — l'anneau de focus des deux contrôles ÉCRITS À LA MAIN de la barre
 * haute. Les autres (`ProfileSwitcher`, `LanguageSwitcher`, `NotificationBell`, `UserMenu`)
 * passent par la primitive `Button` et portent son propre anneau.
 *
 * Ces deux-là n'en portaient AUCUN : ils retombaient sur la règle globale `* { outline-ring }`
 * de `globals.css`, mesurée à **1,73:1** sur le fond de la barre — sous les 3:1 qu'exige
 * WCAG 1.4.11. `AppShell` monte cette barre sur CHAQUE page de `/app` — section d'agence comprise
 * depuis TCK-649.
 *
 * TCK-2481 — le hamburger a quitté la barre : sous `md`, « Menu » de la barre d'onglets
 * (`BarreDOnglets`) est la seule porte du tiroir. Il ne restait qu'un contrôle écrit à la main ici,
 * le lien du logo.
 *
 * TCK-2482 — le bouton de la palette de commandes en est un second : il porte le même anneau. Son
 * fond `bg-white/10` (`hover:bg-white/20`) compose sur la barre ; le blanc plein y reste au-dessus
 * de 3:1 (`AppTopbar.a11y.test.tsx` le mesure).
 *
 * Même anneau blanc, et pour la même raison, que la barre latérale sombre de l'ancienne console
 * d'administration (TCK-371). Le logo n'a qu'un fond, `bg-foreground` étant posé sur le
 * `<header>` :
 *
 *   barre nue                    #1f1812   →   `white` 17,53:1   (`outline-ring` : 3,30:1)
 *
 * Décalage SORTANT : le `<header>` ne coupe sur aucun axe (pas d'`overflow`), et le lien du logo
 * est un lien EN LIGNE sans padding vertical — un anneau rentrant y affleurerait les glyphes.
 */
const ANNEAU_FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

/** TCK-2482 (A11) — `⌘ K` sur Apple, `Ctrl K` ailleurs ; `Ctrl K` au rendu serveur, sans écart d'hydratation. */
const sAbonnerARien = () => () => {};
const estSurApple = () => /Mac|iPhone|iPad/.test(navigator.userAgent);
const jamaisSurApple = () => false;

interface AppTopbarProps {
  readonly user: User;
  /** TCK-2482 — ouvre la palette de commandes, depuis ce bouton. Absent : pas de bouton (plein écran, tests). */
  readonly onOuvrirPalette?: (depuis: HTMLElement) => void;
}

export function AppTopbar({ user, onOuvrirPalette }: AppTopbarProps) {
  const tCommon = useTranslations('common');
  const tPalette = useTranslations('nav.palette');
  const surApple = useSyncExternalStore(sAbonnerARien, estSurApple, jamaisSurApple);

  return (
    <header className={cn('relative flex h-14 shrink-0 items-center gap-3 bg-foreground px-4')}>
      {/* TCK-621 — la marque, et non plus le nom en texte nu : ton `clair` sur la barre d'encre. Sous
          640 px, le symbole seul — la barre porte aussi la recherche (cf. `Logo`, `nomVisible`). */}
      <Link href="/" className={cn('shrink-0 rounded-sm', ANNEAU_FOCUS)}>
        <Logo nom={tCommon('appName')} ton="clair" nomVisible="des-sm" />
      </Link>

      {/* TCK-505 (#1) — visible dès `lg` seulement, et compressible. À `md` la coque montre déjà
          la barre latérale (256 px) : un `min-w-80` posé au même pixel faisait déborder le
          document de +81 à +118 px sur 58 pages de la console à 768 px. */}
      <SearchAutocomplete
        variant="navbar"
        className="ml-6 hidden lg:block min-w-0 flex-1 max-w-xl"
      />

      {/* TCK-505 (#1) — le cluster rétrécit au lieu de pousser ; ses libellés (profil actif,
          prénom) se cachent sous `lg`, il ne reste que les icônes. */}
      <div className="ml-auto flex min-w-0 shrink items-center gap-2">
        {/* TCK-2482 (A11) — la palette : premier contrôle du groupe, à toutes les largeurs (sous `md`,
            c'est sa seule porte : pas de clavier), icône seule sous `lg`. Le nom accessible commence par
            le texte visible (WCAG 2.5.3). Écrit à la main : il porte `ANNEAU_FOCUS`, comme le logo. */}
        {onOuvrirPalette ? (
          <button
            type="button"
            data-slot="ouvrir-palette"
            onClick={(event) => onOuvrirPalette(event.currentTarget)}
            aria-label={tPalette('titre')}
            aria-keyshortcuts="Control+K Meta+K"
            className={cn(
              'relative inline-flex size-9 shrink-0 items-center justify-center gap-2 rounded-md bg-white/10 text-sm text-white/90 after:absolute after:-inset-1 hover:bg-white/20 lg:w-auto lg:px-2.5',
              ANNEAU_FOCUS,
            )}
          >
            <Search className="size-4" aria-hidden />
            <span className="hidden lg:inline">{tPalette('ouvrir')}</span>
            <kbd aria-hidden className="hidden rounded bg-white/15 px-1.5 font-mono text-[11px] lg:inline">
              {surApple ? tPalette('raccourciMac') : tPalette('raccourciAutre')}
            </kbd>
          </button>
        ) : null}
        <ProfileSwitcher user={user} />
        {/* TCK-642 — le solde de l'espace actif, juste après le sélecteur qui le choisit. Dès `md`
            seulement : sous ce seuil, il est dans le tiroir (entrée « Crédits »). */}
        {voitLePortefeuille(user.roles) ? <PastilleCredits ton="sombre" className="hidden md:inline-flex" /> : null}
        {/* TCK-017 — language switcher persisted via cookie + (when logged in)
            PATCH /api/users/me by the client inside the switcher. */}
        <LanguageSwitcher
          variant="compact"
          className="relative bg-white/10 text-white ring-white/10 after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-white/20"
        />
        <NotificationBell />
        <UserMenu user={user} variant="dark" />
      </div>
    </header>
  );
}
