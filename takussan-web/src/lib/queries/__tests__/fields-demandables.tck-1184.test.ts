import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * TCK-1184 (P100.04), TCK-1186 (P100.05) — toute colonne que le front demande par `fields[<table>]` est dans le
 * `$queryFields` d'un modèle de cette table.
 *
 * spatie refuse en 400 (`InvalidFieldQuery`) un `fields` qui nomme une colonne hors de la liste
 * blanche : c'est ce qui a cassé la page de passage en agence (TCK-1029), que seul un test propre à
 * sa constante gardait. Cette garde est la générale : elle lit les deux côtés, rien n'est recopié.
 * - l'API : `$queryFields` de chaque modèle de `takussan-api/app/Models`, sa table prise dans
 *   `$table` ou déduite du nom de classe. Une table imbriquée (`include=property` +
 *   `fields[properties]`) est jugée contre le modèle de SA table, comme le fait `HasQueryBuilder`
 *   (`getAllAllowedQueryFields`) ;
 * - le front : les objets `fields: { <table>: … }` de `src/` (tableaux littéraux, constantes
 *   `*_FIELDS` et leurs `...` résolues dans tout `src/`) et les `fields[<table>]=…` écrits en dur.
 *
 * Limite : une colonne passée en paramètre de fonction (`inventory.ts`, `maintenance.ts`) n'est
 * pas suivie, et une expression calculée hors tableau littéral non plus.
 *
 * Une table que l'API n'ouvre pas à `buildQuery` reçoit un `fields` inerte, ni honoré ni refusé :
 * elle est nommée dans `HORS_BUILD_QUERY`, avec sa raison (P100.05). Une entrée neuve s'y ajoute en
 * le disant dans le fichier du front qui l'envoie.
 */
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const MODELES = join(RACINE, 'takussan-api', 'app', 'Models');
const SRC = join(RACINE, 'takussan-web', 'src');

/** Tables dont le `fields` n'est lu par aucun endpoint : la liste écrite à la main l'ignore. */
const HORS_BUILD_QUERY: Record<string, string> = {
  conversations: 'ConversationController : liste écrite à la main, `Conversation::$queryFields` vide',
  messages: 'ConversationController::messages : liste écrite à la main, `Message::$queryFields` vide',
  lease_payments: 'LeasePaymentController::index : liste écrite à la main (TCK-1178), `LeasePayment::$queryFields` vide',
  reviews: 'ReviewController (modération) : filtres et tri lus à la main, `Review::$queryFields` vide',
  saved_searches: 'SavedSearchController::index : liste écrite à la main, `SavedSearch::$queryFields` vide',
  profiles: 'Me\\MeProfilesController::index : profils assemblés à la main, aucune table `profiles`',
  personal_access_tokens: 'Admin\\UserDetailController::sessions : liste écrite à la main, aucun modèle à `$queryFields`',
  moderation: 'Admin\\ModerationQueueController::index : file assemblée à la main, aucune table `moderation`',
  radar_observatory: 'Admin\\RadarObservatoryController::market (TCK-2393) : les SECTIONS du marché, lues par RadarObservatoryRequest — aucune table `radar_observatory`',
};

/** Sites d'appel dont l'endpoint ignore `fields` alors que le modèle de la table l'ouvrirait. */
const SITES_HORS_BUILD_QUERY: Record<string, string> = {
  'lib/queries/super-admin.ts#agencies': 'Admin\\AgencyModerationController::index, liste écrite à la main',
  'lib/queries/property-moderation.ts#properties': 'Admin\\PropertyModerationController, liste écrite à la main (en-tête du fichier)',
  'app/(super-admin)/super-admin/users/page.tsx#users': 'Admin\\UserDetailController::index, liste écrite à la main',
};

function fichiers(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((nom) => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' ? [] : fichiers(chemin, ext);
    return ext.test(nom) ? [chemin] : [];
  });
}

function pluriel(snake: string): string {
  if (/[^aeiou]y$/.test(snake)) return `${snake.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(snake)) return `${snake}es`;
  return `${snake}s`;
}

/** table → colonnes demandables (union des modèles de la table). */
function colonnesParTable(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const f of fichiers(MODELES, /\.php$/)) {
    const php = readFileSync(f, 'utf8');
    const bloc = /static array \$queryFields = \[([\s\S]*?)\];/.exec(php);
    const classe = /^(?:final |abstract )?class (\w+)/m.exec(php);
    if (!bloc || !classe) continue;
    const table =
      /protected \$table = '([a-z_]+)'/.exec(php)?.[1] ??
      pluriel(classe[1].replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase());
    const cols = tables.get(table) ?? new Set<string>();
    for (const m of bloc[1].matchAll(/'([a-z0-9_]+)'/g)) cols.add(m[1]);
    tables.set(table, cols);
  }
  return tables;
}

/** Le texte équilibré qui commence à `debut` (un `{` ou un `[`). */
function equilibre(texte: string, debut: number): string {
  const ouvrant = texte[debut];
  const fermant = ouvrant === '{' ? '}' : ']';
  let n = 0;
  for (let i = debut; i < texte.length; i++) {
    if (texte[i] === ouvrant) n++;
    else if (texte[i] === fermant && --n === 0) return texte.slice(debut, i + 1);
  }
  return texte.slice(debut);
}

/** Le source sans ses commentaires : un nom de colonne cité dans un commentaire n'est pas demandé. */
function sansCommentaires(texte: string): string {
  return texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

type Constantes = { locales: Map<string, Map<string, string>>; uniques: Map<string, string> };

/**
 * Constantes tableau de `src/` : NOM → texte du tableau. Un nom se résout d'abord dans le fichier
 * qui l'emploie, puis dans tout `src/` s'il n'y est défini qu'une fois (les `LIST_FIELDS` de
 * plusieurs modules ne se confondent pas).
 */
function constantes(sources: Map<string, string>): Constantes {
  const locales = new Map<string, Map<string, string>>();
  const vues = new Map<string, string[]>();
  for (const [f, texte] of sources) {
    const ici = new Map<string, string>();
    for (const m of texte.matchAll(/(?:const|let) ([A-Z][A-Z0-9_]*)(?:\s*:[^=]+)?\s*=\s*\[/g)) {
      const corps = equilibre(texte, m.index! + m[0].length - 1);
      ici.set(m[1], corps);
      vues.set(m[1], [...(vues.get(m[1]) ?? []), corps]);
    }
    locales.set(f, ici);
  }
  const uniques = new Map([...vues].filter(([, c]) => c.length === 1).map(([n, c]) => [n, c[0]]));
  return { locales, uniques };
}

function colonnesDe(expr: string, fichier: string, consts: Constantes, vus = new Set<string>()): string[] {
  const cols = [...expr.matchAll(/'([a-z0-9_.]+)'/g)].map((m) => m[1]);
  for (const m of expr.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) {
    const corps = consts.locales.get(fichier)?.get(m[1]) ?? consts.uniques.get(m[1]);
    if (corps && !vus.has(m[1])) {
      vus.add(m[1]);
      cols.push(...colonnesDe(corps, fichier, consts, vus));
    }
  }
  return cols;
}

type Demande = { site: string; table: string; colonnes: string[] };

function demandes(): Demande[] {
  const sources = new Map(fichiers(SRC, /\.tsx?$/).map((f) => [f, sansCommentaires(readFileSync(f, 'utf8'))]));
  const consts = constantes(sources);
  const out: Demande[] = [];
  for (const [f, texte] of sources) {
    const site = relative(SRC, f);
    for (const m of texte.matchAll(/\bfields\??\s*:\s*\{/g)) {
      const objet = equilibre(texte, m.index! + m[0].length - 1).slice(1, -1);
      // Entrées de premier niveau : `table: <expression>` jusqu'à la virgule de même niveau.
      let i = 0;
      while (i < objet.length) {
        const cle = /^\s*([a-z_]+)\s*:\s*/.exec(objet.slice(i));
        if (!cle) {
          const virgule = objet.indexOf(',', i);
          if (virgule < 0) break;
          i = virgule + 1;
          continue;
        }
        let j = i + cle[0].length;
        let n = 0;
        for (; j < objet.length; j++) {
          const c = objet[j];
          if ('[({'.includes(c)) n++;
          else if (')]}'.includes(c)) n--;
          else if (c === ',' && n === 0) break;
        }
        out.push({ site, table: cle[1], colonnes: colonnesDe(objet.slice(i + cle[0].length, j), f, consts) });
        i = j + 1;
      }
    }
    for (const m of texte.matchAll(/['"]fields\[([a-z_]+)\]['"]\s*,\s*['"`]([a-z0-9_,.]+)['"`]/g)) {
      out.push({ site, table: m[1], colonnes: m[2].split(',') });
    }
    for (const m of texte.matchAll(/fields\[([a-z_]+)\]=([a-z0-9_,.]+)/g)) {
      out.push({ site, table: m[1], colonnes: m[2].split(',') });
    }
  }
  return out;
}

describe('fields[…] du front face aux $queryFields de l’API (TCK-1184)', () => {
  const tables = colonnesParTable();
  const toutes = demandes();

  it('lit assez des deux côtés pour juger (plancher de vacuité)', () => {
    // Mesuré le 2026-10-21 : 50 tables à `$queryFields`, 86 demandes `fields[<table>]` dans le
    // front, dont 84 aux colonnes résolues. Les 2 autres (`inventory.ts`, `maintenance.ts`)
    // reçoivent leurs colonnes en paramètre de fonction, que cette lecture ne suit pas.
    expect(tables.size).toBeGreaterThanOrEqual(45);
    expect(toutes.length).toBeGreaterThanOrEqual(80);
    expect(toutes.filter((d) => d.colonnes.length > 0).length).toBeGreaterThanOrEqual(78);
  });

  it('ne demande aucune colonne qu’un modèle de la table ne permette', () => {
    const fautes: string[] = [];
    for (const { site, table, colonnes } of toutes) {
      if (table in HORS_BUILD_QUERY || `${site}#${table}` in SITES_HORS_BUILD_QUERY) continue;
      const permises = tables.get(table);
      if (!permises) {
        fautes.push(`${site} : fields[${table}] vise une table sans $queryFields`);
        continue;
      }
      const refusees = colonnes.filter((c) => !permises.has(c.replace(/^[a-z_]+\./, '')));
      if (refusees.length) fautes.push(`${site} : fields[${table}] refusées → ${refusees.join(', ')}`);
    }
    expect(fautes).toEqual([]);
  });

  /**
   * TCK-1186 (P100.05) — un `fields` envoyé à une liste qui ne le lit pas se dit dans le fichier
   * qui l'envoie, comme `property-moderation.ts` : sinon il se lit comme une charge réduite.
   */
  it('chaque fichier qui envoie un fields inerte le dit', () => {
    const muets = [
      ...new Set(
        toutes
          .filter((d) => d.table in HORS_BUILD_QUERY || `${d.site}#${d.table}` in SITES_HORS_BUILD_QUERY)
          .map((d) => d.site),
      ),
    ].filter((site) => !/fields[^\n]*(inerte|non lus?\b)|inerte[^\n]*fields/i.test(readFileSync(join(SRC, site), 'utf8')));
    expect(muets).toEqual([]);
  });

  it('chaque exception nomme encore une demande réelle', () => {
    for (const table of Object.keys(HORS_BUILD_QUERY)) {
      expect(toutes.some((d) => d.table === table), `HORS_BUILD_QUERY.${table} n’a plus d’envoi`).toBe(true);
      expect(tables.has(table), `${table} a désormais un $queryFields : retirer l’exception`).toBe(false);
    }
    for (const cle of Object.keys(SITES_HORS_BUILD_QUERY)) {
      expect(toutes.some((d) => `${d.site}#${d.table}` === cle), `${cle} n’envoie plus ce fields`).toBe(true);
    }
  });
});
