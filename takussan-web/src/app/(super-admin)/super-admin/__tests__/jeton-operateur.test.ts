/**
 * TCK-650 (ADR-0055 §6) — **aucun écran de la console n'atteint une action qui lit `getToken()`.**
 *
 * `getToken()` désigne la CIBLE pendant une impersonation ; la console agit au nom de l'opérateur.
 * Les paramètres globaux et les étiquettes l'ont oublié (TCK-648 avait recopié l'écart de
 * `/super-admin/tags`) : rien ne le voyait, ni le typage, ni le rendu hors impersonation.
 *
 * Ce test parcourt le graphe d'imports de `src/app/(super-admin)` — pages, layouts, et chaque
 * composant qu'ils rendent, transitivement — et relève chaque action serveur importée. Une action
 * dont le module lit `getToken(` rougit, sauf exception NOMMÉE ci-dessous, avec sa raison.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../../../..');
const RACINE = path.join(SRC, 'app/(super-admin)');

/**
 * Actions d'un module au jeton courant que la console a le droit d'atteindre — par NOM d'action,
 * jamais par module : une action voisine ajoutée plus tard reste gardée.
 */
const EXCEPTIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '@/app/actions/auth': {
    getMeOperateurAction: 'lit `getOperatorToken` (TCK-600) ; le module lit `getToken` pour ses autres actions',
  },
  '@/app/actions/security': {
    twoFactorEnableAction:
      "dialogue d'enrôlement de `GardeDoubleFacteur`, partagé avec `/app` ; le layout de la console refuse déjà un opérateur sans second facteur (`configurationDoubleFacteurExigee`)",
    twoFactorConfirmAction: 'même dialogue que `twoFactorEnableAction`',
  },
};

function resoudre(depuis: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.join(path.dirname(depuis), spec);
  else return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/** `[module, action, fichier importateur]` pour chaque action serveur atteinte depuis la console. */
function actionsAtteintes(): [string, string, string][] {
  const vus = new Set<string>();
  const atteintes: [string, string, string][] = [];
  const visiter = (fichier: string) => {
    if (vus.has(fichier)) return;
    vus.add(fichier);
    const source = fs.readFileSync(fichier, 'utf8');
    for (const m of source.matchAll(/import\s+(type\s+)?([\s\S]*?)\s+from\s+'([^']+)'/g)) {
      const [, estType, noms, spec] = m;
      if (estType) continue;
      if (spec.startsWith('@/app/actions/')) {
        for (const brut of noms.replace(/[{}]/g, '').split(',')) {
          const nom = brut.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0];
          if (nom && !brut.trim().startsWith('type ')) atteintes.push([spec, nom, path.relative(SRC, fichier)]);
        }
        continue;
      }
      const cible = resoudre(fichier, spec);
      if (cible && !cible.includes('__tests__')) visiter(cible);
    }
  };
  const parcourir = (dossier: string) => {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (e.name === '__tests__') continue;
      const p = path.join(dossier, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (/\.tsx?$/.test(e.name)) visiter(p);
    }
  };
  parcourir(RACINE);
  return atteintes;
}

function litGetToken(module: string): boolean {
  const fichier = resoudre(RACINE, module);
  if (!fichier) throw new Error(`module introuvable : ${module}`);
  // Les commentaires NOMMENT `getToken()` (ce module-ci le fait) : seul le code compte.
  const code = fs
    .readFileSync(fichier, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return /\bgetToken\s*\(/.test(code);
}

describe("TCK-650 — la console n'atteint aucune action au jeton courant", () => {
  const atteintes = actionsAtteintes();

  it('relève bien des actions (un parcours vide ne garderait rien)', () => {
    expect(atteintes.map(([module]) => module)).toContain('@/app/actions/console');
  });

  it("chaque action atteinte lit le jeton de l'opérateur, ou figure aux exceptions nommées", () => {
    const fautives = atteintes
      .filter(([module, action]) => litGetToken(module) && !EXCEPTIONS[module]?.[action])
      .map(([module, action, fichier]) => `${module} → ${action} (importée par ${fichier})`);

    expect(fautives).toEqual([]);
  });

  it("le module de la console ne lit jamais `getToken`", () => {
    expect(litGetToken('@/app/actions/console')).toBe(false);
  });
});
