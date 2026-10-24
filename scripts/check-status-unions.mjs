#!/usr/bin/env node
/**
 * Garde : chaque enum `*Status` de l'API a, au front, une union qui porte EXACTEMENT ses cas — ni
 * un de moins, ni un de plus (TCK-1834, P146.04).
 *
 * **Pourquoi.** P146.01 à P146.03, et P115.02 avant elles, avaient la même cause : chaque écran
 * recopiait à la main la liste des statuts, et rien ne la comparait à l'enum de l'API. Un paiement
 * de réservation `failed` s'affichait brut sur un ton neutre ; une échéance `refunded` se lisait
 * « Autre » ; trois statuts de bien manquaient aux filtres. `tsc` attrape un cas oublié dans une
 * table `Record<Union, …>`, mais seulement face à l'union du FRONT : si l'union elle-même a oublié
 * un cas de l'API, tout reste vert. Cette garde ferme ce second écart.
 *
 * **Ce qu'elle lit.**
 *   · Côté API : les `case X = 'valeur';` de chaque `enum …Status: string` de
 *     `takussan-api/app/Models/Enums/`.
 *   · Côté front : une `export type Nom = 'a' | 'b' …;` (ou `(typeof CONST)[number]`), ou une
 *     `export const nom = ['a', …, ...autreConst] as const;`, dans le fichier que désigne
 *     `CORRESPONDANCES`. Une union qui n'est pas faite que de littéraux (`| string`, objet) est
 *     refusée : une union ouverte ne garde rien.
 *
 * **Trois tables, toutes bilatérales.**
 *   · `CORRESPONDANCES` : enum → unions du front qui le portent.
 *   · `SANS_UNION` : enum `*Status` qu'aucune union NOMMÉE du front ne porte, avec sa raison. Un
 *     enum neuf qui n'est dans aucune des deux tables fait échouer la garde ; une entrée qui n'est
 *     plus un enum aussi.
 *   · `ECARTS` : un écart VOULU entre un enum et une union. Il ne se déclare qu'avec la décision
 *     écrite qui le fonde — une Réf de piste (`P146.02`), un ticket (`TCK-NNN`) ou une ancre de spec
 *     (`docs/features.md…`) — et s'il ne correspond plus à un écart réel, la garde échoue aussi : un
 *     écart déclaré ne survit pas à sa correction. Un écart sans décision écrite ne se fige pas ici :
 *     il revient au porteur (décision de P146.04).
 *
 * ## Ce qu'elle NE prouve PAS
 *
 *   · Que les ÉCRANS lisent l'union : une table typée `Record<string, …>` lui échappe. C'est `tsc`
 *     qui tient les tables, une fois typées `Record<Union, …>` (TCK-1834 l'a fait pour les onze
 *     tables de P146.04).
 *   · Les unions anonymes (`status: 'a' | 'b'` dans une interface) : un enum qui n'a qu'elles est
 *     dans `SANS_UNION`.
 *   · Les statuts qui ne sont pas des enums de l'API (les constantes d'`IntegrationService`,
 *     d'`IntegrationWebhookLog`…).
 *   · Les libellés : qu'un cas ait sa traduction relève de `check-i18n`.
 *
 * ## Ses propres tests
 *
 * `CAS_EPREUVE` tourne à CHAQUE invocation sur des sources figées : cas absent, cas en trop, union
 * ouverte, `(typeof X)[number]`, tableau constant avec `...spread`, écart déclaré avec et sans
 * décision, écart déclaré mais résorbé, enum non classé. Une garde dont le motif régresse sort en 1
 * sur elle-même.
 *
 * Usage :
 *   node scripts/check-status-unions.mjs            # garde
 *   node scripts/check-status-unions.mjs --report   # + une ligne par enum
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const ENUMS_DIR = join(ROOT, 'takussan-api/app/Models/Enums');
const WEB = join(ROOT, 'takussan-web');

/** Enum de l'API → unions du front (`fichier` relatif à `takussan-web/`, `nom` du type ou du tableau). */
const CORRESPONDANCES = {
  AgencyStatus: [{ fichier: 'src/types/agency.ts', nom: 'AgencyStatus' }],
  AgencyUpgradeRequestStatus: [{ fichier: 'src/types/agency-upgrade.ts', nom: 'AgencyUpgradeRequestStatus' }],
  BankStatementLineMatchStatus: [{ fichier: 'src/types/reconciliation.ts', nom: 'BankLineMatchStatus' }],
  BankStatementStatus: [{ fichier: 'src/types/reconciliation.ts', nom: 'BankStatementStatus' }],
  BookingStatus: [{ fichier: 'src/types/booking.ts', nom: 'BookingStatus' }],
  CommissionEntryStatus: [{ fichier: 'src/lib/queries/commissions.ts', nom: 'CommissionEntryStatus' }],
  ConversationStatus: [{ fichier: 'src/types/message.ts', nom: 'ConversationStatus' }],
  CustomerStatus: [{ fichier: 'src/types/customer.ts', nom: 'CustomerStatus' }],
  DataExportStatus: [{ fichier: 'src/types/super-admin.ts', nom: 'DataExportStatus' }],
  InventoryStatus: [{ fichier: 'src/types/inventory.ts', nom: 'InventoryStatus' }],
  InvoiceStatus: [{ fichier: 'src/types/invoice.ts', nom: 'InvoiceStatus' }],
  KycDossierStatus: [{ fichier: 'src/types/super-admin.ts', nom: 'KycDossierStatus' }],
  LeaseStatus: [{ fichier: 'src/types/lease.ts', nom: 'LeaseStatus' }],
  MaintenanceStatus: [{ fichier: 'src/types/maintenance.ts', nom: 'MaintenanceStatus' }],
  OwnerProfileStatus: [{ fichier: 'src/lib/queries/owners.ts', nom: 'OwnerProfileStatus' }],
  PaymentStatus: [
    { fichier: 'src/types/booking.ts', nom: 'BookingPaymentStatus' },
    { fichier: 'src/types/lease.ts', nom: 'LeasePaymentStatus' },
  ],
  PayoutStatus: [{ fichier: 'src/types/invoice.ts', nom: 'PayoutStatus' }],
  PlatformPayoutStatus: [{ fichier: 'src/types/super-admin.ts', nom: 'PlatformPayoutStatus' }],
  PrivacyRequestStatus: [{ fichier: 'src/types/privacy-request.ts', nom: 'PrivacyRequestStatus' }],
  // Les onze cas, pour filtrer ; les gestes n'en portent que huit (`propertyStatusValues`, TCK-1268).
  PropertyStatus: [{ fichier: 'src/lib/enums/property.ts', nom: 'propertyStatusFilterValues' }],
  ReferentialStatus: [
    { fichier: 'src/types/tag.ts', nom: 'TagStatus' },
    { fichier: 'src/types/geo.ts', nom: 'GeoNeighborhoodStatus' },
  ],
  ReviewStatus: [{ fichier: 'src/lib/queries/reviews.ts', nom: 'ReviewStatus' }],
  RoleDelegationStatus: [{ fichier: 'src/types/role-delegation.ts', nom: 'RoleDelegationStatus' }],
  ScheduledTaskRunStatus: [{ fichier: 'src/types/super-admin.ts', nom: 'ScheduledTaskStatus' }],
  ServiceProviderBillStatus: [{ fichier: 'src/types/invoice.ts', nom: 'ServiceProviderBillStatus' }],
  ServiceProviderProfileStatus: [
    { fichier: 'src/lib/queries/service-providers.ts', nom: 'ServiceProviderProfileStatus' },
  ],
  TaskStatus: [{ fichier: 'src/types/pipeline.ts', nom: 'TaskStatus' }],
  UserStatus: [{ fichier: 'src/types/user.ts', nom: 'UserStatus' }],
  VisitStatus: [{ fichier: 'src/types/visit.ts', nom: 'VisitStatus' }],
};

/** Enum `*Status` qu'aucune union nommée du front ne porte, et pourquoi (relevé du 2026-10-23). */
const SANS_UNION = {
  AgencyAdminProfileStatus: 'aucune union nommée au front',
  AgencySubscriptionStatus: 'union anonyme seulement (`types/super-admin.ts`, champ `status` d\'un abonnement)',
  AgentProfileStatus: 'aucune union nommée au front',
  BoostStatus: 'aucune union nommée au front',
  CollaborationStatus: 'aucune union nommée au front',
  InvitationStatus: 'unions anonymes seulement (`lib/queries/owners.ts`, `lib/queries/service-providers.ts`)',
  RelationshipStatus: 'union anonyme ouverte seulement (`types/customer.ts`, `… | string`)',
};

/**
 * Écarts voulus : `{ enum, nom, absents: [...], enTrop: [...], decision }`. `decision` cite la
 * décision écrite qui fonde l'écart (Réf de piste, ticket ou spec). Vide au 2026-10-23 : les unions
 * mises en correspondance portent toutes les cas de leur enum, à l'identique.
 */
const ECARTS = [];

const DECISION_ECRITE = /\bP\d{2,3}\.\d{2}\b|\bTCK-\d+\b|docs\/(features|models-spec)\.md/;

// ─── Lecture ────────────────────────────────────────────────────────────────

/** Les cas d'un enum PHP adossé à des chaînes, ou `null` si ce n'en est pas un. */
export function casDeLEnum(source) {
  if (!/\benum\s+\w+\s*:\s*string\b/.test(source)) return null;
  return [...source.matchAll(/^\s*case\s+\w+\s*=\s*'([^']*)'\s*;/gm)].map((m) => m[1]);
}

function sansCommentaires(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Le corps d'une déclaration jusqu'au `;` de premier niveau. */
function corps(source, debut) {
  let prof = 0;
  for (let i = debut; i < source.length; i++) {
    const c = source[i];
    if (c === "'" || c === '"') {
      const fin = source.indexOf(c, i + 1);
      i = fin === -1 ? source.length : fin;
    } else if ('([{'.includes(c)) prof++;
    else if (')]}'.includes(c)) prof--;
    else if (c === ';' && prof === 0) return source.slice(debut, i);
  }
  return source.slice(debut);
}

/**
 * Les valeurs d'une union littérale ou d'un tableau constant nommés `nom` dans `source`.
 * Lève une erreur lisible si la déclaration est absente ou n'est pas fermée.
 */
export function valeursDuFront(source, nom, vus = new Set()) {
  if (vus.has(nom)) throw new Error(`référence circulaire sur \`${nom}\``);
  vus.add(nom);
  const src = sansCommentaires(source);
  const type = new RegExp(`export\\s+type\\s+${nom}\\s*=`).exec(src);
  const tableau = new RegExp(`(?:export\\s+)?const\\s+${nom}\\s*(?::[^=]+)?=\\s*\\[`).exec(src);
  if (type) {
    const b = corps(src, type.index + type[0].length).trim();
    const typeOf = /^\(\s*typeof\s+(\w+)\s*\)\s*\[\s*number\s*\]$/.exec(b);
    if (typeOf) return valeursDuFront(source, typeOf[1], vus);
    const morceaux = b.split('|').map((m) => m.trim()).filter(Boolean);
    const valeurs = [];
    for (const m of morceaux) {
      const lit = /^'([^']*)'$|^"([^"]*)"$/.exec(m);
      if (!lit) throw new Error(`\`${nom}\` n'est pas une union de littéraux (\`${m}\`)`);
      valeurs.push(lit[1] ?? lit[2]);
    }
    return valeurs;
  }
  if (tableau) {
    const b = corps(src, tableau.index + tableau[0].length - 1);
    const interieur = b.slice(1, b.lastIndexOf(']'));
    const valeurs = [];
    for (const m of interieur.split(',').map((x) => x.trim()).filter(Boolean)) {
      const lit = /^'([^']*)'$|^"([^"]*)"$/.exec(m);
      const spread = /^\.\.\.(\w+)$/.exec(m);
      if (lit) valeurs.push(lit[1] ?? lit[2]);
      else if (spread) valeurs.push(...valeursDuFront(source, spread[1], vus));
      else throw new Error(`\`${nom}\` contient un élément non littéral (\`${m}\`)`);
    }
    return valeurs;
  }
  throw new Error(`\`${nom}\` introuvable (ni \`export type\`, ni \`const … = [\`)`);
}

// ─── Jugement ───────────────────────────────────────────────────────────────

/**
 * @param enums        { NomEnum: ['cas', …] } — les enums `*Status` de l'API
 * @param lireFront    (fichier) => source, ou null si le fichier manque
 * @returns { erreurs: string[], lignes: string[] }
 */
export function juger({ enums, correspondances, sansUnion, ecarts, lireFront }) {
  const erreurs = [];
  const lignes = [];
  const ecartsVus = new Set();

  for (const e of ecarts) {
    if (!DECISION_ECRITE.test(e.decision ?? '')) {
      erreurs.push(
        `ECARTS : l'écart ${e.enum} ↔ ${e.nom} ne cite aucune décision écrite (Réf de piste, TCK, ou docs/features.md) — un écart sans décision revient au porteur, il ne se fige pas ici.`,
      );
    }
  }

  for (const nomEnum of Object.keys(enums).sort()) {
    const dans = [nomEnum in correspondances, nomEnum in sansUnion].filter(Boolean).length;
    if (dans === 0) {
      erreurs.push(`${nomEnum} : enum de l'API dans aucune table — l'ajouter à CORRESPONDANCES (son union du front) ou à SANS_UNION (avec sa raison).`);
      continue;
    }
    if (dans === 2) erreurs.push(`${nomEnum} : à la fois dans CORRESPONDANCES et dans SANS_UNION.`);
    if (!(nomEnum in correspondances)) {
      lignes.push(`  ·  ${nomEnum} — sans union : ${sansUnion[nomEnum]}`);
      continue;
    }
    const cas = enums[nomEnum];
    for (const cible of correspondances[nomEnum]) {
      const source = lireFront(cible.fichier);
      if (source === null) {
        erreurs.push(`${nomEnum} ↔ ${cible.nom} : fichier ${cible.fichier} introuvable.`);
        continue;
      }
      let valeurs;
      try {
        valeurs = valeursDuFront(source, cible.nom);
      } catch (err) {
        erreurs.push(`${nomEnum} ↔ ${cible.nom} (${cible.fichier}) : ${err.message}.`);
        continue;
      }
      const ecart = ecarts.find((x) => x.enum === nomEnum && x.nom === cible.nom);
      if (ecart) ecartsVus.add(ecart);
      const absentsDeclares = new Set(ecart?.absents ?? []);
      const enTropDeclares = new Set(ecart?.enTrop ?? []);
      const absents = cas.filter((c) => !valeurs.includes(c));
      const enTrop = valeurs.filter((v) => !cas.includes(v));
      for (const a of absents.filter((x) => !absentsDeclares.has(x))) {
        erreurs.push(`${nomEnum} ↔ ${cible.nom} (${cible.fichier}) : le cas « ${a} » de l'API manque à l'union du front.`);
      }
      for (const t of enTrop.filter((x) => !enTropDeclares.has(x))) {
        erreurs.push(`${nomEnum} ↔ ${cible.nom} (${cible.fichier}) : « ${t} » est dans l'union du front, pas dans l'enum de l'API.`);
      }
      for (const a of [...absentsDeclares].filter((x) => !absents.includes(x))) {
        erreurs.push(`ECARTS : « ${a} » est déclaré absent de ${cible.nom}, mais ne l'est plus — retirer la déclaration.`);
      }
      for (const t of [...enTropDeclares].filter((x) => !enTrop.includes(x))) {
        erreurs.push(`ECARTS : « ${t} » est déclaré en trop dans ${cible.nom}, mais ne l'est plus — retirer la déclaration.`);
      }
      const note = ecart ? ` (écart voulu : ${ecart.decision})` : '';
      lignes.push(`  ${absents.length + enTrop.length === 0 ? '✓' : '≠'}  ${nomEnum} ↔ ${cible.nom} — ${cas.length} cas${note}`);
    }
  }

  for (const nom of [...Object.keys(correspondances), ...Object.keys(sansUnion)]) {
    if (!(nom in enums)) erreurs.push(`${nom} : nommé dans la garde, mais n'est pas un enum \`*Status\` de l'API — retirer l'entrée.`);
  }
  for (const e of ecarts.filter((x) => !ecartsVus.has(x))) {
    erreurs.push(`ECARTS : l'écart ${e.enum} ↔ ${e.nom} ne correspond à aucune correspondance — retirer l'entrée.`);
  }

  return { erreurs, lignes };
}

// ─── Épreuve ────────────────────────────────────────────────────────────────

const CAS_EPREUVE = [
  {
    nom: 'union alignée',
    entree: { enums: { AStatus: ['a', 'b'] }, correspondances: { AStatus: [{ fichier: 'f', nom: 'A' }] }, front: { f: "export type A = 'a' | 'b';" } },
    attendu: 0,
  },
  {
    nom: 'cas de l\'API absent du front',
    entree: { enums: { AStatus: ['a', 'b', 'c'] }, correspondances: { AStatus: [{ fichier: 'f', nom: 'A' }] }, front: { f: "export type A =\n  | 'a'\n  // commentaire 'z'\n  | 'b';" } },
    attendu: 1,
  },
  {
    nom: 'cas en trop au front',
    entree: { enums: { AStatus: ['a'] }, correspondances: { AStatus: [{ fichier: 'f', nom: 'A' }] }, front: { f: "export type A = 'a' | 'z';" } },
    attendu: 1,
  },
  {
    nom: 'union ouverte refusée',
    entree: { enums: { AStatus: ['a'] }, correspondances: { AStatus: [{ fichier: 'f', nom: 'A' }] }, front: { f: "export type A = 'a' | string;" } },
    attendu: 1,
  },
  {
    nom: '(typeof X)[number] résolu',
    entree: { enums: { AStatus: ['a', 'b'] }, correspondances: { AStatus: [{ fichier: 'f', nom: 'A' }] }, front: { f: "export const AS = ['a', 'b'] as const;\nexport type A = (typeof AS)[number];" } },
    attendu: 0,
  },
  {
    nom: 'tableau constant avec spread',
    entree: { enums: { AStatus: ['a', 'b', 'c'] }, correspondances: { AStatus: [{ fichier: 'f', nom: 'tout' }] }, front: { f: "export const base = ['a', 'b'] as const;\nexport const tout = [\n  ...base,\n  'c',\n] as const;" } },
    attendu: 0,
  },
  {
    nom: 'écart déclaré avec sa décision',
    entree: { enums: { AStatus: ['a', 'b'] }, correspondances: { AStatus: [{ fichier: 'f', nom: 'A' }] }, ecarts: [{ enum: 'AStatus', nom: 'A', absents: ['b'], decision: 'P146.02' }], front: { f: "export type A = 'a';" } },
    attendu: 0,
  },
  {
    nom: 'écart déclaré sans décision écrite',
    entree: { enums: { AStatus: ['a', 'b'] }, correspondances: { AStatus: [{ fichier: 'f', nom: 'A' }] }, ecarts: [{ enum: 'AStatus', nom: 'A', absents: ['b'], decision: 'voulu' }], front: { f: "export type A = 'a';" } },
    attendu: 1,
  },
  {
    nom: 'écart déclaré mais résorbé',
    entree: { enums: { AStatus: ['a', 'b'] }, correspondances: { AStatus: [{ fichier: 'f', nom: 'A' }] }, ecarts: [{ enum: 'AStatus', nom: 'A', absents: ['b'], decision: 'TCK-1' }], front: { f: "export type A = 'a' | 'b';" } },
    attendu: 1,
  },
  {
    nom: 'enum neuf non classé',
    entree: { enums: { AStatus: ['a'], BStatus: ['x'] }, correspondances: { AStatus: [{ fichier: 'f', nom: 'A' }] }, front: { f: "export type A = 'a';" } },
    attendu: 1,
  },
  {
    nom: 'entrée qui ne désigne plus un enum',
    entree: { enums: {}, correspondances: {}, sansUnion: { GoneStatus: 'raison' }, front: {} },
    attendu: 1,
  },
];

function epreuve() {
  const ratees = [];
  for (const c of CAS_EPREUVE) {
    const e = c.entree;
    const { erreurs } = juger({
      enums: e.enums,
      correspondances: e.correspondances,
      sansUnion: e.sansUnion ?? {},
      ecarts: e.ecarts ?? [],
      lireFront: (f) => e.front[f] ?? null,
    });
    if (erreurs.length !== c.attendu) ratees.push(`${c.nom} : ${erreurs.length} erreur(s), ${c.attendu} attendue(s)${erreurs.length ? ` — ${erreurs.join(' | ')}` : ''}`);
  }
  return ratees;
}

// ─── Exécution ──────────────────────────────────────────────────────────────

function enumsDeLApi() {
  const enums = {};
  for (const f of readdirSync(ENUMS_DIR).filter((x) => /Status\.php$/.test(x))) {
    const cas = casDeLEnum(readFileSync(join(ENUMS_DIR, f), 'utf8'));
    if (cas) enums[f.replace(/\.php$/, '')] = cas;
  }
  return enums;
}

const estAppelDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (estAppelDirect) {
  const ratees = epreuve();
  if (ratees.length) {
    console.error('✗ check-status-unions : la garde échoue sur ses propres cas d\'épreuve :');
    for (const r of ratees) console.error(`  - ${r}`);
    process.exit(1);
  }
  const { erreurs, lignes } = juger({
    enums: enumsDeLApi(),
    correspondances: CORRESPONDANCES,
    sansUnion: SANS_UNION,
    ecarts: ECARTS,
    lireFront: (f) => (existsSync(join(WEB, f)) ? readFileSync(join(WEB, f), 'utf8') : null),
  });
  if (REPORT) {
    console.log('Enums `*Status` de l\'API face aux unions du front :');
    for (const l of lignes) console.log(l);
  }
  if (erreurs.length) {
    console.error(`✗ check-status-unions : ${erreurs.length} écart(s) entre les enums de statut de l'API et les unions du front :`);
    for (const e of erreurs) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✓ check-status-unions : ${Object.keys(CORRESPONDANCES).length} enums de statut alignés sur leurs unions du front, ${Object.keys(SANS_UNION).length} sans union nommée, ${ECARTS.length} écart(s) voulu(s) ; ${CAS_EPREUVE.length} cas d'épreuve verts.`);
}
