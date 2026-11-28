---
id: TCK-3016
title: "Qui peut lire : une table de décision par module de lecture, jouée sur ses deux faces"
status: done
phase: P2
family: back
estimate: M
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

Une erreur de la règle de lecture commune à la liste et à la fiche est attrapée, et pas seulement leur désaccord.

## Contrat de données

ADR-0138. Les dix modules `app/Services/Lecture/*Lisibles.php` (et `app/Services/Visit/VisitesLisibles.php`) n'ont aucun test direct ; `tests/Feature/Lecture/ListeEtFicheParityTest.php` compare les deux faces, donc ne voit pas une erreur qu'elles partagent. Le verdict « l'agent parti ne lit plus » vit route par route (`Authorization/AgentCreateur*` 11 fichiers / 47 tests, `*ExistenceOracle`, `*Scope`, `*Isolation`).

## Contraintes strictes (métier)

- Additif d'abord : la table s'ajoute ; un test par route ne se retire que si la table rougit à sa place (ADR-0140 § 3), mesuré par ablation sur le module.
- Acteurs : ceux de `ListeEtFicheParityTest` ; lignes : de son agence, autre agence, parent en corbeille, auteur parti.
- **Règle de retrait (ADR-0140 § 3)** : par grappe, relire les deux côtés, puis muter en production la règle que le test retiré garde : un test qui reste doit rougir, sinon le test se déplace au lieu de se supprimer. Une ligne du relevé dont la raison dit « doute » ne se retire pas.
- Les règles sacrées (argent, isolation d'agence et lecture, empreintes et HMAC du Radar, idempotence, autorisation par capacités) ne perdent un test que si un autre rougit à sa place.
- Jamais de suite entière en local : les classes touchées par le créneau ; la CI juge la suite et le cliquet de couverture (`Total:` du job `couverture`).

## Delta à produire

- [x] Table acteur × ligne → visible pour chaque module, jouée sur `restreindre` ET `peut`
- [x] Retraits des tests par route que la table couvre, prouvés par ablation

## Critères d'acceptation

- [x] AC1 — Une mutation commune aux deux faces d'un module (même branche retirée des deux) rougit la table, alors que la parité reste verte (constaté sur au moins deux modules).
- [x] AC2 — Chaque test retiré est nommé dans les notes avec l'ablation qui le couvre.

## Hors périmètre

- Le front (`takussan-web`) ; renommer les 1 391 méthodes `ac1_/m4_…` (aucun gain de détection ni de temps).

## Notes d'implémentation

- **Forme** : une seule classe, `tests/Feature/Lecture/QuiPeutLireTest.php`, une méthode par module (10, Visites
  comprise). Chaque table s'écrit `'libellé' => [ligne, [acteurs qui la lisent]]`, attendus écrits à la main d'après
  le docblock du module ; le super-admin lit tout et n'est pas écrit. Les modules sont appelés directement
  (`restreindre(Model::query(), $u)` et `peut($u, $ligne)`), sous le profil actif ; tous les écarts d'une table sont
  rendus d'un coup. Un fournisseur de données aurait éloigné chaque ligne de son verdict.
- **Décor partagé** : `tests/Feature/Lecture/ActeursDeLecture.php` (trait), tiré de `ListeEtFicheParityTest`, qui
  l'emploie désormais (inchangée sinon, 18 verts). La table y ajoute un agent de A privé de `crm.view_all` et
  `payouts.create` : sans lui, les branches gardées par capacité (Clients, Reversements, vue d'équipe des tâches) ne
  se distinguaient pas de l'appartenance.
- **Tâches** : la face liste est la réunion de `restreindre` et `restreindreALEquipe` (si `teamAgencyOf`). La
  couverture d'une absence (branche 3, ADR-0035) n'a pas de ligne : son décor reste aux tests d'absence.
- **Ce que la table enregistre sans que le docblock le dise** (constaté, pas modifié) : sur une réservation dont le
  bien est en corbeille, le bailleur perd la ligne (il lit par le bien), l'agence la garde ; l'agent assigné à une
  visite ne la lit que dans l'agence de son profil actif (le compte à deux agences, actif dans B, ne lit pas la
  visite qui lui est assignée dans A), alors que l'assigné d'une intervention ou d'une tâche la lit dans toutes ses
  agences.
- **AC1** — mutation commune aux deux faces, puis table et parité, créneau pris avant de muter, md5 restauré :
  `FacturesLisibles` branche 2 (client facturé) → table rouge (4 écarts), parité verte (18) ; `BauxLisibles`
  branche 2 (locataire) → table rouge (2 écarts), parité verte ; `InterventionsLisibles` branche 2 (prestataire
  assigné) → table rouge (2 écarts), parité verte.
- **AC2 — tests retirés**, chacun rouge sous l'ablation qui fait aussi rougir la table :
  - `AgentCreateurLectureDuBailTest::test_l_agent_createur_actif_lit_le_bail_au_titre_du_personnel` — ablation
    `BauxLisibles` branche 3 (personnel) retirée des deux faces : table `baux` rouge.
  - `AgentCreateurLectureDuBailTest::test_le_bailleur_particulier_garde_la_lecture` — ablation `BauxLisibles`
    branche 1 privée du bail hors agence, deux faces : table `baux` rouge (lignes « hors agence »).
  - `AgentCreateurListeDesReservationsTest::test_l_agent_createur_retire_ne_liste_plus_les_reservations_du_bien` —
    ablation `ReservationsLisibles` branche 2 réduite à `properties.user_id = user` (sans `BailleurDuBien`), deux
    faces : table `reservations` rouge sur la ligne « bien saisi par le personnel parti », ajoutée pour cela.
  - `AgentCreateurListeDesReservationsTest::test_l_agent_createur_actif_liste_les_reservations_du_bien` — ablation
    `ReservationsLisibles` branche 4 (personnel), deux faces : table rouge.
- **Restent, et pourquoi** : les tests de suspension (`TeamMemberSuspensionService`) et du bailleur bloqué ou
  suspendu — le décor n'a ni agent suspendu ni bailleur bloqué, la table ne rougirait pas ; tout test qui mêle la
  lecture à une écriture (`AgentCreateurEtatDesLieux`, `MaintenanceOwnerIsolation`, `PropertyVisitIsolation`,
  `OwnerIsolationWithinAgency`), au fil de messagerie (`AgentCreateurListeDesInterventions`, le retrait du bail) ou
  au 404 contre 403 (`*ExistenceOracle*`) ; les autres `AgentCreateur*` jugent des routes hors des modules
  (documents, paiements, résoumission, biens).
- **Re-mesure du contrat** : neuf modules `*Lisibles` sous `app/Services/Lecture/` (plus `AgenceDuLecteur`, une
  aide) et `VisitesLisibles`, soit dix tables, pas « dix plus un ». `AgentCreateur*` : 11 fichiers, 47 tests avant,
  43 après (`grep -rhoE 'public function test_' tests/Feature/Authorization/AgentCreateur* | wc -l`).
- Lignes ajoutées après la revue : Baux « A, désignant le personnel parti » ; Tâches « bien effacé pour de bon »
  (parent introuvable : personne ne lit). Gardes `scripts/check-*.mjs` qui lisent `tests/` : vertes.
- Tests lancés par le créneau : `QuiPeutLireTest` (10), `ListeEtFicheParityTest` (18),
  `CautionsSansAgenceRattacheesTest`, les deux `AgentCreateur*` modifiés — 34 verts. Pint propre.
