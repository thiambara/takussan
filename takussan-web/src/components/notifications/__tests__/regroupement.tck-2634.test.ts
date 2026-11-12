import { describe, expect, it } from 'vitest';

import type { AppNotification } from '@/lib/notifications';

import { cleDeRepli, grouperParJour, jourDe, quandRelatif, replier, type TextesDuQuand } from '../regroupement';

/**
 * TCK-2634 — le repli des répétitions, les jours et les dates relatives : des fonctions pures, sur les
 * lignes CHARGÉES (le repli ne change ni la pagination de l'API ni le compte des non-lues).
 */

let suivant = 1;
function n(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: suivant++,
    type: 'system',
    code: 'boost.ended',
    title: 'Mise en avant terminée',
    is_read: false,
    read_at: null,
    created_at: '2026-11-11T09:05:00+00:00',
    target: { kind: 'property', id: 1, path: '/app/properties/1' },
    ...overrides,
  };
}

const MAINTENANT = new Date('2026-11-12T10:00:00Z');

describe('replier', () => {
  it('replie 9 lignes consécutives de même code en une seule, dans l’ordre', () => {
    const visite = n({ code: 'visit.requested', title: 'Demande de visite' });
    const boosts = Array.from({ length: 9 }, () => n());
    const paiement = n({ code: 'lease_payment.recorded' });
    const elements = replier([visite, ...boosts, paiement]);

    expect(elements.map((e) => e.type)).toEqual(['seule', 'repli', 'seule']);
    const repli = elements[1];
    expect(repli.type === 'repli' && repli.lignes.map((l) => l.id)).toEqual(boosts.map((b) => b.id));
  });

  it('ne replie pas deux lignes : sous le seuil, elles restent lisibles', () => {
    expect(replier([n(), n()]).map((e) => e.type)).toEqual(['seule', 'seule']);
  });

  it('ne replie que des lignes CONSÉCUTIVES', () => {
    const autre = n({ code: 'review.received' });
    const elements = replier([n(), n(), autre, n(), n()]);
    expect(elements.every((e) => e.type === 'seule')).toBe(true);
  });

  it('sans code, replie par le titre de l’API ET le genre de la cible — jamais avec les lignes à code', () => {
    const anciennes = Array.from({ length: 3 }, () => n({ code: null }));
    const nouvelles = Array.from({ length: 3 }, () => n());
    expect(cleDeRepli(anciennes[0])).not.toBe(cleDeRepli(nouvelles[0]));
    expect(replier([...nouvelles, ...anciennes]).map((e) => e.type)).toEqual(['repli', 'repli']);
    // Même titre, autre cible : deux natures.
    expect(cleDeRepli(n({ code: null, target: { kind: 'lease', id: 2, path: '/x' } }))).not.toBe(cleDeRepli(anciennes[0]));
  });
});

describe('une ligne qui attend un geste', () => {
  const visite = (lue: boolean) =>
    n({ code: 'visit.requested', a_traiter: true, read_at: lue ? '2026-11-11T10:00:00Z' : null, is_read: lue });

  it('ne se replie jamais (à traiter ET non lue) : elle coupe la suite, et garde son verbe', () => {
    const lignes = [visite(true), visite(true), visite(true), visite(false), visite(true), visite(true), visite(true)];
    const elements = replier(lignes);
    expect(elements.map((e) => e.type)).toEqual(['repli', 'seule', 'repli']);
    const seule = elements[1];
    expect(seule.type === 'seule' && seule.notification.id).toBe(lignes[3].id);
  });

  it('lue, elle se replie comme les autres', () => {
    expect(replier([visite(true), visite(true), visite(true)]).map((e) => e.type)).toEqual(['repli']);
  });
});

describe('jours', () => {
  it('range aujourd’hui, hier, cette semaine (2 à 6 jours) et plus ancien, au jour de Dakar', () => {
    expect(jourDe('2026-11-12T00:10:00Z', MAINTENANT)).toBe('aujourdhui');
    expect(jourDe('2026-11-11T23:50:00Z', MAINTENANT)).toBe('hier');
    expect(jourDe('2026-11-06T12:00:00Z', MAINTENANT)).toBe('semaine');
    expect(jourDe('2026-11-05T12:00:00Z', MAINTENANT)).toBe('ancien');
  });

  it('un repli va au jour de sa ligne la plus récente', () => {
    const lignes = [
      n({ created_at: '2026-11-11T09:00:00Z' }),
      n({ created_at: '2026-11-01T09:00:00Z' }),
      n({ created_at: '2026-05-09T09:00:00Z' }),
    ];
    const groupes = grouperParJour(replier(lignes), MAINTENANT);
    expect(groupes.map((g) => g.jour)).toEqual(['hier']);
    expect(groupes[0].elements).toHaveLength(1);
  });
});

describe('quandRelatif', () => {
  // Les mots et la date sont fournis (`useQuand` les tire de next-intl et de `useFormatteurs`) : ici,
  // des formes témoins qui disent quelle branche a été prise.
  const TEXTES: TextesDuQuand = {
    instant: 'à l’instant',
    minutes: (n) => `il y a ${n} min`,
    heures: (n) => `il y a ${n} h`,
    hier: 'hier',
    date: (d, semaine, annee) => `${semaine ? 'jour ' : ''}${d.toISOString().slice(0, 10)}${annee ? ' +année' : ''}`,
  };
  const quand = (iso: string) => quandRelatif(iso, MAINTENANT, TEXTES);

  it('dit « il y a 5 min », « il y a 2 h », « hier », le jour de la semaine, puis la date courte', () => {
    expect(quand('2026-11-12T09:59:40Z')).toBe('à l’instant');
    expect(quand('2026-11-12T09:55:00Z')).toBe('il y a 5 min');
    expect(quand('2026-11-12T08:00:00Z')).toBe('il y a 2 h');
    expect(quand('2026-11-11T09:00:00Z')).toBe('hier');
    expect(quand('2026-11-07T09:00:00Z')).toBe('jour 2026-11-07');
    expect(quand('2026-11-03T09:00:00Z')).toBe('2026-11-03');
    expect(quand('2025-11-03T09:00:00Z')).toBe('2025-11-03 +année');
  });

  it('un autre jour à venir dit sa date, jamais « à l’instant »', () => {
    expect(quand('2026-12-01T10:28:00Z')).toBe('2026-12-01');
  });
});
