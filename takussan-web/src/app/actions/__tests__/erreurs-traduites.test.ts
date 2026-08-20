/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * GARDE — un module `'use server'` ne renvoie JAMAIS une clé i18n ni « API error <n> »
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Ce défaut a traversé trois vagues d'agents et deux vérifications.** Il est né d'un correctif
 * JUSTE appliqué à une seule des trois surfaces de rendu : les 31 route handlers BFF ont cessé
 * d'émettre de la prose anglaise et se sont mis à émettre des CODES — le bon geste — mais le
 * libellé correspondant était ensuite calculé par `ApiError.displayMessage`, qui s'appuyait sur un
 * traducteur rangé dans une **variable de module**, enregistrée par `QueryProvider`.
 *
 * `QueryProvider` est `'use client'`. Les 16 modules `'use server'` de `src/app/actions/` lisaient
 * pourtant `err.displayMessage` et renvoyaient le résultat au client pour affichage. Mesuré par
 * exécution, avant correctif :
 *
 * ```
 * getMyProfilesAction()  ← ApiError(401, { message: 'Unauthenticated.' })
 *   → { ok: false, message: "errors.api.unauthenticated" }
 * getMyProfilesAction()  ← ApiError(500, null)
 *   → { ok: false, message: "errors.api.unknown" }
 * ```
 *
 * Soit **la clé i18n brute affichée à l'utilisateur** — exactement le défaut que le chantier venait
 * de réparer sur 18 messages de validation. Avant le chantier, ces deux cas rendaient
 * « Unauthenticated. » et « API error 500 » : on avait troqué de l'anglais contre une clé.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * DEUX GARDES, ET AUCUNE NE REND L'AUTRE SUPERFLUE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * 1. **Le recensement statique** parcourt `src/app/**` sans rien exécuter et refuse qu'un module
 *    `'use server'` lise un libellé pré-calculé sur l'objet d'erreur. Il voit les modules qu'aucun
 *    test ne monte — et c'est ainsi que le défaut a duré : les actions fautives *avaient* des
 *    tests, verts, qui ne regardaient pas la chaîne renvoyée.
 * 2. **Les cas exécutés** montent le chemin réel et regardent la chaîne. Ils voient ce qu'aucune
 *    lecture statique ne peut décider : que la composition code + traducteur rend bien du français.
 *
 * ⚠️ **Le recensement ÉCHOUE s'il ne scanne rien.** Un contrôle qui ne trouve plus sa cible passe
 * au vert en ne regardant rien, et sa sortie ressemble à un succès — le mode de défaillance payé
 * trois fois par ce dépôt (ardoise D-15, D-18, D-44).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { attendTexteAffichable } from '@/test/cles-brutes';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

const fetchMyProfilesMock = vi.fn();
const patchActiveProfileMock = vi.fn();
vi.mock('@/lib/profiles', () => ({
  ACTIVE_PROFILE_COOKIE: 'active_profile',
  fetchMyProfiles: (...a: unknown[]) => fetchMyProfilesMock(...a),
  patchActiveProfile: (...a: unknown[]) => patchActiveProfileMock(...a),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton-de-test' }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));

import { ApiError } from '@/lib/api';
import { getMyProfilesAction, switchActiveProfileAction } from '@/app/actions/profiles';

beforeEach(() => vi.clearAllMocks());

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 1. Recensement statique
// ──────────────────────────────────────────────────────────────────────────────────────────────

const RACINE = 'src/app';

function fichiersTs(dossier: string): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree === '__tests__') continue;
      sortie.push(...fichiersTs(chemin));
    } else if (/\.tsx?$/.test(entree)) {
      sortie.push(chemin);
    }
  }
  return sortie;
}

/** `'use server'` en tête de fichier — la directive de module, pas une fonction isolée. */
function estModuleServeur(source: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*\n|\s)*['"]use server['"]\s*;/.test(source);
}

/**
 * Ce qu'un module `'use server'` n'a pas le droit de lire sur une erreur : un libellé
 * pré-calculé. Il n'a aucun moyen d'être localisé — la seule primitive correcte ici est
 * `getTranslations()` de `next-intl/server`, appelée dans le module lui-même.
 */
const LECTURES_INTERDITES: readonly { motif: RegExp; pourquoi: string }[] = [
  { motif: /\.displayMessage\b/, pourquoi: '`.displayMessage` — prose serveur ou `undefined`, jamais un libellé complet' },
  { motif: /\.proseServeur\b/, pourquoi: '`.proseServeur` — non traduit côté client, à composer via `messageErreurApi`' },
  // ⚠ CES DEUX MOTIFS ONT ÉTÉ ÉLARGIS LE 2026-08-20, SUR MUTATION D'UN VÉRIFICATEUR ADVERSE.
  // Ils étaient plus étroits que ce que l'en-tête promettait — le défaut exact que ce dépôt
  // combat partout ailleurs, commis ici par la garde censée le prévenir. Deux formes passaient
  // au vert : `message: apiErr.message` (identifiant hors d'une liste de six noms) et
  // `message: repli || 'errors.api.unknown'` (clé ailleurs qu'immédiatement après `message:`).
  { motif: /message:[^,;\n]*['"`]errors\.api\./, pourquoi: 'une clé i18n renvoyée telle quelle comme `message` — où qu\'elle soit dans l\'expression' },
  { motif: /message:[^,;\n]*\b[A-Za-z_$][\w$]*\s*\??\.\s*message\b/, pourquoi: 'un `message` brut relayé sans filtre — soit « API error <n> » (natif d’`ApiError`), soit la sentinelle anglaise « Unauthenticated. » de Laravel. Le motif ne présume plus du NOM de la variable : c\'est la lecture de `.message` qui est interdite, quel que soit le porteur' },
];

describe('recensement statique des modules `use server`', () => {
  const sources = fichiersTs(RACINE).map((p) => [p, readFileSync(p, 'utf8')] as const);
  const modulesServeur = sources.filter(([, s]) => estModuleServeur(s));

  it('trouve bien des modules `use server` à contrôler', () => {
    // Sans ce cas, une régression du détecteur rendrait la garde muette ET verte.
    expect(
      modulesServeur.length,
      `aucun module 'use server' trouvé sous ${RACINE}/ — le détecteur ne voit plus sa cible`,
    ).toBeGreaterThanOrEqual(20); // 20 modules `use server` mesurés le 2026-08-20 — cliquet, pas plancher : le compte ne redescend pas sans qu'on le décide.
  });

  it.each(LECTURES_INTERDITES)('aucun module ne lit $pourquoi', ({ motif }) => {
    const fautifs = modulesServeur
      .flatMap(([chemin, source]) =>
        source
          .split('\n')
          .map((ligne, i) => ({ chemin, n: i + 1, ligne }))
          .filter(({ ligne }) => !/^\s*(\/\/|\*|\/\*)/.test(ligne) && motif.test(ligne)),
      )
      .map(({ chemin, n, ligne }) => `${chemin}:${n}  ${ligne.trim()}`);
    expect(fautifs, fautifs.join('\n')).toEqual([]);
  });

  it('tout module `use server` qui manipule ApiError importe `getTranslations`', () => {
    const fautifs = modulesServeur
      .filter(([, s]) => /\bApiError\b/.test(s))
      .filter(([, s]) => !/getTranslations\s*[,}].*from\s*'next-intl\/server'|from\s*'next-intl\/server'/.test(s))
      .map(([p]) => p);
    expect(fautifs, `sans traducteur serveur, ces modules ne peuvent rien localiser :\n${fautifs.join('\n')}`)
      .toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 2. Cas exécutés — on regarde la chaîne réellement renvoyée
// ──────────────────────────────────────────────────────────────────────────────────────────────

type Echec = { ok: false; message: string };

const CAS: readonly { nom: string; erreur: unknown; attendu: string }[] = [
  {
    nom: '401 portant la sentinelle anglaise de Laravel',
    erreur: new ApiError(401, { message: 'Unauthenticated.' }),
    attendu: 'Votre session a expiré. Reconnectez-vous.',
  },
  {
    nom: 'corps vide (500)',
    erreur: new ApiError(500, null),
    attendu: 'Le serveur a rencontré une erreur. Réessayez dans un instant.',
  },
  {
    nom: 'code émis par un route handler BFF',
    erreur: new ApiError(400, { code: 'invalid_profile_id' }),
    attendu: 'Ce profil est introuvable.',
  },
  {
    nom: '429',
    erreur: new ApiError(429, null),
    attendu: 'Trop de tentatives. Réessayez dans quelques minutes.',
  },
  {
    nom: 'prose déjà localisée par Laravel — on la garde',
    erreur: new ApiError(422, { message: 'Le fichier est trop lourd.' }),
    attendu: 'Le fichier est trop lourd.',
  },
  {
    nom: 'corps sans rien d’exploitable — le repli MÉTIER de l’action, plus utile que le générique',
    erreur: new ApiError(418, {}),
    attendu: 'Impossible de charger vos profils.',
  },
];

describe('getMyProfilesAction rend du français, jamais une clé', () => {
  it.each(CAS)('$nom', async ({ erreur, attendu }) => {
    fetchMyProfilesMock.mockRejectedValue(erreur);
    const r = (await getMyProfilesAction()) as Echec;
    attendTexteAffichable(r.message, 'getMyProfilesAction');
    expect(r.message).toBe(attendu);
  });
});

describe('switchActiveProfileAction — même chemin, autre action', () => {
  it('un 401 sentinelle ne renvoie pas la clé', async () => {
    patchActiveProfileMock.mockRejectedValue(new ApiError(401, { message: 'Unauthenticated.' }));
    const r = (await switchActiveProfileAction('agent:5')) as Echec;
    attendTexteAffichable(r.message, 'switchActiveProfileAction');
    expect(r.message).toBe('Votre session a expiré. Reconnectez-vous.');
  });
});
