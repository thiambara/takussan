---
id: TCK-616
title: "Agent responsable, après TCK-603 : une revue de réparation qui se lit sans `activity_log`, un sélecteur alimenté par le personnel actif, et le bail d'un agent parti (suites de verif-603 passes 1 et 2)"
status: done
phase: P2
family: full
estimate: S
wave: 76
created: 2026-10-08
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#112-agence--équipe
    - docs/features.md#14-location-longue-durée-baux
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#8-propertycollaborator
    - docs/models-spec.md#14-lease-
tags: [back, front, agent-responsable, passation, bulk, reparation, bail, adr-0059]
---

# TCK-616 — Une revue de réparation lisible, un sélecteur juste

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé.** Points 1, 2, 3 toujours vrais (`RepairReassignedOwners` inchangé
depuis TCK-603 ; `buildAgentOptions` toujours alimenté par les biens de la page).

- Point 4 — **caduc depuis TCK-817** : la cible se résout dans `PropertyBulkAssignService::cible()`
  (`:92-105`) ; un compte absent ou supprimé rend **422 `user.not_in_active_agency` pour le lot**, à
  dessein (pas d'oracle d'existence). L'AC5 allait contre cette décision.
- Point 5, moitié lecture — **fermée par TCK-1926** : `LeasePolicy::view` (`:94-116`) passe par
  `BailleurDuBien::est()` puis `isStaffOf`. Reste la moitié passation (`AgentHandoverService` ne
  touche toujours pas aux baux).

Reste à faire : `RepairReassignedOwners` (AC1-AC3) ; sélecteur de la liste sur `GET agencies/{agency}/team`
(attention : `agentOptions` sert aussi au filtre agent de `PropertyListFilters`) ; la passation des
baux si le porteur la confirme. La commande se joue ensuite une fois en préproduction (`--dry-run` d'abord).

**Décision du porteur (2026-11-16) : (a) oui** — à la passation, les baux `draft` du partant passent
à son successeur, comme le reste de son portefeuille ; les autres sont listés au bilan.

## Objectif utilisateur

Le porteur qui lance la réparation des biens réattribués comprend chaque ligne « à revoir » sans
fouiller le journal ; un admin d'agence choisit l'agent responsable parmi tout son personnel actif, et
seulement parmi lui ; un agent parti ne lit plus le bail d'un bien qu'il a transmis.

## Contexte

Suites de **TCK-603** (verif-603 passe 1, m6 et observations ; passe 2, « Faux négatifs » et
« Détail cosmétique »), consignées dans `FILE-D-ATTENTE.md` (17:35, 19:00) et dans le ticket 603
(« En suite : m6 »). La réparation se joue une fois en préproduction, `--dry-run` d'abord
(`BILAN-FINAL.md`, point 4) : sa sortie est lue par une personne.

**Re-mesure sur `839be671` (2026-10-08)** :

1. **Faux négatifs de la revue.** `RepairReassignedOwners::reviewReason`
   (`takussan-api/app/Console/Commands/RepairReassignedOwners.php:173-202`, le second critère `:196-199`) classe `designated_after`
   si le journal `PrimaryAgentDesignator::EVENT` **ou** une ligne `is_primary` dont `updated_at` est
   postérieure existe. Le second critère ratisse large : FN1 (agent ajouté après, marqué par le
   remplissage d'ADR-0053, sans désignation) et FN3 (marque antérieure, `commission_share` modifiée
   après) sortent `designated_after` à tort. FN2 : `original_not_landlord owner=Y original=X` ne nomme
   pas le vrai bailleur B5, intermédiaire de la chaîne.
2. **`leases_fixed=` porte deux sens.** Sur une ligne `restore` (`:149-155`), il liste des
   **identifiants** ; dans le bilan final (`:62`, `:146`), un **compte**.
3. **m6 — le sélecteur du lot.** `buildAgentOptions`
   (`takussan-web/src/app/(dashboard)/app/properties/(liste)/page.tsx:444-461`) propose l'utilisateur,
   les **propriétaires** et les collaborateurs des biens de la page — des bailleurs, toujours refusés
   ligne à ligne par l'API (`invalid_target`) — et omet un agent de l'agence absent de la page.
4. **Cible supprimée en douceur** : `bulk-assign` vers un utilisateur supprimé rend 404
   `http.not_found` pour **tout** le lot au lieu d'un refus `invalid_target` par ligne (verif-603
   passe 1, observation). — caduc depuis TCK-817 : un compte absent ou supprimé rend 422
   `user.not_in_active_agency` pour le lot, à dessein (pas d'oracle d'existence).
5. **Le bail d'un agent parti.** La passation de `held_properties` (TCK-603) ne touche pas les baux :
   un bail actif garde `landlord_id` = l'agent parti, et `LeasePolicy::view`
   (`takussan-api/app/Policies/LeasePolicy.php:68`) lui en laisse la lecture (verif-603 passe 1, v8).
   — lecture fermée par TCK-1926 : `LeasePolicy::view` (`:94-116`) ne rend le bail à `landlord_id`
   qu'avec un profil propriétaire (`BailleurDuBien`) ; la passation, elle, ne touche toujours pas aux baux.

**Re-mesuré le 2026-11-16 sur `9112194ec`** : voir la section de re-vérification en tête.

## Décision du porteur

**Tranchée le 2026-11-16 : oui** — à la passation, les baux `draft` de l'agent qui part vont à son
successeur, comme le reste de son portefeuille ; tout autre statut est listé au bilan, jamais réécrit
(ADR-0059, amendement §7). La recommandation ci-dessous est retenue, moins `LeasePolicy::view` (caduc).

**Le bail d'un bien transmis à la passation** (point 5) : *recommandation de la session* — comme la
réparation de 603 : un bail `draft` dont `landlord_id` = le partant passe au repreneur ; tout autre
statut est **listé** dans le bilan de la passation, jamais réécrit (un bail signé est un document
contractuel) ; et `LeasePolicy::view` ne rend plus un bail à un `landlord_id` qui n'est ni du personnel
actif de l'agence du bail ni un bailleur à profil. Alternative : ne rien changer, la lecture d'un bail
signé par celui qui l'a signé étant défendable.

## Contraintes strictes (métier)

1. La commande de réparation ne change **pas** de décision (ADR-0059) : seules la classification et
   la sortie changent. Aucune écriture nouvelle.
2. `designated_after` se lit dans le **seul** journal de désignation.
3. Le sélecteur vient du serveur : le personnel actif de l'agence (la règle de cible de TCK-587, que
   l'API applique), filtré par `filter[…]`, en sparse fieldsets — jamais une liste déduite des biens de
   la page.

## Delta à produire

- [x] `RepairReassignedOwners` : `chain=X>B5>Y` sur chaque ligne de revue et de restauration ;
      `designated_after` au seul journal ; `leases_fixed_ids=` sur la ligne, `leases_fixed=` (compte)
      au bilan.
- [ ] ~~`PropertyBulkAssignService` : cible supprimée → refus `invalid_target` par ligne.~~ — caduc depuis TCK-817 (422 `user.not_in_active_agency` pour le lot, à dessein).
- [x] Front : le sélecteur « Changer l'agent responsable » (liste ; la fiche n'en a pas) se remplit du personnel
      actif de l'agence (endpoint existant de l'équipe, champs `id,name`) ; libellés inchangés.
- [x] Passation (décision) : baux `draft` du partant transmis, autres listés au bilan ;
      ~~`LeasePolicy::view` resserré~~ — caduc depuis TCK-1926.
- [x] Tests : `RepairReassignedOwnersOutputTest` (FN1, FN2, FN3), ~~`PropertyBulkAssignTest` (cible
      supprimée)~~ (caduc depuis TCK-817), test front du sélecteur, `AgentHandoverLeaseTest`.

## Critères d'acceptation

- [x] **AC1 (rouge sur `839be671`).** FN1 et FN3 de verif-603 passe 2 : plus de `designated_after` ;
      une désignation réelle après la réattribution : `designated_after`.
- [x] **AC2.** FN2 : la ligne imprime `chain=X>B5>Y`, le bailleur B5 y est lisible.
- [x] **AC3.** La ligne `restore` porte `leases_fixed_ids=…` ; le bilan porte `leases_fixed=<compte>`.
- [x] **AC4 (rouge sur `839be671`).** Le sélecteur de la liste propose un agent actif de l'agence sans
      aucun bien sur la page, et ne propose aucun bailleur.
- [ ] ~~**AC5.** `bulk-assign` de 3 biens vers un utilisateur supprimé : 200, 3 refus `invalid_target`.~~ — caduc depuis TCK-817 (422 `user.not_in_active_agency` pour le lot, anti-oracle).
- [x] **AC6 (décision).** Après la passation d'un bien dont un bail actif a `landlord_id` = le partant :
      le bail figure au bilan ; `GET /api/leases/{id}` par le partant → 403 (cette moitié est déjà
      vraie depuis TCK-1926 : à garder au plus comme test de non-régression).
- [x] Ablations consignées : second critère `is_primary` remis → AC1 rouge ; sélecteur rendu à
      `buildAgentOptions` → AC4 rouge.

## Hors périmètre

- La règle de réparation elle-même (ADR-0059, TCK-603).
- Le bailleur qui change l'agent responsable de son propre bien (porte `update`, conforme à TCK-504).
- L'oracle d'existence `forbidden` / `not_found` du lot (même motif que `bulk-visibility`, TCK-591).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **Réparation** (`RepairReassignedOwners`, ADR-0059 amendé §7) : `designated_after` au seul journal
  `property.primary_agent_designated` ; `chain=X>B5>Y` en fin de chaque ligne `review`/`restore` ; sur la ligne
  `leases_fixed_ids=` **et** `leases_to_review_ids=` (même double sens corrigé), comptes `leases_fixed=` /
  `leases_to_review=` au bilan. La trace `property.owner_restored` garde ses clés : aucune écriture nouvelle.
  `test_une_marque_posee_apres_sans_journal_compte_aussi` (TCK-603 m2) est **renversé** à dessein.
  Preuves : `RepairReassignedOwnersOutputTest` (AC1 FN1/FN3 + désignation réelle, AC2 FN2, AC3), temps posé par
  `travelTo` ; ablation « second critère `is_primary` remis » → FN1 et FN3 rouges.
- **Sélecteur du lot** (AC4) : `fetchResponsablesDuLot` lit `GET /api/agencies/{agency}/members?filter[assignable]=1`
  (`fields[users]=id,first_name,last_name`, toutes les pages) — **et non `…/team`**, qui ne lit que les profils
  d'agent de tout statut (omet l'admin, propose le suspendu) ; `assignable` est la règle d'`isStaffAt` que le lot
  applique. Seule la barre du lot change : le filtre d'agent garde `buildAgentOptions` (`filter[user_id]` vise
  aussi un titulaire bailleur). Un 403 (agent sans `crm.assign`) ou une panne laissent « moi » seul ; sans agence
  (super-admin), aucun choix, le sélecteur ne s'affiche pas ; **un bailleur seul non plus** (il voyait la liste
  tirée de la page ; sa porte est la fiche, TCK-504, hors périmètre). Preuves : `selecteur-du-lot.tck-616.test.tsx`,
  et `ResponsablesDuLotListeTest` (la requête exacte acceptée par l'API, admin et agent : admin actif et agent
  sans bien rendus, bailleur et suspendu jamais) ;
  ablation « `PropertyList` rendu à `buildAgentOptions` » → 4 rouges. Libellés inchangés, aucune clé i18n.
- **AC6** (décision du porteur du 2026-11-16, ADR-0059 amendé §7) : `AgentHandoverService::moveDraftLeases()`,
  appelé après `held_properties` — sur les seuls biens saisis **réellement transmis**, un bail `draft` dont le
  partant est le bailleur passe au repreneur de cette catégorie ; tout autre statut garde son bailleur et sort au
  bilan (`data.leases.to_review`, identifiants ; `data.leases.moved`, compte), journal `AgentHandover`/`leases`.
  Aucune catégorie de portefeuille neuve (inventaire et garde du retrait inchangés). Verrous bien → bail : biens
  tenus depuis `lockProperties()`, brouillons verrouillés ensuite (`orderBy('id')->lockForUpdate()`), statut jugé
  sous verrou ; écriture de masse comme la réparation. Preuves : `AgentHandoverLeaseTest` — brouillon passé,
  actif et en signature listés et inchangés, brouillon d'un autre agent intact, bien laissé au partant (repreneur
  bailleur) qui garde son brouillon ; non-régression de lecture (partant → 403, ablation `BailleurDuBien` → 200).
  Ablations : écriture retirée → rouge ; filtre `landlord_id` retiré → rouge ; filtre `draft` retiré → 2 rouges.
  **Front** : `HandoverWizard` affiche ce bilan avant de fermer quand des baux sont touchés — compte des
  brouillons passés au repreneur, lien `/app/leases/{id}` vers chaque bail à revoir, « Fermer » termine ;
  sans bail touché, fermeture comme avant. Preuves : `HandoverWizard.leases.tck-616.test.tsx` ; ablations
  « bilan sauté » et « liens sans identifiant » → 2 rouges chacune.
- La commande se joue ensuite une fois en préproduction, `--dry-run` d'abord : son format de sortie a changé.

