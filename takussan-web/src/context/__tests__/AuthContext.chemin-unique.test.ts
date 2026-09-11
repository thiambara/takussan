// @vitest-environment node
/**
 * TCK-509 — garde : AUCUN chemin d'entrée ni de sortie ne contourne le contexte d'auth.
 *
 * ## Pourquoi une garde et pas seulement des tests de comportement
 *
 * Le défaut n'était dans aucune fonction : il était dans les CHEMINS. Le contexte savait ouvrir et
 * fermer une session proprement (`login`, `register`, `logout`) — et ces trois fonctions avaient
 * zéro appelant. La page de connexion, l'inscription et le callback OAuth posaient le cookie par
 * leur propre `fetch('/api/auth/set-token')` ; le menu de `/app` se déconnectait par une server
 * action, la `Navbar` par son propre `fetch('/api/auth/logout')`. Chacun était « correct » pris
 * isolément, et le jeton du navigateur restait celui de la session précédente.
 *
 * Un test de comportement couvre les chemins qu'on lui a donnés. Le prochain écran qui poserait le
 * cookie lui-même ne serait couvert par aucun — cette garde, si.
 *
 * ## Ce qu'elle refuse
 *
 *   1. un `fetch('/api/auth/set-token' | '/api/auth/logout')` hors de `src/context/AuthContext.tsx` ;
 *   2. un effacement du cookie de session (`.delete(AUTH_COOKIE_NAME)`) hors des route handlers de
 *      `src/app/api/auth/` — c'est la forme qu'avait la server action `logoutAction`, dont le
 *      client n'apprenait jamais l'effet.
 *
 * ## Ce qu'elle ne voit pas
 *
 * Une URL construite (`fetch(\`/api/auth/${x}\`)`) ou un appel via un utilitaire intermédiaire.
 * Elle cherche une FORME, pas une propriété : c'est un plancher, les tests de comportement de
 * `AuthContext.session.test.tsx` restent la preuve.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = process.cwd();
const SRC = join(RACINE, 'src');
const CONTEXTE = 'src/context/AuthContext.tsx';

function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' ? [] : sources(chemin);
    return /\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : [];
  });
}

const FICHIERS = sources(SRC).map((f) => ({
  chemin: relative(RACINE, f).split(sep).join('/'),
  texte: readFileSync(f, 'utf8'),
}));

const POSE_OU_EFFACE = /fetch\(\s*['"`]\/api\/auth\/(?:set-token|logout)['"`]/;
const EFFACE_LE_COOKIE = /\.delete\(\s*AUTH_COOKIE_NAME\s*\)/;

describe('TCK-509 — un seul chemin pour ouvrir et fermer une session côté client', () => {
  it('parcourt réellement le code (témoins positifs)', () => {
    expect(FICHIERS.length).toBeGreaterThan(300);
    // Le contexte LUI-MÊME doit être vu par le motif : sans quoi un motif cassé passerait à vide.
    expect(POSE_OU_EFFACE.test(FICHIERS.find((f) => f.chemin === CONTEXTE)?.texte ?? '')).toBe(true);
    expect(
      FICHIERS.some((f) => f.chemin.startsWith('src/app/api/auth/') && EFFACE_LE_COOKIE.test(f.texte)),
    ).toBe(true);
  });

  it('seul le contexte d’auth appelle set-token ou /api/auth/logout depuis le client', () => {
    const fautifs = FICHIERS.filter((f) => f.chemin !== CONTEXTE && POSE_OU_EFFACE.test(f.texte)).map(
      (f) => f.chemin,
    );
    expect(fautifs, 'passer par useAuth().openSession / useAuth().logout').toEqual([]);
  });

  it('seuls les route handlers de /api/auth effacent le cookie de session', () => {
    const fautifs = FICHIERS.filter(
      (f) => !f.chemin.startsWith('src/app/api/auth/') && EFFACE_LE_COOKIE.test(f.texte),
    ).map((f) => f.chemin);
    expect(fautifs, 'le client n’apprendrait jamais cet effacement — passer par useAuth().logout').toEqual([]);
  });
});
