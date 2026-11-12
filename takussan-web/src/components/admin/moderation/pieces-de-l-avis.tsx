'use client';

import Link from 'next/link';
import { ChevronRight, Star, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initiales } from '@/lib/fiche-publique';
import type { ModerationReview, ModerationReviewTarget } from '@/lib/queries/reviews-moderation';
import { cn } from '@/lib/utils';

/**
 * TCK-2673 — les pièces d'un avis dans la file de modération (maquette `app-moderation`, approche B) :
 * les étoiles, la vignette du sujet, la puce du risque, le bloc du sujet. Partagées par la carte de
 * la file et par le détail.
 */

const NOTES = [1, 2, 3, 4, 5] as const;

export function EtoilesDeLAvis({ note, grand = false, className }: { readonly note: number; readonly grand?: boolean; readonly className?: string }) {
  const t = useTranslations('admin.moderation.file');
  return (
    <span role="img" aria-label={t('noteAria', { n: note })} className={cn('inline-flex flex-none items-center gap-0.5', className)}>
      {NOTES.map((i) => (
        <Star
          key={i}
          className={cn(grand ? 'size-5' : 'size-3.5', i <= Math.round(note) ? 'fill-primary text-primary' : 'text-controle-vide')}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/** La photo principale d'un bien, ou les initiales d'un agent (ou de tout autre sujet nommé). */
export function VignetteDuSujet({ sujet, grande = false }: { readonly sujet: ModerationReviewTarget | null | undefined; readonly grande?: boolean }) {
  const taille = grande ? 'size-14' : 'size-10';
  if (sujet?.type === 'property') {
    return (
      <span className={cn('block flex-none overflow-hidden rounded-lg bg-muted', taille)}>
        {sujet.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- vignette de l'API (`preview`), déjà dimensionnée
          <img src={sujet.photo_url} alt="" className="size-full object-cover" loading="lazy" />
        ) : null}
      </span>
    );
  }
  return (
    <Avatar size={grande ? '48' : '40'} className={grande ? 'size-14' : undefined}>
      <AvatarFallback>{initiales(sujet?.title ?? '') || '?'}</AvatarFallback>
    </Avatar>
  );
}

/** La raison du risque, et le compte des signalements quand il y en a. */
export function PuceDeRisque({ avis }: { readonly avis: ModerationReview }) {
  const t = useTranslations('admin.moderation.file');
  const raisons = avis.risk?.level === 'high' ? avis.risk.reasons : [];
  const signalements = avis.reported_count ?? 0;
  const libelles = raisons
    .filter((r) => r !== 'reported')
    .map((r) => (r === 'low_rating' ? t('risque.low_rating', { note: avis.rating }) : t('risque.contact_details')));
  if (libelles.length === 0 && signalements === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ui font-medium">
      {libelles.map((l) => (
        <span key={l} className="inline-flex items-center gap-1 whitespace-nowrap text-warning">
          <TriangleAlert className="size-3.5 flex-none" strokeWidth={2} aria-hidden="true" />
          {l}
        </span>
      ))}
      {signalements > 0 ? <span className="whitespace-nowrap text-destructive">{t('signalements', { n: signalements })}</span> : null}
    </span>
  );
}

/** Où mène le sujet : la fiche du bien dans l'app, la fiche publique d'un agent. */
export function lienDuSujet(sujet: ModerationReviewTarget | null | undefined): string | null {
  if (!sujet) return null;
  if (sujet.type === 'property') return `/app/properties/${sujet.id}`;
  if (sujet.type === 'user' && sujet.slug) return `/agents/${sujet.slug}`;
  return null;
}

/** Le sujet de l'avis, en bloc : sur quoi il porte, et le lien pour aller le voir. */
export function BlocDuSujet({ sujet }: { readonly sujet: ModerationReviewTarget | null | undefined }) {
  const t = useTranslations('admin.moderation.file');
  const lien = lienDuSujet(sujet);
  const detail =
    sujet?.type === 'property'
      ? [
          sujet.subtitle ? t('sujet.reference', { ref: sujet.subtitle }) : null,
          sujet.agent?.name ? t('sujet.suiviPar', { nom: sujet.agent.name }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : sujet?.type === 'user'
        ? t('sujet.agent')
        : '';
  const contenu = (
    <>
      <VignetteDuSujet sujet={sujet} grande />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{sujet ? t(`sujet.${sujet.type}`) : t('sujet.inconnu')}</span>
        <span className="block truncate text-corps font-semibold">{sujet?.title ?? '—'}</span>
        {detail ? <span className="block truncate text-ui tabular-nums text-muted-foreground">{detail}</span> : null}
      </span>
      {lien ? <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" /> : null}
    </>
  );
  const classes = 'flex items-center gap-3 rounded-xl border border-border bg-background p-2.5';
  return lien ? (
    <Link
      href={lien}
      aria-label={t('sujet.ouvrir', { titre: sujet?.title ?? '' })}
      className={cn(classes, 'hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring')}
      data-slot="sujet-de-l-avis"
    >
      {contenu}
    </Link>
  ) : (
    <div className={classes} data-slot="sujet-de-l-avis">
      {contenu}
    </div>
  );
}

/** L'avatar de l'auteur de l'avis (sa photo, ou ses initiales). */
export function AvatarDeLAuteur({ avis }: { readonly avis: ModerationReview }) {
  const nom = avis.author?.name ?? '';
  return (
    <Avatar size="40">
      {avis.author?.avatar_url ? <AvatarImage src={avis.author.avatar_url} alt="" /> : null}
      <AvatarFallback>{initiales(nom) || '?'}</AvatarFallback>
    </Avatar>
  );
}
