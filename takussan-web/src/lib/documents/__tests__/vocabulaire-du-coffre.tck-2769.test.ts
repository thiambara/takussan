import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { LOCALES } from '@/i18n/config';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';

import { natureDeLEntree, type EntreeDuCoffre } from '../coffre';

/**
 * TCK-2769 — le vocabulaire dans lequel l'API cherche les entrées GÉNÉRÉES du coffre
 * (`GET /api/me/document-vault?filter[search]=`), DÉRIVÉ des libellés que le front affiche.
 *
 * Le front possède le texte (principe 5) : le libellé d'une quittance (« Quittance de mars ») se
 * compose ici, depuis sa catégorie et sa date. Le serveur cherche donc dans ce fichier, versionné
 * dans l'API (`takussan-api/resources/documents/vocabulaire-du-coffre.json`) : une PR qui le change
 * déclenche API CI. Ce test rougit dès qu'un libellé change sans que le fichier suive :
 *
 *   cd takussan-web && node scripts/gen-vocabulaire-du-coffre.mjs           # régénère le fichier
 *   cd takussan-web && node scripts/gen-vocabulaire-du-coffre.mjs --check   # le vérifie (ce que fait la suite)
 *
 * Ce qui est DÉRIVÉ : le texte de chaque catégorie et de chaque type, placeholders ICU retirés (le
 * mois, l'année et la référence, l'API les tire de l'entrée elle-même). Ce qui est TENU ICI : la
 * liste des catégories que l'API émet. `RechercheDuCoffreVocabulaireTest` rougit côté API quand
 * une catégorie émise par le coffre n'y figure pas.
 */

const ICI = dirname(fileURLToPath(import.meta.url));
const FICHIER = join(ICI, '../../../../../takussan-api/resources/documents/vocabulaire-du-coffre.json');

/** La commande qui régénère le fichier : l'en-tête du fichier et chaque message d'échec la nomment. */
const REGENERER = 'cd takussan-web && node scripts/gen-vocabulaire-du-coffre.mjs';

/** L'en-tête du fichier généré : sa source, l'interdiction de l'éditer, la commande qui le régénère. */
const EN_TETE =
  'GÉNÉRÉ depuis les libellés du front (takussan-web/src/messages/{fr,en,wo}.json : documents.coffre.entrees, ' +
  `documents.types). Ne pas éditer à la main. Régénérer : ${REGENERER} (TCK-2769).`;

/** Les catégories d'entrées GÉNÉRÉES que `DocumentVault` émet (`receipt_<LeasePaymentType>`, `inventory_<InventoryType>`). */
const CATEGORIES_GENEREES = [
  'lease_contract',
  'inventory_move_in',
  'inventory_move_out',
  'receipt_rent',
  'receipt_charges',
  'receipt_deposit',
  'receipt_deposit_refund',
  'receipt_regularization',
  'receipt_penalty',
  'owner_statement',
  'annual_attestation',
  'provider_bill',
] as const;

type Messages = typeof fr;
const MESSAGES: Record<(typeof LOCALES)[number], Messages> = { fr, en, wo: wo as Messages };

/** Le texte d'un message ICU sans ses arguments : « Quittance {elision, select, …} » → « Quittance ». */
export function sansArguments(message: string): string {
  let texte = message;
  for (;;) {
    const suivant = texte.replace(/\{[^{}]*\}/g, ' ');
    if (suivant === texte) break;
    texte = suivant;
  }
  return texte.replace(/\s+/g, ' ').trim();
}

function rendre(): string {
  const categories: Record<string, Record<string, string>> = {};
  for (const categorie of CATEGORIES_GENEREES) {
    const nature = natureDeLEntree({ kind: 'generated', category: categorie } as EntreeDuCoffre);
    const cle = nature === 'autre' ? 'document' : nature;
    categories[categorie] = Object.fromEntries(
      LOCALES.map((l) => [l, sansArguments((MESSAGES[l].documents.coffre.entrees as Record<string, string>)[cle])]),
    );
  }

  const types: Record<string, Record<string, string>> = {};
  for (const type of Object.keys(fr.documents.types).sort()) {
    types[type] = Object.fromEntries(
      LOCALES.map((l) => [l, sansArguments((MESSAGES[l].documents.types as Record<string, string>)[type] ?? '')]),
    );
  }

  return `${JSON.stringify(
    {
      _: EN_TETE,
      categories,
      types,
    },
    null,
    2,
  )}\n`;
}

describe('TCK-2769 — le vocabulaire de la recherche du coffre, dérivé des libellés du front', () => {
  it('retire les arguments ICU, imbriqués compris', () => {
    expect(sansArguments('Quittance {elision, select, oui {d’{mois}} other {de {mois}}}')).toBe('Quittance');
    expect(sansArguments('{mois} rent receipt')).toBe('rent receipt');
    expect(sansArguments('Attestation annuelle {annee}')).toBe('Attestation annuelle');
  });

  it('chaque catégorie émise a un libellé dans chaque langue', () => {
    const vocabulaire = JSON.parse(rendre()) as { categories: Record<string, Record<string, string>> };
    for (const categorie of CATEGORIES_GENEREES) {
      for (const l of LOCALES) expect(vocabulaire.categories[categorie][l], `${categorie} / ${l}`).not.toBe('');
    }
    expect(vocabulaire.categories.receipt_rent).toEqual({ fr: 'Quittance', en: 'rent receipt', wo: 'Quittance' });
  });

  it('l’en-tête du fichier dit sa source et nomme la commande qui le régénère', () => {
    const { _: enTete } = JSON.parse(rendre()) as { _: string };
    expect(enTete).toContain('src/messages/');
    expect(enTete).toContain(REGENERER);
  });

  it('le fichier versionné de l’API est celui que les libellés produisent', () => {
    const attendu = rendre();

    if (process.env.ECRIRE_VOCABULAIRE_DU_COFFRE === '1') {
      writeFileSync(FICHIER, attendu);
      return;
    }

    expect(existsSync(FICHIER), `${FICHIER} absent. Régénérer : ${REGENERER}`).toBe(true);
    expect(
      readFileSync(FICHIER, 'utf8'),
      `vocabulaire-du-coffre.json ne suit plus les libellés du coffre. Régénérer : ${REGENERER}`,
    ).toBe(attendu);
  });
});
