'use client';

import Link from 'next/link';
import { ChevronRight, Mail, Send, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';

import { SymboleTakussan } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';

/**
 * TCK-2606 — les pièces des écrans « Mot de passe oublié », « Lien envoyé » et « Vérifier
 * l'adresse » (maquette `app-entree-connexion`, approche a) : le message tel qu'il attend dans la
 * boîte, les rangées d'action, l'encadré du code SMS, le disque d'icône.
 */

type Icone = ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' }>;

/**
 * Le message tel qu'il attend dans la boîte (`ApercuMail`) : l'écran montre quoi chercher, pas une
 * icône. L'objet et la première ligne sont ceux du VRAI message de l'API
 * (`lang/*\/notifications.php`, `password_reset` et `registration`), recopiés dans le dictionnaire
 * du front, qui possède le texte affiché.
 */
export function ApercuDuMessage({ objet, extrait, className }: { readonly objet: string; readonly extrait: string; readonly className?: string }) {
  const t = useTranslations('auth.boite');
  return (
    <div data-apercu-du-message="" className={cn('relative rounded-2xl bg-secondary/60 px-3.5 pb-3.5 pt-4', className)}>
      <p className="flex items-center gap-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <Mail className="size-3.5" strokeWidth={2} aria-hidden="true" />
        {t('titre')}
      </p>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-card p-3 shadow-[0_10px_22px_-16px_color-mix(in_oklab,var(--shadow-color)_55%,transparent)]">
        <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-secondary">
          <SymboleTakussan className="h-[17px] w-6" />
        </span>
        <div className="min-w-0 flex-1 leading-snug">
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{t('expediteur')}</span>
            <span className="flex-none text-xs text-muted-foreground">{t('instant')}</span>
          </p>
          <p className="truncate text-sm font-medium">{objet}</p>
          <p className="truncate text-[13px] text-muted-foreground">{extrait}</p>
        </div>
      </div>
      <span className="absolute -right-1.5 -top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-accent text-accent-foreground ring-4 ring-background">
        <Send className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
      </span>
    </div>
  );
}

/** Le disque d'icône du bureau (48 px), lin ou sauge. */
export function DisqueDIcone({ icone: I, ton = 'lin', className }: { readonly icone: Icone; readonly ton?: 'lin' | 'sauge'; readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-12 items-center justify-center rounded-full',
        ton === 'sauge' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-primary-deep',
        className,
      )}
    >
      <I className="size-6" strokeWidth={1.5} aria-hidden="true" />
    </span>
  );
}

interface RangeeDActionProps {
  readonly icone: Icone;
  readonly titre: string;
  readonly texte: string;
  /** Un bouton (renvoyer, corriger) ou un lien (Gmail, ouvert dans un autre onglet). */
  readonly onClick?: () => void;
  readonly href?: string;
  readonly desactive?: boolean;
}

/** Une rangée de la liste d'actions (`LigneLien`) : 56 px, icône, titre, aide, chevron. */
export function RangeeDAction({ icone: I, titre, texte, onClick, href, desactive = false }: RangeeDActionProps) {
  const corps: ReactNode = (
    <>
      <I className="size-5 flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[15px] font-medium">{titre}</span>
        <span className="mt-0.5 block text-[13px] tabular-nums text-muted-foreground">{texte}</span>
      </span>
      <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
    </>
  );
  const classes =
    'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent';
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {corps}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={desactive} className={classes}>
      {corps}
    </button>
  );
}

export function ListeDActions({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={cn('divide-y divide-border overflow-hidden rounded-xl border border-border bg-card', className)}>{children}</div>;
}

/**
 * La sortie que l'écran d'oubli ne proposait pas (`EncadreSms`) : le code SMS, sans rien
 * réinitialiser. Rendu seulement quand la voie téléphone est ouverte (`phone_login`).
 */
export function EncadreCodeSms({ href, className }: { readonly href: string; readonly className?: string }) {
  const t = useTranslations('auth.oubli.sms');
  return (
    <div className={cn('flex gap-3 rounded-xl border border-accent/20 bg-accent/[0.08] p-3.5', className)}>
      <Smartphone className="mt-0.5 size-5 flex-none text-accent" strokeWidth={1.5} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm leading-snug">
        <p className="font-semibold">{t('titre')}</p>
        <p className="mt-0.5 text-muted-foreground">{t('texte')}</p>
        <p className="mt-2">
          <Link href={href} className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary">
            {t('lien')}
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Le titre d'un écran d'entrée et sa phrase (`TitreEcran`) : 28 px au téléphone, 36 au bureau. */
export function TitreDEntree({ children, sous, className }: { readonly children: ReactNode; readonly sous?: ReactNode; readonly className?: string }) {
  return (
    <div className={className}>
      <h1 className="font-display text-[28px] font-semibold leading-[1.12] tracking-[-0.025em] text-balance lg:text-[36px] lg:leading-[1.08]">
        {children}
      </h1>
      {sous ? <p className="mt-2 text-[15px] leading-normal text-muted-foreground text-pretty lg:mt-3 lg:text-[17px]">{sous}</p> : null}
    </div>
  );
}
