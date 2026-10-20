/**
 * TCK-1040 (P70.03) — la fiche bien de la console ne charge le contenu d'un onglet qu'à son
 * premier affichage.
 *
 * Mesuré le 2026-10-20 (angle 70) : `/app/properties/[id]` était l'écran de `/app` le plus lourd
 * (602,6 Kio gzip de JS initial). `PropertyDetailTabs` importait statiquement l'assistant
 * d'édition complet (`PropertyForm`, 58,9 Kio à lui seul), le panneau des médias et le calendrier
 * d'hôte (react-day-picker, date-fns), alors que l'onglet ouvert par défaut est l'aperçu. Ils
 * passent par `next/dynamic` : `TabsContent` ne monte que l'onglet actif, donc leur code ne se
 * télécharge qu'à la première ouverture de l'onglet (même méthode que TCK-850 sur la fiche
 * publique).
 *
 * jsdom ne mesure aucun chunk : ce test garde la cause (le graphe d'imports statiques de la page),
 * le build mesure l'effet.
 */
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC } from '@/test/analyse-statique';
import { modulesDuGrapheClient } from '@/test/graphe-client';

const PAGE = join(RACINE_SRC, 'app', '(dashboard)', 'app', 'properties', '[id]', 'page.tsx');

const DIFFERES = [
  'components/property-form/PropertyForm.tsx',
  'components/property-dashboard/PropertyMediaPanel.tsx',
  'components/property-dashboard/PropertyCalendarPanel.tsx',
];

describe('fiche bien de la console : onglets différés', () => {
  const modules = modulesDuGrapheClient(PAGE);

  it('la page entre bien dans le graphe des onglets', () => {
    expect(modules).toContain('components/property-dashboard/PropertyDetailTabs.tsx');
  });

  it.each(DIFFERES)('%s n’est pas dans le JS initial de la fiche', (module) => {
    expect(modules).not.toContain(module);
  });
});
