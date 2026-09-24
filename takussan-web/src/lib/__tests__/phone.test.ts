import { describe, expect, it } from 'vitest';

import {
  INDICATIF_PAR_DEFAUT,
  composerTelephone,
  decomposerTelephone,
  formaterTelephone,
  normaliserIndicatif,
  numeroComposable,
  recomposerTelephone,
  relireTelephoneBrouillon,
} from '../phone';

/**
 * TCK-566 — la saisie du téléphone sépare l'INDICATIF (affiché, jamais édité)
 * des CHIFFRES que la personne tape.
 *
 * Le défaut d'origine : l'assistant « Publier votre premier bien » amorçait le
 * champ avec la VALEUR `+221`. Un clic posé en tête du champ, et les chiffres
 * s'inséraient AVANT l'indicatif — `78|+221` à l'écran, `780143710+221` au
 * récapitulatif, et c'est cette chaîne-là qui partait au serveur.
 */
describe('lib/phone — TCK-566', () => {
  it('normalise un indicatif géo, et retombe sur +221 quand il est absent ou illisible', () => {
    expect(normaliserIndicatif('+221')).toBe('+221');
    expect(normaliserIndicatif('221')).toBe('+221');
    expect(normaliserIndicatif(' +33 ')).toBe('+33');
    expect(normaliserIndicatif('')).toBe(INDICATIF_PAR_DEFAUT);
    expect(normaliserIndicatif(undefined)).toBe(INDICATIF_PAR_DEFAUT);
    expect(normaliserIndicatif('abc')).toBe(INDICATIF_PAR_DEFAUT);
  });

  it('compose l’indicatif DEVANT les chiffres tapés, quels qu’ils soient', () => {
    expect(composerTelephone('78', '+221')).toBe('+22178');
    expect(composerTelephone('78 014 37 10', '+221')).toBe('+221780143710');
    // Rien de tapé : rien d'enregistré — pas un indicatif seul.
    expect(composerTelephone('', '+221')).toBe('');
    expect(composerTelephone('  ', '+221')).toBe('');
  });

  it('un « + » ou un « 00 » en tête bascule en numéro international complet', () => {
    expect(composerTelephone('+33 6 12 34 56 78', '+221')).toBe('+33612345678');
    expect(composerTelephone('00221 78 014 37 10', '+221')).toBe('+221780143710');
    expect(composerTelephone('+', '+221')).toBe('+');
  });

  it('+221 : l’indicatif tapé sans « + » (12 chiffres commençant par 221) n’est pas doublé', () => {
    expect(composerTelephone('221780143710', '+221')).toBe('+221780143710');
  });

  it('décompose une valeur en indicatif + saisie, sans jamais laisser l’indicatif dans la saisie', () => {
    expect(decomposerTelephone('+221780143710', '+221')).toEqual({
      international: false,
      saisie: '780143710',
    });
    expect(decomposerTelephone('', '+221')).toEqual({ international: false, saisie: '' });
    expect(decomposerTelephone('+33612345678', '+221')).toEqual({
      international: true,
      saisie: '+33612345678',
    });
    // La forme corrompue que le défaut a produite et enregistrée.
    expect(decomposerTelephone('780143710+221', '+221')).toEqual({
      international: false,
      saisie: '780143710',
    });
  });

  it('recompose une valeur enregistrée — y compris la forme corrompue — en E.164', () => {
    expect(recomposerTelephone('780143710+221', '+221')).toBe('+221780143710');
    expect(recomposerTelephone('770000000', '+221')).toBe('+221770000000');
    expect(recomposerTelephone('+221 77 000 00 00', '+221')).toBe('+221770000000');
    expect(recomposerTelephone('+33612345678', '+221')).toBe('+33612345678');
    expect(recomposerTelephone('', '+221')).toBe('');
  });

  it('un numéro n’est « composable » qu’en E.164 complet, et à 9 chiffres pour +221', () => {
    expect(numeroComposable('+221780143710')).toBe(true);
    expect(numeroComposable('+33612345678')).toBe(true);
    expect(numeroComposable('+22178')).toBe(false);
    expect(numeroComposable('+2217801437100')).toBe(false);
    expect(numeroComposable('780143710+221')).toBe(false);
    expect(numeroComposable('')).toBe(false);
  });

  // Relevé par le vérificateur : seules 2 et 10 chiffres étaient essayés. Une
  // borne relâchée à « 8 ou 9 » passait tous les tests — et `+22178014371`
  // (11 chiffres, E.164 valide en apparence) ouvrait « Envoyer le code » pour
  // un 422 de l'API. Les deux voisins immédiats de la borne, des deux côtés.
  it('la borne +221 est EXACTEMENT 9 chiffres : 8 et 10 sont refusés, 9 accepté', () => {
    expect(numeroComposable('+22178014371')).toBe(false);
    expect(numeroComposable('+221780143710')).toBe(true);
    expect(numeroComposable('+2217801437100')).toBe(false);
  });

  it('relit le téléphone d’un brouillon hérité dans la forme d’aujourd’hui', () => {
    // L'indicatif seul, amorcé comme valeur par l'ancien assistant hôte : pas un numéro.
    expect(relireTelephoneBrouillon('+221', '+221')).toBe('');
    // Forme nationale de l'ancien champ libre, et forme corrompue de TCK-566.
    expect(relireTelephoneBrouillon('771234567', '+221')).toBe('+221771234567');
    expect(relireTelephoneBrouillon('780143710+221', '+221')).toBe('+221780143710');
    // `''` enregistré `null` par le serveur, ou valeur d'un autre type.
    expect(relireTelephoneBrouillon(null, '+221')).toBe('');
    expect(relireTelephoneBrouillon(771234567, '+221')).toBe('');
    // Idempotente : une valeur déjà en E.164, sénégalaise ou non, reste telle quelle.
    expect(relireTelephoneBrouillon('+221771234567', '+221')).toBe('+221771234567');
    expect(relireTelephoneBrouillon('+33612345678', '+221')).toBe('+33612345678');
  });

  // Relevé par le vérificateur (passe 3) : l'ancien autosave amorçait le
  // téléphone avec l'indicatif géo DU JOUR de l'écriture. Relu sous un autre
  // indicatif, ce fantôme passait pour un numéro international (« +221 » tel
  // quel), donc pour une saisie. Un indicatif seul n'est jamais un numéro,
  // quel que soit l'indicatif courant.
  it('un indicatif seul, quel qu’il soit, est relu comme vide', () => {
    expect(relireTelephoneBrouillon('+221', '+33')).toBe('');
    expect(relireTelephoneBrouillon('+33', '+221')).toBe('');
    expect(relireTelephoneBrouillon(' +1268 ', '+221')).toBe('');
    expect(relireTelephoneBrouillon('+', '+221')).toBe('');
    // Au-delà, c'est une saisie : elle est gardée, même incomplète.
    expect(relireTelephoneBrouillon('+33612', '+221')).toBe('+33612');
    expect(relireTelephoneBrouillon('+221', '+221')).toBe('');
  });

  it('formate un numéro sénégalais par groupes pour la lecture, et laisse les autres tels quels', () => {
    expect(formaterTelephone('+221780143710')).toBe('+221 78 014 37 10');
    expect(formaterTelephone('+33612345678')).toBe('+33612345678');
    expect(formaterTelephone('')).toBe('');
  });
});
