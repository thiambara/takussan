---
id: TCK-3018
title: "Les trous de test signalés par le relevé : vérifier chacun, combler ceux qui existent"
status: done
phase: P2
family: back
estimate: S
wave: 99
created: 2026-11-28
updated: 2026-11-28
depends_on: [TCK-3012]
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, tests, back, architecture, adr-0140]
---

## Objectif utilisateur

Ce que la suite ne garde pas encore et devrait garder est éprouvé.

## Contrat de données

Signaux NON vérifiés du relevé du 2026-11-28 : défaut XOF de `agencies.currency` masqué par la factory ; pas de budget de requêtes N contre 2N sur les listes de factures et d'états des lieux ; parité entre le geste `pay` de la facture et la route de paiement en ligne ; course « annuler » d'une visite absente de `GestesDeLaVisiteTest` (peut-être couverte depuis TCK-3005 b) ; plafond par agence des exports d'un bailleur ; alertes Discord et Slack (3 tests partagés), `AlertsOnFirstFailure`, `BoundedResendClient`. NB : les « fichiers jamais couverts » de `tests/impact-map.json` sont un artefact (carte du 2026-11-19) — vérifiés : chacun a 1 à 5 fichiers de test.

## Contraintes strictes (métier)

- Re-mesurer chaque signal avant d'écrire un test : un signal faux se note et ne produit rien.
- Un test neuf va dans la classe du module (ADR-0140 § 1), rouge d'abord sur une mutation.
- **Règle de retrait (ADR-0140 § 3)** : par grappe, relire les deux côtés, puis muter en production la règle que le test retiré garde : un test qui reste doit rougir, sinon le test se déplace au lieu de se supprimer. Une ligne du relevé dont la raison dit « doute » ne se retire pas.
- Les règles sacrées (argent, isolation d'agence et lecture, empreintes et HMAC du Radar, idempotence, autorisation par capacités) ne perdent un test que si un autre rougit à sa place.
- Jamais de suite entière en local : les classes touchées par le créneau ; la CI juge la suite et le cliquet de couverture (`Total:` du job `couverture`).

## Delta à produire

- [x] Pour chaque signal : verdict mesuré (réel / déjà couvert, par quel test)
- [x] Les tests des trous réels, dans la classe du module

## Critères d'acceptation

- [x] AC1 — Chaque signal a un verdict mesuré dans les notes.
- [x] AC2 — Chaque test ajouté a rougi sur une mutation de la règle qu'il garde.

## Hors périmètre

- Le front (`takussan-web`) ; renommer les 1 391 méthodes `ac1_/m4_…` (aucun gain de détection ni de temps).

## Notes d'implémentation

Re-mesuré le 2026-11-28 sur l'arbre de `feat/approfondissements-architecture`. Chaque mutation a été appliquée sous le créneau
de test, puis restaurée, md5 vérifié. Aucun défaut de production trouvé.

| Signal | Verdict mesuré | Preuve |
|---|---|---|
| Défaut XOF de `agencies.currency` masqué par la factory | **Trou réel, sur un chemin.** Aucun chemin de production ne s'appuie sur le défaut de colonne ni sur `$attributes` : les trois créations d'agence posent `currency` (console `AgencyProvisioningService`, hôte `HostIndividualOnboardingService`, libre-service `OwnAgencyOpeningService`). Les deux premières sont gardées (`AgencyOnboardingCurrencyTest`, `HostAutoOnboardTest`). La troisième ne l'était pas. | Assertion ajoutée à `OrientationCreateAgencyTest::test_l_agence_s_ouvre_standard_…`. Elle rougit quand `Currency::default()` devient `Currency::EUR` dans `OwnAgencyOpeningService`. |
| Budget N contre 2N, listes de factures et d'états des lieux | **Trou réel.** La garde générale `ProListQueryBudgetTest` (TCK-919) ne couvrait ni `/api/invoices` ni `/api/inventories`. `ListeEtFicheParityTest` ne compte les requêtes des états des lieux que sur un bien en corbeille. Aucun N+1 aujourd'hui : 2 lignes et 12 lignes coûtent autant. | Deux jeux ajoutés à `ProListQueryBudgetTest`, avec les `fields[]` et `include=` du front (`payments.ts`, `inventory.ts`). Factures : rouge quand `abilities` est calculé en liste (39 requêtes pour 2 lignes, 159 pour 12). États des lieux : rouge quand `room_photos` sort de `whenLoaded('media')` (19 contre 29). NB : calculés en liste, les `abilities` d'un état des lieux ne coûtent aucune requête par ligne. |
| Parité du geste `pay` de la facture et de la route de paiement en ligne | **Trou réel.** Aucun test n'appelait `POST /api/invoices/{id}/initiate`. | `InvoiceGestesTest::test_payer_en_ligne_est_offert_si_et_seulement_si_la_route_l_ouvre` : tous les statuts × (personnel, client), sur `FakeWave`. Rouge sur trois mutations : `authorize('update')` retiré de `initiate`, `can('update')` retiré du geste, `isPayable` remplacé par `encaissable` dans le geste. |
| Course « annuler » d'une visite absente de `GestesDeLaVisiteTest` | **Déjà couvert.** TCK-3017 y a fusionné `PropertyVisitCancelSousVerrouTest`. | Mutation de `GestesDeLaVisite::ecrireLAnnulation`, qui juge alors `$visit->status` au lieu de la ligne relue : `test_une_visite_deja_annulee_en_base_…` et `test_une_visite_terminee_en_base_…` rougissent. |
| Plafond par agence des exports d'un bailleur | **Couvert pour les biens et les paiements. Trou réel pour les baux.** Sans la borne `BailleurDuBien` des biens ou des paiements, `ExportScopingTest` et `ColonneDeBailleurAgentCreateurTest` (`p232_06`) rougissent. Sans celle des baux, tout reste vert, parce que `BauxLisibles` (TCK-3006) borne déjà l'agence et le bailleur. Elle n'a plus qu'un effet : écarter un bail dont le bailleur est **locataire**. Ce n'est pas une fuite, la liste le lui montre. | `ExportScopingTest::test_an_owner_who_is_also_a_tenant_exports_only_the_leases_he_lets` : rouge quand `'lease' => BailleurDuBien::restreindre(…)` devient `null`. |
| Alertes Discord et Slack (3 tests partagés) | **Trou réel.** Les trois tests d'`OperationalAlertDeliveryTest` vérifient qu'une URL est appelée. Aucun ne vérifie le corps par fournisseur, ni le choix du canal pour un hôte inconnu. | Deux tests ajoutés à `OperationalAlertDeliveryTest`. Ils rougissent sur trois mutations de `SendAdminAlert` : corps Slack et Discord inversés, premier canal pris quand deux sont actifs, hôte reconnu pris alors que son canal est inactif. |
| `AlertsOnFirstFailure` | **Déjà couvert.** | `CriticalJobFailureAlertTest` : ses 4 tests rougissent quand `->log('ops_critical_job_failed')` est retiré. |
| `BoundedResendClient` | **Déjà couvert.** | `ResendTransportTimeoutTest` rougit quand `TIMEOUT_SECONDS` passe à 30. Le test lit le client par réflexion, mais sur du privé de Resend et de Laravel, pas de l'application (ADR-0140 § 5 ne vise que l'application). |

Lancés par le créneau, tous verts : `ProListQueryBudgetTest` (8), `OrientationCreateAgencyTest` + `OperationalAlertDeliveryTest` (26),
`InvoiceGestesTest` (10), `ExportScopingTest::…also_a_tenant…`. `InvoiceGestesTest` utilise `tests/Support/FakeWave.php`, qu'apporte
TCK-3014 et qui n'est pas encore suivi par git : il doit être commité avec lui, ou avant.

