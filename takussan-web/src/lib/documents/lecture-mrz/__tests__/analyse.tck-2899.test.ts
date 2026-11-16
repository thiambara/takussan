import { describe, expect, it } from 'vitest';

import { cleDeControle, lireLaDateDansLaMrz } from '../analyse';

/**
 * TCK-2899 — l'analyseur de MRZ. Les clés de contrôle sont CALCULÉES ici par une implémentation
 * indépendante de celle du code (poids 7-3-1, `<` = 0, A = 10), jamais recopiées.
 */
function cle(champ: string): string {
  const poids = [7, 3, 1];
  let somme = 0;
  [...champ].forEach((c, i) => {
    const v = /\d/.test(c) ? Number(c) : c === '<' ? 0 : c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
    somme += v * poids[i % 3];
  });
  return String(somme % 10);
}

const fausse = (c: string) => String((Number(c) + 1) % 10);

/** Carte CEDEAO (TD1, 3 × 30). */
function td1({ naissance = '900515', expiration = '361114', cleExp }: { naissance?: string; expiration?: string; cleExp?: string } = {}) {
  const l1 = `I<SEN1234567897${'<'.repeat(15)}`;
  const debut = `${naissance}${cle(naissance)}M${expiration}${cleExp ?? cle(expiration)}SEN`;
  const l2 = `${debut}${'<'.repeat(30 - debut.length - 1)}4`;
  const l3 = `NDIAYE<<AWA${'<'.repeat(19)}`;
  return [l1, l2, l3];
}

/** Passeport (TD3, 2 × 44). */
function td3({ naissance = '850203', expiration = '310620', cleExp }: { naissance?: string; expiration?: string; cleExp?: string } = {}) {
  const l1 = `P<SENDIOP<<MOUSSA${'<'.repeat(27)}`;
  const numero = 'A01234567';
  const l2 = `${numero}${cle(numero)}SEN${naissance}${cle(naissance)}M${expiration}${cleExp ?? cle(expiration)}${'<'.repeat(14)}<0`;
  return [l1, l2];
}

describe('TCK-2899 — lire la date d’expiration dans la MRZ', () => {
  it('les gabarits du test ont la longueur de leur format', () => {
    expect(td1().map((l) => l.length)).toEqual([30, 30, 30]);
    expect(td3().map((l) => l.length)).toEqual([44, 44]);
  });

  it('la clé de contrôle suit ICAO 9303 (7-3-1, A = 10, < = 0)', () => {
    for (const champ of ['361114', '900515', 'A01234567', 'L898902C<', 'AB<12']) {
      expect(String(cleDeControle(champ))).toBe(cle(champ));
    }
    // L'exemple du document 9303 (partie 4) : `L898902C<` → 3.
    expect(cleDeControle('L898902C<')).toBe(3);
  });

  it('AC1 — une MRZ TD1 dont l’expiration est 361114, clé juste → 2036-11-14', () => {
    expect(lireLaDateDansLaMrz(td1().join('\n'))).toEqual({ format: 'TD1', expiration: '2036-11-14' });
  });

  it('AC1 — la même MRZ, clé d’expiration fausse → rien', () => {
    const juste = cle('361114');
    expect(lireLaDateDansLaMrz(td1({ cleExp: fausse(juste) }).join('\n'))).toBeNull();
  });

  it('TD3 (passeport) : la date est lue à la colonne 13 de la deuxième ligne', () => {
    expect(lireLaDateDansLaMrz(td3().join('\n'))).toEqual({ format: 'TD3', expiration: '2031-06-20' });
  });

  it('TD3, clé d’expiration fausse → rien', () => {
    expect(lireLaDateDansLaMrz(td3({ cleExp: fausse(cle('310620')) }).join('\n'))).toBeNull();
  });

  it('une clé de naissance fausse suffit à ne rien rendre (deux clés, pas une)', () => {
    const [l1, l2, l3] = td1();
    const l2Faux = `${l2.slice(0, 6)}${fausse(l2[6])}${l2.slice(7)}`;
    expect(lireLaDateDansLaMrz([l1, l2Faux, l3].join('\n'))).toBeNull();
  });

  it('du bruit autour, des espaces et des minuscules lus par l’OCR n’empêchent pas la lecture', () => {
    const [l1, l2, l3] = td1();
    const bruite = ['REPUBLIQUE DU SENEGAL', 'CARTE D IDENTITE CEDEAO', l1, ` ${l2.slice(0, 15)} ${l2.slice(15).toLowerCase()}`, l3].join('\n');
    expect(lireLaDateDansLaMrz(bruite)?.expiration).toBe('2036-11-14');
  });

  it('une lettre lue à la place d’un chiffre (O pour 0) est redressée si les clés tombent juste', () => {
    const [l1, l2, l3] = td1({ naissance: '900105' });
    const lu = l2.replace(/^9001/, '9OO1');
    expect(lireLaDateDansLaMrz([l1, lu, l3].join('\n'))?.expiration).toBe('2036-11-14');
  });

  it('une date impossible (mois 13) ne rend rien, même avec une clé juste', () => {
    expect(lireLaDateDansLaMrz(td1({ expiration: '361314' }).join('\n'))).toBeNull();
  });

  it('un texte sans MRZ ne rend rien', () => {
    expect(lireLaDateDansLaMrz('ATTESTATION DE TRAVAIL\nLE 14 NOVEMBRE 2036')).toBeNull();
    expect(lireLaDateDansLaMrz('')).toBeNull();
  });

  it('une pièce expirée en 1998 (`98`) se lit 1998, pas 2098', () => {
    expect(lireLaDateDansLaMrz(td1({ expiration: '980301' }).join('\n'), 2026)?.expiration).toBe('1998-03-01');
  });
});
