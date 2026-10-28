'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { RadarListingDetail } from '@/types/radar';
import { localiserPassage } from './passage';

interface PanneauSourceProps {
  readonly detail: RadarListingDetail;
  /** Le passage cité par le champ survolé ou focalisé ; `null` : aucun. */
  readonly passage: string | null;
  readonly className?: string;
}

/** Une URL de page ou de photo qui s'ouvre : `http(s)` seulement, jamais `javascript:` ni `data:`. */
const estUrlWeb = (valeur: string | null | undefined): valeur is string => !!valeur && /^https?:\/\//i.test(valeur);

/**
 * TCK-2387 (ADR-0077) — la source de la fiche, à côté de ce qu'on en a lu.
 *
 * - texte ou URL : `raw_text` tel quel (préformaté, replié), le lien vers l'annonce d'origine et les
 *   photos source. Quand un champ est survolé ou focalisé, son passage cité est entouré d'un `<mark>`
 *   et ramené à l'écran dans le texte seul (jamais dans la page : cf. l'effet) ;
 * - captures : une image par capture, par son URL signée (l'original, valable 5 minutes). Une image
 *   ne se surligne pas : les passages cités s'affichent sous les champs.
 *
 * Les photos source sont chargées directement depuis leur site (`<img>` simple,
 * `referrerPolicy="no-referrer"`, jamais `next/image` : ADR-0077, décision 10a — pas de copie ni de
 * proxy de ce qui n'est pas à nous, et aucune URL de l'opérateur n'est transmise au site d'origine).
 */
export function PanneauSource({ detail, passage, className }: PanneauSourceProps) {
  const t = useTranslations('superAdmin.pages.radar.listing.source');
  const marque = useRef<HTMLElement>(null);
  const defilement = useRef<HTMLPreElement>(null);

  const texte = detail.raw_text;
  const position = texte !== null && passage !== null ? localiserPassage(texte, passage) : null;
  const debut = position?.debut;
  const fin = position?.fin;

  useEffect(() => {
    // Le défilement ne touche QUE la source : `scrollIntoView` ferait aussi défiler la fenêtre, et, sous
    // `lg`, où la source est AU-DESSUS des champs, survoler ou focaliser un champ ramènerait la page vers
    // elle — sous le pointeur à la souris, loin du clavier virtuel au téléphone. Sémantique « nearest » à
    // la main : rien ne bouge si le passage est déjà visible.
    const zone = defilement.current;
    const passageMarque = marque.current;
    if (!zone || !passageMarque) return;
    const haut = passageMarque.offsetTop;
    const bas = haut + passageMarque.offsetHeight;
    if (haut < zone.scrollTop) zone.scrollTop = haut;
    else if (bas > zone.scrollTop + zone.clientHeight) zone.scrollTop = bas - zone.clientHeight;
  }, [debut, fin]);

  const captures = detail.captures ?? [];
  const photos = (detail.photo_urls ?? []).filter(estUrlWeb);

  return (
    <section
      aria-label={t('heading')}
      className={cn('space-y-4 rounded-xl border bg-card p-4', className)}
      data-testid="radar-source"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-foreground">{t('heading')}</h2>
        {estUrlWeb(detail.source_url) ? (
          <a
            href={detail.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('original')}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {captures.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('capturesHint')} {t('capturesExpire')}</p>
          <ul className="grid gap-3 sm:grid-cols-2" aria-label={t('captures')}>
            {captures.map((capture, i) => (
              <li key={capture.id}>
                <a href={capture.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL signée de l'original (5 min) : rien à optimiser ni à mettre en cache. */}
                  <img
                    src={capture.url}
                    alt={t('captureAlt', { n: i + 1 })}
                    loading="lazy"
                    className="max-h-80 w-full rounded-lg border bg-muted object-contain"
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : texte ? (
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium text-foreground">{t('rawText')}</h3>
          <pre
            ref={defilement}
            className="relative max-h-[60vh] overflow-y-auto rounded-lg bg-muted/40 p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground"
            data-testid="radar-source-text"
          >
            {position && texte !== null ? (
              <>
                {texte.slice(0, position.debut)}
                <mark ref={marque} className="rounded-sm bg-warning/30 px-0.5 text-foreground">
                  {texte.slice(position.debut, position.fin)}
                </mark>
                {texte.slice(position.fin)}
              </>
            ) : texte}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('noText')}</p>
      )}

      {photos.length > 0 ? (
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium text-foreground">{t('photos')}</h3>
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((url, i) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="block rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ADR-0077 décision 10a : l'image d'un site tiers, jamais passée par un loader. */}
                  <img
                    src={url}
                    alt={t('photoAlt', { n: i + 1 })}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="aspect-square w-full rounded-md border bg-muted object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
