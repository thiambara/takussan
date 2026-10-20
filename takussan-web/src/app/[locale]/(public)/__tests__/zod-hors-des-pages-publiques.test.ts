import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC, nommer, sourcesDe } from '@/test/analyse-statique';
import { paquetsDuGrapheClient } from '@/test/graphe-client';

/**
 * TCK-744 (P33.03) — **zod et react-hook-form n'entrent sur une page publique que par un
 * formulaire.**
 *
 * Mesuré le 2026-10-17 (angle 33) : la fiche bien portait le morceau zod (64,2 Kio gzip) dans son
 * JS initial, apporté par des composants d'affichage (`PropertyCard`, `NewBuildChip`,
 * `FilterSidebar`) qui n'importaient de `@/lib/schemas/property` que des listes de valeurs
 * `as const` — un module qui commence par `import { z } from 'zod'` et construit ses schémas au
 * chargement. Les listes vivent depuis dans `@/lib/enums/property`, sans dépendance.
 *
 * Chaque page et chaque layout de `[locale]/(public)` est tracé (`src/test/graphe-client.ts`).
 * Un chemin vers ces paquets n'est admis que s'il passe par un FORMULAIRE de la table ci-dessous :
 * l'y ajouter est une décision, qui se lit dans la revue.
 */
const PAQUETS = ['zod', 'react-hook-form', '@hookform/resolvers'];

const FORMULAIRES_ADMIS: Readonly<Record<string, string>> = {
  'components/bookings/BookingTunnel.tsx': 'le tunnel de réservation est un formulaire',
};

const ENTREES = sourcesDe(join(RACINE_SRC, 'app', '[locale]', '(public)')).filter((f) =>
  /[\\/](page|layout)\.tsx$/.test(f),
);

describe('zod hors des pages publiques', () => {
  it('trouve des pages à tracer', () => {
    expect(ENTREES.length).toBeGreaterThan(10);
  });

  it.each(ENTREES.map((f) => [nommer(f), f]))('%s : zod seulement par un formulaire admis', (_nom, entree) => {
    const horsFormulaire = paquetsDuGrapheClient(entree, PAQUETS).filter(
      (chemin) => !chemin.split(' ← ').some((module) => module in FORMULAIRES_ADMIS),
    );
    expect(horsFormulaire).toEqual([]);
  });
});
