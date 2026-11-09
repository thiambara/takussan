'use client';

import Image from 'next/image';
import { useState } from 'react';

import { initiales } from './faits-de-profil';

/**
 * Le logo d'un profil, ou ses initiales — y compris quand le logo NE SE CHARGE PAS (TCK-2521).
 *
 * Mesuré sur la base de dev le 2026-11-09 : le `logo_url` de Dakar Immo répond **403**, et la ligne
 * montrait l'icône d'image cassée du navigateur. L'audit l'exige : « logo absent ou cassé : un
 * monogramme, plus d'image cassée ». D'où le seul état client de la ligne : `onError` bascule sur
 * les initiales.
 *
 * TCK-1814 (P180.03) — le logo passe par le loader (ADR-0029 §4) : `logo_url` est l'original,
 * jusqu'à 10 Mo. Les initiales ne sont rendues que sans logo affiché, pour qu'un logo transparent
 * ne les laisse pas voir dessous.
 */
export function LogoOuInitiales({ nom, logoUrl }: { readonly nom: string; readonly logoUrl: string | null }) {
  const [casse, setCasse] = useState(false);

  if (logoUrl && !casse) {
    return (
      <Image
        src={logoUrl}
        alt=""
        fill
        sizes="56px"
        className="bg-muted object-cover"
        onError={() => setCasse(true)}
      />
    );
  }
  return <span aria-hidden>{initiales(nom)}</span>;
}
