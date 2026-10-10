import { describe, expect, it } from 'vitest';

import { initialesDe, libelleDe, nomCompletDe, prenomDe } from '@/lib/identite';

const SANS_NOM = { first_name: '', last_name: '', email: null, phone: '+221770000623' };

describe('identite — TCK-623', () => {
  it("un compte ouvert par téléphone n'écrit jamais « undefined »", () => {
    expect(initialesDe(SANS_NOM)).toBeNull();
    expect(prenomDe(SANS_NOM)).toBeNull();
    expect(nomCompletDe(SANS_NOM)).toBeNull();
    expect(libelleDe(SANS_NOM)).toBe('+221 77 000 06 23');
  });

  it('prénom et nom donnent les initiales et le libellé', () => {
    const awa = { first_name: 'Awa', last_name: 'Diop', email: 'awa@example.com', phone: null };
    expect(initialesDe(awa)).toBe('AD');
    expect(libelleDe(awa)).toBe('Awa Diop');
  });

  it('le prénom seul suffit', () => {
    const awa = { first_name: ' Awa ', last_name: '', email: null, phone: null };
    expect(initialesDe(awa)).toBe('A');
    expect(nomCompletDe(awa)).toBe('Awa');
  });

  it("sans nom, l'e-mail prend le relais", () => {
    const oauth = { first_name: '', last_name: '', email: 'moussa@example.com', phone: null };
    expect(initialesDe(oauth)).toBe('M');
    expect(libelleDe(oauth)).toBe('moussa@example.com');
  });

  it('un emoji en tête reste entier', () => {
    expect(initialesDe({ first_name: '😀x', last_name: 'Ba' })).toBe('😀B');
  });

  it('rien du tout rend null partout', () => {
    expect(libelleDe(null)).toBeNull();
    expect(initialesDe(undefined)).toBeNull();
  });
});
