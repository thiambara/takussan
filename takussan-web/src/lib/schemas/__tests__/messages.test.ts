import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { TIMEZONE } from '@/i18n/config';
import { decodeMsgValidation, msgValidation, PREFIXE_VALIDATION } from '../messages';

const DICTIONNAIRES = { fr, en, wo } as const;

/** Feuilles `<chemin, valeur>` d'un sous-arbre. */
function feuilles(noeud: unknown, prefixe = ''): [string, string][] {
  if (typeof noeud === 'string') return [[prefixe, noeud]];
  if (!noeud || typeof noeud !== 'object') return [];
  return Object.entries(noeud as Record<string, unknown>).flatMap(([cle, valeur]) =>
    feuilles(valeur, prefixe ? `${prefixe}.${cle}` : cle),
  );
}

describe('msgValidation / decodeMsgValidation', () => {
  it('encode une clé nue et la relit', () => {
    const m = msgValidation('property.titleRequired');
    expect(m).toBe('validation.property.titleRequired');
    expect(decodeMsgValidation(m)).toEqual({ cle: 'validation.property.titleRequired' });
  });

  it('encode les paramètres ICU et les relit', () => {
    const m = msgValidation('message.bodyTooLong', { max: '4000' });
    expect(decodeMsgValidation(m)).toEqual({
      cle: 'validation.message.bodyTooLong',
      valeurs: { max: '4000' },
    });
  });

  it('rend null pour tout ce qui n’est PAS une clé de ce module', () => {
    // Le message 422 de Laravel remis sur un champ ne doit jamais être re-traduit.
    expect(decodeMsgValidation('Cette adresse e-mail est déjà utilisée.')).toBeNull();
    expect(decodeMsgValidation(undefined)).toBeNull();
    expect(decodeMsgValidation(42)).toBeNull();
  });
});

/**
 * ⚠️ Le contrôle qui compte : **next-intl passe chaque message dans ICU MessageFormat**, où
 * l'apostrophe et les accolades sont des caractères d'échappement. Un libellé déplacé du code vers
 * le dictionnaire peut donc changer À L'ÉCRAN sans que personne n'ait retouché son texte —
 * exactement le mode d'échec que TCK-292 interdit.
 *
 * On ne le déduit pas de la spécification ICU : on rend chaque valeur et on la compare à
 * elle-même. Les seuls messages exemptés sont ceux qui portent délibérément un paramètre.
 */
describe('validation.* traverse ICU sans changer de texte', () => {
  const AVEC_PARAMETRES = new Set(['validation.message.bodyTooLong']);

  for (const locale of Object.keys(DICTIONNAIRES) as (keyof typeof DICTIONNAIRES)[]) {
    it(`${locale} — chaque valeur se rend telle quelle`, () => {
      const messages = DICTIONNAIRES[locale] as Record<string, unknown>;
      const t = createTranslator({ locale, messages, timeZone: TIMEZONE });
      const entrees = feuilles(messages.validation, PREFIXE_VALIDATION.slice(0, -1));

      expect(entrees.length).toBeGreaterThan(100);
      for (const [chemin, valeur] of entrees) {
        if (AVEC_PARAMETRES.has(chemin)) continue;
        // @ts-expect-error — chemin dynamique, volontairement non typé par next-intl.
        expect(t(chemin)).toBe(valeur);
      }
    });
  }

  it('interpole le seul message paramétré, et rend le nombre VERBATIM', () => {
    // `{max}` reçoit une CHAÎNE et non un nombre : passé en nombre, ICU le formaterait selon la
    // locale et « 4000 » deviendrait « 4 000 » en français — un changement d'affichage.
    const t = createTranslator({ locale: 'fr', messages: fr, timeZone: TIMEZONE });
    expect(t('validation.message.bodyTooLong', { max: '4000' })).toBe(
      'Message trop long (4000 caractères max).',
    );
  });
});
