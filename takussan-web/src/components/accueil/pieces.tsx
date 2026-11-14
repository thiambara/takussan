'use client';

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Vignette } from '@/components/visits/planification/PiecesDeLaPlanification';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * TCK-2624 (ADR-0096, maquette `app-accueil` a) — les pièces de « À faire maintenant », communes aux
 * personas qui décident (admin d'agence, bailleur, hôte) :
 *
 *  - au TÉLÉPHONE, une carte par file : la tête de file (`CarteAFaire`, deux boutons de 44 px) ou la
 *    file entière (`CarteFile`, son verbe à droite) ;
 *  - au BUREAU, des groupes de rangées denses (`GroupeAFaire`, `RangeeAFaire`) : un en-tête de 44 px
 *    avec le compte et « Tout voir », des rangées de 56 px, « Voir les N autres » en pied.
 *
 * Les gestes sont passés en `ReactNode` : chaque persona porte les siens (lien, bouton, feuille).
 */

export type Icone = ComponentType<{ className?: string; strokeWidth?: number }>;
export type Ton = 'primaire' | 'danger' | 'neutre';

const LIEN = 'outline-none focus-visible:ring-3 focus-visible:ring-ring';

export function Disque({ icone: I, ton = 'primaire', className }: { readonly icone: Icone; readonly ton?: Ton; readonly className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-9 flex-none items-center justify-center rounded-full',
        ton === 'primaire' && 'bg-secondary text-primary-deep',
        ton === 'danger' && 'bg-destructive/10 text-destructive',
        ton === 'neutre' && 'bg-muted text-encre-douce',
        className,
      )}
    >
      <I className="size-icone" strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/** L'intertitre d'un bloc au téléphone (« À faire maintenant »). */
export function TitreBloc({ children, id, className }: { readonly children: ReactNode; readonly id?: string; readonly className?: string }) {
  return (
    <h2 id={id} className={cn('px-4 text-ui font-semibold text-muted-foreground', className)}>
      {children}
    </h2>
  );
}

/** L'intertitre d'une colonne au bureau. */
export function TitreColonne({ children, id }: { readonly children: ReactNode; readonly id?: string }) {
  return (
    <h2 id={id} className="text-ui font-semibold text-muted-foreground">
      {children}
    </h2>
  );
}

/** Le bouton TONAL d'une carte (jamais plein hors de la tête de file) : un lien. */
export function LienTonal({ href, children, className }: { readonly href: string; readonly children: ReactNode; readonly className?: string }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'px-3.5 font-semibold', className)}>
      {children}
    </Link>
  );
}

/** Téléphone : la tête d'une file, avec ses deux boutons de 44 px. */
export function CarteAFaire({
  icone,
  ton,
  vignette,
  titre,
  quand,
  detail,
  secondaire,
  primaire,
}: {
  readonly icone: Icone;
  readonly ton?: Ton;
  /** La photo de l'objet (le bien à valider), à la place du disque. */
  readonly vignette?: string | null;
  readonly titre: ReactNode;
  readonly quand?: ReactNode;
  readonly detail: ReactNode;
  readonly secondaire: ReactNode;
  /** `null` : le geste n'est pas permis (403) — « Voir » seul, pleine largeur. */
  readonly primaire: ReactNode | null;
}) {
  return (
    <li data-slot="carte-a-faire" className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        {vignette !== undefined ? <Vignette src={vignette} className="size-12" /> : <Disque icone={icone} ton={ton} />}
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="min-w-0 truncate text-corps font-semibold">{titre}</span>
            {quand ? <span className={cn('flex-none text-xs', ton === 'danger' ? 'font-medium text-destructive' : 'text-muted-foreground')}>{quand}</span> : null}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      <div className={cn('mt-3.5 grid gap-2 [&>*]:h-11 [&>*]:w-full', primaire === null ? 'grid-cols-1' : 'grid-cols-2')}>
        {secondaire}
        {primaire}
      </div>
    </li>
  );
}

/** Téléphone : une FILE entière (« 5 avis à modérer ») — une ligne, son verbe à droite. */
export function CarteFile({
  icone,
  ton,
  titre,
  detail,
  action,
  danger = false,
}: {
  readonly icone: Icone;
  readonly ton?: Ton;
  readonly titre: ReactNode;
  readonly detail: ReactNode;
  readonly action: ReactNode;
  readonly danger?: boolean;
}) {
  return (
    <li data-slot="carte-file" className={cn('flex items-center gap-3 rounded-2xl border p-4', danger ? 'border-destructive/20 bg-destructive/6' : 'border-border bg-card')}>
      <Disque icone={icone} ton={danger ? 'danger' : ton} />
      <div className="min-w-0 flex-1">
        <p className="text-corps font-semibold">{titre}</p>
        <p className="text-sm tabular-nums text-muted-foreground">{detail}</p>
      </div>
      {action}
    </li>
  );
}

/** Le verbe d'une file en danger (« Relancer ») : bordé de rouge sur la carte. */
export const ACTION_DANGER = 'h-11 flex-none border-bord-danger bg-card px-3.5 font-semibold text-destructive hover:bg-destructive/6 hover:text-destructive';

/** Bureau : une famille de la file (« Demandes non attribuées 3 »), en carte à rangées de 56 px. */
export function GroupeAFaire({
  titre,
  compte,
  toutVoir,
  pied,
  children,
}: {
  readonly titre: string;
  readonly compte?: number;
  /** « Tout voir » : la liste où mène la file. */
  readonly toutVoir?: string;
  /** « Voir les 10 autres visites à confirmer », quand la file en compte plus que ses rangées. */
  readonly pied?: { readonly texte: string; readonly href: string } | null;
  readonly children: ReactNode;
}) {
  const t = useTranslations('accueil.aFaire');
  return (
    <section data-slot="groupe-a-faire" aria-label={titre} className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex h-11 items-center gap-2 border-b border-border px-4">
        <h3 className="text-sm font-semibold">{titre}</h3>
        {compte !== undefined ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-legende font-semibold tabular-nums text-primary-deep">{compte}</span>
        ) : null}
        {toutVoir ? (
          <Link href={toutVoir} className={cn('ml-auto inline-flex items-center gap-0.5 rounded text-ui font-medium text-primary', LIEN)}>
            {t('toutVoir')}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      <ul className="divide-y divide-border">{children}</ul>
      {pied ? (
        <Link
          href={pied.href}
          className={cn('flex h-10 items-center border-t border-border bg-muted/30 px-4 text-ui font-medium text-encre-douce hover:bg-muted', LIEN)}
        >
          {pied.texte}
          <ChevronRight className="ml-1 size-3.5 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}

/** Bureau : une rangée de 56 px — le disque ou la vignette, deux lignes, le temps, les gestes. */
export function RangeeAFaire({
  icone,
  ton,
  vignette,
  titre,
  detail,
  quand,
  gestes,
  danger = false,
}: {
  readonly icone: Icone;
  readonly ton?: Ton;
  readonly vignette?: string | null;
  readonly titre: ReactNode;
  readonly detail: ReactNode;
  readonly quand?: ReactNode;
  readonly gestes?: ReactNode;
  readonly danger?: boolean;
}) {
  return (
    <li data-slot="rangee-a-faire" className={cn('flex min-h-14 items-center gap-3 px-4 py-1.5', danger && 'bg-destructive/5')}>
      {vignette !== undefined ? <Vignette src={vignette} className="size-9 rounded-md" /> : <Disque icone={icone} ton={danger ? 'danger' : ton} className="size-8" />}
      <div className="min-w-0 flex-1 leading-tight">
        <p className="line-clamp-2 text-sm font-semibold">{titre}</p>
        <p className="mt-0.5 line-clamp-2 text-ui text-muted-foreground">{detail}</p>
      </div>
      {quand ? <span className={cn('flex-none text-xs tabular-nums', ton === 'danger' ? 'font-medium text-destructive' : 'text-muted-foreground')}>{quand}</span> : null}
      {gestes ? <div className="flex flex-none items-center gap-1">{gestes}</div> : null}
    </li>
  );
}
