import { describe, expect, it } from 'vitest';

import { vueDesCommissions } from '@/lib/commissions/vue';
import { bornesDuMois, estMois } from '@/lib/finances/mois';
import { bornesDesEncaissements, moisAffiche } from '@/lib/finances/vue-argent';

/**
 * TCK-2768 (q2 de la vérification de 7981e617d) — l'API refuse (422) un jour qui n'est pas `AAAA-MM-JJ` réel
 * d'une année de 1970 au plafond de `JourIso` (2199). Les écrans d'argent lisaient leurs bornes dans l'URL :
 *
 * - « Argent », registre des encaissements : `date_from` / `date_to` relayés tels quels ;
 * - le mois (`?period=` d'« Argent », du rapprochement et de la fiche du bailleur, `?mois=` des commissions)
 *   jugé par sa seule forme : « 0001-01 » devenait les bornes `0001-01-01` / `0001-01-31`.
 *
 * Un favori mal formé faisait perdre sa liste à l'écran (422, ou une liste vide d'un mois de l'an 1). La borne
 * refusée est ignorée : l'écran reprend son défaut, comme la recherche publique écarte un `available_from` refusé.
 */
const COURANT = '2026-11';
const lire = (requete: string) => new URLSearchParams(requete);

describe('estMois — un mois que l’API admet, années de 1970 à 2199 (TCK-2768)', () => {
  it('borne les années comme JourIso, ses bornes de jours restent admises', () => {
    for (const mois of ['2026-11', '1970-01', '2199-12']) expect(estMois(mois), mois).toBe(true);
    for (const mois of ['0001-01', '1969-12', '2200-01', '2026-13', '2026-1']) expect(estMois(mois), mois).toBe(false);
    expect(bornesDuMois('2199-12')).toEqual({ du: '2199-12-01', au: '2199-12-31' });
  });
});

describe('« Argent » — bornes des encaissements lues dans l’URL (TCK-2768)', () => {
  it('une borne refusée est ignorée : l’autre reste, ou le mois en cours reprend', () => {
    expect(bornesDesEncaissements(lire('date_from=12/11/2026&date_to=2026-11-12'), COURANT)).toEqual({ du: undefined, au: '2026-11-12', mois: null });
    expect(bornesDesEncaissements(lire('date_from=2026-02-30&date_to=0001-01-01'), COURANT)).toEqual({ du: '2026-11-01', au: '2026-11-30', mois: COURANT });
  });

  it('un mois de l’an 1 n’est pas un mois : la page montre le mois en cours', () => {
    expect(moisAffiche(lire('period=0001-01'), COURANT)).toBe(COURANT);
    expect(bornesDesEncaissements(lire('period=0001-01'), COURANT)).toEqual({ du: '2026-11-01', au: '2026-11-30', mois: COURANT });
  });

  it('des bornes admises partent telles quelles', () => {
    expect(bornesDesEncaissements(lire('date_from=2026-10-01&date_to=2026-11-12'), COURANT)).toEqual({ du: '2026-10-01', au: '2026-11-12', mois: null });
  });
});

describe('Commissions — le mois lu dans l’URL (TCK-2768)', () => {
  it('« 0001-01 » rend le mois en cours, et non une liste vide de l’an 1', () => {
    expect(vueDesCommissions(lire('mois=0001-01'), '2026-11-13').mois).toBe(COURANT);
    expect(vueDesCommissions(lire('mois=2026-09'), '2026-11-13').mois).toBe('2026-09');
  });
});
