'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { BellPlus } from 'lucide-react';

import { filtersToCriteria } from '@/components/favorites/SaveSearchButton';
import type { SearchFilters } from '@/types/search';

// Le dialogue tire zod, react-hook-form et le formulaire d'alerte : il se charge au premier clic,
// hors du JS initial de la page (même patron que `SaveSearchButton`, TCK-1037).
const SaveSearchDialog = dynamic(() =>
  import('@/components/favorites/SaveSearchDialog').then((m) => m.SaveSearchDialog),
);

export interface AlerteDuBienRetireProps {
  /** Les critères du bien retiré (`criteresDAlerte`) : quartier, ville, type, contrat. */
  readonly filtres: SearchFilters;
  /** Le libellé, résolu par le serveur : ce composant ne lit aucun dictionnaire lui-même. */
  readonly libelle: string;
  /** Le nom proposé pour l'alerte (`nomDeLAlerte`), quartier compris. */
  readonly nomParDefaut?: string;
}

/**
 * TCK-2515 — « M'alerter des nouveaux biens à <quartier> », sur la page d'un bien loué, vendu ou
 * retiré. Le lien circule sur WhatsApp ; son lecteur cherchait exactement ce quartier.
 *
 * Aucun endpoint neuf : c'est le dialogue de la liste (`SaveSearchDialog`), qui sait déjà les
 * deux voies — l'alerte SANS compte (`POST /api/public/search-alerts`, TCK-599) pour un visiteur,
 * la recherche sauvegardée pour un connecté. La case d'alerte part COCHÉE, comme depuis la barre
 * de recherche (TCK-2475) : le geste demande l'alerte.
 */
export function AlerteDuBienRetire({ filtres, libelle, nomParDefaut }: AlerteDuBienRetireProps) {
  const [ouvert, setOuvert] = useState(false);
  const [ouverture, setOuverture] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOuverture((n) => n + 1);
          setOuvert(true);
        }}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border py-2 text-balance border-border bg-card px-5 text-[15px] font-semibold text-foreground transition-[background-color,scale] hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] motion-reduce:active:scale-100 sm:w-auto"
      >
        <BellPlus className="size-4" aria-hidden="true" />
        {libelle}
      </button>
      {ouverture > 0 ? (
        <SaveSearchDialog
          open={ouvert}
          onOpenChange={setOuvert}
          filters={filtres}
          criteria={filtersToCriteria(filtres)}
          ouverture={ouverture}
          alerteCochee
          nomParDefaut={nomParDefaut}
        />
      ) : null}
    </>
  );
}
