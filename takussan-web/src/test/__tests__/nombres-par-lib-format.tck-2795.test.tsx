/**
 * TCK-2795 (décision n° 11 (a) du porteur, suite de TCK-2714) — un nombre affiché groupe ses milliers
 * par U+00A0, comme un montant, et il le fait par `@/lib/format` (`useFormatteurs().nombre`,
 * `formatNumber`), le seul point de passage de la règle (`lib/format/groupes.ts`).
 *
 * next-intl, lui, groupe par l'espace FINE U+202F d'`Intl` (relevé du 2026-11-13, use-intl 4.13.6) :
 * `useFormatter().number()`, `getFormatter().number()` et l'argument `{x, number}` d'un message
 * rendent « 1 250 » en U+202F. Les deux espaces sont insécables — aucune coupure n'est en jeu — mais
 * deux nombres affichés côte à côte ne groupaient pas de la même façon.
 *
 * Cette garde refuse donc, hors d'une LISTE FERMÉE (vide aujourd'hui) :
 *   1. un `.number(` appelé sur ce que rend `useFormatter()` ou `getFormatter()` ;
 *   2. un argument `{x, number…}` dans `fr.json` ou `wo.json`. `en.json` n'est pas lu : l'anglais
 *      groupe par une virgule, que la règle ne touche pas.
 * La forme juste : formater le nombre par `useFormatteurs().nombre(x)` et passer la CHAÎNE au
 * message (`{x}`), comme `dashboard.exports.truncated`.
 *
 * ⚠ CE QUE CETTE GARDE NE VOIT PAS, ET POURQUOI C'EST ÉCRIT : le `#` des pluriels ICU
 * (« {count, plural, one {# bien} other {# biens}} », plus de 560 messages `fr`) passe par le
 * formateur de nombres interne de use-intl, qu'aucune API publique ne laisse remplacer. Il garde
 * U+202F — décision de TCK-2795, avec sa voie de retour dans le dernier `describe` de ce fichier.
 */
import { globSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import fr from '@/messages/fr.json';

const SOURCES = globSync('src/**/*.{ts,tsx}').filter(
  (f) => !/__tests__|\.test\.tsx?$/.test(f) && !f.startsWith('src/lib/format'),
);

/**
 * LISTE FERMÉE des `.number(` de next-intl tolérés, `fichier` → raison. Vide : un ajout est une
 * décision, écrite ici avec sa raison (par exemple un nombre qui ne peut jamais atteindre 1 000).
 */
const FORMATEURS_TOLERES: Readonly<Record<string, string>> = {};

/** LISTE FERMÉE des clés (`fr`/`wo`) tolérées avec un `{x, number}`, clé → raison. Vide. */
const MESSAGES_TOLERES: Readonly<Record<string, string>> = {};

/** Les variables liées à `useFormatter()` / `getFormatter()` d'un fichier, et leurs `.number(`. */
function appelsDeNumber(source: string): string[] {
  const noms = [...source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useFormatter|getFormatter)\s*\(/g)].map(
    (m) => m[1],
  );
  const appels = noms.flatMap((nom) => [...source.matchAll(new RegExp(`\\b${nom}\\s*\\.\\s*number\\s*\\(`, 'g'))].map(() => `${nom}.number(`));
  // `const { number } = useFormatter()` : la déstructuration contourne le nom.
  if (/\{[^}]*\bnumber\b[^}]*\}\s*=\s*(?:await\s+)?(?:useFormatter|getFormatter)\s*\(/.test(source)) appels.push('{ number }');
  return appels;
}

type Arbre = { readonly [cle: string]: string | Arbre };

function messagesANombre(arbre: Arbre, chemin: string[] = []): string[] {
  return Object.entries(arbre).flatMap(([cle, valeur]) =>
    typeof valeur === 'string'
      ? /\{\s*[\w.]+\s*,\s*number\b/.test(valeur)
        ? [[...chemin, cle].join('.')]
        : []
      : messagesANombre(valeur, [...chemin, cle]),
  );
}

describe('TCK-2795 — un nombre groupable passe par lib/format, pas par next-intl', () => {
  it('parcourt bien les sources (sans quoi la garde ne garderait rien)', () => {
    expect(SOURCES.length).toBeGreaterThan(500);
    // L'auto-épreuve du motif : chaque forme refusée est vue.
    expect(appelsDeNumber('const format = useFormatter();\nformat.number(n)')).toEqual(['format.number(']);
    expect(appelsDeNumber('const f = await getFormatter();\nf . number (n, {})')).toEqual(['f.number(']);
    expect(appelsDeNumber('const { number, dateTime } = useFormatter();')).toEqual(['{ number }']);
    expect(appelsDeNumber('const format = useFormatter();\nformat.dateTime(d)')).toEqual([]);
    expect(messagesANombre({ a: { b: 'Au plus {max, number} lignes' }, c: '{n, plural, other {# x}}' })).toEqual(['a.b']);
  });

  it('aucun `.number(` de useFormatter()/getFormatter() hors de la liste fermée', () => {
    const fautifs = SOURCES.flatMap((f) => {
      const appels = appelsDeNumber(readFileSync(f, 'utf8'));
      return appels.length && !(f in FORMATEURS_TOLERES) ? [`${f} : ${appels.join(', ')}`] : [];
    });
    expect(fautifs, 'formatez par useFormatteurs().nombre (lib/format), qui groupe par U+00A0').toEqual([]);
  });

  it('aucun `{x, number}` dans fr.json ni wo.json hors de la liste fermée', () => {
    for (const locale of ['fr', 'wo']) {
      const arbre = JSON.parse(readFileSync(`src/messages/${locale}.json`, 'utf8')) as Arbre;
      const fautifs = messagesANombre(arbre).filter((cle) => !(cle in MESSAGES_TOLERES));
      expect(fautifs, `${locale}.json : passez la chaîne de useFormatteurs().nombre à un argument {x}`).toEqual([]);
    }
  });

  it('les listes fermées ne gardent rien de mort', () => {
    for (const f of Object.keys(FORMATEURS_TOLERES)) expect(appelsDeNumber(readFileSync(f, 'utf8'))).not.toEqual([]);
  });
});

describe('TCK-2795 — le `#` des pluriels : décision écrite, et sa voie de retour', () => {
  it('le `#` rend encore U+202F (use-intl n’expose pas ses formateurs) : le jour où il rougit, relire TCK-2795', () => {
    // Un message RÉEL. Si ce rendu passe à U+00A0, use-intl a changé : le `#` suit enfin la règle,
    // et la décision de TCK-2795 (« 569 messages gardent U+202F ») est à refermer.
    const t = createTranslator({ locale: 'fr', messages: fr });
    expect(t('nav.propertiesCount', { count: 1250 })).toBe('1 250 biens');
  });

  it('IntlProvider n’accepte aucun formateur : le jour où il en accepte, tsc rougit ici', () => {
    // `@ts-expect-error` DEVIENT une erreur (« inutilisée ») dès que next-intl type une prop
    // `formatters` : c'est le signal pour brancher `formaterGroupesLisibles` sur le `#`.
    const element = createElement(NextIntlClientProvider, {
      locale: 'fr',
      // @ts-expect-error — TCK-2795 : aucune prop publique ne fournit les formateurs (use-intl 4.13).
      formatters: {},
    });
    expect(element).toBeTruthy();
  });
});
