import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC } from '@/test/analyse-statique';
import { paquetsDuGrapheClient } from '@/test/graphe-client';

/**
 * Le graphe client des écrans de la console super-admin (angle 104 du fichier de pistes).
 *
 * TCK-1194 (P104.01) — `/super-admin/tags` était l'écran le plus lourd de la console (452,2 Kio
 * gzip, mesure de l'explorateur) : `TagsManager` prenait `FormError` au fichier `index.ts` de
 * `components/forms`, qui réexporte aussi les champs liés à react-hook-form et les sélecteurs de
 * date, et `useTraducteurValidation` à `hooks/useApiForm.ts`, qui importe react-hook-form. Son
 * formulaire est tenu par `useState` : aucun de ces paquets ne lui sert.
 *
 * TCK-1196 (P104.02) — c'était aussi le seul écran de la console à charger zod (64,2 Kio gzip),
 * pour lire `tagTypeValues`, un tableau `as const`, et valider à l'envoi d'un dialogue fermé au
 * chargement. Le tableau vit dans `@/lib/enums/tag`, et le schéma se charge à l'envoi.
 *
 * TCK-1198 (P104.03) — `/super-admin/privacy-requests` chargeait le calendrier (react-day-picker,
 * date-fns : 31,9 Kio gzip, mesure de l'explorateur) pour le seul `DatePicker` du formulaire de
 * création, monté quand on ouvre son dialogue. Le formulaire vit dans son fichier, chargé par
 * `next/dynamic` à l'ouverture.
 */
const CONSOLE = join(RACINE_SRC, 'app', '(super-admin)', 'super-admin');

const FORMULAIRES_ET_DATES = ['react-hook-form', '@hookform/resolvers', 'react-day-picker', 'date-fns'];

describe('graphe client de la console super-admin', () => {
  it('TCK-1198 — demandes de droits : le calendrier ne se charge qu’à l’ouverture du formulaire', () => {
    expect(
      paquetsDuGrapheClient(join(CONSOLE, 'privacy-requests', 'page.tsx'), ['react-day-picker', 'date-fns']),
    ).toEqual([]);
  });

  it('TCK-1196 — tags : zod ne se charge qu’à l’envoi du formulaire', () => {
    expect(paquetsDuGrapheClient(join(CONSOLE, 'tags', 'page.tsx'), ['zod'])).toEqual([]);
  });

  it('TCK-1194 — tags : ni react-hook-form ni sélecteur de date', () => {
    expect(paquetsDuGrapheClient(join(CONSOLE, 'tags', 'page.tsx'), FORMULAIRES_ET_DATES)).toEqual([]);
  });
});
