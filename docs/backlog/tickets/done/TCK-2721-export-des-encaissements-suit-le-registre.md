---
id: TCK-2721
title: "« Exporter » le registre des encaissements rend les lignes du registre, avec ses filtres"
status: done
phase: P1
family: full
estimate: M
wave: 90
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2659]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#15-leasepayment-"
tags: [full, argent, export, encaissements, csv, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

L'admin d'agence qui a ouvert les encaissements d'un bail (ou filtré par payeur, bien, bailleur, moyen) et touche
« Exporter » reçoit un fichier qui contient **exactement** les lignes qu'il a à l'écran, pas tout le mois de l'agence.

## Contexte

Relevé à la vérification adverse de TCK-2659 (R1), re-mesuré sur 2fcd7fb57 :

- Le bouton « Exporter » d'« Argent » appelle l'export générique `GET /api/export/payments` (`ExportDataService::payments`)
  avec les seules bornes `from` / `to`. Cet export rend les **échéances** de loyer dont `due_date` tombe dans les bornes —
  impayées comprises, **réservations exclues** —, pas les encaissements (`paid_at`) du registre.
- Les filtres du registre (`filter[entity_type]` + `filter[entity_id]` d'un lien entrant — bail, client, réservation,
  bien —, `filter[payer_id]`, `filter[landlord_id]`, `filter[payment_method]`, `filter[status]`, `filter[search]`,
  `filter[paid_from]` / `filter[paid_to]`) ne sont **pas transmis** et `ShowExportRequest` ne les accepterait pas : depuis
  le lien d'un bail, l'export rend tout le mois de l'agence.
- Le correctif de R1 (b10afead0) a fait dire au bouton ce qui part (« Exporter les loyers dus en <mois> (CSV) ») ; il n'a
  pas changé ce qui part, et le commentaire d'`AdminFinancesClient.tsx` (~l. 97-100) le dit : « le filtre d'entité n'y est
  pas promis : l'export l'ignore ».
- Le téléchargement passe par le relais du front `src/app/api/export/[entity]/route.ts`, qui n'accepte que les entités
  de `ALLOWED_ENTITIES` et ne transmet que `format`, `from`, `to`, `limit` (`FORWARD_PARAMS`) : aucun `filter[…]` ne
  passerait aujourd'hui, même si l'API l'acceptait.

## Décision

**Recommandation de back-3** (le fichier des décisions de la session n'en porte pas pour ce point), **à confirmer par le
porteur ; si refusée → `obsolete`.**

- **a) (recommandé)** une entité d'export neuve, **le registre lui-même** (`payment_history`), servie par la route
  d'export existante : mêmes filtres, même périmètre, mêmes lignes que `GET /api/payments/history` ; « Exporter » du
  registre l'appelle avec les paramètres de l'écran.
- b) statu quo : l'export des loyers dus du mois, nommé comme tel depuis b10afead0, sans filtre d'entité.

## Contrat de données

- `GET /api/export/payment_history?format=csv|xlsx&<les filtres de l'historique>` (`ExportController::show`, entité
  neuve) → fichier ; capacité `payments.export` (celle de l'entité `payments`), 403 sinon, **avant** la validation.
- Lignes = celles que `GET /api/payments/history` rendrait au même lecteur avec les mêmes filtres et le même tri, toutes
  pages confondues, bornées par le plafond des exports (`ExportDataService::maxRows($format)`) **comme les autres
  entités** : au-delà, le fichier est tronqué et la réponse porte `X-Export-Truncated` (une `limit` demandée au-delà du
  plafond reste refusée en 422 par `ShowExportRequest`).
- Relais du front : `payment_history` entre dans `ALLOWED_ENTITIES` ; les clés `filter[…]` de l'historique sont
  transmises pour cette entité (liste fermée, pas de recopie aveugle de la requête).
- Colonnes, dans l'ordre du registre : date d'encaissement, payeur, bien, période (« Loyer de novembre » en données
  brutes : type + période), moyen, montant, statut, référence. Montants en nombres (pas de séparateur), dates ISO.

## Direction UX / Artistique

Le bouton reste où il est. Son nom accessible dit le périmètre réel (« Exporter les 12 encaissements affichés », ou
« … du bail B-2026-014 ») ; le lien porte les paramètres de l'écran au moment du clic.

## Contraintes strictes (métier)

- **Une seule source de vérité des lignes** : l'export réutilise la requête de `PaymentController::history` (même
  cloisonnement d'agence et de bailleur, mêmes lignes de réservation, même `paid_at`), jamais une seconde requête écrite
  à côté. Un test de parité le garde.
- Un payeur, un bailleur ou un bien hors du périmètre du lecteur ne sort pas plus par l'export que par la liste.
- L'entité d'export `payments` (les échéances) reste telle quelle.
- Le journal d'export existant (`filters` journalisés) s'applique.

## Delta à produire

- [ ] La requête de `PaymentController::history` extraite en un point commun ; `ExportDataService::paymentHistory()` la
      lit ; `ExportController` : entité `payment_history` → `Capability::PaymentsExport`.
- [ ] `ShowExportRequest` : les règles des filtres de l'historique, pour cette seule entité.
- [ ] Relais `src/app/api/export/[entity]/route.ts` : l'entité et ses clés de filtre ; `ExportEntity` du front.
- [ ] Front « Argent » : le lien d'export porte les paramètres de `parametresDesEncaissements` ; libellé accessible.
- [ ] Tests : `PaymentHistoryExportTest` (parité liste/export, filtre d'entité, cloisonnement, plafond) ; test du lien côté
      front.
- [ ] `docs/spatie-query-builder.md` si la liste des filtres y est recopiée.

## Critères d'acceptation

- [ ] AC1 — Agence avec deux baux B1 et B2 encaissés en novembre : `/api/export/payment_history?filter[entity_type]=lease&filter[entity_id]=B1&filter[paid_from]=2026-11-01&filter[paid_to]=2026-11-30`
      rend les seules lignes de B1 ; l'export sans filtre d'entité rend celles de B1 et B2.
- [ ] AC2 — Pour cinq combinaisons de filtres (entité, payeur, bailleur, moyen, recherche), l'ensemble des références de
      l'export égale celui des pages de `GET /api/payments/history` aux mêmes paramètres.
- [ ] AC3 — Une réservation payée en novembre figure dans l'export du mois (l'export générique l'excluait).
- [ ] AC4 — Un agent sans `payments.export` → 403, y compris avec un filtre mal formé (403 avant 422).
- [ ] AC5 — Front : depuis `/app/agency/finances?tab=encaissements&entity_type=lease&entity_id=<B1>`, le lien
      « Exporter » vise `/api/export/payment_history` et contient `filter[entity_type]=lease` et `filter[entity_id]=<B1>` ;
      le relais les transmet à l'API (test du route handler).
- [ ] AC6 — Au-delà du plafond, le fichier est tronqué au plafond et la réponse porte `X-Export-Truncated`, comme l'entité
      `payments`.

## Hors périmètre

- L'export PDF du registre.
- Les autres registres d'« Argent » (factures, reversements, impayés), qui ont leurs exports.

## Notes d'implémentation

**Décision.** (a) retenue sous la consigne du 2026-11-11 (« implémentez tous les tickets selon vos
recommandations »).

**Une seule source de vérité.** Toute la sélection de `PaymentController::history` est déplacée dans le service
`App\Services\Payments\PaymentHistory` : cloisonnement, filtres et leurs refus en 422 (dans le même ordre),
lignes, tri, plafond. Le déplacement s'est fait en deux étapes.
1. Un déplacement pur. Les helpers déplacés ne diffèrent de l'original que par leur visibilité, et `withReminders()`
   reçoit le lecteur en paramètre au lieu de lire `request()->user()`. Les 19 fichiers de test qui lisent
   `/api/payments/history`, joués un par un, sont verts.
2. L'export. `ExportDataService::paymentHistory()` appelle `PaymentHistory::select()` avec `limit + 1` lignes au plus
   (la règle des autres constructeurs), et `collect()` en déduit la coupure et `X-Export-Truncated`.

Le contrôleur ne garde que la pagination et les totaux.

**Écart au delta : `ShowExportRequest` ne reçoit aucune règle de filtre (AC4).** Ses règles s'exécutent avant le
contrôle de capacité de `ExportController::show`, donc un filtre mal formé y aurait rendu 422 à qui n'a pas le droit
d'exporter. Le contrôleur lit `filter[…]` et `sort` dans la requête après le 403. La sélection les refuse ensuite
elle-même, comme la liste (par exemple `payment.filter_status_invalid`). L'ablation E3 (une règle `filter.status`
ajoutée à `ShowExportRequest`) fait rougir l'AC4. Le test `test_ac4_sans_payments_export_403_meme_avec_un_filtre_mal_forme`
envoie un appel non autorisé avec un filtre invalide (`filter[status]=nope`, `filter[payer_id]=abc`) et attend 403 ;
son versant autorisé attend le 422 `payment.filter_status_invalid`. `from` et `to` restent acceptés mais n'ont pas d'effet pour cette
entité : les bornes sont `filter[paid_from]`/`filter[paid_to]`.

**Qui exporte.** `payment_history` exige `payments.export` et fait partie de `STAFF_ONLY`. Le bailleur et le
locataire reçoivent 403, alors que la liste leur rend leurs propres lignes. Le registre est un écran du personnel ; à
rouvrir si on veut un export de « mes paiements ». Le journal d'export enregistre `filters.filter` (les filtres du
registre) pour cette entité.

**Colonnes.** `paid_at` (date ISO), `payer`, `property`, `payment_type`, `period_start`, `period_end`,
`payment_method`, `amount` (nombre), `currency`, `status`, `reference`. Le fichier s'appelle
`encaissements-<horodatage>`.

**Garde d'architecture.** `ControllerInstantFormTest` ne lit que `Http/Controllers` et `Services/Admin`. Le
`toISOString()` de l'historique, toléré par l'exception TCK-1500, a quitté le contrôleur, et la garde rougissait
(« exception qui ne s'applique plus à rien »). L'exception suit le code, et la nouvelle liste `FICHIERS_EXTRAITS`
remet le service sous la garde. Sans elle, déplacer une conversion dans un service suffisait à la faire disparaître
du relevé.

**Front.** `filtresDeLHistorique()` (`lib/queries/payments.ts`) écrit les `filter[…]` une seule fois, pour la liste
comme pour le lien `lienDExportDuRegistre()` (`lib/queries/exports.ts`). Ce lien n'est pas dans `ExportEntity` :
`ExportForm` y attache une table de capacités par entité, et le formulaire d'exports n'offre pas le registre. Le
relais `api/export/[entity]` admet `payment_history`, transmet pour elle seule une liste fermée de `filter[…]` plus
`sort`, et ne transmet rien d'autre. Le nom accessible du bouton se lit sur le total de la liste (la même requête,
donc aucune lecture de plus) : « Exporter les N encaissements affichés (CSV) ». La ligne du téléphone devient
« Exporter les encaissements · Les encaissements du mois affiché, en CSV ».

**Tests.**
- `PaymentHistoryExportTest` : 9 tests (AC1 à AC4 et AC6, colonnes, cloisonnement, journal). Six ablations, toutes
  rouges (E1 à E6).
- Relais : `route.registre.tck-2721.test.ts`, 3 tests. Trois ablations, toutes rouges.
- Lien : trois tests dans `argent.tck-2659.test.tsx`, qui remplacent les trois tests R1 de TCK-2659 (« loyers dus »).

**Pour /sync-specs.** `docs/features.md` §15 et §25 ne nomment pas l'export du registre. À ajouter si la spec énumère
les exports.

**Messages (accord de team-lead du 2026-11-11).** `admin.finances.argent.actions.exporterAria` réécrite
(« Exporter {count, plural, =0 {le registre affiché} one {l’encaissement affiché} other {les # encaissements
affichés}} (CSV) »), `exporterAriaSansCompte` ajoutée, `exporterAriaBornes` retirée (plus aucun lecteur),
`registres.exporter` et `registres.exporterDetail` réécrites ; fr, en, et wo = le texte français (`=1`).
`docs/spatie-query-builder.md` § « Historique des paiements » : un paragraphe sur `PaymentHistory` et l'export.
Front : `argent.tck-2659.test.tsx` 38 verts, `route.registre.tck-2721.test.ts` 3 verts.

**Vérification adverse — deux défauts corrigés (d1, d2).**
- **d1 — la coupe gardait des lignes arbitraires.** `PaymentHistory::select()` coupait chaque source à `$maxRows`
  sans `ORDER BY`, puis triait en PHP. Reproduit : six encaissements insérés du plus ancien au plus récent,
  `sort=-date&limit=2` rendait R-06 et R-03 au lieu de R-06 et R-05. Chaque source est désormais triée en SQL
  (`orderForCut()`) sur la clé que rend la ligne, dans le sens d'`applySort()` : `date` (le paiement, sinon le début
  de période d'une échéance, sinon la création), `amount`, `created_at`, `remaining_amount` (l'accesseur de
  `HasPaymentAttributes` recopié branche pour branche — ce n'est pas `CollectedPayments::OWED_REMAINING_SQL`, qui
  ignore `paid` et `refunded`) et `days_late` (la définition du filtre `days_late_min`), `NULL` rangés comme en PHP,
  `id` croissant pour départager. La clé et le sens se lisent une fois (`sortKey()`), pour la coupe et le tri : un tri
  inconnu vaut `-date` des deux côtés. La liste en profite au-delà de 5 000 lignes.
- **Pourquoi deux niveaux de test.** L'export demande `limit + 1` lignes : cette ligne de marge absorbe une ligne mal
  rangée par la coupe, et trois ablations (branches `refunded` et `paid` à `metadata.paid_amount`, statuts dus du
  retard) restaient vertes par l'export seul. `assertSelectionCoupeeGardeLeDebut()` appelle donc `select()` à `k`
  exactement, pour chaque `k`.
- **d2 — le tri de l'export n'était gardé par aucun test.** `test_d2_l_export_suit_l_ordre_de_la_liste_pour_chaque_tri`
  compare l'ordre du fichier à celui de la liste pour `-date`, `amount`, `-amount` et `date`, dont deux ordres
  inverses.
- **Ablations, toutes rouges, fichiers restaurés à l'empreinte près :** ordre SQL retiré ; `history_sort` forcé à
  `-date`, puis à `date` ; branche `paid` sans le remboursé ; branche `refunded` retirée ; `paid` sans
  `metadata.paid_amount` ; retard sans exclure la restitution de caution, sans la condition d'échéance passée, sans
  les statuts dus, `NULLS FIRST` ; tri inconnu croissant ; date d'une échéance sans le début de période ;
  départage par `id` retiré. Non gardés par une ablation : le versant réservation de `remaining_amount` (même
  expression, autre table) et le repli `created_at` de la date d'un acompte.
- **Le tri `remaining_amount` caste `metadata.paid_amount` en `numeric`** sur toutes les lignes du périmètre, comme
  `CollectedPayments::OWED_REMAINING_SQL`. Il repose sur le garde d'écriture de `HasPaymentAttributes` (`is_numeric`,
  ≥ 0, refus 422) : une valeur non numérique posée hors du modèle (`DB::table`) ferait de ce tri une erreur 500 là où
  l'accesseur PHP la lisait comme 0.

