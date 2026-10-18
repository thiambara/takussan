#!/usr/bin/env node
/**
 * GARDE DES OUTILS des agents des pistes (ADR-0066 § 5) — hook `PreToolUse` de `claude -p`.
 *
 * Les agents tournent en `bypassPermissions` : personne n'est là pour répondre à une demande
 * d'autorisation. Ce hook est donc la seule frontière déterministe entre ce qu'un agent DÉCIDE et
 * ce qu'il FAIT. Il sort en 2 pour refuser, et le message part à l'agent. Mesuré le 2026-10-15 :
 * un hook qui sort en 2 empêche bien la commande en `bypassPermissions`.
 *
 * Il ne remplace pas les règles de `.agent/agents/pistes/commun.md`, il en tient le noyau. Il lit
 * une commande comme du texte, et un détour de shell assez tordu le traverse. Il attrape l'erreur
 * honnête et la « réparation » qui desserre une borne, pas un adversaire. Le second filet est
 * `pistes.sh`, qui vérifie le DIFF avant tout push, quel que soit le chemin qui l'a produit.
 *
 * ⚠ Le hook appliqué est la COPIE FIGÉE de `~/.takussan-agents/outils/`, posée par
 * `pistes.sh installer`, jamais ce fichier dans l'arbre d'un agent : un agent ne desserre pas la
 * garde qui le borne. Modifier ce fichier ne change rien tant qu'on n'a pas réinstallé.
 *
 * Environnement fourni par `pistes.sh` :
 *   PISTES_ARBRE    l'arbre de travail de l'agent (seul endroit où il écrit dans le dépôt)
 *   PISTES_SORTIE   son dossier de rapport, hors du dépôt
 *   PISTES_DEPOT    l'arbre principal du porteur (interdit)
 *   PISTES_JOURNAL  fichier où chaque refus est consigné
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, normalize, resolve } from 'node:path';

const ARBRE = process.env.PISTES_ARBRE ?? '';
const SORTIE = process.env.PISTES_SORTIE ?? '';
const DEPOT = process.env.PISTES_DEPOT ?? '';
const JOURNAL = process.env.PISTES_JOURNAL ?? '';

// Chemins qui bornent les agents : ni l'outil d'écriture ni le shell n'y écrivent.
const BORNES = ['.agent/', '.claude/', 'scripts/agents/', 'scripts/check-pistes.mjs', '.github/', 'docs/adr/0066-'];

// Règles sur le texte d'une commande shell : [motif, raison]. La première qui correspond refuse.
const COMMANDES = [
  [/\bgit\b[^|;&]*\bpush\b/, 'pas de push : pistes.sh publie après avoir vérifié le diff'],
  [/\bgit\b[^|;&]*\bworktree\s+(add|remove|prune|move|repair)\b/, 'les worktrees sont gérés par pistes.sh'],
  [/\bgit\b[^|;&]*\bconfig\s+--(global|system)\b/, 'pas de configuration git globale'],
  [/\bgit\b[^|;&]*--no-verify\b/, 'jamais --no-verify'],
  [/\bgh\s+pr\s+(create|merge|close|reopen|edit|comment|review|ready|lock)\b/, 'les PR sont créées et commentées par pistes.sh'],
  [/\bgh\s+(repo|release|secret|variable|label|ruleset|workflow\s+(run|enable|disable)|issue\s+(create|close|edit|comment|delete)|run\s+(cancel|delete))\b/, 'action GitHub en écriture'],
  [/\bgh\s+api\b[^|;&]*(-X\s*|--method[\s=]+)(POST|PUT|PATCH|DELETE)\b/i, 'API GitHub en écriture'],
  [/\bgh\s+api\b[^|;&]*\s(-f|-F|--field|--raw-field|--input)\s/, 'API GitHub en écriture (champ implicite = POST)'],
  [/\bdocker\b[^|;&]*\b(stop|down|rm|rmi|kill|restart|up|start|run|build|pull|push|prune|volume|network|system|compose\s+(stop|down|rm|kill|restart|up|start|pull|build|run))\b/, 'les conteneurs ne se touchent pas (lecture seule : ps, logs, exec)'],
  [/\bartisan\s+(migrate|db:|scout:|queue:(work|listen|flush|clear|restart)|schedule:run|key:generate|storage:link|optimize|config:cache|down|up)\b/, 'commande artisan qui écrit dans un état partagé'],
  [/\b(psql|docker\s+exec)\b[^|;&]*\b(insert\s+into|update\s+\w+\s+set|delete\s+from|drop|truncate|alter|create\s+(table|index|database|extension)|grant|vacuum)\b/i, 'la base de développement se lit seulement'],
  // `Request::create(…)` fabrique une requête en mémoire : c'est une mesure, pas une écriture (faux positif du 2026-10-15).
  [/\b(tinker|php\s+-r)\b[\s\S]*(->(save|update|delete|forceDelete|insert|insertOrIgnore|upsert|truncate|increment|decrement|flush)|(?<!Request)::(create|insert|update|delete|truncate|statement|unprepared|updateOrCreate|firstOrCreate))\s*\(/, 'tinker et php -r : lecture seule'],
  // En position de commande seulement : `grep -rn ssh deploy/` reste une lecture.
  [/(^|[;&|(`]\s*|\b(xargs|exec|nohup|time)\s+)(ssh|scp|sftp|rsync|dokploy|flyctl|kubectl|terraform|sudo|launchctl|crontab|osascript|shutdown|reboot|killall|pkill)\b/, 'commande hors du périmètre des agents'],
  [/\b(curl|wget|http|https|nc|ping|dig|nslookup|openssl)\b[^|;&]*takussan\.com/i, 'aucun accès à un environnement déployé'],
  [/\bsecurity\s+(find|dump|add|delete|export|unlock)-/, 'le trousseau ne se lit pas'],
  [/\b(npm|pnpm|yarn)\s+(add|remove|rm|uninstall|un|update|up|upgrade|publish|login|adduser|link)\b/, 'pas de dépendance ajoutée, retirée ou mise à jour'],
  // `npm install` nu (ou `npm ci`) réinstalle le verrou ; un paquet nommé, même après des options, en ajoute un.
  [/\b(npm|pnpm|yarn)\s+(i|install)\b(\s+--?[\w-]+(=\S+)?)*\s+(?!\d*>)[^-\s|;&>]/, 'pas de dépendance ajoutée'],
  [/\bcomposer\s+(require|remove|update|upgrade|global)\b/, 'pas de dépendance ajoutée, retirée ou mise à jour'],
  [/\b(printenv|env)\s*($|[|;&>])/, "l'environnement peut porter des secrets"],
  [/(^|[\s/'"=<])\.env(\.local|\.testing|\.production|\.preview)?(['"\s;|&)]|$)/, 'un .env ne se lit pas (secrets) ; .env.example et .env.docker restent lisibles'],
  [/\bcurl\b[^|;&]*(-X\s*|--request[\s=]+)(POST|PUT|PATCH|DELETE)\b/i, "pas d'écriture HTTP"],
];

// Une recherche Meilisearch locale se fait en POST et ne fait que lire (faux positif du 2026-10-15).
const RECHERCHE_LOCALE = /^https?:\/\/(127\.0\.0\.1|localhost):\d+\/(indexes\/[\w-]+\/search|multi-search)\b/;
const recherche_locale_seule = (cmd) => {
  const urls = cmd.match(/https?:\/\/[^\s'"]+/g) ?? [];
  return urls.length > 0 && urls.every((u) => RECHERCHE_LOCALE.test(u));
};

// Une écriture shell vise-t-elle un chemin qui borne les agents ? On ne regarde que les CIBLES :
// la mention d'un tel chemin dans un message de commit, un heredoc ou un argument de `node` n'est
// pas une écriture (trois faux positifs du 2026-10-15, au premier passage à blanc).
function ecritUneBorne(cmd) {
  const s = cmd
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g, ' ')
    .replace(/(["'])(?:(?!\1)[^\\]|\\.)*?\s(?:(?!\1)[^\\]|\\.)*?\1/g, '""');
  for (const m of s.matchAll(/(?:^|[^0-9&<>])>>?\s*("[^"]*"|'[^']*'|[^\s;|&]+)/g)) {
    if (BORNES.some((b) => m[1].includes(b))) return true;
  }
  return s
    .split(/;|&&|\|\||\|/)
    .some((seg) => /\b(tee|cp|mv|rm|ln|touch|chmod|install)\b|\bsed\s+-i|\bperl\s+-[a-z]*i/.test(seg) && BORNES.some((b) => seg.includes(b)));
}

function refuser(raison, detail) {
  const ligne = `${new Date().toISOString()}\t${process.env.PISTES_ROLE ?? '?'}\tREFUS\t${raison}\t${String(detail).replace(/\s+/g, ' ').slice(0, 300)}\n`;
  if (JOURNAL) {
    try {
      appendFileSync(JOURNAL, ligne);
    } catch {
      // un journal illisible ne doit pas ouvrir la garde
    }
  }
  process.stderr.write(`Refusé par la garde des agents (ADR-0066 § 5) : ${raison}.\n`);
  process.exit(2);
}

const dans = (chemin, racine) => racine && (chemin === racine || chemin.startsWith(racine.endsWith('/') ? racine : `${racine}/`));
const TEMPS = [tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'];

function verifierChemin(brut, cwd) {
  const chemin = normalize(isAbsolute(brut) ? brut : resolve(cwd || ARBRE, brut));
  if (DEPOT && dans(chemin, DEPOT)) refuser("l'arbre principal du porteur est interdit", chemin);
  if (dans(chemin, SORTIE) || TEMPS.some((t) => dans(chemin, t))) return;
  if (!dans(chemin, ARBRE)) refuser('écriture hors de ton arbre de travail', chemin);
  const relatif = chemin.slice(ARBRE.length + 1);
  if (BORNES.some((b) => relatif.startsWith(b))) refuser('ce chemin borne les agents et appartient au porteur', relatif);
  if (/(^|\/)\.env(\.|$)/.test(relatif) && !/\.env\.(example|docker)$/.test(relatif)) refuser('un .env ne se modifie pas', relatif);
}

function verifierCommande(cmd, cwd) {
  if (DEPOT && cwd && dans(normalize(cwd), DEPOT)) refuser("l'arbre principal du porteur est interdit (répertoire courant)", cwd);
  if (DEPOT && cmd.includes(DEPOT)) refuser("l'arbre principal du porteur est interdit", cmd);
  for (const [motif, raison] of COMMANDES) {
    if (raison === "pas d'écriture HTTP" && recherche_locale_seule(cmd)) continue;
    if (motif.test(cmd)) refuser(raison, cmd);
  }
  if (ecritUneBorne(cmd)) refuser('ce chemin borne les agents et appartient au porteur', cmd);
  // rm récursif ou forcé hors de l'arbre, de la sortie et des dossiers temporaires.
  const rm = cmd.match(/\brm\s+((?:-[a-zA-Z]+\s+)+)([^|;&]+)/);
  if (rm && /[rf]/i.test(rm[1])) {
    for (const cible of rm[2].trim().split(/\s+/)) {
      if (cible.includes('..')) refuser('rm avec « .. »', cmd);
      if (cible.startsWith('/') || cible.startsWith('~') || cible.startsWith('$HOME')) {
        const abs = normalize(cible.replace(/^(~|\$HOME)/, process.env.HOME ?? '~'));
        if (!dans(abs, ARBRE) && !dans(abs, SORTIE) && !TEMPS.some((t) => dans(abs, t))) refuser('suppression hors de ton arbre', cmd);
      }
    }
  }
}

let entree;
try {
  entree = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  refuser('entrée du hook illisible', '');
}
if (!ARBRE) refuser("PISTES_ARBRE absent : la garde ne sait pas où l'agent a le droit d'écrire", '');

const outil = entree.tool_name ?? '';
const args = entree.tool_input ?? {};
const cwd = entree.cwd ?? '';

if (outil === 'Bash') verifierCommande(String(args.command ?? ''), cwd);
else if (outil === 'WebFetch' && /takussan\.com/i.test(String(args.url ?? ''))) refuser('aucun accès à un environnement déployé', args.url);
else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(outil)) verifierChemin(String(args.file_path ?? args.notebook_path ?? ''), cwd);
process.exit(0);
