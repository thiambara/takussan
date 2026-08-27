import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ENTETE_LOCALE_NEXT_INTL } from '@/proxy';

/**
 * La constante que `src/proxy.ts` RECOPIE de next-intl — et la seule chose qui l'empêche de mentir.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE MODE DE DÉFAILLANCE QUE CE TEST EXISTE POUR ATTRAPER
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `HEADER_LOCALE_NAME` est une constante INTERNE de next-intl : le paquet ne l'exporte pas. Le
 * proxy l'écrit donc en clair. Si une montée de version la renommait, **rien ne rougirait** :
 * `getRequestConfig({ requestLocale })` retomberait simplement sur le cookie, et `/en/properties/x`
 * se remettrait à rendre du français. Le défaut d'origine de TCK-434, restauré en silence par une
 * mise à jour de routine, sur une surface où il ne se voit qu'en changeant de langue ET en
 * partageant le lien.
 *
 * ⚠ Le test lit `node_modules`, ce qui est délibéré : c'est le seul endroit où la VÉRITÉ de cette
 * valeur existe. Un test qui comparerait la constante à elle-même serait vert par construction.
 */
const SOURCE_NEXT_INTL = 'node_modules/next-intl/dist/esm/production/shared/constants.js';

describe('l’en-tête de langue de next-intl', () => {
  it('est bien celui que next-intl lit', () => {
    const source = readFileSync(SOURCE_NEXT_INTL, 'utf8');
    const trouve = source.match(/const\s+\w+\s*=\s*"([^"]+)"\s*;\s*export\s*{\s*\w+\s+as\s+HEADER_LOCALE_NAME\s*}/);

    expect(
      trouve,
      `HEADER_LOCALE_NAME est introuvable dans ${SOURCE_NEXT_INTL}. next-intl a changé de forme : ` +
        'relire `RequestLocale.js` et remettre `ENTETE_LOCALE_NEXT_INTL` de `src/proxy.ts` en accord ' +
        'avec ce que le paquet lit RÉELLEMENT.',
    ).not.toBeNull();
    expect(trouve![1]).toBe(ENTETE_LOCALE_NEXT_INTL);
  });

  it('est bien lu par le résolveur de next-intl, et pas seulement déclaré', () => {
    // Refus de vacuité : si `RequestLocale.js` cessait de lire cet en-tête (bascule vers un autre
    // mécanisme), le test précédent resterait vert en gardant une constante devenue inerte.
    const source = readFileSync(
      'node_modules/next-intl/dist/esm/production/server/react-server/RequestLocale.js',
      'utf8',
    );
    expect(source).toContain('HEADER_LOCALE_NAME');
  });
});
