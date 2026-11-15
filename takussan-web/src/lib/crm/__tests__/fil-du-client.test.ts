import { describe, expect, it } from 'vitest';

import type { EntreeDuFil } from '@/lib/queries/customer-timeline';

import { entreesDesPages, filtreDeLURL, pageSuivante, requeteAvecFiltre, typesDuFiltre } from '../fil-du-client';

const visite = (id: number, milestone: 'created' | 'confirmed' | 'cancelled'): EntreeDuFil => ({
  type: 'visit', id, at: '2026-11-10T09:00:00+00:00', milestone, status: 'confirmed', scheduled_at: null, property: null,
});
const note = (id: number): EntreeDuFil => ({
  type: 'note', id, at: '2026-11-10T09:00:00+00:00', kind: 'general', body: 'x', pinned: false, property_visit_id: null, author: null,
});

describe('TCK-2589 — le filtre du fil', () => {
  it('se lit dans l’URL ; une valeur inconnue vaut « Tout »', () => {
    expect(filtreDeLURL('visites')).toBe('visites');
    expect(filtreDeLURL(null)).toBe('tout');
    expect(filtreDeLURL('visit')).toBe('tout');
    expect(filtreDeLURL('tout')).toBe('tout');
  });

  it('demande à l’API le type de chaque puce, et rien pour « Tout »', () => {
    expect(typesDuFiltre('tout')).toBeNull();
    expect(typesDuFiltre('notes')).toEqual(['note']);
    expect(typesDuFiltre('visites')).toEqual(['visit']);
    expect(typesDuFiltre('appels')).toEqual(['contact']);
    expect(typesDuFiltre('etapes')).toEqual(['stage']);
  });

  it('se pose dans l’URL sans toucher aux autres paramètres ; « Tout » le retire', () => {
    expect(requeteAvecFiltre('section=documents', 'appels')).toBe('?section=documents&fil=appels');
    expect(requeteAvecFiltre('fil=appels&section=documents', 'tout')).toBe('?section=documents');
    expect(requeteAvecFiltre('fil=notes', 'tout')).toBe('');
  });
});

describe('TCK-2589 — les pages du fil', () => {
  it('mises bout à bout dans l’ordre de l’API, sans doublon ; deux jalons d’une visite restent deux entrées', () => {
    const pages = [{ data: [note(1), visite(5, 'confirmed')] }, { data: [visite(5, 'confirmed'), visite(5, 'created'), note(2)] }];
    expect(entreesDesPages(pages).map((e) => `${e.type}:${e.id}${e.type === 'visit' ? `:${e.milestone}` : ''}`)).toEqual([
      'note:1', 'visit:5:confirmed', 'visit:5:created', 'note:2',
    ]);
    expect(entreesDesPages(undefined)).toEqual([]);
  });

  it('la page suivante, jusqu’à la dernière', () => {
    expect(pageSuivante({ meta: { current_page: 1, last_page: 3 } })).toBe(2);
    expect(pageSuivante({ meta: { current_page: 3, last_page: 3 } })).toBeUndefined();
    expect(pageSuivante({})).toBeUndefined();
  });
});
