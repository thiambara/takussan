/**
 * P08.09 (TCK-757) — un champ de saisie fait main a 16 px de texte sous `md`, comme les primitives
 * (`ui/input.tsx` : « 16 px sous `md` (`text-base md:text-sm`) : iOS ne zoome pas au focus »).
 * Sous 16 px, Safari iOS zoome la page au focus, et l'utilisateur doit la dézoomer à la main.
 *
 * Garde de SOURCE, limitée aux trois fichiers que cite la piste : jsdom ne rend aucune taille de
 * police. Un `<input>` ou `<textarea>` dont la classe porte `text-sm` doit aussi porter `text-base`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FICHIERS = [
  'src/components/inventory/RoomEditor.tsx',
  'src/components/admin/InviteAgentDialog.tsx',
  'src/components/admin/InviteMemberDialog.tsx',
];

/** Les classes de chaque `<input>` / `<textarea>` du fichier, avec la ligne de la balise. */
function champs(source: string): { ligne: number; classes: string }[] {
  const trouves: { ligne: number; classes: string }[] = [];
  const balise = /<(input|textarea)\b([^>]*?)\/?>/gs;
  for (const m of source.matchAll(balise)) {
    const attributs = m[2];
    if (/type="(checkbox|radio|file|range|hidden)"/.test(attributs)) continue;
    const classe = /className="([^"]*)"/.exec(attributs);
    if (!classe) continue;
    trouves.push({ ligne: source.slice(0, m.index).split('\n').length, classes: classe[1] });
  }
  return trouves;
}

describe('champs faits main : 16 px sous md (TCK-757)', () => {
  for (const fichier of FICHIERS) {
    it(fichier, () => {
      const source = readFileSync(resolve(process.cwd(), fichier), 'utf8');
      const trouves = champs(source);
      expect(trouves.length).toBeGreaterThan(0);
      const fautifs = trouves
        .filter(({ classes }) => /(^|\s)text-sm(\s|$)/.test(classes) && !/(^|\s)text-base(\s|$)/.test(classes))
        .map(({ ligne }) => `${fichier}:${ligne}`);
      expect(fautifs).toEqual([]);
    });
  }
});
