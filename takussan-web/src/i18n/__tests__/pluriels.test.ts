/**
 * TCK-752 (P06.10) — un compte s'accorde : « 1 bien », « 2 biens », jamais « 1 biens » ni
 * « 1 document(s) ».
 *
 * Deux preuves : les messages convertis rendus à 1 et à 2 dans les deux langues, et le contrôle D
 * de `scripts/check-i18n.mjs` (`accordsManquants`) vide sur les vrais dictionnaires, et non vide
 * sur un message fautif.
 */
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';

import { accordsManquants, INVARIABLES } from '../../../scripts/i18n-pluriels.mjs';

type Arbre = Record<string, unknown>;

function feuilles(arbre: Arbre, prefixe = '', acc = new Map<string, unknown>()) {
  for (const [k, v] of Object.entries(arbre)) {
    const chemin = prefixe ? `${prefixe}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) feuilles(v as Arbre, chemin, acc);
    else acc.set(chemin, v);
  }
  return acc;
}

const rendre = (locale: 'fr' | 'en', cle: string, valeurs: Record<string, number | string>) => {
  const t = createTranslator({ locale, messages: locale === 'fr' ? fr : en });
  return (t as unknown as (k: string, v: Record<string, number | string>) => string)(cle, valeurs);
};

describe('pluriels ICU (TCK-752)', () => {
  it.each([
    ['fr', 'nav.propertiesCount', '1 bien', '2 biens'],
    ['en', 'nav.propertiesCount', '1 listing', '2 listings'],
    ['fr', 'property.detail.viewsCount', '1 vue', '2 vues'],
    ['en', 'property.detail.reviewsCount', '(1 review)', '(2 reviews)'],
    ['en', 'property.wizard.preview.entryDeposit', '1 month of deposit', '2 months of deposit'],
    ['fr', 'documents.library.count', '1 document', '2 documents'],
    ['en', 'documents.library.count', '1 document', '2 documents'],
    ['fr', 'dashboard.agencyKpis.rentedHint', '1 bien loué', '2 biens loués'],
    ['fr', 'superAdmin.pages.upgradeRequests.plannedAgents', ' · 1 agent prévu', ' · 2 agents prévus'],
    ['en', 'serviceProviders.multiAgency.subtitle', 'You now collaborate with 1 agency.', 'You now collaborate with 2 agencies.'],
  ] as const)('%s %s : %s / %s', (locale, cle, un, deux) => {
    expect(rendre(locale, cle, { count: 1 })).toContain(un);
    expect(rendre(locale, cle, { count: 2 })).toContain(deux);
  });

  it('accorde une variable autre que count', () => {
    expect(rendre('fr', 'dashboard.pages.propertyNew.quotaUsage', { used: 1, limit: 5 }))
      .toBe('1 annonce active sur 5 permises par votre offre.');
    expect(rendre('fr', 'superAdmin.moderation.batchResult', { ok: 2, failed: 0 }))
      .toBe('2 traités, 0 en échec.');
    expect(rendre('en', 'notifications.codes.prospect_match.digest.body', { properties: 1, prospects: 3 }))
      .toBe('1 new or repriced property matches 3 of your prospects.');
  });

  it('formate le nombre selon la langue, au lieu de le recevoir déjà formaté', () => {
    expect(rendre('fr', 'dashboard.agencyKpis.publishedHint', { count: 1500 })).toMatch(/^1\s500 publiés$/u);
  });
});

describe('contrôle D de check-i18n : les comptes qui ne s’accordent pas', () => {
  it.each(['fr', 'en'] as const)('ne relève rien dans %s.json', (locale) => {
    const { releves, perimees } = accordsManquants(feuilles(locale === 'fr' ? fr : en), locale);
    expect(releves).toEqual([]);
    expect(perimees).toEqual([]);
  });

  it('relève un {count} suivi d’un nom, et une forme (s)', () => {
    const { releves } = accordsManquants(new Map([
      ['a', '{count} biens'],
      ['b', '{n} document(s)'],
      ['c', '{count, plural, one {# bien} other {# biens}}'],
      ['d', 'Plus longue attente (s)'],
    ]), 'fr');
    expect(releves).toEqual(['a', 'b']);
  });

  it('dit qu’une exception ne sert plus', () => {
    const cle = Object.keys(INVARIABLES.fr)[0];
    const { perimees } = accordsManquants(new Map([[cle, '{count, plural, other {# x}}']]), 'fr');
    expect(perimees).toContain(cle);
  });

  it('ne lit pas le wolof, en pause', () => {
    expect(feuilles(wo).get('nav.propertiesCount')).toBe('{count} kër');
  });
});
