#!/usr/bin/env node
/**
 * TAKUSSAN VOUVOIE PARTOUT — et cette garde empêche le tutoiement de revenir (TCK-2683).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La charte disait « tutoyer sur les surfaces publiques de découverte » ; le site livré vouvoyait
 * déjà presque partout, et les maquettes de l'audit tutoient souvent. Une page dont la voix change
 * d'un écran à l'autre se lit comme une incohérence. Le porteur a tranché le 2026-11-10 :
 * **vouvoiement partout**, site public compris, connecté ou non
 * ([ADR-0095](../../docs/adr/0095-le-ton-suit-la-session.md)).
 *
 * Le relevé de TCK-2683 a trouvé 6 clés au tutoiement dans `fr.json` sur ~10 500 — cinq annoncées,
 * et une sixième (`agency.publicPage.teamHeading`, « pour t’accompagner ») qu'un `grep` ligne à ligne
 * ne voyait pas, cachée dans un pluriel ICU. Rien d'autre ne les aurait rattrapées : ni `tsc`, ni
 * ESLint, ni `check:i18n` (qui ne juge que la parité des langues), ni un test.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET LA RÈGLE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * - `src/messages/fr.json`, toutes les feuilles ;
 * - les chaînes littérales et le texte JSX de `src/**\/*.{ts,tsx}`, hors `__tests__/` et
 *   `playground/` (les maquettes sont locales et ne sont pas une référence de ton, ADR-0095 § 3).
 *
 * Les marques reconnues sont dans `scripts/vouvoiement.mjs` (pronoms et possessifs de la 2ᵉ personne,
 * `te` compris ; impératifs sans homonyme à toute position ; liste fermée d'impératifs ambigus en tête
 * de proposition), avec ce qu'elles ne voient pas. `en` n'a pas de voix ; le wolof est en pause.
 *
 * **Plafond 0, sans cliquet** : un retour du tutoiement rougit, toujours. Un faux positif ne se tolère
 * que par une EXCEPTION ci-dessous, nommée par sa clé (ou son fichier), avec sa raison. Une exception
 * sans raison rougit ; une exception qui ne couvre plus rien rougit aussi — une tolérance morte est
 * une tolérance qui attend son prochain abus.
 *
 *     node scripts/check-vouvoiement.mjs        (npm run check:vouvoiement, branchée dans web-ci.yml)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verifier } from './vouvoiement.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Les faux positifs MESURÉS (2026-11-11). Chacun porte sa raison ; aucun n'est un tutoiement. */
export const EXCEPTIONS = [
  {
    cle: 'visits.client.messageAgent',
    raison: '« je vous écris au sujet de ma visite » : message que le CLIENT envoie à l’agent, à la 1ʳᵉ personne et qui vouvoie l’agent (TCK-2587).',
  },
  {
    cle: 'favorites.selection.sousTitre',
    raison: '« Choisis sur Takussan et partagés avec vous » : participe passé (des biens choisis), pas un impératif.',
  },
  {
    cle: 'superAdmin.userDetail.support.forcePasswordReset.description',
    raison: '« Envoie un email de reset… » : description d’un geste de la console à la 3ᵉ personne (le geste envoie).',
  },
  {
    cle: 'superAdmin.operatorLevels.viewer.hint',
    raison: '« Consulte la console… Ne touche à rien. » : ce que fait un opérateur de ce niveau, à la 3ᵉ personne.',
  },
  {
    cle: 'billing.agencySubscription.overrides.hint',
    raison: '« Modifie l’abonnement en cours… » : ce que fait la surcharge, à la 3ᵉ personne.',
  },
];

export function releverLeDepot() {
  const dictionnaire = JSON.parse(readFileSync(join(WEB, 'src/messages/fr.json'), 'utf8'));
  const fichiers = readdirSync(join(WEB, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.d.ts'))
    .map((f) => f.split('\\').join('/'))
    .filter((f) => !/(^|\/)(__tests__|playground)\//.test(f))
    .sort()
    .map((f) => ({ chemin: `src/${f}`, source: readFileSync(join(WEB, 'src', f), 'utf8') }));
  return { ...verifier({ dictionnaire, fichiers, exceptions: EXCEPTIONS }), fichiers: fichiers.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { ecarts, exceptionsFautives, fichiers } = releverLeDepot();
  if (ecarts.length === 0 && exceptionsFautives.length === 0) {
    console.log(`✓ vouvoiement : fr.json et ${fichiers} fichiers de src/ — aucun tutoiement (${EXCEPTIONS.length} exceptions nommées).`);
  } else {
    console.error(`✗ ${ecarts.length + exceptionsFautives.length} écart(s) au vouvoiement (ADR-0095 : Takussan vouvoie partout) :`);
    for (const e of ecarts) console.error(`  · ${e.ou} — « ${e.mot} » dans « ${e.texte.slice(0, 120)} »`);
    for (const f of exceptionsFautives) console.error(`  · exception ${f}`);
    console.error(
      '\n  Réécrire le texte au vouvoiement (« Choisissez votre… »). Un faux positif (participe,\n' +
        '  3ᵉ personne, nom) s\'ajoute à EXCEPTIONS dans scripts/check-vouvoiement.mjs, avec sa raison.\n' +
        '  Voir docs/adr/0095-le-ton-suit-la-session.md.',
    );
    process.exit(1);
  }
}
