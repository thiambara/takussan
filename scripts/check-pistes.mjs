#!/usr/bin/env node
/**
 * Garde du FICHIER DE PISTES (ADR-0066) : la forme que trois agents planifiés lisent et écrivent
 * tour à tour, et le périmètre de chacun.
 *
 * ─── Pourquoi elle existe ────────────────────────────────────────────────────────────────────
 *
 * `docs/plans/2026-10-15-pistes-d-amelioration.md` est le SEUL canal entre l'explorateur, le
 * mesureur et l'implémenteur : chacun ne voit que ce que le précédent y a écrit. Dans ce canal, une
 * faute ne fait rien échouer, elle fait disparaître. Un statut mal orthographié retire l'entrée de
 * la liste que l'agent suivant demande, sans que rien le dise. Une référence en double fait
 * implémenter deux fois, ou marquer « fait » la mauvaise piste. Un classement « autonome » sans
 * mesure fait coder sur une prémisse que personne n'a revérifiée.
 *
 * ─── Ce qu'elle vérifie ──────────────────────────────────────────────────────────────────────
 *
 * Mode garde (sans option, joué par la CI sur toute PR), la FORME :
 *   · chaque entrée `###` d'une section `## Angle N` porte `Réf : PNN.MM`, où NN vaut N, unique
 *     dans tout le fichier ;
 *   · elle porte aussi un `Statut` du vocabulaire, une `Gravité` 🔴/🟠/🟢, un constat et une `Piste` ;
 *   · tout statut autre que `à mesurer` est appuyé par au moins une ligne
 *     `Mesure (AAAA-MM-JJ, <sha>, <rôle>) : …` ;
 *   · `fait · TCK-NNN` désigne un ticket qui existe ;
 *   · le tableau des angles et les sections `## Angle N` se correspondent.
 *
 * L'ARCHIVE (amendement du 2026-10-24) : les entrées closes (`fait`, `caduc`, `refusé`) quittent
 * le fichier vivant, telles quelles, pour `docs/plans/pistes-archive/angles-NNN-NNN.md`, une par
 * centaine d'angles. Seul l'archiveur (`scripts/agents/archiver-pistes.mjs`, sans modèle) les y
 * déplace. La garde lit le fichier vivant ET l'archive, et tient de plus :
 *   · la Réf unique dans l'ensemble des deux ;
 *   · toute Réf `PNN.MM` qu'une entrée vivante cite existe dans l'ensemble ;
 *   · l'archive ne garde que des entrées closes, chacune dans le fichier de sa centaine et sous une
 *     section dont le fichier vivant garde le titre.
 * `--report`, `--liste`, `--restes`, `--delegations` et les désaveux du porteur lisent l'ensemble.
 *
 * Mode rôle (`--role <rôle> --base <ref>`), le PÉRIMÈTRE. `scripts/agents/pistes.sh` le joue
 * après chaque passage d'agent, AVANT tout push, contre la base de fusion avec `pre-dev`. Il
 * vérifie les fichiers touchés et les transitions de statut faites, au regard du rôle. Un agent ne
 * s'accorde pas ce que son rôle n'a pas : l'explorateur ne classe pas, le mesureur n'implémente
 * pas, et aucun agent n'écrit `validé` seul, qui est la signature du porteur. Une piste `validé` ne
 * revient au porteur qu'avec une raison. Sa précision (`validé — …`) se retrouve mot pour mot dans
 * le ticket qui la passe à `fait`. Un passage de l'implémenteur fait changer de statut 10 entrées
 * au plus (amendement du 2026-10-21). Un lot de plusieurs tickets qui touche à la fois l'API et le front est une seule famille :
 * ses pistes faites se relient par un angle commun ou un fichier cité en commun (amendements du
 * 2026-10-17). Le délégué (amendement du 2026-10-18) n'écrit que `validé (délégué) — …`, et
 * seulement sur une entrée que le porteur n'a pas encore tranchée, dont TOUS les critères V sont
 * délégables : jamais V1, V2, V3, V5 ni V9, ni une catégorie que le porteur a désavouée. Aucun rôle
 * modèle n'écrit l'archive ; l'archiveur (`--role archiveur`) n'y fait que déplacer des entrées
 * closes, octet pour octet, et ne touche à rien d'autre.
 *
 * ─── Ce qu'elle ne vérifie PAS ───────────────────────────────────────────────────────────────
 *
 * Qu'une mesure est vraie, ni qu'un classement « autonome » est juste. Elle garantit qu'une trace
 * datée existe et peut être relue, pas que cette trace dit vrai. Juger le fond relève de la revue
 * de la PR, et de la re-mesure que l'implémenteur refait avant de coder.
 *
 * Usage :
 *   node scripts/check-pistes.mjs                         # garde, sort en 1 sur la première erreur
 *   node scripts/check-pistes.mjs --report                # + comptes par statut et par gravité
 *   node scripts/check-pistes.mjs --liste "à mesurer"     # entrées dont le statut commence ainsi
 *   node scripts/check-pistes.mjs --angles-a-faire        # angles encore à explorer, dans l'ordre
 *   node scripts/check-pistes.mjs --restes                # ce qui reste des validations partielles
 *   node scripts/check-pistes.mjs --a-deleguer            # « à valider » que le délégué peut prendre
 *   node scripts/check-pistes.mjs --delegations           # validations et recommandations du délégué
 *   node scripts/check-pistes.mjs --role mesureur --base origin/pre-dev
 *   node scripts/check-pistes.mjs --role archiveur --base origin/pre-dev   # joué par `pistes.sh archiver`
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `CHECK_PISTES_RACINE` : `pistes.sh` joue la version de `origin/pre-dev` de ce fichier, posée hors
// de l'arbre de l'agent, contre cet arbre — un agent ne juge pas son travail avec une garde qu'il a modifiée.
const ROOT = process.env.CHECK_PISTES_RACINE ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FICHIER = 'docs/plans/2026-10-15-pistes-d-amelioration.md';
// L'archive des entrées closes (amendement d'ADR-0066 du 2026-10-24) : un fichier par centaine
// d'angles, que seul l'archiveur écrit.
export const ARCHIVE = 'docs/plans/pistes-archive';
const TICKETS = 'docs/backlog/tickets';

// Le vocabulaire est FERMÉ : un statut hors de cette liste est une erreur, jamais un « autre ».
// `nom` est la forme canonique, celle que `--liste` et les transitions comparent.
const STATUTS = [
  { nom: 'à mesurer', motif: /^à mesurer$/ },
  { nom: 'caduc', motif: /^caduc( — .{10,})?$/ },
  { nom: 'retenu · autonome', motif: /^retenu · autonome$/ },
  { nom: 'retenu · à valider', motif: /^retenu · à valider( — .{10,})?$/ },
  // `validé (délégué) — …` : la même signature, écrite par le délégué, avec sa décision.
  { nom: 'validé', motif: /^validé( — .+| \(délégué\) — .{10,})?$/ },
  { nom: 'refusé', motif: /^refusé( — .+)?$/ },
  { nom: 'fait', motif: /^fait · TCK-\d{3,}( — reste : .{10,})?$/ },
];
// Les statuts qui ferment une entrée : seuls eux partent à l'archive.
export const CLOS = ['fait', 'caduc', 'refusé'];

// `archiveur` n'est pas un agent modèle : c'est le périmètre de `pistes.sh archiver`.
const ROLES = ['explorateur', 'mesureur', 'implementeur', 'delegue', 'archiveur'];

// Ce que chaque rôle a le droit de faire d'un statut. `refusé` n'est une cible nulle part, et
// `validé` ne l'est que du délégué, sous la forme `validé (délégué) — …` et dans les bornes de
// `verifierDelegation` : le reste du temps, seul le porteur les écrit, sur `pre-dev`.
const TRANSITIONS = {
  explorateur: {},
  mesureur: { 'à mesurer': ['caduc', 'retenu · autonome', 'retenu · à valider'] },
  implementeur: {
    'retenu · autonome': ['fait', 'caduc', 'retenu · à valider'],
    validé: ['fait', 'caduc', 'retenu · à valider'],
  },
  delegue: { 'retenu · à valider': ['validé'] },
};

// Le délégué (amendement d'ADR-0066 du 2026-10-18) tranche à la place du porteur les seules
// catégories qu'il lui a confiées. Les autres lui restent quoi qu'il arrive : l'argent (V1),
// l'authentification (V2), les données personnelles (V3), l'infrastructure et la production (V5),
// et les bornes des agents eux-mêmes (V9) — un agent ne s'accorde pas ce qui le borne.
const DELEGABLES = ['V4', 'V6', 'V7', 'V8'];
// Un désaveu du porteur retire sa catégorie au délégué, sans autre réglage : une ligne
// `- Mesure (…, humain) : désaveu de la délégation V7 — …`, sur n'importe quelle entrée.
const DESAVEU = /désaveu de la délégation ((?:V\d(?:, | et )?)+)/;
// Entrées qu'un passage du délégué peut faire changer de statut.
const DELEGATION_MAX = 6;

// Chemins que l'implémenteur ne touche jamais. Tout y relève d'une décision du porteur : la CI,
// le déploiement, les instructions et gardes des agents eux-mêmes, les specs (que
// `/implement-spec` ne modifie pas), les seuils, les dépendances, les environnements.
const PROTEGES_IMPLEMENTEUR = [
  /^\.github\//,
  /^deploy\//,
  /^docker-compose\.yml$/,
  /^dev\.sh$/,
  /^scripts\/agents\//,
  /^scripts\/check-pistes\.mjs$/,
  /^\.agent\//,
  /^\.claude\//,
  /^\.windsurf\//,
  /(^|\/)CLAUDE\.md$/,
  /^AGENTS\.md$/,
  /^docs\/adr\//,
  /^docs\/features\.md$/,
  /^docs\/models-spec\.md$/,
  /^docs\/infra\//,
  /(^|\/)\.env(\.|$)/,
  /^takussan-api\/bin\/coverage-gate\.php$/,
  /^takussan-api\/phpunit\.xml$/,
  /^takussan-api\/composer\.(json|lock)$/,
  /^takussan-web\/package(-lock)?\.json$/,
  /^takussan-web\/(eslint\.config\.|tsconfig[^/]*\.json$|vitest\.config\.)/,
  /^takussan-api\/pint\.json$/,
];
// Une garde existante ne se modifie pas (V9) ; une garde neuve s'ajoute (A5).
const GARDES = /^(scripts\/[^/]+\.mjs|docs\/backlog\/(gen-index|check-backlog)\.mjs|takussan-web\/scripts\/)/;
// Un test ne se supprime pas pour faire passer un correctif.
const TESTS = /^takussan-api\/tests\/|\.test\.tsx?$/;
const MIGRATIONS = /^takussan-api\/database\/migrations\//;
// Entrées qu'un passage de l'implémenteur peut faire changer de statut (amendement d'ADR-0066 du
// 2026-10-17, plafond relevé de 4 à 10 le 2026-10-21) : reclassements et caducs compris.
const LOT_MAX = 10;

const MESURE = /^- Mesure \((\d{4}-\d{2}-\d{2}), ([0-9a-f]{7,40}), (explorateur|mesureur|implementeur|delegue|humain)\) : (.+)$/;

/**
 * Découpe le fichier en en-tête, tableau des angles, sections et entrées. Un fichier d'archive
 * (`archive: true`) n'a pas de tableau : ses sections suivent l'en-tête.
 */
export function analyser(texte, { archive = false } = {}) {
  const lignes = texte.split('\n');
  const erreurs = [];
  let i;
  let entete;
  let tableau = null;
  if (archive) {
    i = lignes.findIndex((l) => l.startsWith('## '));
    if (i < 0) i = lignes.length;
    entete = lignes.slice(0, i).join('\n');
  } else {
    const iAngles = lignes.findIndex((l) => l === '## Angles');
    if (iAngles < 0) return { erreurs: ['section « ## Angles » introuvable'] };

    entete = lignes.slice(0, iAngles).join('\n');
    tableau = new Map();
    i = iAngles + 1;
    for (; i < lignes.length && !lignes[i].startsWith('## '); i++) {
      const m = lignes[i].match(/^\| (\d+) \| (.+) \| (.+) \|$/);
      if (!m) continue;
      const num = Number(m[1]);
      if (tableau.has(num)) erreurs.push(`tableau : l'angle ${num} apparaît deux fois (l. ${i + 1})`);
      tableau.set(num, { num, ligne: i + 1, sujet: m[2], etat: m[3], brut: lignes[i] });
    }
  }

  const sections = new Map();
  const entrees = [];
  let section = null;
  let entree = null;
  // Le CONTENU d'une entrée, celui que l'archiveur déplace : du `###` à la dernière ligne qui lui
  // appartient. Après ses champs (`- …`), leurs suites indentées et ses lignes vides, une ligne de
  // texte en colonne 0 ouvre le texte de fin de SECTION (« Ce qui tient », « Angles voisins »), qui
  // reste où il est. Les lignes vides de fin n'en sont pas.
  const fermerEntree = (fin) => {
    if (entree) {
      let f = entree.debut + 1;
      while (f < fin && (lignes[f] === '' || lignes[f].startsWith('- ') || lignes[f].startsWith(' '))) f++;
      while (f > entree.debut + 1 && lignes[f - 1] === '') f--;
      entree.finContenu = f;
      entree.contenu = lignes.slice(entree.debut, f).join('\n');
      entrees.push(entree);
    }
    entree = null;
  };
  for (; i < lignes.length; i++) {
    const l = lignes[i];
    const mSection = l.match(/^## Angle (\d+) — (.+)$/);
    if (mSection) {
      fermerEntree(i);
      const num = Number(mSection[1]);
      if (sections.has(num)) erreurs.push(`la section « Angle ${num} » apparaît deux fois (l. ${i + 1})`);
      section = { num, ligne: i + 1, lignes: [l] };
      sections.set(num, section);
      continue;
    }
    if (l.startsWith('## ')) {
      fermerEntree(i);
      erreurs.push(`l. ${i + 1} : titre de niveau 2 hors de la forme « ## Angle N — … »${archive ? '' : ' après le tableau'}`);
      section = null;
      continue;
    }
    if (section) section.lignes.push(l);
    if (l.startsWith('### ')) {
      fermerEntree(i);
      if (!section) {
        erreurs.push(`l. ${i + 1} : entrée hors de toute section d'angle`);
        continue;
      }
      entree = { angle: section.num, titre: l.slice(4), ligne: i + 1, debut: i, champs: [], mesures: [] };
      continue;
    }
    if (entree && /^- /.test(l)) {
      const m = l.match(/^- (.+?)(?: \([^)]*\))? :(?: (.*))?$/);
      if (m) entree.champs.push({ cle: m[1], valeur: m[2] ?? '', ligne: i + 1, brut: l });
      if (l.startsWith('- Mesure ')) entree.mesures.push({ brut: l, ligne: i + 1, m: l.match(MESURE) });
    }
  }
  fermerEntree(lignes.length);
  for (const s of sections.values()) s.texte = s.lignes.join('\n').replace(/[\s-]+$/, '');
  return { entete, tableau, sections, entrees, erreurs };
}

const champ = (e, cle) => e.champs.find((c) => c.cle === cle);
export const statutDe = (e) => {
  const v = champ(e, 'Statut')?.valeur ?? '';
  return STATUTS.find((s) => s.motif.test(v))?.nom ?? null;
};
export const refDe = (e) => champ(e, 'Réf')?.valeur ?? '';
const rangDe = (ref) => Number(ref.match(/\.(\d+)$/)?.[1] ?? 0);

// ─── L'archive ────────────────────────────────────────────────────────────────────────────────

/** Le fichier d'archive d'un angle : `angles-001-099.md`, `angles-100-199.md`… */
export function fichierDArchive(angle) {
  const c = Math.floor(angle / 100);
  const n = (x) => String(x).padStart(3, '0');
  return `${ARCHIVE}/angles-${n(c === 0 ? 1 : c * 100)}-${n(c * 100 + 99)}.md`;
}

function enteteDArchive(chemin) {
  const [, de, a] = chemin.match(/angles-(\d+)-(\d+)\.md$/);
  return [
    `# Pistes closes — angles ${Number(de)} à ${Number(a)}`,
    '',
    `Archive du [fichier de pistes](../${FICHIER.split('/').pop()}) : ses entrées closes (\`fait\`, \`caduc\`,`,
    '`refusé`), déplacées telles quelles, angle par angle, quand leur statut est clos sur `pre-dev`',
    'depuis 24 h au moins.',
    '',
    '**Écrite par `scripts/agents/archiver-pistes.mjs` (`pistes.sh archiver`), jamais à la main ni par',
    'un agent** ([ADR-0066](../../adr/0066-trois-agents-sur-les-pistes-d-amelioration.md), amendement du',
    "2026-10-24, « l'archive des pistes closes »). Rouvrir une piste close, c'est écrire une entrée",
    "neuve dans le fichier vivant, qui cite l'ancienne Réf. `node scripts/check-pistes.mjs` lit les deux.",
  ].join('\n');
}

/** Le fichier vivant et l'archive, lus ensemble : `entrees` les porte tous, chacune avec son fichier. */
export function ensemble(texteVivant, archives) {
  const vivant = charger(texteVivant);
  for (const e of vivant.entrees ?? []) e.fichier = FICHIER;
  const lues = archives.map(({ chemin, texte }) => {
    const doc = charger(texte, { archive: true });
    for (const e of doc.entrees) e.fichier = chemin;
    return { chemin, doc };
  });
  return { vivant, archives: lues, entrees: [...(vivant.entrees ?? []), ...lues.flatMap((a) => a.doc.entrees)] };
}

/** L'ensemble tel qu'il est sur le disque, sous `racine`. */
export function lireEnsemble(racine = ROOT) {
  const dossier = join(racine, ARCHIVE);
  const noms = existsSync(dossier) ? readdirSync(dossier).filter((n) => n.endsWith('.md')).sort() : [];
  const ens = ensemble(
    readFileSync(join(racine, FICHIER), 'utf8'),
    noms.map((n) => ({ chemin: `${ARCHIVE}/${n}`, texte: readFileSync(join(dossier, n), 'utf8') })),
  );
  ens.sansArchive = !existsSync(dossier);
  return ens;
}

/**
 * Le déplacement, fonction pure : les entrées `refs` du fichier vivant partent, octet pour octet,
 * dans le fichier d'archive de leur angle, sous le titre de leur section, rangées par Réf. Le
 * fichier vivant perd leur contenu et la ou les lignes vides qui le suivent : rien d'autre. Une
 * archive existante est réécrite à l'identique, plus les entrées neuves. Rend les textes de chaque
 * fichier, et les Réf demandées introuvables.
 */
export function deplacer(ens, refs) {
  const demandees = new Set(refs);
  const lignes = ens.vivant.texteSource.split('\n');
  const retire = new Array(lignes.length).fill(false);
  const parFichier = new Map();
  const sectionDe = (chemin, num, titre) => {
    if (!parFichier.has(chemin)) parFichier.set(chemin, new Map());
    const sections = parFichier.get(chemin);
    if (!sections.has(num)) sections.set(num, { titre, entrees: [] });
    return sections.get(num);
  };
  for (const a of ens.archives) {
    for (const [num, s] of a.doc.sections) sectionDe(a.chemin, num, s.lignes[0]);
    for (const e of a.doc.entrees) sectionDe(a.chemin, e.angle).entrees.push({ ref: refDe(e), contenu: e.contenu });
  }
  const deplacees = [];
  for (const e of ens.vivant.entrees) {
    const ref = refDe(e);
    if (!demandees.delete(ref)) continue;
    let f = e.finContenu;
    while (f < lignes.length && lignes[f] === '') f++;
    for (let k = e.debut; k < f; k++) retire[k] = true;
    sectionDe(fichierDArchive(e.angle), e.angle, ens.vivant.sections.get(e.angle).lignes[0]).entrees.push({ ref, contenu: e.contenu });
    deplacees.push(ref);
  }
  const archives = new Map();
  for (const [chemin, sections] of [...parFichier].sort(([a], [b]) => a.localeCompare(b))) {
    const morceaux = [enteteDArchive(chemin)];
    for (const [, s] of [...sections].sort(([a], [b]) => a - b)) {
      if (!s.entrees.length) continue;
      morceaux.push(s.titre, ...s.entrees.sort((x, y) => rangDe(x.ref) - rangDe(y.ref)).map((x) => x.contenu));
    }
    archives.set(chemin, `${morceaux.join('\n\n')}\n`);
  }
  return { vivant: lignes.filter((_, k) => !retire[k]).join('\n'), archives, deplacees, introuvables: [...demandees] };
}
const codesV = (texte) => new Set([...texte.matchAll(/\bV(\d)\b/g)].map((m) => `V${m[1]}`));

/** Les catégories que le porteur confie au délégué, moins celles qu'il lui a retirées. */
export function delegables(doc) {
  const retirees = new Set();
  for (const e of doc.entrees) {
    for (const x of e.mesures) {
      if (x.m?.[3] !== 'humain') continue;
      const d = x.m[4].match(DESAVEU);
      if (d) for (const c of codesV(d[1])) retirees.add(c);
    }
  }
  return DELEGABLES.filter((c) => !retirees.has(c));
}

/**
 * Le délégué peut-il trancher cette entrée ? Elle est « à valider », le porteur ne l'a pas déjà
 * tranchée (« porteur (date) : … », y compris « plus tard »), elle n'attend pas un chemin fermé aux
 * agents, le délégué ne l'a pas déjà vue, et TOUS les critères V qu'elle cite — dans son statut et
 * dans les classements du mesureur — sont délégables. Une entrée sans critère V lisible est un
 * doute : elle reste au porteur. Rend la raison du refus, ou null.
 */
export function refusDeDelegation(e, permises) {
  const statut = champ(e, 'Statut')?.valeur ?? '';
  if (statutDe(e) !== 'retenu · à valider') return `statut « ${statut} »`;
  if (/porteur \(/.test(statut)) return 'déjà tranchée par le porteur';
  if (/chemin fermé/.test(statut)) return 'chemin fermé : revient au porteur, en session';
  if (e.mesures.some((x) => x.m?.[3] === 'delegue')) return 'déjà vue par le délégué';
  const codes = codesV([statut, ...e.mesures.filter((x) => x.m?.[3] === 'mesureur').map((x) => x.m[4])].join(' '));
  if (!codes.size) return 'aucun critère V lisible';
  const reserves = [...codes].filter((c) => !permises.includes(c));
  if (reserves.length) return `${reserves.join(', ')} réservé(s) au porteur`;
  return null;
}

// Où est une entrée, pour un message : le fichier vivant se dit par ses seules lignes, comme
// avant l'archive ; un fichier d'archive se nomme.
const lieu = (e, ligne = e.ligne) => (e.fichier && e.fichier !== FICHIER ? `${e.fichier} l. ${ligne}` : `l. ${ligne}`);

/** La garde de forme, sur le fichier vivant et l'archive : renvoie la liste des erreurs. */
export function verifierForme(ens, { racine = ROOT } = {}) {
  const doc = ens.vivant;
  const erreurs = [...doc.erreurs];
  if (!doc.tableau) return erreurs;
  for (const a of ens.archives) erreurs.push(...a.doc.erreurs.map((x) => `${a.chemin} : ${x}`));
  const vues = new Map();
  const tickets = existsSync(join(racine, TICKETS)) ? readdirSync(join(racine, TICKETS)) : [];

  for (const e of ens.entrees) {
    const ou = `${lieu(e)} (« ${e.titre} »)`;
    const ref = refDe(e);
    const m = ref.match(/^P(\d{2,3})\.(\d{2,3})$/);
    if (!m) erreurs.push(`${ou} : « - Réf : PNN.MM » absente ou mal formée (« ${ref} »)`);
    else if (Number(m[1]) !== e.angle) erreurs.push(`${ou} : la Réf ${ref} n'est pas de l'angle ${e.angle}`);
    if (ref && vues.has(ref)) erreurs.push(`${ou} : Réf ${ref} déjà portée ${lieu(vues.get(ref))}`);
    vues.set(ref, e);

    const brut = champ(e, 'Statut')?.valeur;
    const statut = statutDe(e);
    if (brut === undefined) erreurs.push(`${ou} : « - Statut : … » absent`);
    else if (!statut) erreurs.push(`${ou} : statut « ${brut} » hors vocabulaire (${STATUTS.map((s) => s.nom).join(', ')})`);

    if (!/^[🔴🟠🟢]/u.test(champ(e, 'Gravité')?.valeur ?? '')) erreurs.push(`${ou} : « - Gravité : 🔴|🟠|🟢 … » absente`);
    if (!champ(e, 'Piste')) erreurs.push(`${ou} : « - Piste : … » absente`);
    if (!e.champs.some((c) => /constat/i.test(c.cle))) erreurs.push(`${ou} : aucun constat`);

    for (const mes of e.mesures) {
      if (!mes.m) erreurs.push(`${lieu(e, mes.ligne)} : ligne Mesure hors forme « - Mesure (AAAA-MM-JJ, <sha>, <rôle>) : … »`);
      else if (mes.m[4].trim().length < 40) erreurs.push(`${lieu(e, mes.ligne)} : une mesure dit ce qui a été lancé ou lu, et ce que cela a rendu (40 caractères au moins)`);
    }
    if (statut && statut !== 'à mesurer' && !e.mesures.some((x) => x.m)) {
      erreurs.push(`${ou} : le statut « ${statut} » n'est appuyé par aucune ligne Mesure`);
    }
    if (statut === 'fait') {
      const tck = brut.match(/TCK-\d+/)[0];
      if (!tickets.some((f) => f.startsWith(`${tck}-`))) erreurs.push(`${ou} : ${tck} n'existe pas dans ${TICKETS}`);
    }
    if (e.fichier !== FICHIER) {
      if (statut && !CLOS.includes(statut)) erreurs.push(`${ou} : statut « ${statut} » : l'archive ne garde que les entrées closes (${CLOS.join(', ')})`);
      if (fichierDArchive(e.angle) !== e.fichier) erreurs.push(`${ou} : l'angle ${e.angle} s'archive dans ${fichierDArchive(e.angle)}`);
    }
  }

  // Une entrée vivante qui cite une Réf (« voir P02.04 », « né de P227.01 ») la trouve dans
  // l'ensemble : archivée, elle se cherche aussi dans l'archive, mais elle ne disparaît pas. Sans
  // dossier d'archive, on ne juge pas : la copie que `pistes.sh` extrait pour lire une liste ne le
  // portait pas avant l'amendement, et une erreur y passe pour un doute qui lance le modèle.
  for (const e of ens.sansArchive ? [] : doc.entrees) {
    const propre = refDe(e);
    for (const [cite] of e.contenu.matchAll(/\bP\d{2,3}\.\d{2,3}\b/g)) {
      if (cite !== propre && !vues.has(cite)) erreurs.push(`${lieu(e)} (« ${e.titre} ») : cite ${cite}, qui n'existe ni dans ${FICHIER} ni dans ${ARCHIVE}/`);
    }
  }
  for (const a of ens.archives) {
    for (const [num, s] of a.doc.sections) {
      if (!doc.sections.has(num)) erreurs.push(`${a.chemin} l. ${s.ligne} : la section « Angle ${num} » n'existe plus dans ${FICHIER}`);
    }
  }

  const nums = [...doc.tableau.keys()].sort((a, b) => a - b);
  nums.forEach((n, k) => {
    if (n !== k + 1) erreurs.push(`tableau : numérotation non continue (attendu ${k + 1}, lu ${n})`);
  });
  for (const a of doc.tableau.values()) {
    if (!/^(à faire|fait|fait \(couvert par l'angle \d+\))$/.test(a.etat)) {
      erreurs.push(`tableau l. ${a.ligne} : état « ${a.etat} » hors vocabulaire (à faire, fait, fait (couvert par l'angle N))`);
    }
    if (a.etat === 'fait' && !doc.sections.has(a.num)) erreurs.push(`tableau : l'angle ${a.num} est « fait » sans section « ## Angle ${a.num} — … »`);
  }
  for (const s of doc.sections.values()) {
    const ligne = doc.tableau.get(s.num);
    if (!ligne || ligne.etat !== 'fait') erreurs.push(`section « Angle ${s.num} » (l. ${s.ligne}) : le tableau ne la marque pas « fait »`);
  }
  return erreurs;
}

const sansSuivi = (texte) =>
  texte
    .split('\n')
    .filter((l) => !l.startsWith('- Statut : ') && !l.startsWith('- Mesure ('))
    .join('\n');

const dansLArchive = (chemin) => chemin.startsWith(`${ARCHIVE}/`);
const ARCHIVE_FERMEE = `l'archive des pistes n'est écrite que par l'archiveur (pistes.sh archiver) ; une piste close se rouvre par une entrée neuve dans ${FICHIER}, qui cite son ancienne Réf`;

/**
 * Le périmètre de l'archiveur : il ne touche que le fichier vivant et l'archive, et ce qu'il
 * propose est EXACTEMENT le déplacement, depuis la base, des entrées closes qui ont quitté le
 * fichier vivant. Rien d'autre ne change : ni une ligne du fichier vivant, ni une entrée archivée.
 */
function verifierArchivage(baseEns, teteEns, touche) {
  const erreurs = [];
  for (const c of touche) {
    if (c !== FICHIER && !dansLArchive(c)) erreurs.push(`${c} : l'archiveur n'écrit que ${FICHIER} et ${ARCHIVE}/`);
  }
  const restees = new Set(teteEns.vivant.entrees.map(refDe));
  const parties = baseEns.vivant.entrees.filter((e) => !restees.has(refDe(e)));
  if (!parties.length) erreurs.push(`aucune entrée n'a quitté ${FICHIER} : rien à archiver`);
  for (const e of parties) {
    if (!CLOS.includes(statutDe(e))) erreurs.push(`${refDe(e)} : statut « ${champ(e, 'Statut')?.valeur ?? ''} » : seule une entrée close s'archive`);
  }
  const attendu = deplacer(baseEns, parties.map(refDe));
  if (attendu.vivant !== teteEns.vivant.texteSource) {
    const refs = parties.map(refDe);
    erreurs.push(`${FICHIER} : il ne résulte pas du seul retrait des ${refs.length} entrées archivées (${refs.slice(0, 5).join(', ')}${refs.length > 5 ? ', …' : ''})`);
  }
  const lues = new Map(teteEns.archives.map((a) => [a.chemin, a.doc.texteSource]));
  for (const chemin of new Set([...attendu.archives.keys(), ...lues.keys()])) {
    if (attendu.archives.get(chemin) !== lues.get(chemin)) {
      erreurs.push(`${chemin} : il ne résulte pas du seul ajout, octet pour octet, des entrées archivées à l'archive de la base`);
    }
  }
  return erreurs;
}

/** Le périmètre d'un rôle : fichiers touchés et transitions, contre la version de base. */
export function verifierRole(role, baseEns, teteEns, fichiers, { racine = ROOT } = {}) {
  const erreurs = [];
  const touche = fichiers.map((f) => f.chemin);
  if (role === 'archiveur') return verifierArchivage(baseEns, teteEns, touche);
  const base = baseEns.vivant;
  const tete = teteEns.vivant;

  if (role === 'implementeur') {
    for (const f of fichiers) {
      if (dansLArchive(f.chemin)) erreurs.push(`${f.chemin} : ${ARCHIVE_FERMEE}`);
      else if (PROTEGES_IMPLEMENTEUR.some((re) => re.test(f.chemin))) erreurs.push(`${f.chemin} : chemin réservé au porteur`);
      if (MIGRATIONS.test(f.chemin) && f.etat !== 'A') erreurs.push(`${f.chemin} : une migration existante ne se modifie ni ne se supprime`);
      if (GARDES.test(f.chemin) && f.etat !== 'A') erreurs.push(`${f.chemin} : une garde existante ne se modifie pas (critère V9)`);
      if (TESTS.test(f.chemin) && f.etat === 'D') erreurs.push(`${f.chemin} : un test ne se supprime pas`);
    }
  } else {
    for (const c of touche) {
      if (dansLArchive(c)) erreurs.push(`${c} : ${ARCHIVE_FERMEE}`);
      else if (c !== FICHIER) erreurs.push(`${c} : le rôle ${role} n'écrit que ${FICHIER}`);
    }
  }
  if (!touche.includes(FICHIER) && role !== 'implementeur') erreurs.push(`${FICHIER} n'a pas changé : rien à proposer`);

  if (base.entete !== tete.entete) erreurs.push("l'en-tête du fichier (avant « ## Angles ») a changé : il appartient au porteur");

  const parRef = (doc) => new Map(doc.entrees.map((e) => [refDe(e), e]));
  const avant = parRef(base);
  const apres = parRef(tete);

  if (role === 'explorateur') {
    const bascules = [];
    for (const a of base.tableau.values()) {
      const b = tete.tableau.get(a.num);
      if (!b) erreurs.push(`tableau : l'angle ${a.num} a disparu`);
      else if (b.sujet !== a.sujet) erreurs.push(`tableau : le sujet de l'angle ${a.num} a changé`);
      else if (b.etat !== a.etat) {
        if (a.etat !== 'à faire') erreurs.push(`tableau : l'angle ${a.num} était « ${a.etat} »`);
        else bascules.push(a.num);
      }
    }
    if (bascules.length > 1) erreurs.push(`un passage explore UN angle ; ${bascules.length} ont basculé (${bascules.join(', ')})`);
    const neufs = [...tete.tableau.values()].filter((a) => !base.tableau.has(a.num));
    if (neufs.length > 3) erreurs.push(`au plus 3 angles proposés par passage ; ${neufs.length} ajoutés`);
    for (const a of neufs) if (a.etat !== 'à faire') erreurs.push(`tableau : l'angle neuf ${a.num} doit être « à faire »`);
    for (const [num, s] of base.sections) {
      if (tete.sections.get(num)?.texte !== s.texte) erreurs.push(`la section « Angle ${num} » existante a changé`);
    }
    for (const num of tete.sections.keys()) {
      if (!base.sections.has(num) && !bascules.includes(num)) erreurs.push(`section « Angle ${num} » ajoutée sans que son angle ait basculé à « fait »`);
    }
    for (const [ref, e] of apres) {
      if (avant.has(ref)) continue;
      if (statutDe(e) !== 'à mesurer') erreurs.push(`${ref} : une entrée neuve naît « à mesurer »`);
      if (e.mesures.length) erreurs.push(`${ref} : l'explorateur n'écrit pas de ligne Mesure (c'est la re-mesure du mesureur)`);
    }
    return erreurs;
  }

  // Mesureur et implémenteur : rien ne change hors des lignes Statut et Mesure.
  if (sansSuivi(texteDe(base)) !== sansSuivi(texteDe(tete))) {
    erreurs.push('le fichier a changé hors des lignes « - Statut : » et « - Mesure (…) : » (titre, constat, tableau, entrée ajoutée ou retirée)');
  }
  const permis = TRANSITIONS[role];
  const basculees = [];
  const tickets = new Set();
  const faites = [];
  for (const [ref, e] of apres) {
    const avantE = avant.get(ref);
    if (!avantE) continue;
    const anciennes = avantE.mesures.map((x) => x.brut);
    if (anciennes.some((m, k) => e.mesures[k]?.brut !== m)) erreurs.push(`${ref} : une ligne Mesure existante a été modifiée ou retirée`);
    const de = statutDe(avantE);
    const vers = statutDe(e);
    const nouvelles = e.mesures.slice(anciennes.length);
    if (nouvelles.length && de === vers && champ(avantE, 'Statut')?.valeur === champ(e, 'Statut')?.valeur) {
      // Le délégué qui ne tranche pas laisse sa recommandation au porteur, sans changer le statut.
      const recommande = role === 'delegue' && nouvelles.every((x) => x.m?.[3] === 'delegue' && /Recommandation : .{20,}/.test(x.m[4]));
      if (!recommande) erreurs.push(`${ref} : mesure ajoutée sans changement de statut`);
      else if (refusDeDelegation(avantE, ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9']) !== null) {
        erreurs.push(`${ref} : le délégué ne recommande que sur une entrée « à valider » que le porteur n'a pas tranchée`);
      } else basculees.push(ref);
    }
    if (champ(avantE, 'Statut')?.valeur === champ(e, 'Statut')?.valeur) continue;
    basculees.push(ref);
    if (vers === 'fait') {
      const tck = champ(e, 'Statut').valeur.match(/TCK-\d+/)?.[0];
      tickets.add(tck);
      faites.push({ ref, angle: avantE.angle, tck, fichiers: fichiersCites(avantE) });
    }
    if (!(permis[de] ?? []).includes(vers)) {
      erreurs.push(`${ref} : « ${de} » → « ${vers} » n'est pas une transition du rôle ${role}`);
      continue;
    }
    const miennes = nouvelles.filter((x) => x.m && x.m[3] === role);
    if (!miennes.length) erreurs.push(`${ref} : la transition « ${de} » → « ${vers} » demande une ligne Mesure neuve du rôle ${role}`);
    if (vers.startsWith('retenu') && role === 'mesureur' && !miennes.some((x) => /Classement : .{20,}/.test(x.m[4]))) {
      erreurs.push(`${ref} : un classement « ${vers} » dit pourquoi (« Classement : … », 20 caractères au moins)`);
    }
    if (role === 'delegue') {
      // Un désaveu du porteur vaut aussi écrit sur une entrée archivée.
      const permises = delegables(baseEns);
      const refus = refusDeDelegation(avantE, permises);
      if (refus) erreurs.push(`${ref} : le délégué ne tranche pas cette entrée (${refus})`);
      if (!/^validé \(délégué\) — /.test(champ(e, 'Statut').valeur)) {
        erreurs.push(`${ref} : le délégué signe « validé (délégué) — <décision> », jamais « validé » seul`);
      }
      // Sa relecture a pu trouver un critère que le mesureur n'avait pas vu : il le déclare, et
      // la délégation tombe s'il n'est pas délégable.
      const declares = codesV(miennes.map((x) => x.m[4].match(/Délégation : (.+)$/)?.[1] ?? '').join(' '));
      if (!declares.size) erreurs.push(`${ref} : la mesure du délégué déclare ses critères (« Délégation : V7, <pourquoi> »)`);
      const horsDelegation = [...declares].filter((c) => !permises.includes(c));
      if (horsDelegation.length) erreurs.push(`${ref} : ${horsDelegation.join(', ')} réservé(s) au porteur`);
    }
    // Une piste `validé` porte la décision du porteur : elle ne lui revient pas sans raison, et sa
    // précision (`validé — …`) arrive mot pour mot dans le ticket qui l'implémente.
    if (de === 'validé') {
      const accord = champ(avantE, 'Statut').valeur.match(/^validé(?: \(délégué\))? — (.+)$/)?.[1];
      if (vers === 'retenu · à valider' && !champ(e, 'Statut').valeur.includes(' — ')) {
        erreurs.push(`${ref} : une piste validée ne revient au porteur qu'avec sa raison (« retenu · à valider — … »)`);
      }
      if (vers === 'fait' && accord) {
        const tck = champ(e, 'Statut').valeur.match(/TCK-\d+/)[0];
        const dossier = join(racine, TICKETS);
        const nom = existsSync(dossier) ? readdirSync(dossier).find((f) => f.startsWith(`${tck}-`)) : undefined;
        const plat = (t) => t.replace(/\s+/g, ' ').trim();
        if (nom && !plat(readFileSync(join(dossier, nom), 'utf8')).includes(plat(accord))) {
          erreurs.push(`${ref} : ${tck} ne recopie pas la décision du porteur (« ${accord} »)`);
        }
        // Ce que le porteur a gardé pour plus tard survit à `fait` : sinon plus rien ne le suit.
        const reste = accord.match(/ ; reste : (.+)$/)?.[1];
        const resteFait = champ(e, 'Statut').valeur.match(/ — reste : (.+)$/)?.[1];
        if (reste && plat(resteFait ?? '') !== plat(reste)) {
          erreurs.push(`${ref} : la précision garde un reste ; l'entrée passe à « fait · ${tck} — reste : ${reste} »`);
        }
      }
    }
  }
  // Un passage de l'implémenteur livre un lot (amendements du 2026-10-17) : au plus LOT_MAX entrées
  // changent de statut. Un lot qui touche l'API et le front est une seule famille : ses pistes
  // faites se relient de proche en proche par un angle, un ticket ou un fichier cité en commun.
  if (role === 'delegue' && basculees.length > DELEGATION_MAX) {
    erreurs.push(`un passage du délégué tranche au plus ${DELEGATION_MAX} entrées ; ${basculees.length} touchées (${basculees.join(', ')})`);
  }
  if (role === 'implementeur') {
    // Un angle entier se prend d'un bloc, quel que soit son nombre d'entrées (porteur, 2026-10-21) :
    // le plafond ne compte que les lots de plusieurs angles.
    const angles = new Set(basculees.map((r) => r.match(/^P(\d+)\./)?.[1] ?? r));
    if (angles.size > 1 && basculees.length > LOT_MAX) {
      erreurs.push(`un lot compte au plus ${LOT_MAX} entrées ; ${basculees.length} ont changé de statut (${basculees.join(', ')})`);
    }
    const cotes = ['takussan-api/', 'takussan-web/'].filter((c) => touche.some((f) => f.startsWith(c)));
    if (tickets.size > 1 && cotes.length > 1 && !uneFamille(faites)) {
      erreurs.push(`un lot qui touche l'API et le front est une seule famille ; ${faites.map((f) => f.ref).join(', ')} ne partagent ni angle, ni ticket, ni fichier cité`);
    }
  }
  return erreurs;
}

// Les fichiers qu'une entrée cite dans son `Où`, par leur seul nom : les chemins y sont tantôt
// complets, tantôt abrégés (`PaymentGatewayService.php:606`), jamais sous la même forme.
function fichiersCites(e) {
  const ou = champ(e, 'Où')?.valeur ?? champ(e, 'Où et constat')?.valeur ?? '';
  const noms = [...ou.matchAll(/`([^`]+)`/g)].map((m) => m[1].split(':')[0].split('/').pop());
  return new Set(noms.filter((n) => /\.[a-z]{2,5}$/.test(n)));
}

/** Les pistes se relient toutes, de proche en proche, par un angle, un ticket ou un fichier cité. */
function uneFamille(pistes) {
  if (pistes.length < 2) return true;
  const proches = (a, b) => a.angle === b.angle || a.tck === b.tck || [...a.fichiers].some((f) => b.fichiers.has(f));
  const atteintes = new Set([0]);
  for (let ajout = true; ajout; ) {
    ajout = false;
    for (let i = 0; i < pistes.length; i++) {
      if (atteintes.has(i)) continue;
      if ([...atteintes].some((j) => proches(pistes[i], pistes[j]))) {
        atteintes.add(i);
        ajout = true;
      }
    }
  }
  return atteintes.size === pistes.length;
}

const texteDe = (doc) => doc.texteSource;

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function charger(texte, options) {
  const doc = analyser(texte, options);
  doc.texteSource = texte;
  return doc;
}

/** L'ensemble tel qu'il est dans un commit. */
function ensembleAu(rev) {
  const chemins = git(['ls-tree', '--name-only', rev, `${ARCHIVE}/`])
    .split('\n')
    .filter((c) => c.endsWith('.md'));
  return ensemble(
    git(['show', `${rev}:${FICHIER}`]),
    chemins.map((chemin) => ({ chemin, texte: git(['show', `${rev}:${chemin}`]) })),
  );
}

// La colonne « où » de `--liste` et `--a-deleguer` : `l. N` dans le fichier vivant, le nom du
// fichier d'archive devant sinon.
const ouDans = (e) => (e.fichier === FICHIER ? `l. ${e.ligne}` : `${e.fichier.split('/').pop()} l. ${e.ligne}`);

function principal(argv) {
  const opt = (nom) => {
    const k = argv.indexOf(nom);
    return k >= 0 ? (argv[k + 1] ?? '') : null;
  };
  const ens = lireEnsemble(ROOT);
  const tete = ens.vivant;
  const erreurs = verifierForme(ens);

  const role = opt('--role');
  if (role !== null) {
    if (!ROLES.includes(role)) {
      console.error(`✗ rôle inconnu « ${role} » (${ROLES.join(', ')})`);
      return 2;
    }
    const ref = opt('--base');
    if (!ref) {
      console.error('✗ --role exige --base <ref>');
      return 2;
    }
    const mb = git(['merge-base', 'HEAD', ref]).trim();
    if (git(['status', '--porcelain']).trim()) erreurs.push("l'arbre de travail n'est pas propre : tout ce qui est proposé doit être commité");
    const fichiers = git(['diff', '--name-status', '--no-renames', mb, 'HEAD'])
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [etat, chemin] = l.split('\t');
        return { etat: etat[0], chemin };
      });
    erreurs.push(...verifierRole(role, ensembleAu(mb), ens, fichiers));
  }

  if (argv.includes('--restes')) {
    // Ce qui reste d'une validation partielle : à faire (`validé — … ; reste : …`) ou laissé par
    // le ticket qui l'a implémentée (`fait · TCK-NNN — reste : …`), archivé compris.
    for (const e of ens.entrees) {
      const s = champ(e, 'Statut')?.valeur ?? '';
      const fait = s.match(/^fait · (TCK-\d+) — reste : (.+)$/);
      const valide = s.match(/^validé(?: \(délégué\))? — .* ; reste : (.+)$/);
      if (fait) console.log(`${refDe(e)}\t${fait[1]}\t${fait[2]}`);
      else if (valide) console.log(`${refDe(e)}\tpas encore fait\t${valide[1]}`);
    }
  }
  if (argv.includes('--a-deleguer')) {
    const permises = delegables(ens);
    for (const e of tete.entrees) {
      if (refusDeDelegation(e, permises) === null) console.log(`${refDe(e)}\t${(champ(e, 'Gravité')?.valeur ?? '').slice(0, 2)}\t${ouDans(e)}\t${champ(e, 'Statut').valeur}\t${e.titre}`);
    }
  }
  if (argv.includes('--delegations')) {
    // Le relevé du porteur : ce que le délégué a tranché ou recommandé, le plus récent d'abord.
    const lignes = [];
    for (const e of ens.entrees) {
      for (const x of e.mesures) {
        if (x.m?.[3] !== 'delegue') continue;
        const quoi = /Recommandation : /.test(x.m[4]) ? 'recommandé' : 'validé';
        lignes.push(`${x.m[1]}\t${refDe(e)}\t${quoi}\t${champ(e, 'Statut')?.valeur ?? ''}\t${e.titre}`);
      }
    }
    for (const l of lignes.sort().reverse()) console.log(l);
    console.log(`catégories délégables : ${delegables(ens).join(', ') || 'aucune'}`);
  }
  if (argv.includes('--angles-a-faire')) {
    for (const a of tete.tableau.values()) if (a.etat === 'à faire') console.log(`${a.num}\t${a.sujet}`);
  }
  const liste = opt('--liste');
  if (liste !== null) {
    for (const e of ens.entrees) {
      const s = champ(e, 'Statut')?.valeur ?? '';
      if (s.startsWith(liste)) console.log(`${refDe(e)}\t${(champ(e, 'Gravité')?.valeur ?? '').slice(0, 2)}\t${ouDans(e)}\t${s}\t${e.titre}`);
    }
  }
  if (argv.includes('--report')) {
    const comptes = new Map();
    for (const e of ens.entrees) {
      const cle = `${statutDe(e) ?? '(hors vocabulaire)'}`;
      const g = [...(champ(e, 'Gravité')?.valeur ?? '?')][0];
      const c = comptes.get(cle) ?? { '🔴': 0, '🟠': 0, '🟢': 0, total: 0 };
      c[g] = (c[g] ?? 0) + 1;
      c.total++;
      comptes.set(cle, c);
    }
    const archivees = ens.entrees.length - tete.entrees.length;
    console.log(`${FICHIER}${ens.archives.length ? ` et ${ARCHIVE}/` : ''}`);
    console.log(`  ${ens.entrees.length} entrées, ${tete.sections.size} angles explorés sur ${tete.tableau.size}`);
    console.log(`  dont ${tete.entrees.length} dans le fichier vivant, ${archivees} archivées (${ens.archives.length} fichier(s))`);
    for (const s of STATUTS) {
      const c = comptes.get(s.nom);
      if (c) console.log(`  ${s.nom.padEnd(20)} ${String(c.total).padStart(4)}   🔴 ${c['🔴']}  🟠 ${c['🟠']}  🟢 ${c['🟢']}`);
    }
  }

  if (erreurs.length) {
    for (const e of erreurs) console.error(`✗ ${e}`);
    console.error(`\n${erreurs.length} erreur(s) — forme et protocole : docs/adr/0066-trois-agents-sur-les-pistes-d-amelioration.md`);
    return 1;
  }
  if (liste === null && !['--angles-a-faire', '--restes', '--a-deleguer', '--delegations'].some((o) => argv.includes(o))) {
    const archivees = ens.entrees.length - tete.entrees.length;
    console.log(`✓ ${FICHIER} : ${ens.entrees.length} entrées bien formées, dont ${archivees} dans ${ARCHIVE}/${role ? `, périmètre du rôle ${role} tenu` : ''}`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal(process.argv.slice(2));
}
