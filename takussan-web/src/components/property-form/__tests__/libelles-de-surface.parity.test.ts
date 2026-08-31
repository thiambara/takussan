import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { areaLabelKey } from '../field-matrix';

/**
 * TCK-488, AC3 — l'édition et le parcours de publication nomment la surface À L'IDENTIQUE.
 *
 * Les deux écrans lisent la MÊME fonction (`areaLabelKey`) mais dans DEUX espaces de noms
 * différents : `property.wizard.fields` pour le parcours, `property.form.fields` pour l'édition.
 * `areaLabelKey` rend une clé RELATIVE, ce qui est précisément ce qui rend les deux dictionnaires
 * capables de diverger sans qu'aucun type ne s'y oppose.
 *
 * ⚠ Cette égalité a été vérifiée une fois, à la main, au moment d'ajouter les deux entrées. *Une
 * vérification manuelle n'est pas une garde : c'est une photographie* — elle prouve l'état d'un
 * instant, jamais qu'il tienne. Le repli de next-intl aggrave le cas : une valeur `en` divergente
 * ne produit ni erreur, ni avertissement, ni rouge (`takussan-web/CLAUDE.md`, § i18n).
 */
const DICTIONNAIRES = { fr, en, wo } as const;

const CLES = ['fields.areaLand', 'fields.areaLiving'] as const;

function lire(dico: unknown, espace: 'wizard' | 'form', cleRelative: string): unknown {
  return [`property`, espace, ...cleRelative.split('.')].reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
    dico,
  );
}

describe('libellés de surface — édition ↔ parcours (TCK-488)', () => {
  for (const [locale, dico] of Object.entries(DICTIONNAIRES)) {
    for (const cle of CLES) {
      it(`${locale} · ${cle} est identique des deux côtés, caractère pour caractère`, () => {
        const parcours = lire(dico, 'wizard', cle);
        expect(parcours, `${cle} manque au parcours en ${locale}`).toEqual(expect.any(String));
        expect(lire(dico, 'form', cle)).toBe(parcours);
      });
    }
  }

  it('les deux clés que la matrice peut rendre sont exactement celles qui sont gardées ici', () => {
    // Sans ceci, `areaLabelKey` pourrait rendre une troisième clé sans que rien ne l'exige des
    // dictionnaires : la garde ci-dessus deviendrait partielle en silence.
    const rendues = new Set(
      (['land', 'farm', 'apartment', 'house', 'garage', 'other'] as const).map(areaLabelKey),
    );
    expect([...rendues].sort()).toEqual([...CLES].sort());
  });
});
