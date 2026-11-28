---
id: TCK-3006
title: "« Qui peut lire » à deux faces : un module par modèle pour la liste et la fiche, un test de parité, et trois divergences corrigées (caution, état des lieux, visite)"
status: done
phase: P2
family: back
estimate: L
wave: 99
created: 2026-11-27
updated: 2026-11-28
depends_on: [TCK-3005, TCK-3007]
blocks: [TCK-3011]
spec_refs:
  features: []
  models: []
tags: [back, autorisation, agence, lecture, architecture, adr-0138]
---

## Objectif utilisateur

Ce qu'un membre d'une agence voit dans une liste est exactement ce qu'il peut ouvrir en fiche, ni plus ni moins.

## Contrat de données

Relevé du 2026-11-27 (`dev` 4e3a929f7). La règle de lecture est écrite deux fois, en SQL pour la liste et en PHP dans `XPolicy::view` (inventaire complet dans [ADR-0138](../../../adr/0138-qui-peut-lire-s-ecrit-une-fois-pour-la-liste-et-la-fiche.md) § Contexte). Divergences vérifiées :

1. **Caution** : `GuarantorController::index:28` (`where('added_by_id', …)`) contre `GuarantorPolicy::view:31-33` (auteur ∨ personnel). L'auteur garde aussi la fiche sans condition « encore membre ».
2. **État des lieux** : `Inventory::property()` sans `withTrashed` → `InventoryPolicy::view:34` appelle `auteurEncoreMembre(…, null)`, vrai sans appartenance (`BasePolicy.php:162`) ; la liste (`InventoryController.php:56`) écarte par `whereHas('property')`.
3. **Visite** : même défaut dans `PropertyVisitPolicy::view:46-47` contre `VisitesLisibles`.

Formes actuelles : scope (Lease:178, Customer:467, MaintenanceRequest:329), module (`VisitesLisibles`), contrôleur (Invoice :25-38, Payout :31-45, Booking `visibleTo` :107, Inventory :49-71, Task, Guarantor).

## Contraintes strictes (métier)

- ADR-0138 : un module `<Modèle>Lisibles` par modèle, deux faces écrites côte à côte (`restreindre(Builder, User)`, `peut(User, Model)`), `XPolicy::view` délègue, `index()` applique `restreindre` en base de `buildQuery` (ADR-0006).
- L'agence est celle du profil actif (`staffAgencyId()`), sauf exception écrite (Task, ADR-0035).
- Un parent supprimé en douceur se juge sur son agence (`withTrashed`).
- Les jugements préchargés (`MembershipCapabilityResolver::primed`) restent possibles : `peut()` ne fait pas de requête par ligne quand l'amorce est posée.
- `scripts/check-agency-scope-clause.mjs` reste vert (pas de comparaison `agency_id` brute).

## Delta à produire

- [x] Services : `app/Services/Lecture/{Inventaires,Cautions,Factures,Reversements,Reservations,Taches,Baux,Clients,Interventions}Lisibles.php` ; `app/Services/Visit/VisitesLisibles.php` reçoit sa face `peut()`
- [x] Policies `view` des modèles migrés : délèguent au module
- [x] Contrôleurs `index` et scopes `visibleTo` : passent par `restreindre` (les scopes restent comme raccourcis qui appellent le module, ou disparaissent si plus aucun appelant)
- [x] Corrections des trois divergences (caution, état des lieux, visite)
- [x] Test : `tests/Feature/Lecture/ListeEtFicheParityTest.php` (jeu d'acteurs, deux sens, tous les modèles migrés)

## Critères d'acceptation

- [x] AC1 — Le personnel actif voit dans `GET /api/guarantors` les cautions de son agence ajoutées par un collègue ; un auteur parti ne voit plus ni la liste ni la fiche.
- [x] AC2 — Un agent parti de l'agence n'ouvre plus un état des lieux ni une visite dont le bien est supprimé en douceur ; le personnel actif les voit en liste et en fiche.
- [x] AC3 — Le test de parité couvre les dix modèles et échoue si l'on retire une branche d'une seule face (ablation rejouée sur au moins deux modèles).
- [x] AC4 — Plus aucun commentaire « comme `XPolicy::view` » ne tient seul une règle dupliquée.

## Hors périmètre

- Les règles d'écriture (`update`, `delete`) ; Document (ADR-0099) et CommissionEntry (sans `show`).

## Notes d'implémentation

Re-mesure du 2026-11-28 (branche `feat/approfondissements-architecture`) — ce qui différait du relevé :

- **Caution** : confirmé (liste `where('added_by_id', …)`). La fiche lisait l'agence par
  `GuarantorPolicy::agencyOf()` (colonne, puis agence du profil de l'auteur) ; ce repli n'a pas de
  forme SQL et lit le profil actif d'un tiers. **Décision** : les deux faces lisent la colonne
  `agency_id` seule (rattrapée par migration, posée par `store` : 0 ligne nulle sur 84 en base de
  dev). Effet : `update` et `delete`, qui délèguent à `view`, se ferment aussi à l'auteur parti.
  `agencyOf()` reste pour la pièce en clair et le journal. Trois fixtures de test créaient une
  caution sans `agency_id` et comptaient sur le repli : elles posent l'agence comme `store`
  (`OwnerIsolationWithinAgencyTest`, `DestroyAuthorizationTest`).
- **État des lieux** : confirmé, et plus large que décrit — la liste écartait aussi la ligne au
  PERSONNEL de l'agence (`whereHas('property')` sans corbeille). `Inventory::property()` n'est PAS
  modifiée (elle sert `update`, `Document`, `DocumentPolicy` et `renderPdf`, hors périmètre) :
  `InventairesLisibles::bien()` relit le bien corbeille comprise, la face SQL lève `SoftDeletingScope`.
- **Tâche — quatrième divergence, non relevée** : la fiche jugeait le parent `Booking` (la tâche
  de remboursement, `BookingRefundTaskService`), la liste ne connaissait que `Customer` et
  `Property` : la tâche ouverte à son assigné n'était dans aucune de ses listes. Corrigé
  (`TachesLisibles::PARENTS`), rouge par ablation.
- **Tâche — exceptions écrites dans le docblock du module** : les branches créateur, assigné et
  remplaçant lisent toutes les agences de l'appelant (ADR-0035), pas la seule du profil actif ; la
  liste a deux modes (« mes tâches », `filter[team]=1`) et la fiche se compare à leur réunion.
- Invoice, Payout, Booking, Lease, Customer, MaintenanceRequest : les deux faces s'accordaient ;
  déplacées sans changement de règle. `MaintenanceRequestPolicy::isRequester/isAssignedProvider`,
  qui servent aussi les gestes, délèguent à `InterventionsLisibles::estDemandeur/estPrestataireAssigne`
  ; `TaskPolicy::update/delete` à `TachesLisibles::participe` (une seule écriture PHP de chaque branche).
- Une branche « personnel de l'agence » commune : `App\Services\Lecture\AgenceDuLecteur::personnel()`
  (la règle de `BasePolicy::isStaffOf`, protégée et d'instance).

Vérifications : `tests/Feature/Lecture/ListeEtFicheParityTest.php` — 9 acteurs, un décor par modèle
qui croise auteurs × agences (A, B, hors agence) × biens (dont un en corbeille), liste par HTTP
(profil actif par `X-Active-Profile-Hint`), fiche par la Gate ; deux sens. Rouge AVANT correctif sur
la caution (#2 listée/refusée) et l'état des lieux (ligne en corbeille absente de la liste du
personnel). Ablations rejouées (2026-11-28) : branche « client » retirée de la seule face SQL des
factures → rouge ; `InventairesLisibles::bien()` sans corbeille → rouge ; `Booking` retiré des
parents de la face SQL des tâches → rouge.

- **Visite** (après TCK-3005) : confirmé — `property === null` rendait vraie la branche de l'agent ;
  la liste écartait aussi la ligne au personnel. `VisitesLisibles::pour(User)` devient
  `restreindre(Builder, User, ?personnelDe)` (forme des neuf autres) à côté de `peut()` ; ses deux
  autres appelants suivent (`CustomerTimeline`, `ActiviteDesEspaces`, une ligne chacun). Rouge
  constaté en remettant l'ancienne forme (bien sans corbeille, branche agent sur bien nul), vert après.
- AC3 : dix modèles au test de parité (10 méthodes + AC1 + deux AC2), 110 verts avec
  `OwnerIsolationWithinAgencyTest`.

**Copies restantes et AC4 (second temps, sur demande de la session).**

- `AgenceDeLaCible` excluait le bien en corbeille pour la visite et l'état des lieux, que la fiche lit
  encore. La cible n'avait donc pas d'agence et la cloche ne basculait pas. Corrigé par
  `BIEN_EN_CORBEILLE_LU = ['visit', 'inventory']` ; l'intervention n'y entre pas, puisque sa fiche ne
  s'ouvre plus au personnel une fois le bien supprimé. Le test
  `test_l_objet_d_un_bien_en_corbeille_porte_l_agence_du_bien_quand_la_fiche_le_lit` était rouge avant
  le correctif. Le cas « visite d'un bien en corbeille » a quitté le test des objets absents.
- `CalendarEventCollector` : les tâches et les interventions sont désormais un sous-ensemble composé
  sur `TachesLisibles::restreindre` / `InterventionsLisibles::restreindreDans` (agence du lien) ; le
  docblock dit pourquoi c'est un sous-ensemble. La copie des tâches ignorait le parent `Booking`, et
  celle des interventions servait au personnel parti l'intervention d'un bien qu'il avait saisi.
  `Task::scopeParentAgencyIn`, devenu sans appelant, est supprimé. Le garde-fou est
  `ListeEtFicheParityTest::test_l_agenda_ne_sert_que_ce_que_la_fiche_ouvre` (agenda inclus dans la
  fiche, tâche de remboursement présente). Ablations : le retour à la requête nue des interventions
  (la copie d'avant) et la suppression de `TachesLisibles` dans l'agenda donnent chacun 1 rouge
  (personnel parti) ; restauration vérifiée par md5.
- `Task::scopeLisiblesSurUnParentPar` = `TachesLisibles::restreindre` ∪ `restreindreALEquipe` (quand
  l'agence active est celle du parent). Ablation : 2 rouges dans `CustomerTimelineTachesLisiblesTest`
  et `CustomerActivityEndpointTest` ; restauration vérifiée par md5.
- AC4 : les deux commentaires sont corrigés. `grep "comme \`XPolicy::view\`"` ne rend plus que
  `DocumentPolicy` et `PropertyPolicy`, qui sont hors des dix modèles.
- **Cautions sans agence** : `store()` pose `staffAgencyId() ?? agency_id`, ce qui donne `null` pour
  un auteur sans agence unique ; la reprise de TCK-1993 ne couvrait que les lignes de son jour. La
  migration `2026_11_28_120000_rattacher_les_cautions_sans_agence_a_leur_auteur` rattache une caution
  nulle à l'agence unique des profils ACTIFS de son auteur, c'est-à-dire ce que rendait le repli retiré.
  Son `down()` est vide, et le docblock dit pourquoi. Le test `CautionsSansAgenceRattacheesTest`
  vérifie un 403 avant la migration et un 200 après. Les auteurs ambigus, suspendus ou partis restent
  sans agence. Ablation des filtres de statut : rouge, restauration vérifiée par md5. Le chemin de
  réservation et celui de bail posent l'agence de leur objet (nulle seulement hors agence).

**Vérification adverse (quatre défauts, chacun rouge d'abord).** Les tests sont rangés dans la classe du module éprouvé : lecture et compte de requêtes dans `ListeEtFicheParityTest`, créateur dans `BookingRefundTaskTest`, export dans `ExportScopingTest`.

- **Demandeur parti, bien en corbeille** : `InterventionsLisibles::estDemandeur` et la branche 1 en SQL
  lisent désormais l'agence du bien corbeille comprise (`bien()`, `withoutGlobalScope(SoftDeletingScope)`).
  Avant, `property?->agency_id` valait `null` sous la corbeille, et la fiche comme la liste se rouvraient
  (200). Le docblock est corrigé. Ablations : PHP, 1 rouge ; SQL, 2 rouges.
- **Tâche de remboursement servie au client** : corrigée à la source, sans toucher la règle de lecture.
  `BookingRefundTaskService::createurInterne` n'enregistre pas le client de la réservation comme
  créateur (`null`), et le personnel ou l'hôte qui ferment la réservation le restent. Retirer le créateur
  de `participe()` aurait touché toutes les tâches personnelles, d'où ce choix. Résultat pour le client :
  GET de la fiche 403, PATCH 403, absente de `GET /api/tasks`. L'hôte assigné la garde. La reprise
  `2026_11_28_120100` retire le client des tâches déjà écrites ; son `down()` est vide, avec le motif.
  `BookingRefundTaskTest` épinglait l'ancien créateur (le client) : l'assertion est inversée. Ablation :
  1 rouge.
- **Requête par ligne** : mesurée de 1 à 20 lignes sur un bien en corbeille. Les états des lieux et
  les visites restaient constants (leur liste n'appelle pas `bien()`). Les interventions passaient de
  25 à 44 requêtes, parce que la ressource relisait `property` sur chaque ligne. `with('property')` dans
  `MaintenanceRequestController::index` la ramène à une requête. Le bien n'est pas chargé corbeille
  comprise, sans quoi la ressource exposerait un bien supprimé. Ablation : 1 rouge.
- **Export** : `ExportDataService::scopeToActor` plafonne désormais l'export par la liste du même objet,
  `ClientsLisibles` / `BauxLisibles` / `FacturesLisibles` / `ReversementsLisibles` d'abord ; les bornes
  existantes ne font que rétrécir. Deux fuites ont été fermées. `crm.export` sans `crm.view_all` rendait
  toutes les fiches clients de l'agence, contact compris. `reports.export` sans `payouts.create` rendait
  les reversements que la liste refuse. Ablation : 2 rouges. Les 289 tests d'export restent verts.

