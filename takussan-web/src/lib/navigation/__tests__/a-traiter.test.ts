import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { lignesAujourdhui, type EntreeComptee } from '../a-traiter';
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
    expect(lignesAujourdhui(ENTREES, TOUS, DISPOSITIONS.prestataire.priorites).map((l) => l.cle)).toEqual(['unreadMessages']);
  });
});

describe('TCK-2489 — lignesAujourdhui (ADR-0090 §3)', () => {
  const ZERO: Record<NavCounterKey, number> = {
    unreadMessages: 0,
    pendingVisits: 0,
    unhandledLeads: 0,
    reviewModeration: 0,
    propertyModeration: 0,
  };

  it('AC2 — les lignes non nulles, dans l’ordre des priorités (pas celui du menu), vers la page filtrée', () => {
    const comptes = { ...TOUS, pendingVisits: 0 };
    expect(lignesAujourdhui(ENTREES, comptes, ['unhandledLeads', 'pendingVisits', 'unreadMessages', 'reviewModeration'])).toEqual([
      { cle: 'unhandledLeads', nombre: 1, href: '/app/leads?filtre=todo' },
      { cle: 'unreadMessages', nombre: 3, href: '/app/messages' },
      {
        cle: 'reviewModeration',
        nombre: 4,
        href: '/app/agency/moderation?filter[moderation_status]=pending',
      },
    ]);
  });

  it.each(PERSONAS)('AC2 — %s : tout à zéro, liste vide (le bloc disparaît)', (persona) => {
    expect(lignesAujourdhui(ENTREES, ZERO, DISPOSITIONS[persona].priorites)).toEqual([]);
    expect(lignesAujourdhui(ENTREES, {}, DISPOSITIONS[persona].priorites)).toEqual([]);
  });

  it('AC2 — une entrée verrouillée n’y paraît pas, même avec un compte', () => {
    const entrees: EntreeComptee[] = [
      { href: '/app/leads', counterKey: 'unhandledLeads', locked: true },
      { href: '/app/messages', counterKey: 'unreadMessages' },
    ];
    expect(lignesAujourdhui(entrees, TOUS, ['unhandledLeads', 'unreadMessages']).map((l) => l.cle)).toEqual([
      'unreadMessages',
    ]);
  });

  it('une entrée absente du menu, ou une clé hors des priorités, ne fait pas de ligne', () => {
    expect(lignesAujourdhui([], TOUS, ['unreadMessages'])).toEqual([]);
    expect(lignesAujourdhui(ENTREES, TOUS, ['unreadMessages']).map((l) => l.cle)).toEqual(['unreadMessages']);
  });

  it('0, négatif ou NaN : pas de ligne', () => {
    expect(
      lignesAujourdhui(ENTREES, { unreadMessages: 0, pendingVisits: -2, unhandledLeads: Number.NaN }, [
        'unreadMessages',
        'pendingVisits',
        'unhandledLeads',
      ]),
    ).toEqual([]);
  });

  it('aucune coupe : la plateforme voit ses cinq lignes', () => {
    expect(lignesAujourdhui(ENTREES, TOUS, DISPOSITIONS.plateforme.priorites).map((l) => l.cle)).toEqual([
      'propertyModeration',
      'reviewModeration',
      'unhandledLeads',
      'pendingVisits',
      'unreadMessages',
    ]);
  });

  const PRIORISEES = [...new Set(PERSONAS.flatMap((p) => DISPOSITIONS[p].priorites))];

  it.each([
    ['fr', fr],
    ['en', en],
    ['wo', wo],
  ] as const)('AC2 — %s : un titre et un libellé d’action non vide par clé priorisée', (_l, messages) => {
    const bloc = messages.nav.sidebar.aujourdhui as { titre: string; lignes: Record<string, string> };
    expect(bloc.titre.trim()).not.toBe('');
    for (const cle of PRIORISEES) {
      expect(bloc.lignes[cle]?.trim(), cle).toBeTruthy();
    }
  });

  it('wo porte le texte français tel quel (wolof en pause)', () => {
    expect(wo.nav.sidebar.aujourdhui).toEqual(fr.nav.sidebar.aujourdhui);
  });

  it('les libellés français disent l’action, pas la destination (ADR-0090 §3, TCK-2619)', () => {
    // TCK-2619 : « Demandes de contact » était le nom de l'entrée du menu ; la ligne dit le verbe,
    // pour que la même file ne paraisse plus deux fois sous le même nom (docs/features.md, P1).
    expect(fr.nav.sidebar.aujourdhui.lignes).toEqual({
      unreadMessages: 'Messages non lus',
      pendingVisits: 'Visites à confirmer',
      unhandledLeads: 'Demandes à traiter',
      reviewModeration: 'Avis à modérer',
      propertyModeration: 'Biens à valider',
    });
  });
});
