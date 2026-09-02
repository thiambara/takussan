'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import type { User } from '@/types/user';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { ProfileSwitcher } from '@/components/profile/ProfileSwitcher';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';
import { SearchAutocomplete } from '@/components/search/SearchAutocomplete';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * TCK-371 (revue adverse) — l'anneau de focus des deux contrôles ÉCRITS À LA MAIN de la barre
 * haute. Les autres (`ProfileSwitcher`, `LanguageSwitcher`, `NotificationBell`, `UserMenu`)
 * passent par la primitive `Button` et portent son propre anneau.
 *
 * Ces deux-là n'en portaient AUCUN : ils retombaient sur la règle globale `* { outline-ring/50 }`
 * de `globals.css`, mesurée à **1,73:1** sur le fond de la barre — sous les 3:1 qu'exige
 * WCAG 1.4.11. `AdminShell` monte cette barre sur CHAQUE page `/admin`, et le hamburger est le
 * SEUL contrôle qui ouvre le tiroir de navigation sous `md`.
 *
 * Même anneau blanc, et pour la même raison, que `AdminSidebar` — dont le docblock porte les
 * mesures des trois fonds. Ici il n'y en a que deux, `bg-foreground` étant posé sur le `<header>` :
 *
 *   barre nue                    #1f1812   →   `white` 17,53:1   (`outline-ring` : 3,30:1)
 *   hamburger survolé `bg-white/10` #352f2a →  `white` 13,17:1   (`outline-ring` : 2,48:1 ✗)
 *
 * Décalage SORTANT : le `<header>` ne coupe sur aucun axe (pas d'`overflow`), et le lien du logo
 * est un lien EN LIGNE sans padding vertical — un anneau rentrant y affleurerait les glyphes.
 */
const ANNEAU_FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

interface AppTopbarProps {
  user: User;
  onMenuToggle?: () => void;
}

export function AppTopbar({ user, onMenuToggle }: AppTopbarProps) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');

  return (
    <header className={cn('flex h-14 shrink-0 items-center gap-3 bg-foreground px-4')}>
      <button
        type="button"
        onClick={onMenuToggle}
        aria-label={t('openMenu')}
        className={cn(
          'inline-flex size-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10 md:hidden',
          ANNEAU_FOCUS,
        )}
      >
        <Menu className="size-5" />
      </button>

      <Link
        href="/"
        className={cn('rounded-sm text-lg font-bold tracking-tighter text-white', ANNEAU_FOCUS)}
      >
        {tCommon('appName')}
      </Link>

      {/* TCK-505 (#1) — visible dès `lg` seulement, et compressible. À `md` la coque montre déjà
          la barre latérale (256 px) : un `min-w-80` posé au même pixel faisait déborder le
          document de +81 à +118 px sur les 58 pages `/app` et `/admin` à 768 px. */}
      <SearchAutocomplete
        variant="navbar"
        className="ml-6 hidden lg:block min-w-0 flex-1 max-w-xl"
      />

      {/* TCK-505 (#1) — le cluster rétrécit au lieu de pousser ; ses libellés (profil actif,
          prénom) se cachent sous `lg`, il ne reste que les icônes. */}
      <div className="ml-auto flex min-w-0 shrink items-center gap-2">
        <ProfileSwitcher user={user} />
        {/* TCK-017 — language switcher persisted via cookie + (when logged in)
            PATCH /api/users/me by the client inside the switcher. */}
        <LanguageSwitcher
          variant="compact"
          className="bg-white/10 text-white ring-white/10 hover:bg-white/20"
        />
        <NotificationBell />
        <UserMenu user={user} variant="dark" />
      </div>
    </header>
  );
}
