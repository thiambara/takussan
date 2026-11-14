import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';

import { MOTIFS_HORS_LIGNE, cleDuMotif, phrasesDesMotifs } from '../motifs-hors-ligne';

/**
 * TCK-2678 — les codes que le front sait dire sont EXACTEMENT ceux que l'API peut rendre, relus dans
 * `Property.php` (les clés de `conditionsEnLigne()`, `status` déplié sur `NON_PUBLIC_STATUSES`), et
 * chacun a sa phrase dans les trois langues.
 */
const PROPERTY_PHP = readFileSync(join(process.cwd(), '..', 'takussan-api', 'app', 'Models', 'Property.php'), 'utf8');

function codesDeLApi(): string[] {
  const statuts = /NON_PUBLIC_STATUSES = \[([^\]]+)\]/.exec(PROPERTY_PHP)?.[1] ?? '';
  const corps = /function conditionsEnLigne\(\): array\s*\{([\s\S]*?)\n    \}/.exec(PROPERTY_PHP)?.[1] ?? '';
  const conditions = [...corps.matchAll(/'(\w+)' => fn/g)].map((m) => m[1]);
  expect(conditions.length, 'conditionsEnLigne() relue').toBeGreaterThan(0);
  return conditions.flatMap((c) => (c === 'status' ? [...statuts.matchAll(/'(\w+)'/g)].map((m) => `status_${m[1]}`) : [c]));
}

type Arbre = { readonly [cle: string]: string | Arbre };
const phrase = (dico: Arbre, cle: string) =>
  ['property', 'dashboard', 'horsLigne', ...cle.split('.')].reduce<string | Arbre | undefined>((a, k) => (typeof a === 'object' ? a[k] : undefined), dico);

describe('motifs d’un bien hors ligne (TCK-2678)', () => {
  it('le front connaît exactement les codes de l’API, dans son ordre', () => {
    expect([...MOTIFS_HORS_LIGNE]).toEqual(codesDeLApi());
  });

  it('chaque code, et le code inconnu, a sa phrase en fr, en et wo', () => {
    for (const code of [...MOTIFS_HORS_LIGNE, 'inconnu']) {
      const cle = cleDuMotif(code);
      for (const [langue, dico] of [['fr', fr], ['en', en], ['wo', wo]] as const) {
        const texte = phrase(dico as unknown as Arbre, cle);
        expect(typeof texte, `${langue} ${cle}`).toBe('string');
        expect((texte as string).length, `${langue} ${cle}`).toBeGreaterThan(0);
      }
    }
  });

  it('un code inconnu se dit par le libellé générique, et une phrase ne se répète pas', () => {
    expect(cleDuMotif('agency_inactive')).toBe('phrase.agency_inactive');
    expect(cleDuMotif('moderation_plateforme')).toBe('phrase.inconnu');
    const t = (cle: string) => String(phrase(fr as unknown as Arbre, cle));
    expect(phrasesDesMotifs(['x', 'y', 'private'], t)).toEqual(['Hors ligne.', 'Privé — rendez-le public pour le mettre en ligne.']);
  });
});
