#!/usr/bin/env node
/**
 * Garde : chaque statut que l'API émet et qu'un écran traduit a sa clé au dictionnaire, cas par cas
 * (TCK-2127, P219.03).
 *
 * **Pourquoi.** La chaîne d'un statut est tenue maillon par maillon : `check-status-unions` confronte
 * l'union du front à l'enum de l'API, `tsc` confronte la table de tons `Record<Union, …>` à l'union.
 * Le dernier maillon, le libellé, n'était tenu par rien : les messages next-intl ne sont pas typés
 * (`t()` accepte toute chaîne), et `check-i18n` compare les langues entre elles, pas au code. Un cas
 * ajouté à l'enum, à l'union et aux tons, mais pas au dictionnaire, passait toutes les gardes et
 * s'affichait en clé brute (`commissions.status.<cas>`) — ou levait `MISSING_MESSAGE` hors
 * production. Mesuré avant cette garde : retirer `commissions.status.due` des trois dictionnaires
 * laissait `check-status-unions` et `check-i18n` verts.
 *
 * **Ce qu'elle lit.**
 *   · Les cas des enums `*Status` de `takussan-api/app/Models/Enums/` (même lecture que
 *     `check-status-unions`, dont elle importe `casDeLEnum`).
 *   · Les clés de `EditablePlatformSettings::all()` et les décisions de
 *     `UnifiedModerationService::DECISIONS` : deux listes de l'API qui ne sont pas des enums, et que
 *     la console traduit clé par clé.
 *   · `takussan-web/src/messages/fr.json`. Le français seul : la parité `en`/`wo` est celle de
 *     `check-i18n`.
 *
 * **Deux tables, bilatérales.**
 *   · `LIBELLES` : enum → chemins du dictionnaire qu'un écran lit avec la valeur de l'API, et le
 *     fichier qui les lit. Chaque chemin doit porter une clé `fr` (une chaîne) par cas ; il peut en
 *     porter d'autres (`all`, `unknown`). Le fichier doit lire encore ce chemin : soit il le nomme
 *     en entier, soit il nomme son préfixe et interpole son dernier segment (`status.${…}`). Un
 *     écran retiré fait donc échouer son entrée, au lieu de la laisser garder un chemin mort.
 *   · `SANS_LIBELLE` : enum qu'aucun chemin complet de `LIBELLES` ne porte, avec sa raison. Un enum
 *     neuf qui n'est dans aucune des deux tables fait échouer la garde ; une entrée qui n'est plus un
 *     enum aussi.
 *
 * ## Ce qu'elle NE prouve PAS
 *
 *   · Que `LIBELLES` est complète : un écran qui lit un statut sous un espace qu'elle ne nomme pas
 *     lui échappe. Elle tient les chemins qu'on lui donne, et force à classer chaque enum.
 *   · Les espaces qui manquent déjà d'un cas et que l'écran lit derrière `t.has()` (ex. `deleted`
 *     sous `admin.users.status`) : ils ne sont pas dans la table, le repli brut y est voulu.
 *   · La justesse du texte, ni les langues autres que le français.
 *
 * ## Ses propres tests
 *
 * `CAS_EPREUVE` tourne à CHAQUE invocation sur des sources figées : chemin complet, cas absent,
 * chemin absent, valeur non textuelle, lecteur qui ne lit plus le chemin, enum non classé, entrée
 * qui ne désigne plus un enum, clé de réglage pointée, décision de modération absente.
 *
 * Usage :
 *   node scripts/check-status-labels.mjs            # garde
 *   node scripts/check-status-labels.mjs --report   # + une ligne par enum et par liste
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { casDeLEnum } from './check-status-unions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const ENUMS_DIR = join(ROOT, 'takussan-api/app/Models/Enums');
const REGLAGES_PHP = join(ROOT, 'takussan-api/app/Domain/Settings/EditablePlatformSettings.php');
const MODERATION_PHP = join(ROOT, 'takussan-api/app/Services/Admin/UnifiedModerationService.php');
const WEB_SRC = join(ROOT, 'takussan-web/src');
const FR = join(WEB_SRC, 'messages/fr.json');

/**
 * Enum de l'API → `{ chemin, lu }` : `chemin` est l'espace du dictionnaire dont les clés sont les
 * cas, `lu` le fichier (relatif à `takussan-web/src/`) qui le lit avec la valeur servie par l'API.
 * Relevé du 2026-10-24 : seuls les espaces qui portent déjà tous les cas.
 */
const LIBELLES = {
  AgencyStatus: [{ chemin: 'superAdmin.agencyStatus', lu: 'components/admin/super/agency-detail.tsx' }],
  AgencySubscriptionStatus: [{ chemin: 'billing.subscription.status', lu: 'components/billing/SubscriptionSummary.tsx' }],
  AgencyUpgradeRequestStatus: [
    { chemin: 'superAdmin.pages.upgradeRequests.status', lu: 'app/(super-admin)/super-admin/agency-upgrade-requests/page.tsx' },
    { chemin: 'agency.upgrade.status.headings', lu: 'components/agency/UpgradeRequestStatus.tsx' },
    { chemin: 'agency.upgrade.status.badges', lu: 'components/agency/UpgradeRequestStatus.tsx' },
  ],
  AiEvaluationStatus: [{ chemin: 'superAdmin.pages.ai.evaluationStatus', lu: 'components/admin/super/ai/AiChainDialog.tsx' }],
  BankStatementLineMatchStatus: [{ chemin: 'admin.reconciliation.lineStatus', lu: 'components/admin/reconciliation/StatementDetail.tsx' }],
  BankStatementStatus: [
    { chemin: 'admin.reconciliation.status', lu: 'components/admin/reconciliation/StatementsList.tsx' },
    { chemin: 'admin.reconciliation.status', lu: 'components/admin/reconciliation/StatementDetail.tsx' },
  ],
  BookingStatus: [{ chemin: 'bookings.status', lu: 'components/crm/CustomerLinkedRecords.tsx' }],
  BoostStatus: [{ chemin: 'superAdmin.boosts.statuses', lu: 'components/boost/admin/AdminBoosts.tsx' }],
  CollaborationStatus: [{ chemin: 'serviceProviders.multiAgency.status', lu: 'components/onboarding/ServiceProviderMultiAgencyWelcome.tsx' }],
  CommissionEntryStatus: [{ chemin: 'commissions.status', lu: 'components/commissions/CommissionsLedger.tsx' }],
  CustomerStatus: [{ chemin: 'crm.customerStatus', lu: 'components/customer-form/CustomerForm.tsx' }],
  DataExportStatus: [{ chemin: 'privacy.dataExports.status', lu: 'components/privacy/DataExportsPanel.tsx' }],
  InventoryStatus: [{ chemin: 'inventory.status', lu: 'components/inventory/InventoryBadges.tsx' }],
  InvoiceStatus: [{ chemin: 'payments.invoiceStatus', lu: 'components/admin/reconciliation/PayableStatusBadge.tsx' }],
  KycDossierStatus: [
    { chemin: 'kyc.status', lu: 'app/(super-admin)/super-admin/kyc/page.tsx' },
    { chemin: 'dashboard.agencyQueues.kycStatus', lu: 'components/dashboard/admin/AgencyQueues.tsx' },
  ],
  LeaseStatus: [{ chemin: 'lease.status', lu: 'components/leases/LeasesList.tsx' }],
  MaintenanceStatus: [
    { chemin: 'maintenance.status', lu: 'components/maintenance/MaintenanceStatusBadge.tsx' },
    { chemin: 'messaging.maintenanceEvents.statuses', lu: 'components/messages/useTexteMessageSysteme.ts' },
  ],
  OwnerProfileStatus: [{ chemin: 'owners.page.status', lu: 'components/owners/OwnersList.tsx' }],
  PaymentStatus: [
    { chemin: 'payments.status', lu: 'components/admin/reconciliation/PayableStatusBadge.tsx' },
    { chemin: 'lease.schedule.status', lu: 'components/leases/LeaseSchedule.tsx' },
  ],
  PayoutStatus: [{ chemin: 'payments.payoutStatus', lu: 'components/admin/reconciliation/PayableStatusBadge.tsx' }],
  PlatformPayoutStatus: [{ chemin: 'billing.platformPayouts.status', lu: 'components/admin/reconciliation/PayableStatusBadge.tsx' }],
  PrivacyRequestStatus: [{ chemin: 'superAdmin.privacyRequests.status', lu: 'components/admin/super/PrivacyRequestsConsole.tsx' }],
  PropertyStatus: [{ chemin: 'property.status', lu: 'components/admin/super/SuperAdminPropertiesTable.tsx' }],
  ReviewStatus: [
    { chemin: 'profile.reviews.status', lu: 'components/profile/ProfileReviewsList.tsx' },
    { chemin: 'admin.moderation.status', lu: 'components/admin/ModerationQueueList.tsx' },
  ],
  RoleDelegationStatus: [{ chemin: 'admin.roles.role_delegations.statuses', lu: 'components/admin/roles/RoleDelegationsSection.tsx' }],
  ScheduledTaskRunStatus: [{ chemin: 'superAdmin.scheduler.status', lu: 'components/admin/super/scheduler.tsx' }],
  ServiceProviderBillStatus: [{ chemin: 'payments.serviceProviderBills.status', lu: 'components/payments/ServiceProviderBillsTable.tsx' }],
  ServiceProviderProfileStatus: [{ chemin: 'serviceProviders.list.status', lu: 'components/service-providers/ServiceProvidersList.tsx' }],
  VisitStatus: [{ chemin: 'visits.status', lu: 'components/crm/CustomerLinkedRecords.tsx' }],
};

/** Enum `*Status` qu'aucun chemin complet de `LIBELLES` ne porte, et pourquoi (relevé du 2026-10-24). */
const SANS_LIBELLE = {
  AgencyAdminProfileStatus: 'aucun espace du dictionnaire ne porte ses trois cas (`archived` manque partout)',
  AgentProfileStatus: 'aucun écran relevé ne le traduit sous un espace complet',
  ConversationStatus: 'aucun espace du dictionnaire ne porte ses cas',
  InvitationStatus: 'aucun espace du dictionnaire ne porte ses cas',
  RadarVerificationStatus: 'TCK-2388 : `ReponseVerdict` le lit en comparaison (`pending`, `failed`) et dit chaque état par une phrase (`superAdmin.pages.radar.advertiser.reply.pending`, `.failed`) — pas par une table à un cas par clé que `LIBELLES` puisse relever',
  ReferentialStatus: 'aucun écran relevé ne le traduit sous un espace complet',
  RelationshipStatus: 'aucun écran relevé ne le traduit (`billing.subscription.status` porte ses cas par coïncidence)',
  TaskStatus: 'aucun espace du dictionnaire ne porte ses quatre cas (`done` manque)',
  UserStatus: 'les espaces lus (`admin.users.status`, `superAdmin.pages.users.statuses`) n\'ont pas `deleted`, et l\'écran les lit derrière `t.has()` ou une liste connue',
};

/** Les deux listes de l'API qui ne sont pas des enums, et les clés qu'elles exigent. */
const LISTES = [
  {
    nom: 'EditablePlatformSettings::all()',
    lu: 'components/admin/super/platform-settings.tsx',
    lecteur: 'keys.${',
    cles: (cle) => [`superAdmin.platformSettings.keys.${cle}.label`, `superAdmin.platformSettings.keys.${cle}.description`],
  },
  {
    nom: 'UnifiedModerationService::DECISIONS',
    lu: 'components/admin/super/moderation.tsx',
    lecteur: 'decisionsByType.${',
    cles: ([type, decision]) => [`superAdmin.moderation.decisionsByType.${type}.${decision}`],
  },
];

// ─── Lecture ────────────────────────────────────────────────────────────────

/** La valeur au chemin pointé (`a.b.c`), comme next-intl la résout, ou `undefined`. */
export function auChemin(messages, chemin) {
  let v = messages;
  for (const s of chemin.split('.')) {
    if (v === null || typeof v !== 'object' || !(s in v)) return undefined;
    v = v[s];
  }
  return v;
}

/** Les clés de premier niveau du tableau rendu par `EditablePlatformSettings::all()`. */
export function clesDesReglages(source) {
  const debut = source.indexOf('function all()');
  if (debut === -1) throw new Error('`function all()` introuvable');
  const ret = source.indexOf('return [', debut);
  if (ret === -1) throw new Error('`return [` introuvable dans `all()`');
  let prof = 0;
  let base = -1;
  const cles = [];
  for (let i = ret + 'return '.length; i < source.length; i++) {
    const c = source[i];
    if (c === "'") {
      const fin = source.indexOf("'", i + 1);
      if (prof === 1 && /^\s*=>/.test(source.slice(fin + 1))) cles.push(source.slice(i + 1, fin));
      i = fin;
    } else if (c === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
    } else if (c === '[') {
      if (base === -1) base = i;
      prof++;
    } else if (c === ']') {
      prof--;
      if (prof === 0) return cles;
    }
  }
  throw new Error('tableau de `all()` non fermé');
}

/** Les couples `[type, décision]` de `public const DECISIONS = [ 'type' => ['a', 'b'], … ];`. */
export function decisionsDeModeration(source) {
  const m = /const\s+DECISIONS\s*=\s*\[([\s\S]*?)\];/.exec(source);
  if (!m) throw new Error('`const DECISIONS = [...]` introuvable');
  const couples = [];
  for (const l of m[1].matchAll(/'([^']+)'\s*=>\s*\[([^\]]*)\]/g)) {
    for (const d of l[2].matchAll(/'([^']+)'/g)) couples.push([l[1], d[1]]);
  }
  if (!couples.length) throw new Error('`DECISIONS` ne contient aucune décision lisible');
  return couples;
}

/** Le fichier lit-il encore `chemin` ? En entier, ou par son préfixe et son dernier segment interpolé. */
export function litLeChemin(source, chemin) {
  if (source.includes(`'${chemin}'`) || source.includes(`"${chemin}"`) || source.includes(`\`${chemin}.`)) return true;
  const i = chemin.lastIndexOf('.');
  if (i === -1) return false;
  const prefixe = chemin.slice(0, i);
  const segment = chemin.slice(i + 1);
  return (source.includes(`'${prefixe}'`) || source.includes(`"${prefixe}"`)) && source.includes(`${segment}.\${`);
}

// ─── Jugement ───────────────────────────────────────────────────────────────

/**
 * @param enums     { NomEnum: ['cas', …] }
 * @param messages  le dictionnaire `fr`
 * @param lireFront (fichier) => source, ou null
 * @param listes    [{ nom, lu, lecteur, valeurs: [...], cles: (valeur) => [chemins] }]
 */
export function juger({ enums, libelles, sansLibelle, listes, messages, lireFront }) {
  const erreurs = [];
  const lignes = [];
  const estTexte = (c) => typeof auChemin(messages, c) === 'string';

  for (const nomEnum of Object.keys(enums).sort()) {
    const dans = [nomEnum in libelles, nomEnum in sansLibelle].filter(Boolean).length;
    if (dans === 0) {
      erreurs.push(`${nomEnum} : enum de l'API dans aucune table — l'ajouter à LIBELLES (le chemin que l'écran lit) ou à SANS_LIBELLE (avec sa raison).`);
      continue;
    }
    if (dans === 2) erreurs.push(`${nomEnum} : à la fois dans LIBELLES et dans SANS_LIBELLE.`);
    if (!(nomEnum in libelles)) {
      lignes.push(`  ·  ${nomEnum} — sans libellé gardé : ${sansLibelle[nomEnum]}`);
      continue;
    }
    for (const { chemin, lu } of libelles[nomEnum]) {
      const espace = auChemin(messages, chemin);
      if (espace === undefined || espace === null || typeof espace !== 'object') {
        erreurs.push(`${nomEnum} → ${chemin} : l'espace manque au dictionnaire fr.`);
        continue;
      }
      const absents = enums[nomEnum].filter((c) => !estTexte(`${chemin}.${c}`));
      for (const a of absents) {
        erreurs.push(`${nomEnum} → ${chemin} : le cas « ${a} » de l'API n'a pas de libellé fr (\`${chemin}.${a}\`).`);
      }
      const source = lireFront(lu);
      if (source === null) erreurs.push(`${nomEnum} → ${chemin} : le fichier lecteur ${lu} est introuvable.`);
      else if (!litLeChemin(source, chemin)) {
        erreurs.push(`${nomEnum} → ${chemin} : ${lu} ne lit plus ce chemin — corriger le lecteur, ou retirer l'entrée.`);
      }
      lignes.push(`  ${absents.length ? '≠' : '✓'}  ${nomEnum} → ${chemin} — ${enums[nomEnum].length} cas (${lu})`);
    }
  }
  for (const nom of [...Object.keys(libelles), ...Object.keys(sansLibelle)]) {
    if (!(nom in enums)) erreurs.push(`${nom} : nommé dans la garde, mais n'est pas un enum \`*Status\` de l'API — retirer l'entrée.`);
  }

  for (const liste of listes) {
    if (liste.erreur) {
      erreurs.push(`${liste.nom} : ${liste.erreur}.`);
      continue;
    }
    const absents = liste.valeurs.flatMap((v) => liste.cles(v)).filter((c) => !estTexte(c));
    for (const a of absents) erreurs.push(`${liste.nom} : la clé fr \`${a}\` manque au dictionnaire.`);
    const source = lireFront(liste.lu);
    if (source === null) erreurs.push(`${liste.nom} : le fichier lecteur ${liste.lu} est introuvable.`);
    else if (!source.includes(liste.lecteur)) erreurs.push(`${liste.nom} : ${liste.lu} ne lit plus \`${liste.lecteur}…\` — corriger la garde.`);
    lignes.push(`  ${absents.length ? '≠' : '✓'}  ${liste.nom} — ${liste.valeurs.length} valeur(s) (${liste.lu})`);
  }

  return { erreurs, lignes };
}

// ─── Épreuve ────────────────────────────────────────────────────────────────

const LECTEUR = "const t = useTranslations('ns');\nt(`status.${x}`);";
const LISTE_EPREUVE = (valeurs, lu = 'r') => [
  { nom: 'Réglages', lu, lecteur: 'keys.${', valeurs, cles: (k) => [`s.keys.${k}.label`] },
];

const CAS_EPREUVE = [
  {
    nom: 'chemin complet',
    entree: { enums: { AStatus: ['a', 'b'] }, libelles: { AStatus: [{ chemin: 'ns.status', lu: 'f' }] }, messages: { ns: { status: { a: 'A', b: 'B', all: 'Tous' } } }, front: { f: LECTEUR } },
    attendu: 0,
  },
  {
    nom: 'cas de l\'API sans libellé',
    entree: { enums: { AStatus: ['a', 'b'] }, libelles: { AStatus: [{ chemin: 'ns.status', lu: 'f' }] }, messages: { ns: { status: { a: 'A' } } }, front: { f: LECTEUR } },
    attendu: 1,
  },
  {
    nom: 'espace absent du dictionnaire',
    entree: { enums: { AStatus: ['a'] }, libelles: { AStatus: [{ chemin: 'ns.status', lu: 'f' }] }, messages: { ns: {} }, front: { f: LECTEUR } },
    attendu: 1,
  },
  {
    nom: 'libellé qui n\'est pas une chaîne',
    entree: { enums: { AStatus: ['a'] }, libelles: { AStatus: [{ chemin: 'ns.status', lu: 'f' }] }, messages: { ns: { status: { a: { court: 'A' } } } }, front: { f: LECTEUR } },
    attendu: 1,
  },
  {
    nom: 'chemin nommé en entier par le lecteur',
    entree: { enums: { AStatus: ['a'] }, libelles: { AStatus: [{ chemin: 'ns.status', lu: 'f' }] }, messages: { ns: { status: { a: 'A' } } }, front: { f: "const t = useTranslations('ns.status');\nt(x);" } },
    attendu: 0,
  },
  {
    nom: 'lecteur qui ne lit plus le chemin',
    entree: { enums: { AStatus: ['a'] }, libelles: { AStatus: [{ chemin: 'ns.status', lu: 'f' }] }, messages: { ns: { status: { a: 'A' } } }, front: { f: "const t = useTranslations('ns');\nt('autre');" } },
    attendu: 1,
  },
  {
    nom: 'lecteur introuvable',
    entree: { enums: { AStatus: ['a'] }, libelles: { AStatus: [{ chemin: 'ns.status', lu: 'g' }] }, messages: { ns: { status: { a: 'A' } } }, front: {} },
    attendu: 1,
  },
  {
    nom: 'enum neuf non classé',
    entree: { enums: { AStatus: ['a'], BStatus: ['x'] }, libelles: { AStatus: [{ chemin: 'ns.status', lu: 'f' }] }, messages: { ns: { status: { a: 'A' } } }, front: { f: LECTEUR } },
    attendu: 1,
  },
  {
    nom: 'entrée qui ne désigne plus un enum',
    entree: { enums: {}, sansLibelle: { GoneStatus: 'raison' }, messages: {}, front: {} },
    attendu: 1,
  },
  {
    nom: 'clé de réglage pointée résolue en profondeur',
    entree: { enums: {}, listes: LISTE_EPREUVE(['currency.default']), messages: { s: { keys: { currency: { default: { label: 'Devise' } } } } }, front: { r: 't(`keys.${k}.label`)' } },
    attendu: 0,
  },
  {
    nom: 'valeur de liste sans libellé',
    entree: { enums: {}, listes: LISTE_EPREUVE(['currency.default', 'boost.slots']), messages: { s: { keys: { currency: { default: { label: 'Devise' } } } } }, front: { r: 't(`keys.${k}.label`)' } },
    attendu: 1,
  },
  {
    nom: 'liste illisible côté API',
    entree: { enums: {}, listes: [{ nom: 'Réglages', erreur: '`function all()` introuvable' }], messages: {}, front: {} },
    attendu: 1,
  },
];

const SOURCES_EPREUVE = [
  {
    nom: 'clés de réglages : premier niveau seul, commentaires ignorés',
    lire: () => clesDesReglages("public static function all(): array\n{\n  return [\n    'a.b' => [\n      'type' => 'select', 'options' => ['x'],\n    ],\n    // 'faux' => [\n    'c' => ['rules' => ['present']],\n  ];\n}"),
    attendu: ['a.b', 'c'],
  },
  {
    nom: 'décisions de modération',
    lire: () => decisionsDeModeration("public const DECISIONS = [\n  'property' => ['approve', 'reject'],\n  'review' => ['hide'],\n];"),
    attendu: [['property', 'approve'], ['property', 'reject'], ['review', 'hide']],
  },
];

function epreuve() {
  const ratees = [];
  for (const c of CAS_EPREUVE) {
    const e = c.entree;
    const { erreurs } = juger({
      enums: e.enums,
      libelles: e.libelles ?? {},
      sansLibelle: e.sansLibelle ?? {},
      listes: e.listes ?? [],
      messages: e.messages,
      lireFront: (f) => e.front[f] ?? null,
    });
    if (erreurs.length !== c.attendu) ratees.push(`${c.nom} : ${erreurs.length} erreur(s), ${c.attendu} attendue(s)${erreurs.length ? ` — ${erreurs.join(' | ')}` : ''}`);
  }
  for (const s of SOURCES_EPREUVE) {
    let obtenu;
    try {
      obtenu = s.lire();
    } catch (err) {
      obtenu = `erreur : ${err.message}`;
    }
    if (JSON.stringify(obtenu) !== JSON.stringify(s.attendu)) ratees.push(`${s.nom} : ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(s.attendu)}`);
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

function listesDeLApi() {
  const lecteurs = [
    () => clesDesReglages(readFileSync(REGLAGES_PHP, 'utf8')),
    () => decisionsDeModeration(readFileSync(MODERATION_PHP, 'utf8')),
  ];
  return LISTES.map((l, i) => {
    try {
      return { ...l, valeurs: lecteurs[i]() };
    } catch (err) {
      return { nom: l.nom, erreur: err.message };
    }
  });
}

const estAppelDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (estAppelDirect) {
  const ratees = epreuve();
  if (ratees.length) {
    console.error('✗ check-status-labels : la garde échoue sur ses propres cas d\'épreuve :');
    for (const r of ratees) console.error(`  - ${r}`);
    process.exit(1);
  }
  const { erreurs, lignes } = juger({
    enums: enumsDeLApi(),
    libelles: LIBELLES,
    sansLibelle: SANS_LIBELLE,
    listes: listesDeLApi(),
    messages: JSON.parse(readFileSync(FR, 'utf8')),
    lireFront: (f) => (existsSync(join(WEB_SRC, f)) ? readFileSync(join(WEB_SRC, f), 'utf8') : null),
  });
  if (REPORT) {
    console.log('Statuts et listes de l\'API face au dictionnaire fr :');
    for (const l of lignes) console.log(l);
  }
  if (erreurs.length) {
    console.error(`✗ check-status-labels : ${erreurs.length} libellé(s) manquant(s) ou entrée(s) à revoir :`);
    for (const e of erreurs) console.error(`  - ${e}`);
    process.exit(1);
  }
  const chemins = Object.values(LIBELLES).reduce((n, l) => n + l.length, 0);
  console.log(`✓ check-status-labels : ${Object.keys(LIBELLES).length} enums de statut gardés sur ${chemins} chemin(s) du dictionnaire, ${Object.keys(SANS_LIBELLE).length} sans libellé gardé, ${LISTES.length} listes de l'API ; ${CAS_EPREUVE.length + SOURCES_EPREUVE.length} cas d'épreuve verts.`);
}
