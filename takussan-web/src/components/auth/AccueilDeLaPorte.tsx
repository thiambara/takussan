'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Logo } from '@/components/brand/Logo';

/**
 * TCK-2936 — l'ARRIVÉE DIRECTE sur la porte (`/auth/login` sans intention) : la maquette
 * `app-entree-connexion` (approche a, e1 « Numéro (arrivée directe) ») accueille par une photo de ville
 * et la marque en clair — un en-tête de 176 px au téléphone (`EnTeteAccueil`), le panneau de gauche
 * de 45 % au bureau (`DeuxColonnes` + `PanneauPhoto`).
 *
 * Décor seulement : rien ici n'est requis pour se connecter. Le panneau est `aria-hidden` (la marque
 * se lit dans la barre de la colonne de droite) ; l'en-tête garde sa flèche de retour, qu'il porte à
 * la place de la barre du téléphone.
 *
 * ⚠ **La photo.** La maquette pose une photo locale du porteur (`public/maquettes/`, hors git, droits
 * inconnus) : elle n'est pas reprise. C'est la photo que la connexion montrait jusqu'à TCK-2598,
 * servie par Unsplash (licence Unsplash : usage libre, sans attribution requise), déjà admise par
 * `remotePatterns` et réduite par le loader (`image-loader.ts`, branche `images.unsplash.com`).
 * Pour la remplacer par une photo de ville fournie : cette constante seule.
 */
export const PHOTO_D_ACCUEIL = 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop';

function PhotoDAccueil({ sizes, className }: { readonly sizes: string; readonly className?: string }) {
  return <Image src={PHOTO_D_ACCUEIL} alt="" fill sizes={sizes} className={className ? `object-cover ${className}` : 'object-cover'} />;
}

/** Téléphone, écran du numéro : la photo (176 px), le retour, la marque en clair et ce que le compte ouvre. */
export function EnTeteDAccueil({ retour }: { readonly retour: ReactNode }) {
  const t = useTranslations('auth.porte.accueil');
  const tCommun = useTranslations('common');
  return (
    <div data-en-tete-d-accueil="" className="relative h-44 overflow-hidden bg-muted">
      <PhotoDAccueil sizes="100vw" className="object-[50%_62%]" />
      <div className="absolute inset-0 bg-gradient-to-t from-scrim/80 via-scrim/30 to-scrim/20" aria-hidden="true" />
      <div className="absolute left-3 top-3">{retour}</div>
      <div className="absolute inset-x-4 bottom-3.5 text-primary-foreground">
        <Logo nom={tCommun('appName')} ton="clair" />
        <p className="mt-1.5 text-sm text-primary-foreground/90">{t('slogan')}</p>
      </div>
    </div>
  );
}

/** Bureau : la photo pleine hauteur et son voile bas, la marque en clair posée dessus. */
export function PanneauDAccueil() {
  const tCommun = useTranslations('common');
  return (
    <div data-panneau-d-accueil="" aria-hidden="true" className="relative h-full">
      <PhotoDAccueil sizes="45vw" />
      <div className="absolute inset-0 bg-gradient-to-t from-scrim/60 via-scrim/10 to-transparent" />
      <Logo nom={tCommun('appName')} ton="clair" taille="pied" className="absolute bottom-10 left-10" />
    </div>
  );
}
