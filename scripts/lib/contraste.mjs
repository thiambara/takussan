/**
 * L'ARITHMÉTIQUE DES COULEURS des gardes de contraste — extraite de
 * `scripts/check-profile-badge-contrast.mjs` par TCK-480.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE EXTRACTION ET PAS UNE QUATRIÈME COPIE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le dépôt portait TROIS implémentations du calcul WCAG — `check-profile-badge-contrast.mjs`,
 * `check-chart-contrast.mjs`, `src/test/contraste-wcag.ts` — et le commentaire d'où ce fichier
 * est tiré le disait déjà, avec sa parade : *les trois partagent les MÊMES valeurs de contrôle,
 * de sorte qu'une divergence de calcul fasse rougir au lieu de se propager en silence.* La dette
 * est connue (TCK-371, notes de revue) ; ce fichier ne la solde pas, il refuse de l'aggraver.
 *
 * C'est le patron de `scripts/lib/env-keys.mjs`, et pour le motif qu'il énonce : **deux gardes
 * qui lisent la même matière avec deux parseurs différents, c'est deux verdicts qui divergent le
 * jour où l'un est affiné et pas l'autre.**
 *
 * ⚠ Les deux gardes qui l'emploient aujourd'hui — `check-profile-badge-contrast.mjs` (d'où il
 * vient) et `check-destructive-contrast.mjs` — n'ont PAS le même sujet et ne devaient donc pas
 * fusionner : la première mesure une TABLE FIGÉE dans un composant, la seconde balaie UN JETON
 * sur tout `src/` avec un jeu d'aplats DÉRIVÉ du code. Ce qu'elles partagent est le calcul, pas
 * le périmètre. *Partager la formule, pas le verdict.*
 *
 * `check-chart-contrast.mjs` n'est volontairement pas converti ici : il mesure autre chose
 * (WCAG 1.4.11, seuil 3:1, objets graphiques), sa conversion appartient à qui reprendra
 * TCK-371, et un refactor de plus dans le diff d'un ticket de couleur se relit mal.
 */

/** Les canaux 0-255 d'un `#rrggbb`. */
export function canaux(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

export function luminance(hex) {
  const [r, v, b] = canaux(hex)
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

export function contraste(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)];
  const [haut, bas] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (haut + 0.05) / (bas + 0.05);
}

/** La couleur RÉELLEMENT rendue par `<couleur>/<alpha>` posée sur `fond`. */
export function composer(hex, fond, alpha) {
  const [f, d] = [canaux(hex), canaux(fond)];
  return `#${f.map((v, i) => Math.round(v * alpha + d[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

/** Le corps d'un bloc CSS — `bloc(css, ':root')`, `bloc(css, '.dark')`. */
export function bloc(css, selecteur) {
  const i = css.indexOf(`${selecteur} {`);
  if (i === -1) return '';
  const j = css.indexOf('\n}', i);
  return j === -1 ? '' : css.slice(i, j);
}

/**
 * La valeur d'un jeton, en hexadécimal, ou `null`.
 *
 * ⚠ **`null` ne veut pas dire « absent »** : il veut dire « pas lisible sous cette forme ». Un
 * jeton déclaré en `oklch(…)` rend `null` alors qu'il existe — c'était le cas de `--destructive`
 * jusqu'à TCK-480, et c'est ce qui l'a laissé « compté et non mesuré » dans deux gardes pendant
 * que ce même jeton échouait. *Un appelant qui traite `null` comme « rien à mesurer » fabrique un
 * trou silencieux ; celui qui le traite comme une erreur fabrique une garde honnête.*
 */
export function jeton(source, nom) {
  const m = source.match(new RegExp(`--${nom}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  return m ? m[1].toLowerCase() : null;
}

/** `bg-chart-1/20`, `text-foreground`, `bg-muted` → `{ prefixe, jeton, alpha }`. */
export function utilitaire(classe) {
  const m = /^(bg|text)-([a-z0-9-]+?)(?:\/(\d{1,3}))?$/.exec(classe);
  if (!m) return null;
  const alpha = m[3] === undefined ? 1 : Number(m[3]) / 100;
  if (!(alpha > 0 && alpha <= 1)) return null;
  return { prefixe: m[1], jeton: m[2], alpha };
}

/**
 * LES VALEURS DE CONTRÔLE, partagées avec `check-chart-contrast.mjs` et
 * `src/test/contraste-wcag.ts`.
 *
 * Elles ne prouvent pas que le calcul est juste — elles prouvent que les implémentations qui
 * restent ne DIVERGENT pas. C'est la parade que le commentaire d'origine posait, et la seule
 * chose qui empêche une dérive de se propager en silence tant que les trois coexistent.
 */
export const CONTROLES = [
  { quoi: 'blanc sur noir', calcul: () => contraste('#ffffff', '#000000'), attendu: 21, tol: 0.01 },
  { quoi: '#c89a4a sur blanc', calcul: () => contraste('#c89a4a', '#ffffff'), attendu: 2.57, tol: 0.01 },
  { quoi: 'composition à 50 %', calcul: () => canaux(composer('#ffffff', '#000000', 0.5))[0], attendu: 128, tol: 0 },
];

/** Lève si une valeur de contrôle a bougé. À appeler dans l'auto-épreuve de chaque garde. */
export function verifierControles() {
  for (const c of CONTROLES) {
    const rendu = c.calcul();
    if (Math.abs(rendu - c.attendu) > c.tol) {
      throw new Error(`valeur de contrôle ROMPUE — ${c.quoi} : ${rendu} au lieu de ${c.attendu}`);
    }
  }
}
