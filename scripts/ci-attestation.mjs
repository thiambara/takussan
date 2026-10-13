#!/usr/bin/env node
/**
 * ATTESTATION PAR ARBRE (ADR-0063, TCK-636) — une suite verte dépose un artefact nommé par l'arbre
 * qu'elle a éprouvé ; ce script dit si l'arbre courant en a déjà un.
 *
 * Le défaut qu'il retire : la même suite, sur le même arbre, trois fois — la PR vers `dev`, le push
 * du merge sur `dev`, la promotion vers `preview`. Mesuré le 2026-10-13 : 17-23 min, 19-24 min,
 * 28-42 min.
 *
 * LA CLÉ est le SHA-256 de `git ls-tree -r HEAD` restreint au PÉRIMÈTRE DE LECTURE de la suite.
 * Un `ls-tree` porte le hachage de chaque blob : même clé, même contenu. Le périmètre n'est PAS
 * celui des `paths:` du workflow — mesuré le 2026-10-13, deux tests du front lisent des fichiers de
 * l'API que les `paths` de web-ci ignorent, et un test de l'API lit `takussan-web/src/messages/`.
 * `scripts/check-ci-attestation.mjs` garde ce second côté.
 *
 * ⚠ TOUTE INCERTITUDE REJOUE. Réseau, 403, réponse illisible : `deja-vert=false` et un
 * avertissement. Ce script ne sort en erreur que sur un usage faux ; le défaut qu'il ne doit
 * jamais avoir est de faire sauter une suite qu'aucun run n'a vue verte.
 *
 * Usage :
 *   node scripts/ci-attestation.mjs <api|web>          en CI : écrit `cle`, `artefact`, `deja-vert`
 *                                                     et `carte-courante` dans $GITHUB_OUTPUT
 *   node scripts/ci-attestation.mjs <api|web> --cle    imprime la clé, sans réseau
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Ce que chaque suite LIT — et non ce qui la déclenche. */
export const PERIMETRES = {
  api: [
    'takussan-api',
    // `SearchWolofReviewSheetTest` et la commande qu'il éprouve lisent `messages/wo.json`.
    'takussan-web/src/messages',
    '.github/workflows/api-ci.yml',
    'scripts/ci-attestation.mjs',
  ],
  web: [
    'takussan-web',
    // Tout l'API, pas une liste : les tests du front y lisent fixtures, enums, sources — dont
    // deux fichiers hors des `paths` de web-ci au 2026-10-13. Une énumération se périme.
    'takussan-api',
    '.github/workflows/web-ci.yml',
    'scripts/ci-attestation.mjs',
  ],
};

/** Les workflows dont un run peut avoir déposé une attestation. */
export const WORKFLOWS_ATTESTANTS = [
  '.github/workflows/api-ci.yml',
  '.github/workflows/web-ci.yml',
  '.github/workflows/promotion-ci.yml',
];

export function cleDe(suite, arbre = 'HEAD') {
  const listing = execFileSync('git', ['ls-tree', '-r', arbre, '--', ...PERIMETRES[suite]], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (!listing.trim()) throw new Error(`git ls-tree ne rend rien pour « ${suite} » : le périmètre ne désigne aucun fichier`);
  return createHash('sha256').update(`${suite}\n${listing}`).digest('hex');
}

export const nomDArtefact = (suite, cle) => `ci-vert-${suite}-${cle}`;

async function api(chemin) {
  const base = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const reponse = await fetch(`${base}${chemin}`, {
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'takussan-ci-attestation',
    },
  });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status} sur ${chemin}`);
  return reponse.json();
}

/** Le run qui a attesté cet arbre, ou `null`. Lève sur toute réponse inattendue. */
export async function attestation(nom) {
  const depot = process.env.GITHUB_REPOSITORY;
  const idDepot = String(process.env.GITHUB_REPOSITORY_ID ?? '');
  if (!depot || !idDepot || !process.env.GITHUB_TOKEN) throw new Error('GITHUB_REPOSITORY, GITHUB_REPOSITORY_ID ou GITHUB_TOKEN absent');

  const { artifacts } = await api(`/repos/${depot}/actions/artifacts?name=${encodeURIComponent(nom)}&per_page=20`);
  if (!Array.isArray(artifacts)) throw new Error('réponse sans `artifacts`');

  for (const a of artifacts) {
    const run = a.workflow_run;
    if (a.name !== nom || a.expired || !run) continue;
    // Ni fork, ni autre dépôt : seul un run de CE dépôt, sur une branche de CE dépôt, atteste.
    if (String(run.repository_id) !== idDepot || String(run.head_repository_id) !== idDepot) continue;
    const detail = await api(`/repos/${depot}/actions/runs/${run.id}`);
    const chemin = String(detail.path ?? '').split('@')[0];
    if (!WORKFLOWS_ATTESTANTS.includes(chemin)) continue;
    return { run: detail, artefact: a };
  }
  return null;
}

/**
 * La nuit seulement : la carte d'impact est-elle déjà celle de l'API courante ? Vrai si un commit
 * `[carte-impact]` du bot existe et qu'aucun fichier de l'API, la carte exceptée, n'a changé après
 * lui. Exige l'historique (`fetch-depth: 0`) ; faute de quoi, `false` — on régénère.
 */
function carteCourante() {
  try {
    const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
    const carte = git('log', '-1', '--format=%H', '--author=github-actions[bot]', '-F', '--grep=[carte-impact]');
    if (!carte) return false;
    const apres = git('log', '-1', '--format=%H', `${carte}..HEAD`, '--', 'takussan-api', ':(exclude)takussan-api/tests/impact-map.json');
    return apres === '';
  } catch {
    return false;
  }
}

function ecrire(fichier, texte) {
  if (process.env[fichier]) appendFileSync(process.env[fichier], texte);
  else process.stdout.write(texte);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();

async function principal() {
  const [suite, option] = process.argv.slice(2);
  if (!Object.hasOwn(PERIMETRES, suite ?? '')) {
    console.error(`usage : node scripts/ci-attestation.mjs <${Object.keys(PERIMETRES).join('|')}> [--cle]`);
    process.exit(2);
  }

  const cle = cleDe(suite);
  const nom = nomDArtefact(suite, cle);
  if (option === '--cle') {
    console.log(cle);
    process.exit(0);
  }

  const evenement = process.env.GITHUB_EVENT_NAME ?? '';
  // La nuit et à la demande, la suite tourne toujours : c'est elle qui produit `cov.php`.
  const nuit = evenement === 'schedule' || evenement === 'workflow_dispatch';
  let dejaVert = false;
  let resume;

  const courante = evenement === 'schedule' && suite === 'api' && carteCourante();

  if (courante) {
    resume = "Aucun fichier de l'API n'a changé depuis la dernière carte d'impact : la nuit est sautée.";
  } else if (nuit) {
    resume = `Exécution \`${evenement}\` : la suite tourne quelle que soit l'attestation (elle produit la carte d'impact).`;
  } else {
    try {
      const trouvee = await attestation(nom);
      if (trouvee) {
        dejaVert = true;
        const { run } = trouvee;
        resume =
          `**Arbre déjà attesté vert** — la suite \`${suite}\` est sautée.\n\n` +
          `Run attestant : [${run.name} #${run.run_number}](${run.html_url}) — ` +
          `\`${run.event}\` sur \`${run.head_branch}\`, commit \`${String(run.head_sha).slice(0, 8)}\`.`;
      } else {
        resume = `Aucune attestation pour cet arbre : la suite \`${suite}\` tourne.`;
      }
    } catch (erreur) {
      console.log(`::warning::attestation introuvable (${erreur.message}) — la suite tourne.`);
      resume = `Recherche d'attestation en échec (${erreur.message}) : la suite \`${suite}\` tourne.`;
    }
  }

  ecrire('GITHUB_OUTPUT', `cle=${cle}\nartefact=${nom}\ndeja-vert=${dejaVert}\ncarte-courante=${courante}\n`);
  ecrire('GITHUB_STEP_SUMMARY', `### Attestation \`${suite}\`\n\nClé \`${cle}\`\n\n${resume}\n`);
}
