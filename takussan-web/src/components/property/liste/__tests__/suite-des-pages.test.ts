import { describe, expect, it } from 'vitest';

import type { PropertyListItem } from '@/types/property';
import { suiteDesPages, type PageDeLaListe } from '../emplacements';

/**
 * TCK-2499 / TCK-2500 — la suite CONTINUE (« Voir N biens de plus ») : un bien n'y est montré
 * qu'une fois, et la première page ne s'ouvre pas sur l'emplacement de tête quand des places
 * réservées l'ouvrent. Les trois cas de doublon sont ceux relevés par la revue adverse sur cinq
 * pages de `/properties?contract_type=rent` (2026-11-09).
 */

type Bien = PropertyListItem;
const bien = (id: number, extra: Record<string, unknown> = {}) => ({ id, ...extra }) as unknown as Bien;
const serie = (de: number, a: number) => Array.from({ length: a - de + 1 }, (_, i) => bien(de + i));
const sponsor = (id: number, position: number) => bien(id, { position });
const reserve = (id: number) => bien(id, { placement: 'reserved' });

/** Une page de 40 cartes organiques (`de`…`de + 39`), où `remplacer` pose des biens donnés à des rangs donnés. */
function page(numero: number, de: number, sponsorises: Bien[], remplacer: Record<number, Bien> = {}): PageDeLaListe {
  const organiques = serie(de, de + 39).map((b, rang) => remplacer[rang] ?? b);
  return { numero, organiques, sponsorises };
}

/** `S7` pour un emplacement, `R7` pour une place réservée, `7` pour un bien organique. */
const forme = (suite: ReturnType<typeof suiteDesPages>) =>
  suite.map((c) =>
    c.genre === 'sponsorise' ? `S${c.bien.id}` : (c.bien as { placement?: string }).placement === 'reserved' ? `R${c.bien.id}` : String(c.bien.id),
  );

const occurrences = (suite: ReturnType<typeof suiteDesPages>, id: number) => suite.filter((c) => c.bien.id === id);

describe('suiteDesPages — un bien n’est montré qu’une fois dans la suite continue', () => {
  it('le garage : sponsorisé en 22, resservi en tête de la page 2, organique en page 5 — montré UNE fois, en 22', () => {
    const GARAGE = 900;
    const suite = suiteDesPages([
      page(1, 1, [sponsor(801, 0), sponsor(802, 11), sponsor(GARAGE, 22)]),
      page(2, 41, [sponsor(GARAGE, 0), sponsor(803, 11), sponsor(804, 22)]),
      page(3, 81, []),
      page(4, 121, []),
      page(5, 161, [], { 17: bien(GARAGE) }),
    ]);

    expect(occurrences(suite, GARAGE)).toHaveLength(1);
    expect(suite.findIndex((c) => c.bien.id === GARAGE)).toBe(22);
    expect(suite[22]).toMatchObject({ genre: 'sponsorise', page: 1 });
    // La page 2 s'ouvre sur son bien organique suivant, pas sur un second « Sponsorisé » du garage.
    expect(forme(suite).slice(43, 45)).toEqual(['41', '42']);
  });

  it('le studio : organique en 38, puis sponsorisé deux fois plus bas — seule sa place organique reste', () => {
    const STUDIO = 901;
    const suite = suiteDesPages([
      page(1, 1, [sponsor(801, 0), sponsor(802, 11), sponsor(803, 22)], { 35: bien(STUDIO) }),
      page(2, 41, []),
      page(3, 81, [sponsor(804, 0), sponsor(805, 11), sponsor(STUDIO, 22)]),
      page(4, 121, [sponsor(STUDIO, 0)]),
    ]);

    expect(occurrences(suite, STUDIO)).toEqual([expect.objectContaining({ genre: 'organique', page: 1 })]);
    expect(suite.findIndex((c) => c.bien.id === STUDIO)).toBe(38);
    // Les autres emplacements de la page 3 restent : seul le doublon part.
    expect(occurrences(suite, 804)).toHaveLength(1);
    expect(occurrences(suite, 805)).toHaveLength(1);
  });

  it('la pièce : place réservée en tête de la page 1, revenue sponsorisée en page 4 — montrée une fois, réservée', () => {
    const PIECE = 902;
    const suite = suiteDesPages([
      page(1, 1, [sponsor(802, 11), sponsor(803, 22)], { 0: reserve(PIECE), 1: reserve(903) }),
      page(2, 41, []),
      page(3, 81, []),
      page(4, 121, [sponsor(804, 0), sponsor(PIECE, 11)]),
    ]);

    expect(occurrences(suite, PIECE)).toHaveLength(1);
    expect(forme(suite)[0]).toBe(`R${PIECE}`);
  });

  it('un bien organique déjà montré par une page précédente n’est pas montré une seconde fois', () => {
    // La rotation de l'heure peut faire glisser un bien d'une page à l'autre entre deux chargements.
    const suite = suiteDesPages([page(1, 1, []), page(2, 41, [], { 0: bien(40), 1: bien(12) })]);

    expect(occurrences(suite, 40)).toEqual([expect.objectContaining({ page: 1 })]);
    expect(occurrences(suite, 12)).toEqual([expect.objectContaining({ page: 1 })]);
    expect(suite).toHaveLength(78);
  });
});

describe('suiteDesPages — la première page ne s’ouvre pas sur trois places payées', () => {
  it('des places réservées ouvrent la page 1 : pas d’emplacement de tête, les suivants en 11 et 22', () => {
    const suite = suiteDesPages([
      page(1, 1, [sponsor(801, 0), sponsor(802, 11), sponsor(803, 22)], { 0: reserve(1), 1: reserve(2) }),
    ]);

    expect(occurrences(suite, 801)).toHaveLength(0);
    expect(forme(suite).slice(0, 3)).toEqual(['R1', 'R2', '3']);
    expect(forme(suite)[11]).toBe('S802');
    expect(forme(suite)[22]).toBe('S803');
  });

  it('un emplacement de tête sans position (contrat d’avant) n’est pas posé non plus', () => {
    const suite = suiteDesPages([page(1, 1, [bien(801), sponsor(802, 11)], { 0: reserve(1) })]);

    expect(occurrences(suite, 801)).toHaveLength(0);
    expect(forme(suite)[11]).toBe('S802');
  });

  it('sans place réservée, l’emplacement de tête reste en tête', () => {
    const suite = suiteDesPages([page(1, 1, [sponsor(801, 0), sponsor(802, 11)])]);

    expect(forme(suite).slice(0, 2)).toEqual(['S801', '1']);
    expect(forme(suite)[11]).toBe('S802');
  });

  it('la règle ne vaut que pour la page 1 : la tête d’une page suivante garde son emplacement', () => {
    const suite = suiteDesPages([page(1, 1, []), page(2, 41, [sponsor(804, 0)], { 0: reserve(41) })]);

    expect(forme(suite)[40]).toBe('S804');
  });
});
