/**
 * ADR-0135 § 4 (TCK-2991) — la garde des champs : ce qu'elle compte, et son cliquet exact.
 *
 * Le relevé est éprouvé sur des sources écrites ici (chaque défaut, chaque exemption), le cliquet sur des
 * relevés fabriqués : un compte qui monte ET un compte qui descend rougissent. Le dernier cas joue la garde
 * sur l'arbre réel contre sa base — c'est ce que la CI exécute.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compter, relever } from '../../../scripts/champs.mjs';
import { ecarts, releve } from '../../../scripts/check-champs.mjs';

const defauts = (source: string): string[][] => relever(source).map((c: { defauts: string[] }) => c.defauts);

describe('le relevé d’un fichier', () => {
  it('un champ profilé et illustré n’a aucun défaut, qu’il soit primitive, natif ou enveloppé', () => {
    expect(defauts('<Input profil="recherche" placeholder={t("exemple")} />')).toEqual([[]]);
    expect(defauts('<input {...profil("code")} placeholder="123456" />')).toEqual([[]]);
    expect(defauts('<FormInput control={c} name="a" profil="nom" placeholder="Awa Diop" />')).toEqual([[]]);
    expect(defauts('<FormTextarea control={c} name="a" profil="texte-long" placeholder="…" />')).toEqual([[]]);
  });

  it('chaque défaut est nommé', () => {
    expect(defauts('<Input value={v} />')).toEqual([['sansProfil', 'sansPlaceholder']]);
    expect(defauts('<Input type="number" placeholder="3" />')).toEqual([['sansProfil', 'nombre']]);
    expect(defauts('<Textarea profil="texte-long" placeholder="x" spellCheck={false} />')).toEqual([['reglage']]);
    expect(defauts('<Input profil="entier" inputMode="decimal" placeholder="3" />')).toEqual([['reglage']]);
  });

  it('les composants partagés qui enveloppent un champ sont jugés à leur appel (`ChampDeLaFiche`, `ZoneDeLaFiche`, `ChampChiffre`)', () => {
    expect(defauts('<ChampDeLaFiche name="ninea" libelle={l} />')).toEqual([['sansProfil', 'sansPlaceholder']]);
    // `ZoneDeLaFiche` a un profil par défaut (`texte-long`) : seul le placeholder s'y juge.
    expect(defauts('<ZoneDeLaFiche name="adresse" libelle={l} />')).toEqual([['sansPlaceholder']]);
    expect(defauts('<ChampChiffre control={c} name="budget" profil="montant" placeholder="150000" />')).toEqual([[]]);
  });

  it('un champ sans clavier n’est pas un champ : case, fichier, date, champ caché, lecture seule', () => {
    for (const type of ['checkbox', 'radio', 'file', 'date', 'time', 'hidden', 'range']) {
      expect(defauts(`<input type="${type}" />`)).toEqual([]);
    }
    expect(defauts('<Input readOnly value="x" />')).toEqual([]);
    expect(defauts('<Input readOnly={true} value="x" />')).toEqual([]);
  });

  it('un mot de passe n’a pas de placeholder (ADR-0135 § 3) ; un montant l’a par son `example`', () => {
    expect(defauts('<Input profil="mot-de-passe" />')).toEqual([[]]);
    expect(defauts('<Input profil="nouveau-mot-de-passe" type={voir ? "text" : "password"} />')).toEqual([[]]);
    expect(defauts('<FormAmountInput name="loyer" example={150000} />')).toEqual([[]]);
    expect(defauts('<FormAmountInput name="loyer" />')).toEqual([['sansPlaceholder']]);
  });

  it('une balise citée en commentaire n’est pas un champ ; une URL n’est pas un commentaire', () => {
    expect(defauts('/** remplace `<input type="text">` */\nconst a = 1;')).toEqual([]);
    expect(defauts('{/* <Input /> */}')).toEqual([]);
    expect(defauts('// <Textarea />')).toEqual([]);
    expect(defauts('const u = "https://x"; <Input placeholder="a" />')).toEqual([['sansProfil']]);
  });

  it('les accolades et les chaînes d’un attribut ne ferment pas la balise', () => {
    expect(defauts('<Input value={a > b ? "x>y" : `>`} profil="mots" placeholder="Ex. : Corniche" />')).toEqual([[]]);
  });

  it('la ligne de chaque champ est juste, commentaires effacés compris', () => {
    const champs = relever('/*\n *\n */\nconst a = 1;\n<Input />');
    expect(champs[0].ligne).toBe(5);
  });

  it('`compter` rend le compte par défaut, ou `null` sans défaut', () => {
    expect(compter('<Input profil="mots" placeholder="x" />')).toBeNull();
    expect(compter('<Input /><Input type="number" />')).toEqual({ sansProfil: 2, sansPlaceholder: 2, nombre: 1, reglage: 0 });
  });
});

describe('le cliquet exact par fichier', () => {
  const base = { 'src/a.tsx': { sansProfil: 2, sansPlaceholder: 1, nombre: 0, reglage: 0 } };

  it('identique à la base : aucun écart', () => {
    expect(ecarts(base, base)).toEqual([]);
  });

  it('un compte qui monte rougit, un fichier neuf aussi', () => {
    expect(ecarts({ 'src/a.tsx': { ...base['src/a.tsx'], sansProfil: 3 } }, base)).toHaveLength(1);
    expect(ecarts({ ...base, 'src/b.tsx': { sansProfil: 0, sansPlaceholder: 1, nombre: 0, reglage: 0 } }, base)).toHaveLength(1);
  });

  it('un compte qui DESCEND rougit aussi, tant que la base n’est pas réécrite', () => {
    const liste = ecarts({ 'src/a.tsx': { ...base['src/a.tsx'], sansPlaceholder: 0 } }, base);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatch(/--update/);
    expect(ecarts({}, base)).toHaveLength(2);
  });

  it('l’arbre réel est conforme à `scripts/champs-baseline.json`', () => {
    const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const baseReelle = JSON.parse(readFileSync(join(racine, 'scripts', 'champs-baseline.json'), 'utf8'));
    expect(ecarts(releve(racine), baseReelle)).toEqual([]);
  });
});
