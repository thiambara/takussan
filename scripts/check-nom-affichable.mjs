#!/usr/bin/env node
/**
 * Garde du NOM AFFICHABLE : le front ne compose plus `first_name` + `last_name` lui-même — il passe
 * par `nomAffichable()` (`takussan-web/src/lib/identite.ts`) — P220.08 (TCK-2142).
 *
 * Un compte créé par téléphone naît à noms `''`. Chaque écran qui collait prénom et nom à sa façon
 * rendait alors une ligne, une option, un titre ou un `aria-label` vides, et les replis divergeaient
 * d'un écran à l'autre (`#id` ici, e-mail là, rien ailleurs) — angle 220 du fichier de pistes.
 * `nomAffichable()` fixe l'ordre une fois : prénom et nom, sinon e-mail, sinon numéro, sinon `#<id>`.
 *
 * Ce qu'elle cherche, dans `takussan-web/src` hors tests et hors `src/lib/identite.ts` : un accès
 * `.first_name` suivi, dans la même expression, d'un accès `.last_name`, collés par
 *   · un gabarit ou du JSX : `${u.first_name} ${u.last_name}`, `{u.first_name} {u.last_name}`,
 *     `${u.first_name?.[0] ?? ''}${u.last_name?.[0] ?? ''}` (des initiales sont une composition) ;
 *   · un tableau : `[u.first_name, u.last_name]` ;
 *   · une concaténation : `u.first_name + ' ' + u.last_name`.
 * Elle ne voit pas un nom composé par une variable intermédiaire (`const p = u.first_name; …`) :
 * c'est un plancher, pas une preuve.
 *
 * Les sites que le lot de TCK-2138, TCK-2140 et TCK-2142 n'a pas convertis sont excusés UN PAR UN
 * dans `EXCEPTIONS`, chacun avec son motif et son nombre exact de compositions : un site de plus
 * dans un fichier excusé rougit aussi, et une exception devenue inutile rougit pour qu'on la retire.
 *
 * Usage :
 *   node scripts/check-nom-affichable.mjs            # sort en 1 au moindre site neuf
 *   node scripts/check-nom-affichable.mjs --report   # + chaque site relevé
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'takussan-web', 'src');
const ASSEMBLEUR = 'takussan-web/src/lib/identite.ts';
const REPORT = process.argv.includes('--report');

/** Fichier (relatif à la racine) → nombre de compositions tolérées et pourquoi. */
export const EXCEPTIONS = {
  // Fiches client : leur repli est P220.03, soumise au porteur (V7, et V1 par la facture).
  'takussan-web/src/app/(dashboard)/app/customers/[id]/page.tsx': { max: 5, motif: 'fiche client, P220.03 à valider' },
  'takussan-web/src/components/pipeline/PipelineKanban.tsx': { max: 1, motif: 'fiche client, P220.03 à valider' },
  'takussan-web/src/components/pipeline/PipelineCard.tsx': { max: 4, motif: 'fiche client (et son auteur), P220.03 à valider' },
  'takussan-web/src/components/pipeline/CustomerDetailSheet.tsx': { max: 2, motif: 'fiche client, P220.03 à valider' },
  'takussan-web/src/components/customer-dashboard/CustomerList.tsx': { max: 2, motif: 'fiche client, P220.03 à valider' },
  'takussan-web/src/components/visits/PlanifierUneVisite.tsx': { max: 1, motif: 'fiche client, P220.03 à valider' },
  'takussan-web/src/components/leases/CreateLeaseForm.tsx': { max: 1, motif: 'fiche client du locataire (customerLabel), P220.03 à valider' },
  'takussan-web/src/lib/queries/agent-crm.ts': { max: 1, motif: 'fiche client de la recherche CRM, P220.03 à valider' },
  // Le nom de l'invitation (`metadata`) passe avant le repli : TCK-2136 l'a écrit ainsi.
  'takussan-web/src/components/owners/OwnersList.tsx': { max: 2, motif: 'compte puis nom saisi à l’invitation (TCK-2136)' },
  'takussan-web/src/components/service-providers/ServiceProvidersList.tsx': { max: 2, motif: 'compte puis nom saisi à l’invitation (TCK-2136)' },
  'takussan-web/src/components/payments/CreatePayoutDialog.tsx': { max: 2, motif: 'compte puis nom saisi à l’invitation (TCK-2136)' },
  'takussan-web/src/components/maintenance/MaintenanceAssignmentBlock.tsx': {
    max: 3,
    motif: 'compte puis nom saisi à l’invitation (TCK-2136) ; membre déjà replié sur son id',
  },
  // Repli déjà juste (nom, e-mail, #id), hors de l'angle 220.
  'takussan-web/src/components/admin/AuditTrail.tsx': { max: 1, motif: 'repli nom → e-mail → #id déjà en place' },
  // Pas une personne-compte : le garant d'un bail n'a ni e-mail ni id d'utilisateur.
  'takussan-web/src/components/leases/GuarantorSection.tsx': { max: 1, motif: 'garant du bail, saisi en entier au formulaire' },
  // Le nom proposé par défaut à un hôte qui s'inscrit : vide est la bonne valeur sans nom.
  'takussan-web/src/components/onboarding/HostIndividualWizard.tsx': { max: 1, motif: 'valeur initiale d’un champ de saisie' },
  // Console de la plateforme : hors de l'angle 220, qui relevait les écrans d'agence.
  'takussan-web/src/app/(super-admin)/super-admin/agency-upgrade-requests/page.tsx': { max: 1, motif: 'console plateforme, hors angle 220' },
  'takussan-web/src/app/(super-admin)/super-admin/agency-upgrade-requests/[id]/page.tsx': {
    max: 1,
    motif: 'console plateforme, hors angle 220',
  },
  'takussan-web/src/app/(super-admin)/super-admin/super-admins/page.tsx': { max: 1, motif: 'console plateforme, hors angle 220' },
  'takussan-web/src/app/(super-admin)/super-admin/users/page.tsx': { max: 1, motif: 'console plateforme, hors angle 220' },
};

const OBJET = String.raw`[\w$\]\[?.]*?\??\.`;
const PRENOM = String.raw`${OBJET}first_name(?:\?\.\[0\]|\[0\])?(?:\s*\?\?\s*(?:''|""))?`;
const NOM = String.raw`${OBJET}last_name`;
const MOTIFS = [
  // gabarit `${a} ${b}`, `${a}${b}`, ou JSX `{a} {b}`
  new RegExp(String.raw`${PRENOM}\s*\}[ \t]*\$?\{\s*${NOM}`, 'g'),
  // tableau `[a, b]`
  new RegExp(String.raw`\[\s*${PRENOM}\s*,\s*${NOM}`, 'g'),
  // concaténation `a + ' ' + b`
  new RegExp(String.raw`${PRENOM}\s*\+[^;\n]{0,12}?\+?\s*${NOM}`, 'g'),
];

function* fichiers(dossier) {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === '__tests__' || entree.name === 'node_modules') continue;
      yield* fichiers(chemin);
    } else if (/\.(ts|tsx)$/.test(entree.name) && !/\.test\.tsx?$/.test(entree.name)) {
      yield chemin;
    }
  }
}

/** Les compositions d'un source, avec leur ligne. */
export function compositions(source) {
  const trouvees = new Map();
  for (const motif of MOTIFS) {
    for (const m of source.matchAll(motif)) {
      const ligne = source.slice(0, m.index).split('\n').length;
      trouvees.set(`${ligne}:${m.index}`, { ligne, texte: m[0].replace(/\s+/g, ' ') });
    }
  }
  // Deux motifs peuvent couvrir la même composition : une par ligne.
  const parLigne = new Map();
  for (const t of trouvees.values()) if (!parLigne.has(t.ligne)) parLigne.set(t.ligne, t);
  return [...parLigne.values()].sort((a, b) => a.ligne - b.ligne);
}

function main() {
  const erreurs = [];
  const vus = new Set();
  let total = 0;
  for (const chemin of fichiers(SRC)) {
    const rel = relative(ROOT, chemin);
    if (rel === ASSEMBLEUR) continue;
    const sites = compositions(readFileSync(chemin, 'utf8'));
    if (sites.length === 0) continue;
    total += sites.length;
    vus.add(rel);
    const exception = EXCEPTIONS[rel];
    if (REPORT) {
      for (const s of sites) console.log(`  ${exception ? '·' : '✗'} ${rel}:${s.ligne}  ${s.texte}`);
    }
    if (!exception) {
      for (const s of sites) erreurs.push(`${rel}:${s.ligne} compose le nom à la main (${s.texte})`);
    } else if (sites.length > exception.max) {
      erreurs.push(`${rel} : ${sites.length} compositions pour ${exception.max} excusée(s) (${exception.motif})`);
    } else if (sites.length < exception.max) {
      erreurs.push(`${rel} : ${sites.length} composition(s) pour ${exception.max} excusée(s) — abaisser ou retirer l'exception`);
    }
  }
  for (const rel of Object.keys(EXCEPTIONS)) {
    if (!vus.has(rel)) erreurs.push(`${rel} : exception sans composition — la retirer`);
  }
  if (erreurs.length > 0) {
    console.error(`✗ ${erreurs.length} écart(s) à la règle du nom affichable :`);
    for (const e of erreurs) console.error(`    ${e}`);
    console.error(`  Passer par nomAffichable() (${ASSEMBLEUR}), ou excuser le site dans EXCEPTIONS avec son motif.`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ nom affichable : aucune composition prénom + nom hors de l'assembleur, sauf ${total} excusée(s) dans ${vus.size} fichier(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
