'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { RadarPublicationListing } from '@/types/radar';
import { useLibelleCodePublication } from '../annonceur/useMessageEchecAnnonceur';
import { PhotosReserve } from './PhotosReserve';

interface CartePublicationProps {
  readonly annonce: RadarPublicationListing;
  readonly cochee: boolean;
  readonly desactive: boolean;
  readonly onBascule: () => void;
  readonly onRetirerPhoto: (mediaId: number) => void;
  readonly onDeposerPhotos: (fichiers: readonly File[]) => void;
  readonly onRecupererPhotos: () => void;
}

/**
 * TCK-2389 — une annonce couverte par un accord : de quoi la reconnaître (titre, prix, quartier), ses photos (la réserve),
 * et ce qui l'alerte — un rapprochement ou un doublon (à regarder AVANT de publier), et chaque blocage, dit par son code.
 * Une annonce bloquée ne se coche pas : l'API la refuserait.
 */
export function CartePublication({
  annonce,
  cochee,
  desactive,
  onBascule,
  onRetirerPhoto,
  onDeposerPhotos,
  onRecupererPhotos,
}: CartePublicationProps) {
  const t = useTranslations('superAdmin.pages.radar.publication.listings');
  const fmt = useFormatteurs();
  const tBlocage = useTranslations('superAdmin.pages.radar.publication.listings.blocking');
  const libelleDuCode = useLibelleCodePublication();
  const bloquee = annonce.blocking.length > 0;
  const idCase = `radar-publication-annonce-${annonce.id}`;

  // Une carte ne parle que d'UNE annonce : « Cette annonce… », pas le « Une annonce… » du refus d'un envoi qui en porte plusieurs.
  // Sans photo à la source, rien à « récupérer » : le texte ne propose que le dépôt.
  const sansPhotoSource = annonce.photo_preparation.total === 0;
  const libelle = (code: string): string => {
    switch (code) {
      case 'radar.publish.no_photo': return tBlocage(sansPhotoSource ? 'noPhotoNoSource' : 'noPhoto');
      case 'radar.publish.photos_pending': return tBlocage('photosPending');
      case 'radar.publish.missing_field': return tBlocage('missingField');
      default: return libelleDuCode(code);
    }
  };

  const rapprochements = annonce.matches.map((match) =>
    match.kind === 'property' ? t('matchProperty', { id: match.id }) : t('matchListing', { id: match.id }));
  const doublons = [
    annonce.duplicate_of_listing_id !== null ? t('duplicateOfListing', { id: annonce.duplicate_of_listing_id }) : null,
    annonce.duplicate_of_property_id !== null ? t('duplicateOfProperty', { id: annonce.duplicate_of_property_id }) : null,
  ].filter((texte): texte is string => texte !== null);

  return (
    <li
      className={cn('space-y-3 rounded-lg border bg-card p-3', bloquee && 'bg-muted/40')}
      data-testid={`radar-publication-carte-${annonce.id}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <input
          id={idCase}
          type="checkbox"
          className="mt-1 size-4 accent-primary disabled:cursor-not-allowed"
          checked={cochee}
          disabled={bloquee || desactive}
          aria-label={t('select', { id: annonce.id })}
          onChange={onBascule}
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium text-foreground">{annonce.title || t('untitled')}</p>
          <p className="text-xs text-muted-foreground">
            {[annonce.price === null ? null : fmt.montant(annonce.price, 'XOF'), annonce.neighborhood]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Link
          href={`/super-admin/radar/${annonce.id}`}
          aria-label={t('open', { id: annonce.id })}
          className="rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('number', { id: annonce.id })}
        </Link>
      </div>

      {rapprochements.length > 0 || doublons.length > 0 ? (
        <div
          className="flex items-start gap-2 rounded-md border border-warning/60 bg-warning/5 p-2 text-xs text-foreground"
          data-testid={`radar-publication-alerte-${annonce.id}`}
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <div className="space-y-0.5">
            {rapprochements.length > 0 ? <p>{t('matches', { list: rapprochements.join(', ') })}</p> : null}
            {doublons.map((doublon) => <p key={doublon}>{doublon}</p>)}
          </div>
        </div>
      ) : null}

      {bloquee ? (
        <ul className="space-y-0.5 text-xs text-destructive" data-testid={`radar-publication-blocages-${annonce.id}`}>
          {annonce.blocking.map((code) => <li key={code}>{libelle(code)}</li>)}
        </ul>
      ) : null}

      <PhotosReserve
        annonce={annonce}
        desactive={desactive}
        onRetirer={onRetirerPhoto}
        onDeposer={onDeposerPhotos}
        onRecuperer={onRecupererPhotos}
      />
    </li>
  );
}
