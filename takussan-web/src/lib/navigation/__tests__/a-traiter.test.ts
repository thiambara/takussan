import { describe, expect, it } from 'vitest';
import { PASTILLES_VISIBLES, pastillesATraiter, type EntreeComptee } from '../a-traiter';
import { DISPOSITIONS } from '../dispositions';
import { PERSONAS } from '../personas';
import type { NavCounterKey } from '../types';

const ENTREES: EntreeComptee[] = [
  { href: '/app/messages', counterKey: 'unreadMessages' },
  { href: '/app/visits', counterKey: 'pendingVisits', hrefATraiter: '/app/visits?tab=requested' },
  { href: '/app/leads', counterKey: 'unhandledLeads', hrefATraiter: '/app/leads?filtre=todo' },
  {
    href: '/app/agency/moderation',
    counterKey: 'reviewModeration',
    hrefATraiter: '/app/agency/moderation?filter[moderation_status]=pending',
  },
  { href: '/app/agency/moderation/properties', counterKey: 'propertyModeration' },
];
const TOUS: Record<NavCounterKey, number> = {
  unreadMessages: 3,
  pendingVisits: 2,
  unhandledLeads: 1,
  reviewModeration: 4,
  propertyModeration: 5,
};

describe('TCK-2479 — pastillesATraiter (ADR-0089 §5)', () => {
  it('AC1 — suit l’ordre des priorités, pas celui du menu, et vise la page filtrée', () => {
    const { visibles } = pastillesATraiter(ENTREES, TOUS, ['unhandledLeads', 'pendingVisits', 'unreadMessages']);
    expect(visibles.map((p) => [p.cle, p.nombre, p.href])).toEqual([
      ['unhandledLeads', 1, '/app/leads?filtre=todo'],
      ['pendingVisits', 2, '/app/visits?tab=requested'],
      ['unreadMessages', 3, '/app/messages'],
    ]);
  });

  it('AC1 — à zéro partout, aucune pastille', () => {
    const zero = { unreadMessages: 0, pendingVisits: 0, unhandledLeads: 0, reviewModeration: 0, propertyModeration: 0 };
    expect(pastillesATraiter(ENTREES, zero, DISPOSITIONS.plateforme.priorites)).toEqual({ visibles: [], autres: [] });
  });

  it('0, une valeur absente ou négative : pas de pastille', () => {
    const comptes = { unreadMessages: 0, pendingVisits: -1 };
    expect(
      pastillesATraiter(ENTREES, comptes, ['unreadMessages', 'pendingVisits', 'unhandledLeads']).visibles,
    ).toEqual([]);
  });

  it('un compteur hors des priorités du persona ne monte pas dans la bande', () => {
    expect(pastillesATraiter(ENTREES, TOUS, ['unreadMessages']).visibles.map((p) => p.cle)).toEqual(['unreadMessages']);
  });

  it('une entrée absente du menu, ou cadenassée, ne fait pas de pastille (TCK-377 : pas de sondage)', () => {
    const entrees: EntreeComptee[] = [{ href: '/app/leads', counterKey: 'unhandledLeads', locked: true }];
    expect(pastillesATraiter(entrees, TOUS, ['unhandledLeads', 'unreadMessages']).visibles).toEqual([]);
  });

  it(`${PASTILLES_VISIBLES} pastilles au plus ; le reste, dans l’ordre, derrière « +N »`, () => {
    const { visibles, autres } = pastillesATraiter(ENTREES, TOUS, [
      'propertyModeration',
      'reviewModeration',
      'unhandledLeads',
      'pendingVisits',
      'unreadMessages',
    ]);
    expect(visibles.map((p) => p.cle)).toEqual([
      'propertyModeration',
      'reviewModeration',
      'unhandledLeads',
      'pendingVisits',
    ]);
    expect(autres.map((p) => p.cle)).toEqual(['unreadMessages']);
  });
});

describe('TCK-2479 — la priorité de chaque persona (arbitrage 6 du plan)', () => {
  it('la table', () => {
    expect(Object.fromEntries(PERSONAS.map((p) => [p, DISPOSITIONS[p].priorites]))).toEqual({
      client: ['unreadMessages'],
      locataire: ['unreadMessages'],
      bailleur: ['unreadMessages', 'unhandledLeads', 'pendingVisits'],
      agent: ['unhandledLeads', 'pendingVisits', 'unreadMessages'],
      'admin-agence': ['unhandledLeads', 'pendingVisits', 'unreadMessages', 'propertyModeration', 'reviewModeration'],
      hote: ['unreadMessages', 'unhandledLeads', 'pendingVisits'],
      prestataire: ['unreadMessages'],
      plateforme: ['propertyModeration', 'reviewModeration', 'unhandledLeads', 'pendingVisits', 'unreadMessages'],
    });
  });

  it.each(PERSONAS)('%s : aucune clé deux fois', (persona) => {
    const priorites = DISPOSITIONS[persona].priorites;
    expect(new Set(priorites).size).toBe(priorites.length);
  });

  it('AC6 — le prestataire ne fait monter que la messagerie, quels que soient les compteurs', () => {
    const { visibles } = pastillesATraiter(ENTREES, TOUS, DISPOSITIONS.prestataire.priorites);
    expect(visibles.map((p) => p.cle)).toEqual(['unreadMessages']);
  });
});
