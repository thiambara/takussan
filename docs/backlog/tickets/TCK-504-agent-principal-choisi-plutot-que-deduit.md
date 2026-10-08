---
id: TCK-504
title: "Agent principal — une agence le CHOISIT, au lieu qu'un ordre le déduise"
status: doing
phase: P2
family: full
estimate: M
wave: 58
created: 2026-08-31
updated: 2026-10-08
depends_on: [TCK-502]
blocks: [TCK-603]
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#8-propertycollaborator
tags: [back, front, property, collaborators, contact]
---

## Objectif utilisateur

Un admin d'agence qui confie un bien à deux agents doit pouvoir dire **lequel des deux** la fiche
publique nomme et à qui les messages arrivent.

## Contrat de données

TCK-502 a rendu le choix **déterministe** — le collaborateur `agent` le plus anciennement invité,
via `App\Services\Property\PrimaryPropertyContact` — et c'était l'objet du ticket : fermer un
tirage. Mais déterministe n'est pas *choisi*. Aujourd'hui, une agence qui veut mettre l'autre agent
en avant n'a aucun moyen de le dire : il lui faudrait supprimer puis recréer une ligne de
collaboration pour en déplacer la date d'invitation.

Le delta porte sur `property_collaborators`, dont la définition de référence est en `spec_refs`.

⚠️ **Le relevé qui a motivé ce ticket, et qui touche la spec :** les colonnes d'acceptation que
`docs/models-spec.md#8-propertycollaborator` décrit — `invitation_accepted`, `invitation_date`,
`accepted_date`, `invited_by`, `permissions`, `notes` — **n'existent pas dans la migration**
(`2026_04_17_160008_create_property_collaborators_table`), qui porte `invited_at`, `accepted_at`
et `metadata`. Et **rien dans le code ne renseigne `accepted_at`** : `PropertyCollaboratorController::store()`
ne pose que `invited_at`, il n'existe aucun parcours d'acceptation, seul le *seeder* remplit la
colonne. C'est ce qui a rendu inutilisable la règle « le plus ancien accepté » que TCK-502
envisageait. **L'écart spec↔code relève de `/sync-specs`, pas de ce ticket** — mais il doit être
tranché avant, ou en même temps, sous peine de bâtir sur une colonne qui n'a jamais eu de sens.

## Direction UX / Artistique

Le choix se pose **là où les collaborateurs se gèrent déjà**, pas dans un écran neuf : une ligne
distinguée dans la liste, à un geste, avec ce que le choix change dit en clair — c'est la personne
que la fiche publique nomme, qui reçoit les messages et dont le numéro s'affiche. Un bien sans
choix explicite ne doit pas ressembler à un bien mal configuré : le repli de TCK-502 reste juste,
il est simplement muet.

## Contraintes strictes (métier)

1. **Un seul principal par bien**, garanti en base et pas seulement dans l'écran.
2. **Le repli de TCK-502 reste la règle quand aucun choix n'est posé** — et il reste dans
   `PrimaryPropertyContact`, qui demeure la **seule** définition. Les quatre surfaces qu'il sert
   (carte de contact, `contact-lead`, `contact-message`, résolution) ne doivent rien apprendre de
   ce ticket.
3. Seul le rôle `agent` peut être principal : promouvoir un `viewer` ou un `co_owner` n'a pas de
   sens et doit être refusé côté serveur, pas seulement grisé côté client.
4. Le choix est une écriture sur le bien : elle suit l'autorisation qui gouverne déjà la gestion
   des collaborateurs, jamais une règle neuve écrite en contrôleur.
5. Retirer le collaborateur principal ne doit pas laisser le bien sans contact : le repli reprend.

## Delta à produire

- [ ] Migration : marquer le collaborateur principal, avec l'unicité par bien portée par le schéma.
- [ ] Backfill : les biens existants gardent le contact que `PrimaryPropertyContact` leur donne
      aujourd'hui, pour qu'aucune fiche publique ne change de visage à la migration.
- [ ] `PrimaryPropertyContact::for()` : le choix explicite d'abord, le repli actuel ensuite.
- [ ] Endpoint de désignation + `FormRequest` + policy déléguée.
- [ ] UI de gestion des collaborateurs : désigner, voir qui l'est, comprendre ce que ça change.
- [ ] Tests : unicité, refus sur un rôle non-`agent`, repli après suppression du principal,
      et le backfill qui ne déplace aucun contact.

## Critères d'acceptation

- [ ] AC1 — sur un bien à deux collaborateurs `agent`, désigner le second fait que la carte de
      contact, `contact-lead`, `contact-message` et la résolution nomment tous le second.
- [ ] AC2 — deux désignations concurrentes sur le même bien laissent **un** principal, pas deux.
- [ ] AC3 — désigner un collaborateur de rôle `viewer`, `manager` ou `co_owner` est refusé par le
      serveur.
- [ ] AC4 — supprimer le collaborateur principal ramène le contact au repli de TCK-502, sans
      qu'aucun écran ne rende un contact vide.
- [ ] AC5 — après la migration, **aucun** bien du jeu de données ne change de contact principal.
- [ ] AC6 — chaque test rougit si l'on retire la colonne ou si l'on ignore le choix explicite
      (ablation).

## Hors périmètre

- Le parcours d'acceptation d'une invitation de collaboration, et l'écart spec↔code sur les
  colonnes d'acceptation : ils relèvent de `/sync-specs` puis d'un ticket propre.
- La répartition de commission entre collaborateurs, qui a sa propre règle et son propre verrou.
- La messagerie de groupe.

## Notes d'implémentation

### Re-mesure des prémisses sur `dev` à `3ae586cd` (2026-10-08)

Le ticket date du 2026-08-31 ; 586, 587, 590, 591 et 598 ont touché le contact principal depuis.

- **La règle de repli n'est plus « le plus anciennement invité » tout court.** TCK-590 y a ajouté
  l'éligibilité : un collaborateur `agent` n'est retenu que joignable (ni `blocked` ni `deleted`) et,
  pour un bien d'agence, personnel ACTIF de l'agence du bien (`PersonnelDeLAgence::estPersonnel`,
  branché sur `isStaffAt()` de 587) ; le propriétaire, que bailleur actif (`estProprietaire`).
  `PrimaryPropertyContact.php` relu en entier. Le choix explicite doit donc obéir à la même
  éligibilité, sinon la marque désignerait quelqu'un que la règle écarte.
- **« Quatre surfaces » : il y en a plus.** Outre la carte (`primary_contact` de `PropertyResource`),
  `contact-lead`, `contact-message` et la résolution (`…/conversation`), `PrimaryPropertyContact::for`
  sert aujourd'hui `GET …/contact` (téléphone public, 502/590), la notification du lead
  (`ContactLeadService`), `VisitNotifier` et `SendLeasePaymentReminders`. Toutes passent par `for()` :
  aucune n'a à changer.
- **Colonnes d'acceptation** : la prémisse tient. `2026_04_17_160008_create_property_collaborators_table`
  porte `invited_at`, `accepted_at`, `metadata` ; seul `PropertyCollaboratorSeeder` remplit
  `accepted_at`. Hors périmètre, inchangé.
- **598** : la fiche publique ne rend plus `collaborators` sur `public.*` et se lit dans un cache de
  données de 300 s. `PropertyPublicCacheObserver` ne réagit qu'aux colonnes de `properties` et à
  l'adresse — son docblock range le **contact** parmi ce qui attend les 300 s. Une désignation
  n'atteindrait donc pas la fiche avant 300 s : à corriger ici.
- **Écart majeur, côté front : il n'existe AUCUN écran de gestion des collaborateurs.** Le ticket
  demande de poser le choix « là où les collaborateurs se gèrent déjà ». `grep -rn collaborators
  takussan-web/src` ne rend que le type `PropertyListItem.collaborators` et la liste des agents du
  filtre de `properties/(liste)/page.tsx` ; les quatre routes `properties/{p}/collaborators` n'ont
  aucun appelant front. L'interface est donc posée dans la fiche du bien de l'espace pro, sans
  prétendre remplacer la gestion complète (ajout, retrait, rôle), qui n'existe pas et reste hors
  du Delta.
- **591 (passation)** : `AgentHandoverService::move('collaborations')` réécrit `user_id` de la ligne
  du partant vers le repreneur, ou la SUPPRIME si le repreneur en a déjà une. Une marque posée sur
  la ligne suit donc la passation dans le premier cas, et tombe (repli) dans le second. Noté pour
  TCK-603, qui reprend les biens à la passation.
- **AC3** nomme `manager` en plus de `viewer` et `co_owner` (la contrainte 3 ne les cite pas) : tout
  rôle autre qu'`agent` est refusé.

### Partie 1 — la marque, son unicité, la règle de lecture, le backfill

- Migration `2026_10_08_120000_add_is_primary_to_property_collaborators` : `is_primary boolean NOT NULL
  DEFAULT false`, index unique partiel `property_collaborators_one_primary_per_property (property_id)
  WHERE is_primary`, `CHECK property_collaborators_primary_is_agent (NOT is_primary OR role = 'agent')`.
  `is_primary` hors `fillable` ; l'évènement `saving` du modèle efface la marque quand le rôle quitte
  `agent` (sinon le `PUT …/collaborators/{c}` qui change le rôle rendait une 500 sur le `CHECK`).
- `PrimaryPropertyContact::collaborateurPrincipal()` : la ligne marquée si éligible, sinon le repli de
  502/590 ; `for()` s'écrit à partir d'elle, `eligible()` devient publique (le service la lit).
- Backfill par la définition unique, en écriture SQL (aucun évènement, aucune invalidation en masse).
- Preuves : `php artisan test tests/Feature/Property/PrimaryAgentSchemaTest.php
  tests/Feature/Property/PrimaryAgentBackfillTest.php` → 8 verts (31 assertions). Non-régression :
  11 classes voisines (contact principal, lead, message, résolution, passation, collaborateurs,
  rappels de loyer, modèles) → 99 verts.
- Ablations rejouées (`scratchpad/vague73/t504/abl.sh`, restauration `cp` + md5, journal
  `t504/ablations-p1.log`) — toutes rouges :
  A1 index rendu non unique → `deux_lignes_principales…` rouge ; A2 `CHECK` neutralisé →
  `un_role_autre_qu_agent…` rouge ; A3 évènement `saving` retiré → `changer_le_role_du_principal…`
  rouge (`QueryException` 23514) ; A4 backfill sur le plus récent invité → `le_backfill_marque…` rouge ;
  A5 choix explicite ignoré dans `collaborateurPrincipal` → les deux tests de backfill rouges ; A6 sans
  backfill → les deux tests de backfill rouges.

### Partie 2 — le service de désignation, l'endpoint, la fiche publique, le journal

- `App\Services\Property\PrimaryAgentDesignator::designate(Property, PropertyCollaborator, ?User): PrimaryAgentDesignation`
  — la seule écriture de la marque (ADR-0053 §3). Verrou `Property::withTrashed()->whereKey()->lockForUpdate()`,
  cible relue sous le verrou, refus en `ApiError` (`404 property.collaborator_not_found`,
  `422 property.primary_requires_agent`, `422 property.primary_not_eligible`), écriture SQL
  (ancienne marque retirée puis nouvelle posée), `activity('Property')` évènement
  `property.primary_agent_designated` avec `agency_id`, ancien/nouveau collaborateur et utilisateur et
  le contact d'avant, puis `RevalidatePublicPropertyPage` (après validation). Codes ajoutés en fr/en/wo
  dans `lang/*/errors.php`.
- `PUT /api/properties/{p}/collaborators/{c}/primary` (`properties.collaborators.primary`) ;
  `DesignatePrimaryCollaboratorRequest::authorize()` délègue à `update` de `PropertyPolicy`, comme
  `store`/`update` des collaborateurs. `GET …/collaborators` et la désignation rendent
  `primary_contact {user_id, collaborator_id, source: designated|invitation_order|owner}` ; la liste
  garde sa forme (`with('user')`), triée par `id`. `PropertyResource.collaborators[].is_primary`.
- `PropertyPublicCacheObserver::collaborationModifiee()` : création, suppression, ou modification
  de `role`/`user_id`/`invited_at`/`is_primary`/`property_id` d'une collaboration invalide la fiche
  (le docblock rangeait le contact parmi ce qui attend 300 s). Écouté sur `created`/`updated`/`deleted`
  et non `saved` : `wasRecentlyCreated` reste vrai sur l'instance après une création, et une simple
  mise à jour de commission repassait pour une création (mesuré, test rouge avant la correction).
- Le propriétaire du bien tient `update` (`properties.update_own`) : il peut désigner, exactement
  comme il peut déjà ajouter et retirer un collaborateur. Aucune règle neuve (contrainte 4).
- Preuves : `php artisan test tests/Feature/Property/PrimaryAgentDesignationTest.php` → 14 verts.
  Transverses : `tests/Feature/Property`, `DateInventoryByValueTest`, `DateRepresentationTest`,
  `AgencyIdIsIndexedTest`, `BasePolicyCapabilityTest`, `tests/Unit/Lang`,
  `AuthorizationPrecedesValidationTest`, `PropertyPublicCacheObserverTest`, `PropertyCollaboratorTest`,
  `AgentHandoverTest`, `PropertyPrimaryContactTest`, `PrimaryPropertyContactEligibilityTest`,
  `PropertyCollaboratorsNotExposedTest` → 171 verts ; `tests/Unit/Architecture`,
  `TeamFormationBoundaryTest`, `CataloguePublicCacheTest` → 20 verts. Gardes racine vertes.
- Ablations (`t504/ablations-p2.log`, `t504/ablations-c1.log`), toutes rouges : B1 sans verrou →
  `le_verrou_porte_sur_la_ligne_du_bien…` ; B2 sans refus de rôle → `designer_un_role_autre_qu_agent…`
  (le `CHECK` rend alors une 500) ; B3 sans éligibilité → `un_agent_bloque_ou_suspendu…` ; B4 sans
  invalidation → les deux tests de cache ; B5 sans journal → `…journalisee…` ; B6 `authorize()` ouvert
  à tout connecté → `l_autorisation_est_celle…` ; B7 choix explicite ignoré à la lecture → AC1 et le
  repli/réactivation ; B8 sans écoute des collaborations → `retirer_ou_ajouter…` ; B9 l'ancienne marque
  gardée → `redesigner_deplace_la_marque…` (23505) ; C1 migration sans colonne → 18 rouges sur 19
  (le 404 d'une ligne d'un autre bien est jugé avant le service).
