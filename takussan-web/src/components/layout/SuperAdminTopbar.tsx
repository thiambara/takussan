'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import type { User } from '@/types/user';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { UserMenu } from './UserMenu';
import { GlobalSearch } from '@/components/admin/super/GlobalSearch';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/Logo';

interface SuperAdminTopbarProps {
  user: User;
  onMenuToggle?: () => void;
}

/**
 * Topbar for the super-admin layout, visuellement distincte de l'`AppTopbar` agence pour que
 * l'opérateur ne confonde jamais les deux contextes.
 *
 * TCK-358 : la surface reste sombre, mais par jetons — la barre porte `dark` et lit
 * `--background` / `--foreground` / `--primary` de la rampe sombre. Elle est ainsi d'un cran
 * plus sombre que la barre latérale (`--background` #1f1812 contre `--sidebar` #2a2018), ce que
 * l'ancien couple pierre 950 / pierre 900 faisait à la main. Le mécanisme et sa raison
 * sont documentés dans `SuperAdminSidebar`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-359 — le focus clavier s'arrête ICI AUSSI, pas seulement dans la barre latérale
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'objectif du ticket est « voit toujours où se trouve le focus » sur le SHELL. AC2 ne nomme que
 * `SuperAdminSidebar`, et cette barre est restée à `grep -c focus-visible` → 0 : sur `--background`
 * sombre (#1f1812) le contour par défaut du navigateur est le même quasi-rien qui a motivé le
 * ticket pour la barre latérale. Le bouton de menu est de surcroît le PREMIER focalisable après le
 * lien d'évitement en viewport mobile — traiter la moitié du shell revient à ne pas le traiter.
 *
 * Anneau mesuré le 2026-08-27, contexte `dark` (WCAG 2.x, seuil 3 de SC 1.4.11 pour du non-texte) :
 * `--ring` (#c87a52) sur `--background` (#1f1812) = **5,31:1**. Pas de `ring-offset` ici,
 * contrairement à la barre latérale : aucun élément de cette barre n'est rempli de `--primary`,
 * l'anneau ne peut donc pas se confondre avec le fond qu'il entoure. Le `hover:bg-muted` du bouton
 * ne change rien — en Tailwind v4, `ring-2` est un `box-shadow` sans `inset`, peint HORS de la
 * border-box, donc sur le fond du `<header>` et jamais sur le remplissage de survol.
 */
export function SuperAdminTopbar({ user, onMenuToggle }: SuperAdminTopbarProps) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');

  return (
    <header
      className={cn(
        'dark flex h-14 shrink-0 items-center gap-3 bg-background px-4 text-foreground ring-1 ring-primary/40',
      )}
    >
      <button
        type="button"
        onClick={onMenuToggle}
        aria-label={t('openMenu')}
        className="relative inline-flex size-9 items-center justify-center rounded-md text-foreground after:absolute after:-inset-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <Menu className="size-5" />
      </button>
      {/* TCK-621 — la marque, puis le nom de l'espace. Le lien garde son nom accessible d'origine
          (« Takussan · Console ») : le logo et la pastille se lisent ensemble, pas en deux temps.
          Ton `encre` : la barre est sous `.dark`, où `--foreground` est déjà le lin. */}
      <Link
        href="/super-admin"
        aria-label={t('superAdmin.topbarBrand')}
        className="inline-flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Logo nom={tCommon('appName')} nomVisible="des-sm" />
        <span
          aria-hidden="true"
          className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-[0.12em] text-primary"
        >
          {t('superAdmin.consoleBadge')}
        </span>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        {/* TCK-600 — Ctrl+K depuis toute page de la console ; absente sous le niveau `support`. */}
        <GlobalSearch />
        <LanguageSwitcher
          variant="compact"
          className="relative bg-muted text-foreground ring-border after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-foreground/15"
        />
        <UserMenu user={user} variant="dark" />
      </div>
    </header>
  );
}
