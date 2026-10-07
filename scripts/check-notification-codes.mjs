#!/usr/bin/env node
/**
 * Garde des CODES de notification (TCK-588, ADR-0032) : chaque cas de `NotificationCode` a son
 * texte des deux côtés, dans les trois langues, avec les mêmes paramètres.
 *
 * **Pourquoi elle existe.** Une notification n'est plus une phrase écrite par l'API : c'est un code
 * et des paramètres bruts, rendus dans la langue du destinataire — par l'API pour l'e-mail, le SMS
 * et la ligne stockée (`takussan-api/lang/{fr,en,wo}/notifications.php`, `codes.<code>`), par le
 * front pour la cloche (`takussan-web/src/messages/{fr,en,wo}.json`, `notifications.codes.<code>`).
 * Un code ajouté à l'enum sans son texte ne lève RIEN : le front retombe sur le titre stocké, l'API
 * sur la langue de repli — l'utilisateur wolof lit de l'anglais, et aucun test n'est rouge.
 *
 * Ce qu'elle vérifie, pour chaque cas de l'enum :
 *   1. API : `codes.<code>.{title,body,sms}` dans les trois fichiers `notifications.php` ;
 *   2. front : `notifications.codes.<code>.{title,body}` dans les trois dictionnaires ;
 *   3. paramètres : pour `title` et `body`, les placeholders du front (`{amount}`, et la variable
 *      d'un `plural`) sont ceux de l'API (`:amount`) dans la même langue. Un placeholder retiré
 *      d'une seule traduction, d'un côté ou de l'autre, rougit.
 *
 * Elle lit les fichiers PHP sans PHP (le job « Dépôt » n'en installe pas) : l'enum par ses lignes
 * `case X = 'a.b';`, les fichiers de langue par un petit lecteur de tableaux PHP littéraux — ils ne
 * contiennent que des chaînes et des tableaux. Un fichier qu'il ne sait pas lire fait ÉCHOUER la
 * garde plutôt que de passer en silence.
 *
 * Usage :
 *   node scripts/check-notification-codes.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-notification-codes.mjs --report   # + l'inventaire des codes
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const LOCALES = ['fr', 'en', 'wo'];

const ENUM = join(ROOT, 'takussan-api', 'app', 'Domain', 'Notifications', 'NotificationCode.php');
const apiLang = (locale) => join(ROOT, 'takussan-api', 'lang', locale, 'notifications.php');
const webMessages = (locale) => join(ROOT, 'takussan-web', 'src', 'messages', `${locale}.json`);

const rel = (path) => path.slice(ROOT.length + 1);

for (const path of [ENUM, ...LOCALES.map(apiLang), ...LOCALES.map(webMessages)]) {
  if (!existsSync(path)) {
    console.error(`✗ ${rel(path)} est introuvable — la garde ne peut rien vérifier.`);
    process.exit(1);
  }
}

const codes = [...readFileSync(ENUM, 'utf8').matchAll(/^\s*case\s+\w+\s*=\s*'([a-z0-9_.]+)';/gm)].map((m) => m[1]);
if (codes.length === 0) {
  // Une garde qui parcourt une liste vide passe au vert sans rien avoir vérifié.
  console.error(`✗ aucun cas lu dans ${rel(ENUM)} — la garde n'aurait rien vérifié.`);
  process.exit(1);
}

/**
 * Lit le tableau littéral renvoyé par un fichier de langue PHP : `return [ 'clé' => 'texte',
 * 'groupe' => [ … ], … ];`. Chaînes entre apostrophes ou guillemets, commentaires `//`, `#` et
 * `/* … *\/`. Rien d'autre n'est admis : une expression inattendue lève.
 */
function lirePhp(path) {
  const src = readFileSync(path, 'utf8');
  let i = src.indexOf('return');
  if (i < 0) throw new Error(`${rel(path)} : pas de « return »`);
  i += 'return'.length;

  const blanc = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith('//', i) || src[i] === '#') {
        while (i < src.length && src[i] !== '\n') i++;
      } else if (src.startsWith('/*', i)) {
        i = src.indexOf('*/', i) + 2;
      } else return;
    }
  };
  const chaine = () => {
    const quote = src[i++];
    let out = '';
    while (src[i] !== quote) {
      if (i >= src.length) throw new Error(`${rel(path)} : chaîne non terminée`);
      if (src[i] === '\\' && (src[i + 1] === quote || src[i + 1] === '\\')) i++;
      out += src[i++];
    }
    i++;
    return out;
  };
  const valeur = () => {
    blanc();
    if (src[i] === "'" || src[i] === '"') return chaine();
    if (src[i] !== '[') throw new Error(`${rel(path)} : expression non littérale à l'octet ${i}`);
    i++;
    const out = {};
    for (;;) {
      blanc();
      if (src[i] === ']') {
        i++;
        return out;
      }
      const cle = valeur();
      blanc();
      if (!src.startsWith('=>', i)) throw new Error(`${rel(path)} : « => » attendu à l'octet ${i}`);
      i += 2;
      out[cle] = valeur();
      blanc();
      if (src[i] === ',') i++;
    }
  };

  return valeur();
}

const chemin = (objet, path) => path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), objet);

/** `:amount` → amount. Comme `LangGroupParityTest` : jamais `::` ni « Takussan : ». */
const placeholdersApi = (texte) => [...new Set([...texte.matchAll(/(?<![\w:]):([a-zA-Z_]\w*)/g)].map((m) => m[1]))].sort();

/** `{amount}`, `{days, plural, …}` → amount, days. Les branches d'un `plural` sont lues aussi. */
const placeholdersIcu = (texte) => [...new Set([...texte.matchAll(/\{\s*([a-zA-Z_]\w*)\s*[,}]/g)].map((m) => m[1]))].sort();

const erreurs = [];
const api = {};
const web = {};
for (const locale of LOCALES) {
  try {
    api[locale] = lirePhp(apiLang(locale));
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
  web[locale] = JSON.parse(readFileSync(webMessages(locale), 'utf8'));
}

for (const code of codes) {
  for (const locale of LOCALES) {
    for (const surface of ['title', 'body', 'sms']) {
      if (typeof chemin(api[locale], `codes.${code}.${surface}`) !== 'string') {
        erreurs.push(`API ${locale} : codes.${code}.${surface} absente (${rel(apiLang(locale))})`);
      }
    }
    for (const surface of ['title', 'body']) {
      const front = chemin(web[locale], `notifications.codes.${code}.${surface}`);
      if (typeof front !== 'string') {
        erreurs.push(`front ${locale} : notifications.codes.${code}.${surface} absente (${rel(webMessages(locale))})`);
        continue;
      }
      const back = chemin(api[locale], `codes.${code}.${surface}`);
      if (typeof back !== 'string') continue;
      const attendus = placeholdersApi(back).join(',');
      const obtenus = placeholdersIcu(front).join(',');
      if (attendus !== obtenus) {
        erreurs.push(`${locale} ${code}.${surface} : placeholders API [${attendus}] ≠ front [${obtenus}]`);
      }
    }
  }
}

if (REPORT) {
  console.log(`Codes de notification : ${codes.length} (${rel(ENUM)})`);
  for (const code of codes) console.log(`  ${code}`);
  console.log();
}

if (erreurs.length > 0) {
  console.error(`✗ ${erreurs.length} écart(s) sur ${codes.length} codes :`);
  for (const e of erreurs) console.error(`  ${e}`);
  process.exit(1);
}

console.log(`✓ ${codes.length} codes de notification : texte API (title, body, sms) et front (title, body) en fr, en et wo, mêmes paramètres.`);
