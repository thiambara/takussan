---
id: TCK-504
title: "Agent principal — une agence le CHOISIT, au lieu qu'un ordre le déduise"
status: done
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

- [x] Migration : marquer le collaborateur principal, avec l'unicité par bien portée par le schéma.
      → `is_primary` + index unique partiel + `CHECK` (`PrimaryAgentSchemaTest`, 5 verts).
- [x] Backfill : les biens existants gardent le contact que `PrimaryPropertyContact` leur donne
      aujourd'hui, pour qu'aucune fiche publique ne change de visage à la migration.
      → `PrimaryAgentBackfillTest` (3 verts) et le jeu des seeders (AC5).
- [x] `PrimaryPropertyContact::for()` : le choix explicite d'abord, le repli actuel ensuite.
      → `collaborateurPrincipal()` ; ablations A5 et B7 rouges.
- [x] Endpoint de désignation + `FormRequest` + policy déléguée.
      → `PUT /api/properties/{p}/collaborators/{c}/primary`, `DesignatePrimaryCollaboratorRequest`
      → `can('update', $property)` ; ablation B6 rouge.
- [x] UI de gestion des collaborateurs : désigner, voir qui l'est, comprendre ce que ça change.
      → `PropertyCollaboratorsPanel` (6 vitest verts, ablations W1–W4 rouges), mesuré au navigateur
      (§ Partie 3). Aucun écran de collaborateurs n'existait : le panneau est posé dans la fiche pro.
- [x] Tests : unicité, refus sur un rôle non-`agent`, repli après suppression du principal,
      et le backfill qui ne déplace aucun contact.

## Critères d'acceptation

- [x] AC1 — sur un bien à deux collaborateurs `agent`, désigner le second fait que la carte de
      contact, `contact-lead`, `contact-message` et la résolution nomment tous le second.
      → `test_designer_le_second_agent_le_fait_nommer_par_toutes_les_surfaces` (+ `GET …/contact`) ;
      au navigateur, la fiche publique nomme chaque agent désigné à l'écran (3 désignations sur 3).
- [x] AC2 — deux désignations concurrentes sur le même bien laissent **un** principal, pas deux.
      → course réelle à deux processus sur base jetable (§ AC2) : 1 principal sur S1, S1 inversé et
      80 `PUT` ; témoin R2 (sans verrou ni index) → 2 principaux.
- [x] AC3 — désigner un collaborateur de rôle `viewer`, `manager` ou `co_owner` est refusé par le
      serveur.
      → `test_designer_un_role_autre_qu_agent_est_refuse_par_le_serveur` (422
      `property.primary_requires_agent`, les trois rôles) ; ablation B2 rouge.
- [x] AC4 — supprimer le collaborateur principal ramène le contact au repli de TCK-502, sans
      qu'aucun écran ne rende un contact vide.
      → `test_supprimer_le_principal_ramene_le_repli_sans_contact_vide` (agent suivant, puis
      propriétaire) ; côté écran, la source `owner` se lit « le propriétaire répond » (vitest).
- [x] AC5 — après la migration, **aucun** bien du jeu de données ne change de contact principal.
      → 856 biens, 182 marques, 0 contact changé sur trois relevés (§ AC5) ; `PrimaryAgentBackfillTest`.
- [x] AC6 — chaque test rougit si l'on retire la colonne ou si l'on ignore le choix explicite
      (ablation).
      → C1 (migration sans colonne) : 18 rouges sur 19 — le seul vert est
      `test_la_ligne_d_un_autre_bien_rend_404`, jugé avant toute lecture de la marque, que garde
      sa propre condition. A5 et B7 (choix ignoré) : rouges sur les tests qui lisent le choix.
      Lu comme « aucun test de la marque ne passe sans elle » ; les tests d'autre chose (404,
      autorisation) ont chacun leur ablation (B6…).

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

### AC2 — la course réelle, à deux processus, sur base jetable

Harnais `scratchpad/vague73/t504/race/` (base `takussan_tck504_race`, migrée par le code de la branche,
`Notification::fake()`, `Http::preventStrayRequests()`, `LARAVEL_PDF_DRIVER=dompdf`, garde sur le nom de la
base ; supprimée après). S1 : le processus A désigne sa ligne dans une transaction extérieure tenue
1500 ms avant le `COMMIT`, B désigne l'autre ligne 300 ms après — le chevauchement est certain, pas
probable. S2 : deux processus, 40 `PUT …/primary` HTTP chacun (noyau Laravel), alternés, en même temps.

| Code | S1 | S1 inversé | S2 |
|---|---|---|---|
| branche (`course-head.log`) | A OK, B **attend 1259 ms** puis OK → 1 principal [B] | 1 principal [A] | 80 × 200, 1 principal |
| R1 sans verrou du bien (`course-ablation.log`) | B → `23505` sur `property_collaborators_one_primary_per_property`, 1 principal [A] | idem, [B] | — |
| R2 sans verrou ni index unique | A et B OK, **2 principaux [A,B]** | **2 principaux [B,A]** | — |
| R3 sans index unique, verrou en place | 1 principal [B] | 1 principal [A] | — |

Lecture : l'index garantit « un seul principal » à lui seul (R1), mais la seconde désignation y meurt en
500 ; le verrou de la ligne du bien sérialise et fait réussir les deux (R3) ; sans les deux, deux
principaux (R2). Mutation, course et restauration (`cp` + md5) dans `ablation-course.sh`, un seul script.

### AC5 — le backfill sur le jeu des seeders

Base `takussan_tck504_seed` : `migrate:fresh --seed` (179 s, `SEED_DOWNLOAD_MEDIA=false`, `Http::preventStrayRequests()`).
La migration y passe avant les seeders, donc sans données : relevé « avant » = le repli de 502/590.
Puis `migrate:rollback --step=1` (seule `2026_10_08_120000_…` revient), relevé sans la colonne, puis
`migrate` (le backfill tourne sur les données semées), relevé « après » (`t504/seed/step2.sh`) :
**856 biens, 182 marques posées, 0 contact changé** sur les trois relevés, mêmes ensembles de biens.
64 biens y ont deux agents ou plus ; le semeur leur donne la même date d'invitation (départage par
`id`) : les cas où l'ordre d'invitation contredit l'ordre d'insertion, un premier agent bloqué,
suspendu ou retiré, une date nulle et un bien supprimé sont couverts par `PrimaryAgentBackfillTest`.

### Partie 3 — l'écran, et la mesure au navigateur

- `PropertyCollaboratorsPanel`, onglet « Vue d'ensemble » de `/app/properties/{id}` (rendu par
  `PropertyDetailTabs`, pas par `PropertyOverviewPanel` dont le test n'a pas de `QueryClient`). Il dit
  ce que le choix change (« la personne que la fiche publique du bien nomme, qui reçoit les messages
  et les demandes des visiteurs, et dont le numéro s'affiche »), pourquoi quelqu'un répond
  (`source` : choisi par l'agence / premier agent associé / propriétaire, sans alerte), marque la ligne
  (« Agent principal », ou « Répond par défaut » sans choix), et porte « Désigner comme principal » sur
  les seules lignes `agent` non marquées. Le refus du serveur s'affiche tel quel (`messageErreurApi`).
  Libellés `property.dashboard.collaborators` en fr/en/wo.
- Preuves : `PropertyCollaboratorsPanel.test.tsx` → 6 verts ; `tsc --noEmit` 0 ; `npm run lint` 0 ;
  `check-i18n`, `check-i18n-namespaces`, `check-classes-emises` verts ; vitest `property-dashboard`,
  `(dashboard)/app/properties`, `promesses-de-delai`, `src/i18n` → 253 verts.
- Ablations (`t504/abl-web.sh`, `cp` + md5, `t504/ablations-web.log`), toutes rouges : W1 bouton sur
  tout rôle ; W2 désignation envoyée pour une autre ligne ; W3 refus du serveur remplacé par un message
  générique ; W4 source muette (4 rouges).
- **Au navigateur** (Chrome headless par CDP, ports 8116/3116/9356, base jetable
  `takussan_tck504_seed`, supprimée ; session posée par `set-token` pour l'admin de l'agence 1 ;
  bien 8, deux agents) : désigner l'autre agent → `PUT …/collaborators/6/primary` 200, la ligne prend
  le badge, l'état survit au rechargement, la base porte la marque, le journal compte l'évènement.
  fr, en et wo relus à l'écran. À 360 px : `scrollWidth` = `innerWidth` = 360. **Défaut trouvé et
  corrigé** : le bouton mesurait 180 × 36, sous les 44 px que le dépôt tient ailleurs → `min-h-11`
  sous `sm`, 180 × 44 remesuré.
- **Fiche publique, au navigateur.** Sans `PUBLIC_CACHE_REVALIDATE_URL` (témoin), la fiche publique
  est restée sur l'ancien agent après une désignation : le cache de données de 598 est réel. Avec
  l'URL et le secret câblés vers le front local, trois désignations successives à l'écran
  (Coumba → Ousmane → Coumba) sont chacune lues sur la fiche publique à la lecture suivante, et le
  front journalise trois `POST /api/revalidation/fiche` 200.

### Vérification adverse (verif-504 : ACCEPTÉ, 0 B, 0 M, 6 m) — les six mineurs corrigés

- **m1 — désignation croisée avec un changement de rôle ou une suppression : 500 → refus contractuel.**
  Trois couches, chacune prouvée seule (`PrimaryAgentConcurrentChangeTest`, 5 verts ; ablations
  `t504/ablations-m1.log`, M1a–M1d toutes rouges) : `update()`/`destroy()` des collaborateurs prennent
  le verrou du bien puis relisent la ligne (ordre bien → ligne, celui du service) ; le service pose la
  marque par une écriture conditionnée par `role = 'agent'` et traduit zéro ligne en `404
  property.collaborator_not_found` / `422 property.primary_requires_agent` ; le modèle (`updating`)
  retire la marque STOCKÉE quand le rôle quitte `agent` (instance périmée). La passation de 591 ne
  prend pas le verrou du bien — elle verrouille ses lignes d'abord, l'y ajouter inverserait l'ordre
  des verrous : l'écriture conditionnelle la couvre. **Course réelle** à deux processus, P2 par le
  vrai contrôleur (noyau HTTP) dans une transaction tenue 3 s, base jetable `takussan_tck504_race`
  supprimée (`t504/race/course-m1.log`) :

  | Code | P2 change le rôle | P2 supprime | P2 enregistre une instance périmée |
  |---|---|---|---|
  | branche | P1 `ApiError 422 primary_requires_agent` | P1 `ApiError 404 collaborator_not_found` | OK, marque retirée |
  | R-a sans verrou dans `update()`/`destroy()` | 422 (l'écriture conditionnelle tient) | 404 | OK |
  | R-b écriture inconditionnelle | 422 (le verrou tient) | 404 | OK |
  | R-c ni l'un ni l'autre | **`SQLSTATE 23514`** | **`ModelNotFoundException`** | OK |
  | R-d sans `updating` du modèle | 422 | 404 | **`SQLSTATE 23514`** |
- **m2 — le bouton ne s'affiche qu'à qui peut désigner.** `GET …/collaborators` (et la réponse de la
  désignation) portent `can_designate`, calculé par la règle même de l'endpoint (`can('update', $bien)`,
  profil actif compris) ; le panneau conditionne le bouton dessus. Un agent de l'agence qui n'a pas
  créé le bien lit la liste (200, `can_designate: false`), ne voit aucun bouton, et son `PUT` reste
  403. Preuves : `test_la_liste_dit_si_l_appelant_peut_designer_par_la_regle_de_l_endpoint`, vitest
  « sans le droit de désigner, aucun bouton » ; ablations M2a (droit toujours vrai) et M2b (bouton
  sans droit) rouges (`t504/ablations-m2.log`).
- **m3 — une marque sur un agent devenu inactif : le panneau dit la vérité.** La liste ajoute la
  source `designated_unavailable` et `designated_collaborator_id` (la ligne marquée), pendant que
  `collaborator_id` nomme la ligne réellement servie (le repli, ou `null` pour le propriétaire). Le
  badge « Agent principal » suit qui répond **et** le choix (`source === 'designated'`) ; la ligne
  marquée inactive porte « Choisi, indisponible » ; la phrase nomme le repli qui répond à sa place
  (ICU `select` agent / propriétaire), en fr, en et wo. Preuves :
  `test_une_marque_sur_un_agent_inactif_est_dite_indisponible_et_le_repli_nomme` (repli agent, repli
  propriétaire, retour du choix à la réactivation) et deux vitest ; ablations M3a (source absente),
  M3b (badge sur la marque), M3c (repli toujours « agent ») rouges (`t504/ablations-m3.log`).
- **m4 — la duplication garde le contact.** `PropertyDuplicationService` recopie `invited_at` (le
  repli reste identique) et pose la marque sur la ligne clonée du même titulaire, par le
  constructeur de requêtes (bien neuf : aucune marque concurrente possible). Preuves :
  `test_dupliquer_le_bien_garde_son_contact_par_le_choix_comme_par_le_repli` ; le cas `v2d` du
  vérificateur, joué tel quel, passe (`marques du clone = [4], contact du clone = 4 (source : 4)`) ;
  ablations M4a (marque non recopiée) et M4b (`invited_at` non recopié) rouges
  (`t504/ablations-m4.log`).
- **m5 — le retrait de l'écoute `updated` rougit désormais.** `test_retirer_ou_ajouter_un_collaborateur_invalide_aussi_la_fiche`
  ajoute le `PUT …/collaborators/{principal}` `role=viewer` : la marque tombe et la fiche du bien est
  invalidée. Ablation M5 (ligne `PropertyCollaborator::updated(...)` retirée) : rouge, sur les 4
  classes TCK-504 (`t504/ablations-m5.log`) — elle restait 22/22 verte avant. B8 du rapport ne
  couvrait que `created`/`deleted`.
- **m6 — le docblock de l'observateur dit sa limite.** Seuls les changements de contact qui passent
  par une ligne de collaboration invalident la fiche ; ceux qui passent par l'éligibilité (compte
  bloqué ou supprimé, profil suspendu ou retiré, sortie de l'agence) attendent encore la revalidation
  de 300 s. Écrit dans `PropertyPublicCacheObserver` et dans ADR-0053 « Conséquences » (ticket
  d'invalidation sur `AgentProfile`/`User` à ouvrir si on la veut : non ouvert ici). La limite est
  épinglée par `test_un_changement_de_contact_par_l_eligibilite_attend_la_revalidation_limite_documentee`,
  qui rougira le jour où elle sera levée. Ablation sans objet pour un commentaire. ADR-0053 §4
  décrit aussi la forme de réponse issue de m2/m3 (`can_designate`, `designated_collaborator_id`,
  `designated_unavailable`).
