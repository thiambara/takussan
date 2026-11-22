#!/usr/bin/env node
/**
 * Garde des VALEURS ARBITRAIRES de la partie connectée — TCK-2685 (ADR-0106 § 3, ADR-0107 § 4).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EMPÊCHE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La maquette retenue fait foi au pixel, et elle écrit ses tailles en valeurs arbitraires
 * (3 404 dans les maquettes, 7,3 % de leurs classes : `text-[13px]`, `shadow-[…]`, `tracking-[…]`).
 * Recopiées telles quelles, elles feraient de chaque page une palette à part, sourde aux jetons et,
 * pour le texte en px, au réglage de police de l'utilisateur. TCK-2685 nomme ces valeurs (`text-ui`,
 * `shadow-feuille`, `tracking-titre`, `size-icone`…) ; cette garde refuse qu'une page de `/app` en
 * réécrive une.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE PÉRIMÈTRE — LA CLÔTURE DES IMPORTS, PAS UN DOSSIER
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * *Un grep qui ne suit pas les imports mesure le répertoire, pas l'écran* (TCK-372) : les pages de
 * `src/app/(dashboard)` sont des enveloppes, l'écran vit dans les composants qu'elles montent. Le
 * périmètre est donc la clôture TRANSITIVE des imports de `src/app/(dashboard)` — primitives
 * `components/ui/` comprises —, suivie par `import … from`, `export … from`, `import()` et
 * `require()`, alias `@/` compris. Les fichiers de test n'y entrent pas.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI EST INTERDIT (la table `INTERDITS`)
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   texte-arbitraire   `text-[<longueur>]` — 13px comme 0.8125rem : un jeton `text-*` de l'app
 *   tracking-arbitraire `tracking-[…]` — `tracking-titre`, `tracking-surtitre`, `tracking-tight`
 *   icone-18           `size-[18px]` (ou 1.125rem) — `size-icone`
 *   opacite-crochets   `…/[0.07]` — Tailwind 4 accepte tout entier : `/7`
 *   ombre-arbitraire   `shadow-[…]` — une ombre nommée
 *   shadow-2xl         la classe `shadow-2xl` — `shadow-feuille` en porte la valeur
 *   encre-sourde       `text-muted-foreground/70` — 3,03:1 sur `--card`, sous AA
 *   aplat-accent       `bg-accent/<n>` — l'accent est réservé aux badges *featured*
 *
 * Le relevé lit le TEXTE du fichier, commentaires retirés : une classe s'écrit en littéral, sous
 * peine de ne pas être compilée. Il voit donc aussi une chaîne d'un seul jeton hors de toute
 * position de classe (`const OMBRE = 'shadow-2xl'`), que `classes-ecrites.mjs` ne relève pas (son
 * trou n° 2) : ici la forme est assez distinctive pour se passer d'une position.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE CLIQUET — BILATÉRAL, FICHIER PAR FICHIER
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'existant est consigné dans `check-valeurs-arbitraires-app.consigne.json`, par fichier et par
 * famille. Un compte qui MONTE rougit ; un compte qui DESCEND rougit aussi tant que la consigne ne
 * suit pas (`--consigner`, qui refuse toute hausse) : sinon la marge regagnée resterait ouverte au
 * prochain qui la reprendrait. Chaque ticket de page fait baisser son fichier et la consigne.
 *
 * Chaque entrée porte son motif : celui de la consigne par défaut (« existant à la bascule ») ou un
 * `motif` écrit à la main, seul moyen de relever un compte — et qui se relit en revue.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ELLE S'ÉPROUVE À CHAQUE INVOCATION
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * *Une garde qui ne trouve plus rien et une garde qui n'a plus rien à trouver rendent la même sortie
 * verte* (classes-ecrites.mjs). Avant de lire le dépôt, elle passe ses formes fautives d'épreuve —
 * JSX, `cva`, constante, ternaire, `cn()`, gabarit, variante — dans la MÊME fonction de relevé, et
 * ses formes saines (jetons, couleur arbitraire, commentaire) : une forme manquée ou un faux positif
 * la fait rougir. Puis elle exige un périmètre plausible : au moins 90 % des fichiers consignés, et
 * ses fichiers témoins (une primitive, la coque, un composant à deux maillons d'une page).
 *
 * Usage :
 *   node scripts/check-valeurs-arbitraires-app.mjs              # garde (CI)
 *   node scripts/check-valeurs-arbitraires-app.mjs --report     # + le détail par fichier
 *   node scripts/check-valeurs-arbitraires-app.mjs --consigner  # récrit la consigne ; refuse une hausse
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, '..');
const WEB = join(RACINE, 'takussan-web');
const SRC = join(WEB, 'src');
const ENTREE = join(SRC, 'app', '(dashboard)');
const CONSIGNE = join(ICI, 'check-valeurs-arbitraires-app.consigne.json');

const MOTIF_PAR_DEFAUT =
  "Existant consigné le 2026-11-11 à la bascule (TCK-2685) : chaque ticket de page de l'audit UX le fait baisser.";

/** Les fichiers qui DOIVENT être dans le périmètre : sinon la clôture a été coupée quelque part. */
const TEMOINS = [
  'src/components/ui/button.tsx', // une primitive
  'src/components/layout/AppShell.tsx', // la coque, sous le layout de `/app`
  'src/components/layout/styles-de-la-barre.ts', // deux maillons : layout → AppShell → AppSidebar → styles
];

/** La table des interdits : famille → prédicat sur l'utilitaire (variantes retirées). */
export const INTERDITS = {
  'texte-arbitraire': (u) => /^text-\[(?:length:|-?[\d.]|calc\(|clamp\(|min\(|max\()/.test(u),
  'tracking-arbitraire': (u) => /^-?tracking-\[/.test(u),
  'icone-18': (u) => /^size-\[(?:18px|1\.125rem)\]$/.test(u),
  // Une opacité NUMÉRIQUE entre crochets sur un utilitaire : `bg-foreground/[0.07]` — pas un chemin
  // de route (`/app/properties/[id]`), dont le premier segment commence par une barre.
  'opacite-crochets': (u) => /^[a-z][\w-]*\/\[[\d.]+%?\]$/.test(u),
  'ombre-arbitraire': (u) => /^shadow-\[/.test(u),
  'shadow-2xl': (u) => u === 'shadow-2xl',
  'encre-sourde': (u) => u === 'text-muted-foreground/70',
  'aplat-accent': (u) => /^bg-accent\/(?:\d|\[)/.test(u),
};

/* ───────────────────────────── relevé ───────────────────────────── */

/** Le texte sans ses commentaires (de ligne et de bloc), en respectant les chaînes et les gabarits. */
export function sansCommentaires(source) {
  let out = '';
  let i = 0;
  let chaine = null; // '"', "'", '`'
  while (i < source.length) {
    const c = source[i];
    const d = source[i + 1];
    if (chaine) {
      out += c;
      if (c === '\\') {
        out += d ?? '';
        i += 2;
        continue;
      }
      if (c === chaine) chaine = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      chaine = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && d === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      const fin = source.indexOf('*/', i + 2);
      const bloc = source.slice(i, fin < 0 ? source.length : fin + 2);
      out += bloc.replace(/[^\n]/g, ' '); // garde les numéros de ligne
      i = fin < 0 ? source.length : fin + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** L'utilitaire d'une classe : variantes (`md:`, `[&>svg]:`) et `!` retirés, crochets respectés. */
export function utilitaire(classe) {
  let profondeur = 0;
  let debut = 0;
  for (let k = 0; k < classe.length; k++) {
    const c = classe[k];
    if (c === '[' || c === '(') profondeur++;
    else if (c === ']' || c === ')') profondeur--;
    else if (c === ':' && profondeur === 0) debut = k + 1;
  }
  return classe.slice(debut).replace(/^!|!$/g, '');
}

/**
 * Les morceaux d'un texte séparés par un blanc ou un guillemet — une classe Tailwind n'en contient
 * jamais (une valeur arbitraire écrit ses espaces `_`) —, débarrassés de la ponctuation du code qui
 * les entoure (`cn(`, `{`, `${x}`, `),`).
 */
function jetons(texte) {
  const out = [];
  texte.split('\n').forEach((ligne, n) => {
    for (const morceau of ligne.split(/[\s'"`]+/)) {
      const classe = morceau.replace(/^(?:\$\{[^}]*\}|[{}(),;=?!<>&|+])+/, '').replace(/[}),;]+$/, '');
      if (classe) out.push({ classe, ligne: n + 1 });
    }
  });
  return out;
}

/** Relève les classes interdites d'un source : `[{famille, classe, ligne}]`. */
export function releve(source) {
  const trouve = [];
  for (const { classe, ligne } of jetons(sansCommentaires(source))) {
    const u = utilitaire(classe);
    for (const [famille, interdit] of Object.entries(INTERDITS)) {
      if (interdit(u)) {
        trouve.push({ famille, classe, ligne });
        break;
      }
    }
  }
  return trouve;
}

/* ───────────────────────────── auto-épreuve ───────────────────────────── */

/** Chaque forme fautive doit être relevée dans SA famille ; chaque forme saine, jamais. */
const EPREUVES_FAUTIVES = [
  ['texte-arbitraire', `<p className="text-[13px] font-medium">x</p>`],
  ['texte-arbitraire', `<p className="max-lg:text-[0.9375rem] lg:text-sm">x</p>`],
  ['tracking-arbitraire', `const v = cva('inline-flex', { variants: { taille: { sm: 'h-8 tracking-[-0.02em]' } } });`],
  ['ombre-arbitraire', `const OMBRE = 'rounded-xl shadow-[0_1px_2px_color-mix(in_srgb,var(--shadow-color)_18%,transparent)]';`],
  ['opacite-crochets', `<div className={actif ? 'bg-foreground/[0.07] px-2' : 'px-2'} />`],
  ['icone-18', `<Home className={cn('size-[18px] shrink-0', classe)} />`],
  ['shadow-2xl', 'const F = `rounded-2xl ${x} shadow-2xl`;'],
  ['shadow-2xl', `const SEULE = 'shadow-2xl';`],
  ['encre-sourde', `<span className="text-muted-foreground/70">x</span>`],
  ['aplat-accent', `<span className={clsx('rounded-full', info && 'bg-accent/15 text-accent')}>x</span>`],
];
const EPREUVES_SAINES = [
  `<p className="text-ui text-encre-douce tracking-titre shadow-feuille size-icone">x</p>`,
  `<p className="text-[#fff] bg-foreground/7 text-muted-foreground bg-accent text-sm">x</p>`,
  `// une ancienne forme : text-[13px] shadow-2xl\nconst a = 1;`,
  `/* text-[15px] tracking-[0.08em] */ const b = 'https://exemple.sn/a//b';`,
  `<div className="w-[calc(var(--spacing)*22)] max-lg:@max-[11rem]:hidden" />`,
];

function sEprouver() {
  const echecs = [];
  for (const [famille, source] of EPREUVES_FAUTIVES) {
    const r = releve(source);
    if (!r.some((t) => t.famille === famille)) echecs.push(`forme fautive manquée (${famille}) : ${source}`);
  }
  for (const source of EPREUVES_SAINES) {
    const r = releve(source);
    if (r.length) echecs.push(`faux positif ${r.map((t) => t.classe).join(', ')} dans : ${source.replace(/\n/g, '⏎')}`);
  }
  return echecs;
}

/* ───────────────────────────── périmètre ───────────────────────────── */

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
const estTest = (f) => /(?:^|\/)__tests__\/|\.test\.[jt]sx?$|\.spec\.[jt]sx?$/.test(f);

function fichiersSous(dossier) {
  const out = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiersSous(chemin));
    else if (/\.(?:tsx?|jsx?|mjs)$/.test(nom)) out.push(chemin);
  }
  return out;
}

function resoudre(specificateur, depuis) {
  let base;
  if (specificateur.startsWith('@/')) base = join(SRC, specificateur.slice(2));
  else if (specificateur.startsWith('.')) base = resolve(dirname(depuis), specificateur);
  else return null; // paquet
  for (const ext of EXTENSIONS) {
    const c = base + ext;
    if (existsSync(c) && statSync(c).isFile() && /\.(?:tsx?|jsx?|mjs)$/.test(c)) return c;
  }
  return null;
}

const SPECIFICATEURS = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm;

export function cloture(entrees) {
  const vus = new Set();
  const pile = entrees.filter((f) => !estTest(relative(WEB, f)));
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f)) continue;
    vus.add(f);
    const source = sansCommentaires(readFileSync(f, 'utf8'));
    for (const m of source.matchAll(SPECIFICATEURS)) {
      const cible = resoudre(m[2], f);
      if (cible && !vus.has(cible) && !estTest(relative(WEB, cible))) pile.push(cible);
    }
  }
  return [...vus].map((f) => relative(WEB, f)).sort();
}

/* ───────────────────────────── cliquet ───────────────────────────── */

function comptesDu(perimetre) {
  const comptes = {};
  const lieux = {};
  for (const f of perimetre) {
    const r = releve(readFileSync(join(WEB, f), 'utf8'));
    if (!r.length) continue;
    comptes[f] = {};
    lieux[f] = r;
    for (const t of r) comptes[f][t.famille] = (comptes[f][t.famille] ?? 0) + 1;
  }
  return { comptes, lieux };
}

function ecrireConsigne(perimetre, comptes, ancienne) {
  const lignes = Object.keys(comptes)
    .sort()
    .map((f) => {
      const entree = { ...Object.fromEntries(Object.entries(comptes[f]).sort()) };
      const motif = ancienne?.fichiers?.[f]?.motif;
      if (motif) entree.motif = motif;
      return `    ${JSON.stringify(f)}: ${JSON.stringify(entree)}`;
    });
  const texte = [
    '{',
    `  "_lisez-moi": ${JSON.stringify("Consigne de scripts/check-valeurs-arbitraires-app.mjs (TCK-2685). Un compte ne se relève qu'à la main, avec un champ `motif` ; il se rabaisse par `--consigner`.")},`,
    `  "motif": ${JSON.stringify(MOTIF_PAR_DEFAUT)},`,
    `  "perimetre": ${perimetre.length},`,
    '  "fichiers": {',
    lignes.join(',\n'),
    '  }',
    '}',
    '',
  ].join('\n');
  writeFileSync(CONSIGNE, texte);
}

function principal() {
  const args = process.argv.slice(2);
  const rapport = args.includes('--report');
  const consigner = args.includes('--consigner');
  const erreurs = [];

  // 1. Elle s'éprouve.
  const epreuve = sEprouver();
  if (epreuve.length) {
    console.error('✗ check-valeurs-arbitraires-app : le relevé ne voit plus ce qu’il doit voir');
    for (const e of epreuve) console.error(`  · ${e}`);
    process.exit(2);
  }

  // 2. Le périmètre.
  const perimetre = cloture(fichiersSous(ENTREE));
  const consigne = existsSync(CONSIGNE) ? JSON.parse(readFileSync(CONSIGNE, 'utf8')) : null;
  for (const t of TEMOINS) if (!perimetre.includes(t)) erreurs.push(`périmètre coupé : le témoin ${t} n'est plus atteint depuis src/app/(dashboard)`);
  if (consigne && perimetre.length < Math.floor(consigne.perimetre * 0.9)) {
    erreurs.push(`périmètre rétréci : ${perimetre.length} fichiers atteints, ${consigne.perimetre} consignés (plancher 90 %)`);
  }
  if (perimetre.length === 0) erreurs.push('périmètre vide');

  const { comptes, lieux } = comptesDu(perimetre);

  if (consigner) {
    if (erreurs.length) {
      for (const e of erreurs) console.error(`✗ ${e}`);
      process.exit(1);
    }
    const hausses = [];
    if (consigne) {
      for (const [f, parFamille] of Object.entries(comptes)) {
        for (const [famille, n] of Object.entries(parFamille)) {
          const avant = consigne.fichiers[f]?.[famille] ?? 0;
          if (n > avant) hausses.push(`${f} · ${famille} : ${avant} → ${n}`);
        }
      }
    }
    if (hausses.length) {
      console.error('✗ --consigner refuse une hausse (relever un compte se fait à la main, avec un `motif`) :');
      for (const h of hausses) console.error(`  · ${h}`);
      process.exit(1);
    }
    ecrireConsigne(perimetre, comptes, consigne);
    console.log(`✓ consigne écrite : ${Object.keys(comptes).length} fichiers, périmètre ${perimetre.length}`);
    return;
  }

  if (!consigne) {
    console.error(`✗ consigne absente : ${relative(RACINE, CONSIGNE)} (node scripts/check-valeurs-arbitraires-app.mjs --consigner)`);
    process.exit(1);
  }

  // 3. Le cliquet, dans les deux sens.
  const fichiers = new Set([...Object.keys(comptes), ...Object.keys(consigne.fichiers)]);
  for (const f of [...fichiers].sort()) {
    const reel = comptes[f] ?? {};
    const consigneF = consigne.fichiers[f] ?? {};
    const motif = consigneF.motif ?? consigne.motif;
    if (typeof motif !== 'string' || motif.trim().length < 20) erreurs.push(`${f} : entrée sans motif lisible`);
    for (const famille of Object.keys(INTERDITS)) {
      const n = reel[famille] ?? 0;
      const c = consigneF[famille] ?? 0;
      if (n > c) {
        const ici = (lieux[f] ?? []).filter((t) => t.famille === famille).map((t) => `l.${t.ligne} ${t.classe}`).join(', ');
        erreurs.push(`${f} · ${famille} : ${n} pour ${c} consigné(s) — ${ici}`);
      } else if (n < c) {
        erreurs.push(`${f} · ${famille} : ${n} pour ${c} consigné(s) — le compte a baissé, faites suivre la consigne (--consigner)`);
      }
    }
  }

  const total = Object.values(comptes).reduce((s, p) => s + Object.values(p).reduce((a, b) => a + b, 0), 0);
  if (rapport) {
    console.log(`périmètre : ${perimetre.length} fichiers (clôture des imports de src/app/(dashboard))`);
    for (const f of Object.keys(comptes).sort()) console.log(`  ${f} ${JSON.stringify(comptes[f])}`);
  }
  if (erreurs.length) {
    console.error(`✗ check-valeurs-arbitraires-app : ${erreurs.length} écart(s)`);
    for (const e of erreurs) console.error(`  · ${e}`);
    console.error('  Un jeton de la partie connectée existe pour chaque valeur : docs/design-guidelines.md, « Les jetons de la partie connectée ».');
    process.exit(1);
  }
  console.log(`✓ check-valeurs-arbitraires-app : ${total} valeur(s) arbitraire(s) consignée(s) dans ${Object.keys(comptes).length} fichier(s), périmètre ${perimetre.length} fichiers, ${EPREUVES_FAUTIVES.length} formes d'épreuve relevées`);
}

principal();
