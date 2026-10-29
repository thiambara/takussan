#!/usr/bin/env node
/**
 * Relecture d'un cas du jeu `radar.extraction` : le texte anonymisé et la sortie attendue côte à côte,
 * pour que le porteur juge d'un coup d'œil (1) qu'aucune donnée personnelle ne reste, (2) que
 * chaque valeur attendue est celle que l'annonce dit.
 *
 *   node resources/ai/evals/radar.extraction/relecture.mjs            # tous les cas réels
 *   node resources/ai/evals/radar.extraction/relecture.mjs 007 012    # ces cas
 *   node resources/ai/evals/radar.extraction/relecture.mjs --tous     # y compris les synthétiques
 *
 * Dérivé des fichiers du jeu, rien n'est écrit : la sortie ne peut pas être périmée.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const provenance = JSON.parse(readFileSync(join(DIR, 'provenance.json'), 'utf8'));
const args = process.argv.slice(2);
const tous = args.includes('--tous');
const demandes = args.filter((a) => /^\d{3}$/.test(a));

const ids = readdirSync(join(DIR, 'cases')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, 3)).sort()
  .filter((id) => (demandes.length ? demandes.includes(id) : tous || provenance[id]?.origin === 'real'));

for (const id of ids) {
  const cas = JSON.parse(readFileSync(join(DIR, 'cases', `${id}.json`), 'utf8'));
  const p = provenance[id] ?? {};
  const texte = cas.input.replace(/^.*\n<contenu_externe_[a-p]{16} source="([^"]*)">\n/s, '').replace(/\n<\/contenu_externe_[a-p]{16}>$/, '');
  const source = /source="([^"]*)"/.exec(cas.input)?.[1];
  console.log(`\n${'='.repeat(100)}\n${id}  ${p.origin ?? '?'}  source=${source}  ${p.site ?? ''} ${p.releve ?? ''}  ${cas.attachments ? `captures=${cas.attachments}` : ''}`);
  console.log('-'.repeat(100));
  console.log(texte === '' ? '(capture : voir le fichier image)' : texte.replace(/(.{1,110})(\s|$)/g, '$1\n').trimEnd());
  console.log('-'.repeat(100));
  const presents = Object.entries(cas.expected).filter(([, v]) => v !== null);
  for (const [champ, valeur] of presents) console.log(`  ${champ.padEnd(17)} ${JSON.stringify(valeur)}`);
  console.log(`  (null : ${Object.entries(cas.expected).filter(([, v]) => v === null).map(([c]) => c).join(', ') || '—'})`);
}
