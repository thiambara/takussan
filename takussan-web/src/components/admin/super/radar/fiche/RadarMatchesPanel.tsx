'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ExternalLink, TriangleAlert } from 'lucide-react';

import { StatusBadge, type StatusTone } from '@/components/console';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { RadarMatch, RadarMatches, RadarMatchSignal, RadarMatchStrength } from '@/types/radar';

const TON: Record<RadarMatchStrength, StatusTone> = { high: 'danger', medium: 'attention', low: 'neutral' };

interface RadarMatchesPanelProps {
  readonly matches: RadarMatches | undefined;
  readonly chargement: boolean;
  readonly erreur: boolean;
  /** « Doublon de celui-ci » : ouvre le dialogue de doublon prérempli avec ce rapprochement. */
  readonly onDoublon: (match: RadarMatch) => void;
  /** Le geste « doublon » n'est pas permis (étape, geste en cours). */
  readonly desactive: boolean;
}

/** Un rapprochement de force `medium` ou plus : celui qui mérite qu'on s'arrête avant de valider. */
export const estRapprochementFort = (match: RadarMatch): boolean => match.strength === 'high' || match.strength === 'medium';

/** Au-delà, la liste se replie : un annonceur au gros catalogue rend des dizaines de « même téléphone ». */
export const RAPPROCHEMENTS_VISIBLES = 5;

/**
 * Une annonce cible déjà fermée en doublon : l'API refuse d'en faire une origine (`radar.duplicate.chain`),
 * il faut viser l'annonce dont elle est elle-même le doublon.
 */
export const estDoublonDejaFerme = (match: RadarMatch): boolean =>
  match.kind === 'listing' && match.target.stage === 'duplicate';

/**
 * TCK-2387 (ADR-0077 §6) — les rapprochements de la fiche : les biens et annonces qu'elle ressemble déjà.
 *
 * Impossible à manquer : dès qu'un rapprochement est de force `medium` ou plus, un avertissement
 * (`role="alert"`) ouvre la fiche, au-dessus des champs. Pour chacun : la vignette, le titre, le prix et
 * le quartier, les signaux en libellés, la force, le lien, et le geste « doublon de celui-ci ». Aucun
 * rapprochement : une ligne discrète, pas un écran vide. Pendant le calcul des empreintes de photo, le
 * compteur dit où il en est — le signal photo peut manquer tant qu'il n'est pas fini.
 *
 * Les {@link RAPPROCHEMENTS_VISIBLES} plus forts (la liste arrive triée) s'affichent, le reste se déplie : l'alerte,
 * elle, compte TOUS les rapprochements forts.
 */
export function RadarMatchesPanel({ matches, chargement, erreur, onDoublon, desactive }: RadarMatchesPanelProps) {
  const t = useTranslations('superAdmin.pages.radar.listing.matches');
  const liste = matches?.matches ?? [];
  const [toutes, setToutes] = useState(false);
  const idListe = useId();
  const reste = Math.max(0, liste.length - RAPPROCHEMENTS_VISIBLES);
  const visibles = toutes ? liste : liste.slice(0, RAPPROCHEMENTS_VISIBLES);
  const forts = liste.filter(estRapprochementFort).length;
  const photos = matches?.photos;

  return (
    <section aria-label={t('heading')} className="space-y-3" data-testid="radar-matches">
      {forts > 0 ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-warning bg-warning/10 px-3 py-2.5 text-sm font-medium text-warning"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t('alert', { count: forts })}
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{t('heading')}</h3>
        {photos?.status === 'pending' ? (
          <p className="text-xs text-muted-foreground" data-testid="radar-photos-progress">
            {t('photosProgress', { done: photos.done, total: photos.total })}
          </p>
        ) : null}
        {erreur ? (
          <p className="text-sm text-muted-foreground">{t('loadError')}</p>
        ) : chargement ? null : liste.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('none')}</p>
        ) : (
          <>
            <ul id={idListe} className="space-y-2">
              {visibles.map((match) => (
                <CarteRapprochement key={`${match.kind}:${match.id}`} match={match} onDoublon={onDoublon} desactive={desactive} />
              ))}
            </ul>
            {reste > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={toutes}
                aria-controls={idListe}
                onClick={() => setToutes((ouvert) => !ouvert)}
              >
                {toutes ? t('seeLess') : t('seeMore', { count: reste })}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function CarteRapprochement({ match, onDoublon, desactive }: {
  readonly match: RadarMatch;
  readonly onDoublon: (match: RadarMatch) => void;
  readonly desactive: boolean;
}) {
  const t = useTranslations('superAdmin.pages.radar.listing.matches');
  const tStatut = useTranslations('property.status');
  const tEtapes = useTranslations('superAdmin.pages.radar.stages');
  const fmt = useFormatteurs();
  const bien = match.kind === 'property' ? match.target : null;
  const annonce = match.kind === 'listing' ? match.target : null;
  const target = match.target;
  const dejaDoublon = estDoublonDejaFerme(match);
  const indice = useId();

  const libelleSignal = (signal: RadarMatchSignal): string => {
    if (signal.signal === 'phone') return t('signals.phone');
    if (signal.signal === 'neighborhood_price_bedrooms') return t('signals.neighborhood_price_bedrooms');
    if (signal.signal === 'photo') return t(`signals.photo_${signal.strength}`);
    // TCK-2392 — le texte n'est jamais un signal fort à lui seul : proche (≥ `radar.similarity.close`) ou ressemblant.
    if (signal.signal === 'text') return t(signal.strength === 'low' ? 'signals.text_low' : 'signals.text_close');
    return signal.signal;
  };

  const titre = target.title || t('untitled');
  const details = [
    target.price == null ? null : fmt.montant(target.price, 'XOF'),
    bien?.bedrooms != null ? t('bedrooms', { count: bien.bedrooms }) : null,
    bien?.neighborhood ?? null,
  ].filter(Boolean).join(' · ');

  const statut = bien
    ? (bien.status && tStatut.has(bien.status) ? tStatut(bien.status) : bien.status)
    : (annonce && tEtapes.has(annonce.stage) ? tEtapes(annonce.stage) : annonce?.stage);

  const lien = match.kind === 'listing' ? (
    <Link
      href={`/super-admin/radar/${match.id}`}
      className="inline-flex items-center gap-1 rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {t('openListing')}
    </Link>
  ) : bien?.is_public && bien.slug ? (
    <LienLocalise
      href={`/properties/${bien.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {t('openPublic')}
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </LienLocalise>
  ) : (
    <Link
      href={`/super-admin/properties?filter[search]=${encodeURIComponent(bien?.reference_number ?? String(match.id))}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {t('openConsole')}
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </Link>
  );

  return (
    <li className="flex gap-3 rounded-lg border bg-card p-3" data-testid={`radar-match-${match.kind}-${match.id}`}>
      <div className="size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
        {target.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- vignette d'un bien (conversion publique), d'une capture signée ou d'une photo de site tiers (ADR-0077, décision 10a) : jamais par un loader.
          <img
            src={target.thumbnail_url}
            alt={t('thumbnailAlt', { title: titre })}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="size-full object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">{titre}</span>
          <StatusBadge tone={TON[match.strength]} label={t('strengthLabel', { strength: t(`strength.${match.strength}`) })} />
        </div>
        <p className="text-xs text-muted-foreground">
          {t(`kinds.${match.kind}`)}
          {statut ? ` · ${statut}` : ''}
          {bien && !bien.is_public ? ` · ${t('notPublic')}` : ''}
        </p>
        {details ? <p className="text-sm text-foreground">{details}</p> : null}
        <ul className="flex flex-wrap gap-1.5" aria-label={t('heading')}>
          {match.signals.map((signal) => (
            <li key={signal.signal} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
              {libelleSignal(signal)}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          {lien}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={desactive || dejaDoublon}
            aria-describedby={dejaDoublon ? indice : undefined}
            onClick={() => onDoublon(match)}
          >
            {t('duplicateOfThis')}
          </Button>
        </div>
        {dejaDoublon ? <p id={indice} className="text-xs text-muted-foreground">{t('duplicateClosedHint')}</p> : null}
      </div>
    </li>
  );
}
