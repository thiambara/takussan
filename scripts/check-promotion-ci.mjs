#!/usr/bin/env node
/**
 * Garde de la CI DE PROMOTION : toute PR vers `preview` ou `master` rejoue les trois workflows de
 * CI en entier, et la protection de branche exige leurs jobs (TCK-524).
 *
 * Le défaut qu'elle attrape : un check REQUIS par la protection de branche doit exister sur chaque
 * PR, sinon GitHub attend un statut qui ne vient jamais et la promotion ne fusionne plus. Or les
 * workflows de CI ne se déclenchent que sur leurs chemins — mesuré sur la promotion #271 : web-ci
 * n'a pas tourné. D'où `promotion-ci.yml`, qui les APPELLE tous (`uses:`) sans filtre, et
 * `branches-ignore: [preview, master]` sur leur propre `pull_request`, pour qu'une promotion ne les
 * joue qu'une fois. Un quatrième workflow de CI ajouté demain sans être appelé ici tournerait sur
 * les PR vers `dev` et jamais sur une promotion — exactement l'angle mort que la protection existe
 * pour fermer.
 *
 * Ce qu'elle vérifie, en lisant le dossier (jamais une liste tenue à la main) :
 *   · chaque `*-ci.yml` à déclencheur `pull_request` (hors promotion-ci.yml) porte `workflow_call:`
 *     et `branches-ignore: [preview, master]` sous `pull_request` ;
 *   · promotion-ci.yml l'appelle (`uses: ./.github/workflows/<fichier>`) ;
 *   · promotion-ci.yml se déclenche sur `pull_request` vers `preview` et `master`, et rien d'autre.
 *
 * Ce qu'elle ne vérifie PAS : la protection de branche elle-même, qui vit chez GitHub —
 * `gh api repos/thiambara/takussan/branches/preview/protection -q .required_status_checks.contexts`
 * (relevé : docs/infra/hebergement.md, « Protection des branches »).
 *
 * Usage :  node scripts/check-promotion-ci.mjs [--report]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(ROOT, '.github/workflows');
const PROMOTION = 'promotion-ci.yml';
const REPORT = process.argv.includes('--report');
const erreurs = [];

const lire = (f) => readFileSync(join(DOSSIER, f), 'utf8');
const blocOn = (s) => (s.match(/^on:\n([\s\S]*?)^\S/m) ?? [, ''])[1];

const cis = readdirSync(DOSSIER)
  .filter((f) => /-ci\.yml$/.test(f) && f !== PROMOTION)
  .filter((f) => /^\s{2}pull_request:/m.test(blocOn(lire(f))))
  .sort();
if (cis.length === 0) erreurs.push('aucun workflow `*-ci.yml` à déclencheur `pull_request` : la garde ne trouve plus ce qu\'elle garde');

let promotion = '';
try { promotion = lire(PROMOTION); } catch { erreurs.push(`${PROMOTION} absent`); }
const onPromotion = blocOn(promotion);
if (!/^\s{2}pull_request:\n\s{4}branches:\s*\[preview, master\]\s*$/m.test(onPromotion)) {
  erreurs.push(`${PROMOTION} : \`on.pull_request.branches\` doit être exactement \`[preview, master]\``);
}
const autresDeclencheurs = onPromotion.split('\n').filter((l) => /^\s{2}\S/.test(l) && !/^\s{2}pull_request:/.test(l));
if (autresDeclencheurs.length) erreurs.push(`${PROMOTION} : déclencheur(s) inattendu(s) : ${autresDeclencheurs.join(', ').trim()}`);

for (const f of cis) {
  const on = blocOn(lire(f));
  if (!/^\s{2}workflow_call:\s*$/m.test(on)) erreurs.push(`${f} : \`workflow_call:\` manque sous \`on:\` — promotion-ci.yml ne peut pas l'appeler`);
  const pr = (on.match(/^\s{2}pull_request:\n([\s\S]*?)(?=^\s{2}\S|\s*$)/m) ?? [, ''])[1];
  if (!/^\s{4}branches-ignore:\s*\[preview, master\]\s*$/m.test(pr)) {
    erreurs.push(`${f} : \`pull_request.branches-ignore: [preview, master]\` manque — une promotion le jouerait deux fois`);
  }
  if (!promotion.includes(`uses: ./.github/workflows/${f}`)) erreurs.push(`${PROMOTION} n'appelle pas ${f} : ses jobs ne tourneraient sur aucune promotion`);
}
const appeles = [...promotion.matchAll(/uses: \.\/\.github\/workflows\/([\w-]+\.yml)/g)].map((m) => m[1]);
for (const a of appeles) if (!cis.includes(a)) erreurs.push(`${PROMOTION} appelle ${a}, qui n'est pas un \`*-ci.yml\` à déclencheur \`pull_request\``);

if (REPORT) console.log(`workflows de CI (${cis.length}) : ${cis.join(', ')} ; appelés par ${PROMOTION} : ${appeles.join(', ') || 'aucun'}`);
if (erreurs.length) {
  for (const e of erreurs) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ CI de promotion : ${cis.length} workflow(s) appelés en entier sur toute PR vers preview ou master.`);
