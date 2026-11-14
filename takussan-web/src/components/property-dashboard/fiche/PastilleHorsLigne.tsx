'use client';

import { StatusBadge } from '@/components/console';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface PastilleHorsLigneProps {
  /** « Hors ligne », traduit par l'appelant. */
  readonly label: string;
  /** Les phrases des motifs (`phrasesDesMotifs`), dans l'ordre de l'API. Sans motif, la pastille seule. */
  readonly phrases: readonly string[];
}

/**
 * TCK-2678 (ADR-0097 § 5, AC4 reformulé le 2026-11-14) — la pastille « Hors ligne » de l'en-tête de la
 * fiche porte le POURQUOI en infobulle, au survol et au focus clavier, comme la carte du mode Annonces :
 * la maquette retenue (app-biens a-2) ne dessine aucune ligne sous les pastilles, l'en-tête ne bouge
 * donc d'aucun pixel. Les phrases sont aussi dans le bouton pour les lecteurs d'écran, et visibles en
 * tête de l'onglet Annonce (une infobulle ne s'ouvre pas au toucher).
 */
export function PastilleHorsLigne({ label, phrases }: PastilleHorsLigneProps) {
  const pastille = <StatusBadge tone="neutral" label={label} />;
  if (phrases.length === 0) return pastille;
  const liste = (
    <span role="list" className="block space-y-0.5">
      {phrases.map((phrase) => (
        <span role="listitem" key={phrase} className="block">
          {phrase}
        </span>
      ))}
    </span>
  );
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // Un bouton sans action : le déclencheur d'une infobulle doit prendre le focus clavier. Sans
          // marge ni bord, il a la taille exacte de la pastille.
          <button
            type="button"
            data-slot="pastille-hors-ligne"
            className="inline-flex rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring"
          />
        }
      >
        {pastille}
        <span className="sr-only">{liste}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{liste}</TooltipContent>
    </Tooltip>
  );
}
