/**
 * TCK-850 (P33.04) — les quatre dialogues de la fiche se chargent à l'ouverture.
 *
 * `PropertyDetailContent` les importait statiquement : leur code, et react-day-picker que tirent
 * `Calendar` et `DatePicker`, entraient dans le JS initial de la fiche avant le premier clic
 * (mesuré au build : 480,1 Kio gzip, dont 17,5 de react-day-picker). Ils passent par
 * `next/dynamic` et ne sont montés qu'une fois ouverts. Le crochet `useIntentionDeReservation`,
 * appelé au montage, sort du module du dialogue de réservation : l'importer suffisait à tirer tout
 * le dialogue.
 *
 * jsdom ne mesure aucun chunk : ce test garde la cause (le graphe d'imports statiques), le build
 * mesure l'effet.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ICI = path.resolve(__dirname, '..');
const source = readFileSync(path.join(ICI, 'PropertyDetailContent.tsx'), 'utf8');
const importsStatiques = [...source.matchAll(/^import[\s\S]*?from\s+'([^']+)';/gm)].map((m) => m[1]);

const DIALOGUES = [
  'PropertyVisitDialog',
  'PropertyReservationDialog',
  'PropertyShareDialog',
  'PropertyContactMessageDialog',
];

describe('fiche bien : dialogues différés', () => {
  for (const nom of DIALOGUES) {
    it(`${nom} n'est pas importé statiquement`, () => {
      expect(importsStatiques).not.toContain(`./components/${nom}`);
    });

    it(`${nom} est chargé par next/dynamic`, () => {
      expect(source).toMatch(new RegExp(`dynamic\\(\\s*\\(\\)\\s*=>\\s*import\\('\\./components/${nom}'\\)`));
    });
  }

  it("le crochet d'intention de réservation ne vit plus dans le module du dialogue", () => {
    const dialogue = readFileSync(path.join(ICI, 'components/PropertyReservationDialog.tsx'), 'utf8');
    expect(dialogue).not.toMatch(/export function useIntentionDeReservation/);
  });
});
