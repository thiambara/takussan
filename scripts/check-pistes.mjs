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
 * Mode rôle (`--role <rôle> --base <ref>`), le PÉRIMÈTRE. `scripts/agents/pistes.sh` le joue
 * après chaque passage d'agent, AVANT tout push, contre la base de fusion avec `pre-dev`. Il
 * vérifie les fichiers touchés et les transitions de statut faites, au regard du rôle. Un agent ne
 * s'accorde pas ce que son rôle n'a pas : l'explorateur ne classe pas, le mesureur n'implémente
 * pas, et aucun agent n'écrit `validé`, qui est la signature du porteur. Une piste `validé` ne
 * revient au porteur qu'avec une raison. Sa précision (`validé — …`) se retrouve mot pour mot dans
 * le ticket qui la passe à `fait`. Un passage de l'implémenteur fait changer de statut 4 entrées au
 * plus, et un lot de plusieurs tickets ne mêle pas l'API et le front (amendement du 2026-10-17).
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
 *   node scripts/check-pistes.mjs --role mesureur --base origin/pre-dev
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `CHECK_PISTES_RACINE` : `pistes.sh` joue la version de `origin/pre-dev` de ce fichier, posée hors
// de l'arbre de l'agent, contre cet arbre — un agent ne juge pas son travail avec une garde qu'il a modifiée.
const ROOT = process.env.CHECK_PISTES_RACINE ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FICHIER = 'docs/plans/2026-10-15-pistes-d-amelioration.md';
const TICKETS = 'docs/backlog/tickets';

// Le vocabulaire est FERMÉ : un statut hors de cette liste est une erreur, jamais un « autre ».
// `nom` est la forme canonique, celle que `--liste` et les transitions comparent.
const STATUTS = [
  { nom: 'à mesurer', motif: /^à mesurer$/ },
  { nom: 'caduc', motif: /^caduc( — .{10,})?$/ },
  { nom: 'retenu · autonome', motif: /^retenu · autonome$/ },
  { nom: 'retenu · à valider', motif: /^retenu · à valider( — .{10,})?$/ },
  { nom: 'validé', motif: /^validé( — .+)?$/ },
  { nom: 'refusé', motif: /^refusé( — .+)?$/ },
  { nom: 'fait', motif: /^fait · TCK-\d{3,}( — reste : .{10,})?$/ },
];

const ROLES = ['explorateur', 'mesureur', 'implementeur'];

// Ce que chaque rôle a le droit de faire d'un statut. `validé` et `refusé` n'apparaissent comme
// cible nulle part : seul le porteur les écrit, sur `pre-dev`, hors de tout agent.
const TRANSITIONS = {
  explorateur: {},
  mesureur: { 'à mesurer': ['caduc', 'retenu · autonome', 'retenu · à valider'] },
  implementeur: {
    'retenu · autonome': ['fait', 'caduc', 'retenu · à valider'],
    validé: ['fait', 'caduc', 'retenu · à valider'],
  },
};

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
// 2026-10-17) : un lot de 4 pistes au plus, reclassements et caducs compris.
const LOT_MAX = 4;

const MESURE = /^- Mesure \((\d{4}-\d{2}-\d{2}), ([0-9a-f]{7,40}), (explorateur|mesureur|implementeur|humain)\) : (.+)$/;

/** Découpe le fichier en en-tête, tableau des angles, sections et entrées. */
export function analyser(texte) {
  const lignes = texte.split('\n');
  const erreurs = [];
  const iAngles = lignes.findIndex((l) => l === '## Angles');
  if (iAngles < 0) return { erreurs: ['section « ## Angles » introuvable'] };

  const entete = lignes.slice(0, iAngles).join('\n');
  const tableau = new Map();
  let i = iAngles + 1;
  for (; i < lignes.length && !lignes[i].startsWith('## '); i++) {
    const m = lignes[i].match(/^\| (\d+) \| (.+) \| (.+) \|$/);
    if (!m) continue;
    const num = Number(m[1]);
    if (tableau.has(num)) erreurs.push(`tableau : l'angle ${num} apparaît deux fois (l. ${i + 1})`);
    tableau.set(num, { num, ligne: i + 1, sujet: m[2], etat: m[3], brut: lignes[i] });
  }

  const sections = new Map();
  const entrees = [];
  let section = null;
  let entree = null;
  const fermerEntree = () => {
    if (entree) entrees.push(entree);
    entree = null;
  };
  for (; i < lignes.length; i++) {
    const l = lignes[i];
    const mSection = l.match(/^## Angle (\d+) — (.+)$/);
    if (mSection) {
      fermerEntree();
      const num = Number(mSection[1]);
      if (sections.has(num)) erreurs.push(`la section « Angle ${num} » apparaît deux fois (l. ${i + 1})`);
      section = { num, ligne: i + 1, lignes: [l] };
      sections.set(num, section);
      continue;
    }
    if (l.startsWith('## ')) {
      fermerEntree();
      erreurs.push(`l. ${i + 1} : titre de niveau 2 hors de la forme « ## Angle N — … » après le tableau`);
      section = null;
      continue;
    }
    if (section) section.lignes.push(l);
    if (l.startsWith('### ')) {
      fermerEntree();
      if (!section) {
        erreurs.push(`l. ${i + 1} : entrée hors de toute section d'angle`);
        continue;
      }
      entree = { angle: section.num, titre: l.slice(4), ligne: i + 1, champs: [], mesures: [] };
      continue;
    }
    if (entree && /^- /.test(l)) {
      const m = l.match(/^- (.+?)(?: \([^)]*\))? :(?: (.*))?$/);
      if (m) entree.champs.push({ cle: m[1], valeur: m[2] ?? '', ligne: i + 1, brut: l });
      if (l.startsWith('- Mesure ')) entree.mesures.push({ brut: l, ligne: i + 1, m: l.match(MESURE) });
    }
  }
  fermerEntree();
  for (const s of sections.values()) s.texte = s.lignes.join('\n').replace(/[\s-]+$/, '');
  return { entete, tableau, sections, entrees, erreurs };
}

const champ = (e, cle) => e.champs.find((c) => c.cle === cle);
export const statutDe = (e) => {
  const v = champ(e, 'Statut')?.valeur ?? '';
  return STATUTS.find((s) => s.motif.test(v))?.nom ?? null;
};
const refDe = (e) => champ(e, 'Réf')?.valeur ?? '';

/** La garde de forme : renvoie la liste des erreurs. */
export function verifierForme(doc, { racine = ROOT } = {}) {
  const erreurs = [...doc.erreurs];
  if (!doc.tableau) return erreurs;
  const vues = new Map();
  const tickets = existsSync(join(racine, TICKETS)) ? readdirSync(join(racine, TICKETS)) : [];

  for (const e of doc.entrees) {
    const ou = `l. ${e.ligne} (« ${e.titre} »)`;
    const ref = refDe(e);
    const m = ref.match(/^P(\d{2,3})\.(\d{2,3})$/);
    if (!m) erreurs.push(`${ou} : « - Réf : PNN.MM » absente ou mal formée (« ${ref} »)`);
    else if (Number(m[1]) !== e.angle) erreurs.push(`${ou} : la Réf ${ref} n'est pas de l'angle ${e.angle}`);
    if (ref && vues.has(ref)) erreurs.push(`${ou} : Réf ${ref} déjà portée l. ${vues.get(ref)}`);
    vues.set(ref, e.ligne);

    const brut = champ(e, 'Statut')?.valeur;
    const statut = statutDe(e);
    if (brut === undefined) erreurs.push(`${ou} : « - Statut : … » absent`);
    else if (!statut) erreurs.push(`${ou} : statut « ${brut} » hors vocabulaire (${STATUTS.map((s) => s.nom).join(', ')})`);

    if (!/^[🔴🟠🟢]/u.test(champ(e, 'Gravité')?.valeur ?? '')) erreurs.push(`${ou} : « - Gravité : 🔴|🟠|🟢 … » absente`);
    if (!champ(e, 'Piste')) erreurs.push(`${ou} : « - Piste : … » absente`);
    if (!e.champs.some((c) => /constat/i.test(c.cle))) erreurs.push(`${ou} : aucun constat`);

    for (const mes of e.mesures) {
      if (!mes.m) erreurs.push(`l. ${mes.ligne} : ligne Mesure hors forme « - Mesure (AAAA-MM-JJ, <sha>, <rôle>) : … »`);
      else if (mes.m[4].trim().length < 40) erreurs.push(`l. ${mes.ligne} : une mesure dit ce qui a été lancé ou lu, et ce que cela a rendu (40 caractères au moins)`);
    }
    if (statut && statut !== 'à mesurer' && !e.mesures.some((x) => x.m)) {
      erreurs.push(`${ou} : le statut « ${statut} » n'est appuyé par aucune ligne Mesure`);
    }
    if (statut === 'fait') {
      const tck = brut.match(/TCK-\d+/)[0];
      if (!tickets.some((f) => f.startsWith(`${tck}-`))) erreurs.push(`${ou} : ${tck} n'existe pas dans ${TICKETS}`);
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

/** Le périmètre d'un rôle : fichiers touchés et transitions, contre la version de base. */
export function verifierRole(role, base, tete, fichiers, { racine = ROOT } = {}) {
  const erreurs = [];
  const touche = fichiers.map((f) => f.chemin);

  if (role === 'implementeur') {
    for (const f of fichiers) {
      if (PROTEGES_IMPLEMENTEUR.some((re) => re.test(f.chemin))) erreurs.push(`${f.chemin} : chemin réservé au porteur`);
      if (MIGRATIONS.test(f.chemin) && f.etat !== 'A') erreurs.push(`${f.chemin} : une migration existante ne se modifie ni ne se supprime`);
      if (GARDES.test(f.chemin) && f.etat !== 'A') erreurs.push(`${f.chemin} : une garde existante ne se modifie pas (critère V9)`);
      if (TESTS.test(f.chemin) && f.etat === 'D') erreurs.push(`${f.chemin} : un test ne se supprime pas`);
    }
  } else {
    for (const c of touche) if (c !== FICHIER) erreurs.push(`${c} : le rôle ${role} n'écrit que ${FICHIER}`);
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
  for (const [ref, e] of apres) {
    const avantE = avant.get(ref);
    if (!avantE) continue;
    const anciennes = avantE.mesures.map((x) => x.brut);
    if (anciennes.some((m, k) => e.mesures[k]?.brut !== m)) erreurs.push(`${ref} : une ligne Mesure existante a été modifiée ou retirée`);
    const de = statutDe(avantE);
    const vers = statutDe(e);
    const nouvelles = e.mesures.slice(anciennes.length);
    if (nouvelles.length && de === vers && champ(avantE, 'Statut')?.valeur === champ(e, 'Statut')?.valeur) {
      erreurs.push(`${ref} : mesure ajoutée sans changement de statut`);
    }
    if (champ(avantE, 'Statut')?.valeur === champ(e, 'Statut')?.valeur) continue;
    basculees.push(ref);
    if (vers === 'fait') tickets.add(champ(e, 'Statut').valeur.match(/TCK-\d+/)?.[0]);
    if (!(permis[de] ?? []).includes(vers)) {
      erreurs.push(`${ref} : « ${de} » → « ${vers} » n'est pas une transition du rôle ${role}`);
      continue;
    }
    const miennes = nouvelles.filter((x) => x.m && x.m[3] === role);
    if (!miennes.length) erreurs.push(`${ref} : la transition « ${de} » → « ${vers} » demande une ligne Mesure neuve du rôle ${role}`);
    if (vers.startsWith('retenu') && role === 'mesureur' && !miennes.some((x) => /Classement : .{20,}/.test(x.m[4]))) {
      erreurs.push(`${ref} : un classement « ${vers} » dit pourquoi (« Classement : … », 20 caractères au moins)`);
    }
    // Une piste `validé` porte la décision du porteur : elle ne lui revient pas sans raison, et sa
    // précision (`validé — …`) arrive mot pour mot dans le ticket qui l'implémente.
    if (de === 'validé') {
      const accord = champ(avantE, 'Statut').valeur.match(/^validé — (.+)$/)?.[1];
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
  // Un passage de l'implémenteur livre un lot (amendement du 2026-10-17) : au plus LOT_MAX entrées
  // changent de statut, et un lot de plusieurs tickets ne mêle pas l'API et le front. Une piste qui
  // touche les deux côtés part seule, ou avec les entrées de même cause qui partagent son ticket.
  if (role === 'implementeur') {
    if (basculees.length > LOT_MAX) {
      erreurs.push(`un lot compte au plus ${LOT_MAX} entrées ; ${basculees.length} ont changé de statut (${basculees.join(', ')})`);
    }
    const cotes = ['takussan-api/', 'takussan-web/'].filter((c) => touche.some((f) => f.startsWith(c)));
    if (tickets.size > 1 && cotes.length > 1) {
      erreurs.push(`un lot de ${tickets.size} tickets (${[...tickets].join(', ')}) ne mêle pas l'API et le front : une piste qui touche les deux part seule`);
    }
  }
  return erreurs;
}

const texteDe = (doc) => doc.texteSource;

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function charger(texte) {
  const doc = analyser(texte);
  doc.texteSource = texte;
  return doc;
}

function principal(argv) {
  const opt = (nom) => {
    const k = argv.indexOf(nom);
    return k >= 0 ? (argv[k + 1] ?? '') : null;
  };
  const tete = charger(readFileSync(join(ROOT, FICHIER), 'utf8'));
  const erreurs = verifierForme(tete);

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
    const base = charger(git(['show', `${mb}:${FICHIER}`]));
    erreurs.push(...verifierRole(role, base, tete, fichiers));
  }

  if (argv.includes('--restes')) {
    // Ce qui reste d'une validation partielle : à faire (`validé — … ; reste : …`) ou laissé par
    // le ticket qui l'a implémentée (`fait · TCK-NNN — reste : …`).
    for (const e of tete.entrees) {
      const s = champ(e, 'Statut')?.valeur ?? '';
      const fait = s.match(/^fait · (TCK-\d+) — reste : (.+)$/);
      const valide = s.match(/^validé — .* ; reste : (.+)$/);
      if (fait) console.log(`${refDe(e)}\t${fait[1]}\t${fait[2]}`);
      else if (valide) console.log(`${refDe(e)}\tpas encore fait\t${valide[1]}`);
    }
  }
  if (argv.includes('--angles-a-faire')) {
    for (const a of tete.tableau.values()) if (a.etat === 'à faire') console.log(`${a.num}\t${a.sujet}`);
  }
  const liste = opt('--liste');
  if (liste !== null) {
    for (const e of tete.entrees) {
      const s = champ(e, 'Statut')?.valeur ?? '';
      if (s.startsWith(liste)) console.log(`${refDe(e)}\t${(champ(e, 'Gravité')?.valeur ?? '').slice(0, 2)}\tl. ${e.ligne}\t${s}\t${e.titre}`);
    }
  }
  if (argv.includes('--report')) {
    const comptes = new Map();
    for (const e of tete.entrees) {
      const cle = `${statutDe(e) ?? '(hors vocabulaire)'}`;
      const g = [...(champ(e, 'Gravité')?.valeur ?? '?')][0];
      const c = comptes.get(cle) ?? { '🔴': 0, '🟠': 0, '🟢': 0, total: 0 };
      c[g] = (c[g] ?? 0) + 1;
      c.total++;
      comptes.set(cle, c);
    }
    console.log(`${FICHIER}`);
    console.log(`  ${tete.entrees.length} entrées, ${tete.sections.size} angles explorés sur ${tete.tableau.size}`);
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
  if (liste === null && !argv.includes('--angles-a-faire') && !argv.includes('--restes')) {
    console.log(`✓ ${FICHIER} : ${tete.entrees.length} entrées bien formées${role ? `, périmètre du rôle ${role} tenu` : ''}`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal(process.argv.slice(2));
}
