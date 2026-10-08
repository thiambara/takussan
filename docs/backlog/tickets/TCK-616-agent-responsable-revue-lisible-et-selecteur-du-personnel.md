---
id: TCK-616
title: "Agent responsable, après TCK-603 : une revue de réparation qui se lit sans `activity_log`, un sélecteur alimenté par le personnel actif, et le bail d'un agent parti (suites de verif-603 passes 1 et 2)"
status: todo
phase: P2
family: full
estimate: S
wave: 74
created: 2026-10-08
updated: 2026-10-08
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
   (`takussan-api/app/Console/Commands/RepairReassignedOwners.php:192-202`) classe `designated_after`
   si le journal `PrimaryAgentDesignator::EVENT` **ou** une ligne `is_primary` dont `updated_at` est
   postérieure existe. Le second critère ratisse large : FN1 (agent ajouté après, marqué par le
   remplissage d'ADR-0053, sans désignation) et FN3 (marque antérieure, `commission_share` modifiée
   après) sortent `designated_after` à tort. FN2 : `original_not_landlord owner=Y original=X` ne nomme
   pas le vrai bailleur B5, intermédiaire de la chaîne.
2. **`leases_fixed=` porte deux sens.** Sur une ligne `restore` (`:150-155`), il liste des
   **identifiants** ; dans le bilan final (`:62`, `:146`), un **compte**.
3. **m6 — le sélecteur du lot.** `buildAgentOptions`
   (`takussan-web/src/app/(dashboard)/app/properties/(liste)/page.tsx:216-234`) propose l'utilisateur,
   les **propriétaires** et les collaborateurs des biens de la page — des bailleurs, toujours refusés
   ligne à ligne par l'API (`invalid_target`) — et omet un agent de l'agence absent de la page.
4. **Cible supprimée en douceur** : `bulk-assign` vers un utilisateur supprimé rend 404
   `http.not_found` pour **tout** le lot au lieu d'un refus `invalid_target` par ligne (verif-603
   passe 1, observation).
5. **Le bail d'un agent parti.** La passation de `held_properties` (TCK-603) ne touche pas les baux :
   un bail actif garde `landlord_id` = l'agent parti, et `LeasePolicy::view`
   (`takussan-api/app/Policies/LeasePolicy.php:68`) lui en laisse la lecture (verif-603 passe 1, v8).

## Décision du porteur

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

- [ ] `RepairReassignedOwners` : `chain=X>B5>Y` sur chaque ligne de revue et de restauration ;
      `designated_after` au seul journal ; `leases_fixed_ids=` sur la ligne, `leases_fixed=` (compte)
      au bilan.
- [ ] `PropertyBulkAssignService` : cible supprimée → refus `invalid_target` par ligne.
- [ ] Front : le sélecteur « Changer l'agent responsable » (liste et fiche) se remplit du personnel
      actif de l'agence (endpoint existant de l'équipe, champs `id,name`) ; libellés inchangés.
- [ ] Passation (décision) : baux `draft` du partant transmis, autres listés au bilan ;
      `LeasePolicy::view` resserré.
- [ ] Tests : `RepairReassignedOwnersOutputTest` (FN1, FN2, FN3), `PropertyBulkAssignTest` (cible
      supprimée), test front du sélecteur, `AgentHandoverLeaseTest`.

## Critères d'acceptation

- [ ] **AC1 (rouge sur `839be671`).** FN1 et FN3 de verif-603 passe 2 : plus de `designated_after` ;
      une désignation réelle après la réattribution : `designated_after`.
- [ ] **AC2.** FN2 : la ligne imprime `chain=X>B5>Y`, le bailleur B5 y est lisible.
- [ ] **AC3.** La ligne `restore` porte `leases_fixed_ids=…` ; le bilan porte `leases_fixed=<compte>`.
- [ ] **AC4 (rouge sur `839be671`).** Le sélecteur de la liste propose un agent actif de l'agence sans
      aucun bien sur la page, et ne propose aucun bailleur.
- [ ] **AC5.** `bulk-assign` de 3 biens vers un utilisateur supprimé : 200, 3 refus `invalid_target`.
- [ ] **AC6 (décision).** Après la passation d'un bien dont un bail actif a `landlord_id` = le partant :
      le bail figure au bilan ; `GET /api/leases/{id}` par le partant → 403.
- [ ] Ablations consignées : second critère `is_primary` remis → AC1 rouge ; sélecteur rendu à
      `buildAgentOptions` → AC4 rouge.

## Hors périmètre

- La règle de réparation elle-même (ADR-0059, TCK-603).
- Le bailleur qui change l'agent responsable de son propre bien (porte `update`, conforme à TCK-504).
- L'oracle d'existence `forbidden` / `not_found` du lot (même motif que `bulk-visibility`, TCK-591).

## Notes d'implémentation

_(à remplir par implementing-specs)_
