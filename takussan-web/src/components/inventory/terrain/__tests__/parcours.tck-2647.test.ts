/**
 * TCK-2647 — les règles du parcours de terrain, sans écran : le type déduit du bail, la pièce où
 * reprendre, ce qu'une sortie dit d'un élément dégradé, et le total des retenues proposées.
 */
import { describe, expect, it } from 'vitest';

import type { InventoryRoom } from '@/types/inventory';

import {
  degrade,
  indexDeReprise,
  nomDuLocataire,
  piecesDuModele,
  piecesPourLeServeur,
  qualifies,
  retenueProposable,
  totalDesRetenues,
  typeDeduit,
} from '../parcours';

const piece = (name: string, completed: boolean | null | undefined, n = 2): InventoryRoom => ({
  name,
  condition: 'good',
  completed,
  elements: Array.from({ length: n }, (_, i) => ({ label: `E${i}`, state: null })),
});

describe('typeDeduit — le type se lit sur le bail, et le paramètre l’emporte', () => {
  it('un bail qui commence (actif) ouvre une entrée', () => {
    expect(typeDeduit('active', null)).toBe('move_in');
  });
  it('un bail en préavis (`terminating`) ouvre une sortie', () => {
    expect(typeDeduit('terminating', null)).toBe('move_out');
  });
  it('un bail terminé ouvre une sortie', () => {
    expect(typeDeduit('terminated', null)).toBe('move_out');
  });
  it('`?type=` valide l’emporte sur le bail ; une valeur inconnue est ignorée', () => {
    expect(typeDeduit('terminating', 'move_in')).toBe('move_in');
    expect(typeDeduit('active', 'move_out')).toBe('move_out');
    expect(typeDeduit('active', 'sortie')).toBe('move_in');
  });
});

describe('indexDeReprise — la première pièce non terminée', () => {
  it('rouvre la pièce 3 quand les pièces 1 et 2 sont terminées (AC5)', () => {
    const rooms = [piece('A', true), piece('B', true), piece('C', false), piece('D', null), piece('E', undefined), piece('F', false)];
    expect(indexDeReprise(rooms)).toBe(2);
  });
  it('rend la longueur quand tout est terminé : le parcours est fini', () => {
    expect(indexDeReprise([piece('A', true), piece('B', true)])).toBe(2);
  });
  it('rend 0 pour un brouillon neuf', () => {
    expect(indexDeReprise([piece('A', null), piece('B', null)])).toBe(0);
  });
});

describe('qualifies — les éléments qui ont un état', () => {
  it('compte les états posés, jamais un état nul', () => {
    const room: InventoryRoom = {
      name: 'S',
      condition: 'good',
      elements: [
        { label: 'a', state: 'bon' },
        { label: 'b', state: null },
        { label: 'c', state: 'manquant' },
      ],
    };
    expect(qualifies(room)).toBe(2);
  });
});

describe('sortie — dégradé, retenue proposable, total', () => {
  it('un élément passé de Bon à Abîmé est dégradé et propose une retenue', () => {
    const e = { label: 'Plaques', state: 'endommagé' as const, entry_state: 'bon' as const };
    expect(degrade(e)).toBe(true);
    expect(retenueProposable(e)).toBe(true);
  });
  it('« Usé » après « Bon » est dégradé mais ne propose aucune retenue (usure normale)', () => {
    const e = { label: 'Murs', state: 'usé' as const, entry_state: 'bon' as const };
    expect(degrade(e)).toBe(true);
    expect(retenueProposable(e)).toBe(false);
  });
  it('abîmé déjà à l’entrée n’est pas dégradé', () => {
    const e = { label: 'Porte', state: 'endommagé' as const, entry_state: 'endommagé' as const };
    expect(degrade(e)).toBe(false);
    expect(retenueProposable(e)).toBe(false);
  });
  it('sans état d’entrée (élément ajouté en sortie), rien n’est dégradé', () => {
    expect(degrade({ label: 'x', state: 'endommagé', entry_state: null })).toBe(false);
  });
  it('35 000 F et 50 000 F donnent 85 000 F (AC6), les montants décimaux de l’API compris', () => {
    const rooms: InventoryRoom[] = [
      { name: 'Cuisine', condition: 'good', elements: [
        { label: 'Plaques', state: 'endommagé', entry_state: 'bon', retention_amount: '35000.00' },
        { label: 'Placards', state: 'endommagé', entry_state: 'bon', retention_amount: 50000 },
        { label: 'Murs', state: 'usé', entry_state: 'bon', retention_amount: null },
      ] },
      { name: 'WC', condition: 'good' },
    ];
    expect(totalDesRetenues(rooms)).toBe(85000);
  });
});

describe('piecesPourLeServeur — ce que le PATCH envoie', () => {
  it('retire ce que le serveur pose en lecture (états d’entrée, vignette) et garde la saisie', () => {
    const [r] = piecesPourLeServeur([
      { name: 'Cuisine', condition: 'good', completed: true, notes: 'n', elements: [
        { label: 'Plaques', state: 'endommagé', notes: 'fendue', entry_state: 'bon', entry_notes: null, entry_photo_id: 4, entry_thumbnail_url: 'u', retention_amount: 35000, retention_reason: null },
      ] },
    ]);
    expect(r).toEqual({ name: 'Cuisine', condition: 'good', completed: true, notes: 'n', elements: [
      { label: 'Plaques', state: 'endommagé', notes: 'fendue', retention_amount: 35000, retention_reason: null },
    ] });
  });
  it('une entrée n’envoie pas de clé de retenue (l’API la refuse hors sortie)', () => {
    const [r] = piecesPourLeServeur([{ name: 'S', condition: 'good', elements: [{ label: 'a', state: 'bon' }] }], 'move_in');
    expect(r?.elements?.[0]).toEqual({ label: 'a', state: 'bon', notes: null });
  });
});

describe('piecesDuModele — les pièces cochées et leurs éléments, sans état', () => {
  it('garde l’ordre du modèle, les pièces ajoutées à la fin, chaque élément non qualifié', () => {
    const rooms = piecesDuModele(
      [
        { key: 'living_room', name: 'Séjour', elements: [{ key: 'walls', label: 'Murs' }] },
        { key: 'bedroom_1', name: 'Chambre 1', elements: [{ key: 'walls', label: 'Murs' }] },
      ],
      new Set(['living_room']),
      ['Balcon'],
    );
    expect(rooms).toEqual([
      { name: 'Séjour', condition: 'good', notes: null, completed: false, elements: [{ label: 'Murs', state: null, notes: null }] },
      { name: 'Balcon', condition: 'good', notes: null, completed: false, elements: [] },
    ]);
  });
});

describe('nomDuLocataire', () => {
  it('prénom et nom, ou rien', () => {
    expect(nomDuLocataire({ first_name: 'Aminata', last_name: 'Diop' })).toBe('Aminata Diop');
    expect(nomDuLocataire({ first_name: null, last_name: 'Diop' })).toBe('Diop');
    expect(nomDuLocataire(null)).toBe('');
  });
});
