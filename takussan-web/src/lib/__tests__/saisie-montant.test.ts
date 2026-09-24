import { describe, expect, it } from 'vitest';

import {
  decimalesDeDevise,
  ecrireMontant,
  lireSaisie,
  positionApresReecriture,
  versMontant,
} from '@/lib/format/saisie-montant';

/**
 * TCK-564 (W10) — la saisie d'un montant se RELIT, et le nombre qu'elle rend reste un nombre.
 *
 * `fr-SN` groupe par l'espace fine insécable (U+202F) : les attentes l'écrivent en clair, parce
 * qu'une espace ordinaire dans une assertion passerait pour juste à l'œil et rougirait au test.
 */
const FINE = '\u202f';

describe('lireSaisie — franc CFA (aucune décimale)', () => {
  it('le cas du testeur : « 49000000 » se lit « 49 000 000 », et vaut 49 000 000', () => {
    expect(lireSaisie('49000000', 0, 'fr')).toEqual({
      affichage: `49${FINE}000${FINE}000`,
      valeur: 49_000_000,
    });
  });

  it('la valeur est un NOMBRE, jamais le texte groupé', () => {
    expect(typeof lireSaisie('49 000 000', 0, 'fr').valeur).toBe('number');
  });

  it.each([
    ['49.000.000'],
    ['49,000,000'],
    ['49 000 000'],
    [`49${FINE}000${FINE}000`],
    ['49 000 000 F CFA'],
  ])('tout séparateur collé est un séparateur de milliers : %s', (brut) => {
    expect(lireSaisie(brut, 0, 'fr').valeur).toBe(49_000_000);
  });

  // Repris de la revue adverse : en franc CFA, TOUT caractère non numérique était lu comme un
  // séparateur de milliers. Un montant COLLÉ avec ses centimes était donc multiplié par 100 —
  // « 1 500,00 » devenait 150 000, sans rien qui le signale que l'affichage.
  it.each([
    ['1 500,00', 'fr', 1500],
    ['49 000 000,50 FCFA', 'fr', 49_000_000],
    ['49000000.00', 'fr', 49_000_000],
    ['1,500.00', 'en', 1500],
    ['1500.5', 'en', 1500],
    ['1 500,00', 'wo', 1500],
  ] as const)(
    'des centimes collés TOMBENT, ils ne multiplient pas le montant par 100 : %s (%s)',
    (brut, locale, attendu) => {
      expect(lireSaisie(brut, 0, locale).valeur).toBe(attendu);
    },
  );

  it('un groupe de TROIS chiffres reste un groupe de milliers, quel que soit son séparateur', () => {
    expect(lireSaisie('49.000', 0, 'fr').valeur).toBe(49_000);
    expect(lireSaisie('1,500', 0, 'fr').valeur).toBe(1500);
  });

  it('en anglais, un montant en cours de correction (« 1,500,00 ») n’est PAS lu comme des centimes', () => {
    // La virgule y est le séparateur de milliers : effacer un chiffre de « 1,500,000 » donne
    // « 1,500,00 », qui vaut 150 000 — le lire 1 500 punirait une simple correction.
    expect(lireSaisie('1,500,00', 0, 'en').valeur).toBe(150_000);
  });

  it('un champ vidé ne rend AUCUN montant (`undefined`) — jamais 0', () => {
    // Le champ remet ce vide au formulaire en `null` (FormAmountInput), et c'est le schéma qui le
    // lit « Le prix est requis. » : garde dans `lib/schemas/__tests__/property.test.ts`.
    // (Revue adverse, repair-2 : ce test promettait le message du schéma sans jamais le mesurer.)
    expect(lireSaisie('', 0, 'fr')).toEqual({ affichage: '', valeur: undefined });
    expect(lireSaisie('F CFA', 0, 'fr')).toEqual({ affichage: '', valeur: undefined });
  });

  it('les zéros de tête tombent', () => {
    expect(lireSaisie('0075000', 0, 'fr').affichage).toBe(`75${FINE}000`);
    expect(lireSaisie('0', 0, 'fr').valeur).toBe(0);
  });

  it('s’arrête à quinze chiffres — au-delà, un `number` ne représente plus chaque entier', () => {
    expect(lireSaisie('1234567890123456789', 0, 'fr').valeur).toBe(123_456_789_012_345);
  });

  it('suit la locale : l’anglais groupe par la virgule, le wolof comme le français du Sénégal', () => {
    expect(lireSaisie('49000000', 0, 'en').affichage).toBe('49,000,000');
    expect(lireSaisie('49000000', 0, 'wo').affichage).toBe(`49${FINE}000${FINE}000`);
  });
});

describe('lireSaisie — un montant collé dans la convention de l’AUTRE langue', () => {
  // Revue adverse, repair-2 : la règle « le séparateur de milliers de la locale n'ouvre jamais de
  // centimes » ne regardait qu'UN signe à la fois. Or un texte qui porte les DEUX signes n'est pas
  // ambigu : le dernier sépare les décimales, l'autre groupe — quelle que soit la langue de l'écran.
  it.each([
    ['1.500,00', 0, 'en', 1500],
    ['1.000.000,00', 0, 'en', 1_000_000],
    ['1,500.00', 0, 'fr', 1500],
    ['1.500,50', 2, 'en', 1500.5],
    ['1,500.50', 2, 'fr', 1500.5],
    ['1.000.000,25', 2, 'en', 1_000_000.25],
  ] as const)('deux signes : le DERNIER sépare les décimales — %s (%s déc., %s)', (brut, dec, locale, attendu) => {
    expect(lireSaisie(brut, dec, locale).valeur).toBe(attendu);
  });

  it('en euro, un point suivi de TROIS chiffres groupe, là où la langue décimale est la virgule', () => {
    // « 1.500 » collé en français : 1 500 €, pas 1,50 € — un groupe de milliers compte trois
    // chiffres, et le point n'est pas le séparateur décimal du français.
    expect(lireSaisie('1.500', 2, 'fr')).toEqual({ affichage: `1${FINE}500`, valeur: 1500 });
    expect(lireSaisie('49.000.000', 2, 'fr').valeur).toBe(49_000_000);
    expect(lireSaisie('1,000,000', 2, 'fr').valeur).toBe(1_000_000);
  });

  // Revue adverse v2 : cette règle ne jouait que pour un texte COLLÉ. Au clavier, « 1. » était
  // réécrit « 1, » à la première touche — et « 1, » suivi de « 500 » ne pouvait plus grouper :
  // « 1.500 » tapé valait 1,50 €. Tant que le point est AMBIGU (seul, au plus deux chiffres
  // derrière), l'affichage le garde tel quel ; le troisième chiffre ou la sortie du champ tranche.
  it.each([
    ['1.', 1, '1.'],
    ['1.5', 1.5, '1.5'],
    ['1.50', 1.5, '1.50'],
    ['10.50', 10.5, '10.50'],
    ['1500.', 1500, `1${FINE}500.`],
    ['1500.5', 1500.5, `1${FINE}500.5`],
  ] as const)('en euro, le point AMBIGU de « %s » reste un point à l’écran (fr)', (brut, valeur, affichage) => {
    expect(lireSaisie(brut, 2, 'fr')).toEqual({ affichage, valeur });
  });

  it('en euro, le point cesse d’être ambigu au troisième chiffre : la frappe « 1. » → « 1.500 » groupe', () => {
    const frappes = ['1', '1.', '1.5', '1.50', '1.500'];
    const lus = frappes.map((f) => lireSaisie(f, 2, 'fr'));
    expect(lus.map((l) => l.affichage)).toEqual(['1', '1.', '1.5', '1.50', `1${FINE}500`]);
    expect(lus[4].valeur).toBe(1500);
    // Chaque affichage, relu, se relit à l'identique : le composant peut le garder sous le doigt.
    for (const l of lus) expect(lireSaisie(l.affichage, 2, 'fr')).toEqual(l);
  });

  it('le point n’est gardé que là où il est ambigu', () => {
    // Le séparateur décimal de la locale est TOUJOURS celui qu'on affiche.
    expect(lireSaisie('1500,', 2, 'fr').affichage).toBe(`1${FINE}500,`);
    // Deux signes : rien d'ambigu, l'affichage suit la locale.
    expect(lireSaisie('1,500.50', 2, 'fr').affichage).toBe(`1${FINE}500,50`);
    // En anglais, le point EST le séparateur décimal.
    expect(lireSaisie('1500.5', 2, 'en').affichage).toBe('1,500.5');
    // En franc CFA, il n'y a pas de décimales à garder : le point est avalé.
    expect(lireSaisie('1.', 0, 'fr').affichage).toBe('1');
    expect(lireSaisie('1.50', 0, 'fr')).toEqual({ affichage: '1', valeur: 1 });
  });
});

describe('lireSaisie — une FRAPPE de trop ne change pas l’ordre de grandeur', () => {
  // Trouvé en reproduisant la revue adverse : un second séparateur décimal TAPÉ derrière des
  // centimes faisait lire tout ce qui précède comme la partie entière — « 1 500,5 » + « , »
  // devenait 15 005. Le premier séparateur décimal reste celui qui compte.
  it.each([
    [`1${FINE}500,5,`, 'fr', 1500.5, `1${FINE}500,5`],
    ['1,500.5.', 'en', 1500.5, '1,500.5'],
    ['1.5.', 'en', 1.5, '1.5'],
  ] as const)('%s (%s) garde %s', (brut, locale, attendu, affichage) => {
    const lu = lireSaisie(brut, 2, locale);
    expect(lu.valeur).toBe(attendu);
    expect(lu.affichage).toBe(affichage);
  });

  // Revue adverse, 3ᵉ passe : la frappe de trop n'était neutralisée que si c'était le MÊME signe.
  // Tapé derrière des décimales, l'AUTRE signe (le clavier `decimal` d'Android les propose côte à
  // côte) devenait « le dernier des deux » et faisait lire la vraie marque décimale comme un
  // groupe : « 1 500,5 » + « . » valait 15 005, « 1 500,50 » + « . » 150 050.
  it.each([
    [`1${FINE}500,5.`, 'fr', 1500.5, `1${FINE}500,5`],
    [`1${FINE}500,50.`, 'fr', 1500.5, `1${FINE}500,50`],
    ['1500,5.', 'fr', 1500.5, `1${FINE}500,5`],
    ['1,500.5,', 'en', 1500.5, '1,500.5'],
    ['1500.5,', 'en', 1500.5, '1,500.5'],
    [`1${FINE}500,5.`, 'wo', 1500.5, `1${FINE}500,5`],
  ] as const)('l’AUTRE signe tapé derrière des décimales ne décide rien : %s (%s) garde %s', (brut, locale, attendu, affichage) => {
    const lu = lireSaisie(brut, 2, locale);
    expect(lu.valeur).toBe(attendu);
    expect(lu.affichage).toBe(affichage);
  });

  it('un signe final ouvre encore les décimales quand RIEN ne les avait ouvertes', () => {
    // La frappe de trop n'est de trop que si une marque décimale la précède : « 1.500 » groupe en
    // français, la virgule tapée derrière ouvre donc les centimes — elle ne doit pas disparaître.
    expect(lireSaisie('1.500,', 2, 'fr')).toEqual({ affichage: `1${FINE}500,`, valeur: 1500 });
    expect(lireSaisie('1,500.', 2, 'en')).toEqual({ affichage: '1,500.', valeur: 1500 });
  });
});

describe('lireSaisie — des signes ENTREMÊLÉS ne disent rien : la langue de l’écran tranche', () => {
  // Revue adverse, 3ᵉ passe (mutation MX3 survivante) : la règle « l'autre signe doit tout entier
  // précéder le dernier » n'était gardée par aucun test. Un texte où les deux signes alternent
  // (« 1,500.5,0 ») n'a pas de lecture « groupes puis décimales » ; le lire tout entier comme une
  // partie entière multipliait par 100, et prendre la première virgule divisait par 1 000. En euro
  // c'est le PREMIER séparateur décimal de la locale qui compte — la règle de la frappe de trop.
  it.each([
    ['1,500.5,0', 'en', 1500.5],
    ['1.500,5.0', 'fr', 1500.5],
  ] as const)('%s (%s) vaut %s', (brut, locale, attendu) => {
    expect(lireSaisie(brut, 2, locale).valeur).toBe(attendu);
  });
});

describe('lireSaisie — devise à décimales (euro)', () => {
  it('la virgule française ouvre la partie décimale, tronquée à deux chiffres', () => {
    expect(lireSaisie('1500,509', 2, 'fr')).toEqual({ affichage: `1${FINE}500,50`, valeur: 1500.5 });
  });

  it('une virgule qu’on vient de taper RESTE à l’écran', () => {
    expect(lireSaisie('1500,', 2, 'fr')).toEqual({ affichage: `1${FINE}500,`, valeur: 1500 });
  });

  it('un point unique vaut la virgule en français (clavier numérique des téléphones)', () => {
    expect(lireSaisie('1500.5', 2, 'fr').valeur).toBe(1500.5);
  });

  it('en anglais, la virgule groupe et le point sépare', () => {
    expect(lireSaisie('1,500.25', 2, 'en')).toEqual({ affichage: '1,500.25', valeur: 1500.25 });
  });
});

describe('les valeurs venues d’ailleurs', () => {
  it('un brouillon d’avant TCK-564 portait le prix en CHAÎNE : il se relit quand même', () => {
    expect(versMontant('7000000')).toBe(7_000_000);
    expect(ecrireMontant('7000000', 0, 'fr')).toBe(`7${FINE}000${FINE}000`);
  });

  it('une valeur à décimales s’affiche TELLE QU’ELLE PART, même en franc CFA — jamais arrondie', () => {
    // Un prix hérité (1500,5 en XOF), ou saisi en euros avant de repasser la devise en franc
    // CFA : arrondir l'affichage (« 1 501 ») montrerait une valeur que l'API ne recevra pas.
    expect(ecrireMontant(1500.5, 0, 'fr')).toBe(`1${FINE}500,5`);
    expect(ecrireMontant(1500, 2, 'fr')).toBe(`1${FINE}500`);
  });

  it('rien, ou n’importe quoi, s’affiche vide', () => {
    expect(ecrireMontant(undefined, 0, 'fr')).toBe('');
    expect(ecrireMontant('abc', 0, 'fr')).toBe('');
    expect(ecrireMontant(Number.NaN, 0, 'fr')).toBe('');
  });

  it('les décimales suivent la devise : aucune en franc CFA, deux en euro et en dollar', () => {
    expect(decimalesDeDevise('XOF')).toBe(0);
    expect(decimalesDeDevise('xaf')).toBe(0);
    expect(decimalesDeDevise('EUR')).toBe(2);
    expect(decimalesDeDevise('USD')).toBe(2);
    expect(decimalesDeDevise(undefined)).toBe(0);
    expect(decimalesDeDevise('ZZZ')).toBe(0);
  });
});

describe('positionApresReecriture — le curseur suit les chiffres, pas les caractères', () => {
  it('en fin de frappe, il reste en fin de champ malgré les séparateurs insérés', () => {
    const affichage = `49${FINE}000${FINE}000`;
    expect(positionApresReecriture('49000000', 8, affichage, 'fr')).toBe(affichage.length);
  });

  it('au milieu, il reste après le même chiffre — le regroupement ne le renvoie pas en fin', () => {
    // « 1 500 000 », curseur après « 1 », on tape « 2 » : le champ brut devient « 12 500 000 »
    // puis se regroupe en « 12 500 000 ». Le curseur doit rester entre « 2 » et l'espace.
    const brut = `12${FINE}500${FINE}000`;
    const lu = lireSaisie(brut, 0, 'fr');
    expect(lu.affichage).toBe(`12${FINE}500${FINE}000`);
    expect(positionApresReecriture(brut, 2, lu.affichage, 'fr')).toBe(2);

    // « 999 999 » + « 9 » en fin : un groupe naît, le curseur suit le dernier chiffre.
    const lu2 = lireSaisie(`999${FINE}9999`, 0, 'fr');
    expect(lu2.affichage).toBe(`9${FINE}999${FINE}999`);
    expect(positionApresReecriture(`999${FINE}9999`, 8, lu2.affichage, 'fr')).toBe(lu2.affichage.length);
  });

  it('après un point ambigu fraîchement tapé (euro, fr), il reste APRÈS lui', () => {
    const lu = lireSaisie('1500.', 2, 'fr');
    expect(lu.affichage).toBe(`1${FINE}500.`);
    expect(positionApresReecriture('1500.', 5, lu.affichage, 'fr')).toBe(lu.affichage.length);
  });

  it('après une virgule décimale fraîchement tapée, il reste APRÈS elle', () => {
    const lu = lireSaisie('1500,', 2, 'fr');
    expect(positionApresReecriture('1500,', 5, lu.affichage, 'fr')).toBe(lu.affichage.length);
  });
});
