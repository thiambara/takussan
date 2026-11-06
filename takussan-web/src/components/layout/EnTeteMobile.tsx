'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';
import { NotificationBell } from './NotificationBell';
import { FOCUS_RING } from './styles-de-la-barre';
import { raccourciDeLaPalette, useSurApple } from './useSurApple';

interface EnTeteMobileProps {
  /** Ouvre la palette de commandes, depuis ce bouton (le focus lui revient). Absent : pas de bouton. */
  readonly onOuvrirPalette?: (depuis: HTMLElement) => void;
}

/**
 * TCK-2491 (ADR-0090 §8) — sous `md`, l'en-tête compacte qui remplace la barre d'encre : la marque (vers
 * `/`), « Aller à » (la palette, sa seule porte au doigt — pas de clavier) et la cloche. Le reste de la
 * barre du haut vit dans la colonne, que le tiroir (« Menu » de la barre d'onglets) rend en entier,
 * menu du compte compris. Dès `md`, rien : la colonne porte la marque et la cloche.
 *
 * Une surface claire, celle de la page, séparée du contenu par un filet : la marque en ton `encre`. Les
 * deux boutons font 40 px (cible tactile), même anneau que la colonne.
 */
export function EnTeteMobile({ onOuvrirPalette }: EnTeteMobileProps) {
  const tCommon = useTranslations('common');
  const tPalette = useTranslations('nav.palette');
  const surApple = useSurApple();
  return (
    <header
      data-slot="en-tete-mobile"
      className="flex h-14 shrink-0 items-center gap-1 border-b border-border/70 bg-background pl-4 pr-2 md:hidden"
    >
      <Link href="/" className={cn('mr-auto inline-flex shrink-0 rounded-md px-1 py-1', FOCUS_RING)}>
        <Logo nom={tCommon('appName')} />
      </Link>
      {onOuvrirPalette ? (
        <button
          type="button"
          data-slot="ouvrir-palette"
          onClick={(event) => onOuvrirPalette(event.currentTarget)}
          aria-label={tPalette('titre')}
          // Une fenêtre étroite de bureau a un clavier : le raccourci y ouvre aussi la palette.
          aria-keyshortcuts={raccourciDeLaPalette(surApple)}
          className={cn(
            'inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground',
            FOCUS_RING,
          )}
        >
          <Search className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
      <NotificationBell align="end" />
    </header>
  );
}
