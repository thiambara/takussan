'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Phone } from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formaterTelephone } from '@/lib/phone';
import { cn } from '@/lib/utils';

/**
 * TCK-2645 — les pièces de la fiche d'un bail (maquette `app-baux` a, écran « Fiche — dossier du
 * bail »). Locales à la frontière i18n des baux : elles ne lisent que `lease.*` (les pièces de la
 * fiche du bien lisent `property.*`, que cette frontière ne sert pas).
 */

/** La carte de la console : `Carte` des maquettes, titre de carte facultatif (bureau). */
export function Carte({
  titre,
  action,
  className,
  enteteClassName,
  children,
  ...props
}: {
  readonly titre?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
  /** La rangée du titre (`max-md:hidden` : la carte « Parties » n'a pas de titre au téléphone). */
  readonly enteteClassName?: string;
  readonly children: ReactNode;
  readonly id?: string;
  readonly 'data-testid'?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card', className)} {...props}>
      {titre ? (
        <div className={cn('flex items-center gap-2 border-b border-border px-4 py-3', enteteClassName)}>
          <h2 className="min-w-0 flex-1 truncate text-corps font-semibold">{titre}</h2>
          {action ? <span className="flex-none text-sm font-medium text-primary">{action}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Le titre d'un bloc au téléphone (« Le dossier ») : 13 px, 600, encre discrète. */
export function TitreBloc({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return (
    <div className={cn('flex items-baseline gap-3', className)}>
      <h2 className="min-w-0 flex-1 text-ui font-semibold text-muted-foreground">{children}</h2>
    </div>
  );
}

/** Les boutons ronds « Appeler » / « WhatsApp » d'un numéro SERVI par l'API ; rien sans numéro (décision 5). */
export function Appels({ telephone, nom, className }: { readonly telephone: string | null | undefined; readonly nom: string; readonly className?: string }) {
  const t = useTranslations('lease.fiche.parties');
  if (!isReachable(telephone)) return null;
  const rond =
    'inline-flex size-9 flex-none items-center justify-center rounded-full border border-border bg-card outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring';
  return (
    <span className={cn('flex flex-none items-center gap-2', className)}>
      <a href={telHref(telephone)} aria-label={t('appeler', { nom })} className={rond}>
        <Phone className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </a>
      <a
        href={whatsappHref(telephone, '')}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('whatsapp', { nom })}
        className={cn(rond, 'border-transparent bg-success/10 text-success hover:bg-success/15')}
      >
        <IconeWhatsApp className="size-4 lg:size-4" />
      </a>
    </span>
  );
}

export type QualiteDePartie = 'locataire' | 'bailleur' | 'agent';

export interface PartieDuBail {
  readonly qualite: QualiteDePartie;
  readonly nom: string;
  readonly initiales: string | null;
  readonly telephone: string | null;
}

function AvatarDePartie({ partie }: { readonly partie: PartieDuBail }) {
  return (
    <Avatar size="40">
      {/* L'aplat d'accent de la maquette (`bg-accent/15`) est réservé aux badges *featured*
          (check-valeurs-arbitraires-app) : la pastille d'avatar, teintée de l'accent, comme `AvatarDuBailleur`. */}
      <AvatarFallback className={partie.qualite === 'locataire' ? undefined : 'bg-fond-avatar text-accent'}>
        <span aria-hidden="true">{partie.initiales ?? '?'}</span>
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Une partie du bail : avatar 40, nom 15 px, qualité 13 px, Appeler / WhatsApp. Dès `md`, la qualité
 * porte le numéro servi (« Locataire · +221 77 … », carte « Parties » du bureau) ; l'avatar reste à
 * 40 px au lieu des 36 de la maquette (un seul DOM pour les deux tailles — écart inscrit).
 */
export function Partie({ partie, className }: { readonly partie: PartieDuBail; readonly className?: string }) {
  const t = useTranslations('lease.fiche.parties');
  const qualite = partie.qualite === 'agent' ? t('agentResponsable') : t(partie.qualite);
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 xl:py-2.5', className)} data-testid={`partie-${partie.qualite}`}>
      <AvatarDePartie partie={partie} />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate text-corps font-semibold xl:text-sm">{partie.nom}</p>
        <p className="truncate text-ui text-muted-foreground tabular-nums xl:text-xs">
          {qualite}
          {isReachable(partie.telephone) ? <span className="max-md:hidden"> · {formaterTelephone(partie.telephone)}</span> : null}
        </p>
      </div>
      <Appels telephone={partie.telephone} nom={partie.nom} />
    </div>
  );
}

/** La fine jauge de la carte « Durée ». */
export function Jauge({ part, className }: { readonly part: number; readonly className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(part * 100)));
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-full bg-muted', className)} aria-hidden="true">
      <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </span>
  );
}
