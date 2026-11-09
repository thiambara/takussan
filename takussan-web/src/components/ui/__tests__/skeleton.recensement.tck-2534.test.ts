/**
 * TCK-2534 — le recensement, tenu par le code et non par un relevé.
 *
 * 1. Sur les surfaces de la console super-admin, un état de chargement passe par `<Skeleton>`, jamais
 *    par un `div animate-pulse bg-muted` « maison ». Le correctif vit dans la primitive (elle lit
 *    `--skeleton`), donc un squelette maison n'en profite pas et reste invisible sur le `main` `bg-muted`
 *    de la coque. La revue de TCK-2534 l'a mesuré sur `/super-admin/properties` et
 *    `/super-admin/agencies`, rgb(241, 236, 224) sur rgb(241, 236, 224).
 * 2. `--skeleton` n'est posée QUE par la coque super-admin. Posée par une autre coque (`AppShell` de
 *    `/app`, le site public), elle changerait l'apparence de squelettes que l'AC2 interdit de toucher.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = process.cwd();
const SRC = join(RACINE, 'src');

/** Les surfaces que monte la console super-admin. */
const SURFACES_SUPER_ADMIN = [
  'src/app/(super-admin)',
  'src/components/admin',
  'src/components/super-admin',
  'src/components/boost/admin',
  'src/components/console',
  'src/components/layout',
];

function fichiers(dossier: string): string[] {
  let entrees: string[];
  try {
    entrees = readdirSync(dossier);
  } catch {
    return [];
  }
  return entrees.flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' || nom === 'node_modules' ? [] : fichiers(chemin);
    return /\.(tsx?|css)$/.test(nom) ? [chemin] : [];
  });
}

/** Le code sans ses commentaires (`DataState` raconte en commentaire le `div animate-pulse` d'avant). */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const rel = (chemin: string) => relative(RACINE, chemin).split(sep).join('/');

describe('Skeleton — recensement de la console (TCK-2534)', () => {
  it('aucun squelette maison (`animate-pulse`) sur les surfaces de la console super-admin', () => {
    const fautifs = SURFACES_SUPER_ADMIN.flatMap((d) => fichiers(join(RACINE, d)))
      .filter((f) => /animate-pulse/.test(sansCommentaires(readFileSync(f, 'utf8'))))
      .map(rel);
    // Non-vacuité : le parcours voit bien les fichiers qui portaient le défaut.
    const vus = SURFACES_SUPER_ADMIN.flatMap((d) => fichiers(join(RACINE, d))).map(rel);
    expect(vus).toContain('src/app/(super-admin)/super-admin/properties/page.tsx');
    expect(vus).toContain('src/app/(super-admin)/super-admin/agencies/page.tsx');
    expect(vus).toContain('src/components/admin/super/integrations.tsx');

    expect(fautifs).toEqual([]);
  });

  it('`--skeleton` n’est posée que par la coque super-admin — ni AppShell, ni le site public, ni une feuille de style', () => {
    const poseurs = fichiers(SRC)
      .filter((f) => /--skeleton\s*:/.test(sansCommentaires(readFileSync(f, 'utf8'))))
      .map(rel);
    expect(poseurs).toEqual(['src/components/layout/SuperAdminShell.tsx']);
  });
});
