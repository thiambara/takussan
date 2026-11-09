'use client';

import { useState } from 'react';
import Image from 'next/image';

import { cn } from '@/lib/utils';

export interface LogoDeFicheProps {
  readonly src: string | null;
  readonly nom: string;
  readonly initiales: string;
  readonly className?: string;
}

/**
 * TCK-2522 — le logo d'une agence posé sur sa couverture, **monogramme en repli quand il est absent
 * OU cassé** (acquis de la maquette : « plus d'image cassée »). Mesuré sur la base de dev : le logo
 * de Dakar Immo répond 403, et la fiche d'avant montrait un cadre vide à sa place.
 */
export function LogoDeFiche({ src, nom, initiales, className }: LogoDeFicheProps) {
  const [casse, setCasse] = useState(false);
  return (
    <div data-logo-fiche className={cn('relative overflow-hidden bg-foreground', className)}>
      {src && !casse ? (
        <Image src={src} alt={nom} fill sizes="96px" className="bg-card object-cover" priority onError={() => setCasse(true)} />
      ) : (
        <span className="flex size-full items-center justify-center font-display text-xl font-semibold text-background lg:text-3xl" aria-hidden>
          {initiales}
        </span>
      )}
    </div>
  );
}
