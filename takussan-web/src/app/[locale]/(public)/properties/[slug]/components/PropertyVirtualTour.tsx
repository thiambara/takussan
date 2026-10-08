'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Play, Rotate3d } from 'lucide-react';
import { integrationDeVisite } from '@/lib/property/visite-virtuelle';

/**
 * TCK-598 (V19, contrainte 13) — la visite virtuelle ou la vidéo du bien, dans la galerie.
 *
 * **Rien ne se charge avant le geste.** La vignette est un bouton local, sans image ni script
 * tiers : l'iframe — et avec elle les requêtes vers YouTube, Vimeo, Matterport ou Kuula — n'existe
 * qu'après le clic. Ouvrir la fiche sur un réseau 3G ne paie donc rien pour une vidéo qu'on ne
 * regardera peut-être pas.
 *
 * L'adresse intégrée est reconstruite par `integrationDeVisite` (jamais l'URL brute), et un hôte
 * que le front ne sait pas intégrer devient un lien sortant, jamais une iframe.
 */
export function PropertyVirtualTour({ url, title }: { readonly url: string | null | undefined; readonly title: string }) {
  const t = useTranslations('property.detail.virtualTour');
  const [ouverte, setOuverte] = useState(false);
  const integration = integrationDeVisite(url);
  if (!integration) return null;

  const libelle = integration.genre === 'video' ? t('video') : t('tour');
  const Icone = integration.genre === 'video' ? Play : Rotate3d;

  if (integration.mode === 'lien') {
    return (
      <a
        href={integration.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:border-primary transition-colors"
      >
        <Icone className="size-4 text-primary" aria-hidden />
        {libelle}
        <ExternalLink className="size-3.5 bg-card text-muted-foreground" aria-hidden />
        <span className="sr-only">{t('opensNewTab')}</span>
      </a>
    );
  }

  if (!ouverte) {
    return (
      <button
        type="button"
        onClick={() => setOuverte(true)}
        className="group flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-primary transition-colors"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Icone className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{libelle}</span>
          <span className="block bg-card text-xs text-muted-foreground">{t('loadHint')}</span>
        </span>
      </button>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
      <iframe
        src={integration.src}
        title={t('frameTitle', { title })}
        className="absolute inset-0 size-full border-0"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="fullscreen; picture-in-picture; xr-spatial-tracking"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    </div>
  );
}
