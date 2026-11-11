---
id: TCK-2633
title: "Notifications, côté API : chaque notification porte sa famille et dit si elle demande une action, avec les filtres et les comptes qui vont avec"
status: todo
phase: P1
family: back
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2634]
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: ["docs/models-spec.md#12-appnotification-️"]
tags: [back, notifications, audit-ux, app]
---

## Objectif utilisateur

Une demande de visite ne se lit plus comme une « mise en avant terminée ». La cloche sait ce qui demande une action (« À traiter ») et ce qui informe, et range chaque notification dans une famille reconnaissable (demande, visite, paiement, retard, bien, avis, système).

## Contrat de données

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- `AppNotification` porte :
  - `type` (`NotificationType` : `booking`, `payment`, `lease`, `maintenance`, `visit`, `message`, `system`, et les types de relevé bancaire et de délégation) ;
  - `code` (`App\Domain\Notifications\NotificationCode`, **111 cas**, avec `type()` qui rend le `NotificationType`) ;
  - `params` et `target`.
- Une partie des classes de `app/Notifications` écrivent encore sans `code` : leur texte est rendu par l'API, et non par le front (dette du principe 5, cf. TCK-605). Leur `type` est posé.
- `GET /api/notifications` (`NotificationController::index`) :
  - accepte `filter[unread]` et `per_page` (plafonné, TCK-588) ;
  - rend `meta.unread`.

  **Aucune famille, aucune notion d'action à faire, aucun autre filtre.**

## Direction UX / Artistique

Sans objet (ticket API). Écrans servis : TCK-2634 (puces « À traiter · Tout », icônes par famille, filtres de l'historique au bureau).

## Contraintes strictes (métier)

**Familles** (fermées, celles de la maquette) : `demande`, `visite`, `paiement`, `retard`, `bien`, `avis`, `systeme`.

- **Une table de vérité en code**, exhaustive sur `NotificationCode`. Un code neuf sans famille fait **échouer un test**, comme la parité des langues (garde de recensement, cf. `LangGroupParity`).
- **Une ligne sans `code`** prend sa famille de son `type`, par une seconde table exhaustive sur `NotificationType`. Une ligne inconnue tombe en `systeme`, jamais en erreur.

**« À traiter »** (`a_traiter`) : un booléen **par code**, dans la même table.

- Vrai seulement quand le destinataire a un geste à faire, par exemple :
  - visite demandée à confirmer ;
  - demande reçue ;
  - bien à valider ;
  - devis à valider ;
  - avis à modérer ;
  - loyer en retard pour l'agence.
- Faux pour l'information : paiement reçu, mise en avant terminée, export prêt, bail signé.
- Une ligne sans `code` est toujours `a_traiter = false`.

**La table est écrite une fois et relue partout** : la ressource, les filtres et les comptes la lisent, sans recopier de liste.

**Filtres et comptes** :

- `filter[famille]` (liste) et `filter[a_traiter]=1` s'ajoutent à `filter[unread]` et se cumulent.
- Ils se traduisent en conditions SQL sur `code` et `type` (listes dérivées de la table), jamais en filtrage PHP après pagination.
- `meta.counts {a_traiter_non_lues, par_famille {demande: n, …}}` porte sur les notifications **non lues** de l'appelant, en une requête groupée.

**Ressource** : `famille` et `a_traiter` sur chaque ligne. Les clés existantes ne changent pas.

**Rien ne change** à l'envoi, aux préférences, à la purge des lues (`notifications:prune-read`), ni à `LienDansLAgence` côté front.

## Delta à produire

- [ ] `App\Domain\Notifications\NotificationFamily` (enum) et la table `NotificationCode` → `{famille, a_traiter}`, plus, pour les lignes sans code, le genre de la cible stockée → `famille` puis `NotificationType` → `famille` (décision du 2026-11-11).
- [ ] `AppNotificationResource` : `famille`, `a_traiter`.
- [ ] `NotificationController::index` : `filter[famille]`, `filter[a_traiter]`, `meta.counts`.
- [ ] Tests :
  - `NotificationFamilyTableTest` : chaque cas de `NotificationCode` et de `NotificationType` a une famille ; ajouter un cas sans l'y mettre rougit ;
  - `NotificationFiltersTest` : `famille=visite,demande` ; `a_traiter=1` exclut une ligne sans code ; cumul avec `unread` ; `meta.counts` sur les non lues seulement ; nombre de requêtes constant.

## Critères d'acceptation

- [ ] AC1 — Un admin avec 16 notifications non lues « mise en avant terminée » et 1 « visite demandée » : `filter[a_traiter]=1` rend la seule visite, et `meta.counts.a_traiter_non_lues = 1`.
- [ ] AC2 — `meta.counts.par_famille` vaut exactement `{bien: 16, visite: 1}` pour le même compte : une famille sans non-lue est absente de l'objet. *« Mise en avant terminée » est écrite sans code ; c'est sa cible stockée (`property`) qui la range en `bien` (décision du 2026-11-11, Notes d'implémentation).*
- [ ] AC3 — Une notification écrite sans `code`, de `type = payment`, rend `famille = paiement` et `a_traiter = false`.
- [ ] AC4 — Ablation : retirer de la table la ligne d'un code fait rougir `NotificationFamilyTableTest`, avec le nom du code dans le message.

## Hors périmètre

- **Donner un `code` aux classes qui n'en ont pas** (texte encore rendu par l'API) : ticket à part, recommandé, dans la ligne de TCK-605 et du principe 5. Il ne bloque pas celui-ci.
- Le regroupement des répétitions (« 9 biens »), fait par le front sur les lignes chargées (TCK-2634).
- Le résumé quotidien par WhatsApp (spec § 2.3, digest).

## Notes d'implémentation

Relevé le 2026-11-11 sur `feat/audit-ux-app-lot-1` (c66938af4).

**Prémisses qui différaient**

- `NotificationCode` compte **114** cas, pas 111.
- **« Mise en avant terminée » n'a pas de code** : `BoostEndedNotification` écrit `type = system`, `code = null`,
  `target.kind = property`. Par la règle du ticket (une ligne sans code prend la famille de son type), elle est en
  `systeme`, et **AC2 (`{bien: 16, visite: 1}`) ne pouvait pas être tenu par la règle du ticket**. Base de démo : 153 lignes sans code sur 5071 — 81 `system`/`property` (mises en
  avant), 62 `booking` sans cible (réservation expirée), 6 `system`/`credits`, 3 `maintenance`, 1 `system` ; aucun
  code ni type stocké hors des enums. **Décision de la session (2026-11-11, option b)** : une ligne sans code
  prend d'abord la famille du genre de sa cible STOCKÉE (`target->>'kind'`), puis celle de son type. AC2 est
  tenu tel qu'écrit, les 81 lignes existantes comprises, sans migration.
- **Trois exemples « à traiter » du ticket arrivent aussi SANS code**, donc `a_traiter = false` par la règle : « bien
  à valider » proposé par un bailleur (`PropertyProposedNotification`, `system`, `PropertyController`
  l. 472 — distinct de `property.submitted_for_review`, qui a un code), l'intervention urgente
  (`UrgentMaintenanceCreatedNotification`, `maintenance`) et la demande de passage en agence au super-admin
  (`AgencyUpgradeRequestSubmittedNotification`, `system`). Même contradiction que la mise en avant, côté « à traiter » :
  seule une colonne qui nomme la notification (un `code`) permet de les ranger. **La règle de cible ne les corrige
  pas** : ces trois classes passent par `AppDatabaseChannel::TYPES` et n'écrivent AUCUNE cible stockée (seules les
  classes à `toAppNotification()` en écrivent : `Boost/*` → `property`, `Credits/*` → `credits`, favoris →
  `favorites`, recherches sauvegardées → `saved_searches`). « Bien proposé par un bailleur » reste donc en `systeme`,
  l'intervention urgente en `demande`, toutes trois non « à traiter » : c'est le ticket « donner un code aux classes
  sans code » qui les rangera. Classes sans code relevées dans `AppDatabaseChannel::TYPES` (21) et `Boost/*`,
  `Credits/*`, `FavoriteChangesNotification`, `SavedSearchMatchesNotification`.

**Décisions**

- Table unique : `App\Domain\Notifications\NotificationClassification` — `CODES` par code : `[famille, à traiter]` ;
  `TARGETS` par genre de cible (une ligne par clé de `NotificationTarget::PATHS`, `null` quand le genre ne tranche
  pas : `lease`, qui porte aussi les échéances) ; `TYPES` par type. Ordre : code → cible stockée → type. `of()` lit
  les colonnes stockées ; la ressource, les filtres et les comptes ne passent que par elle. Un code hors catalogue se
  lit comme l'absence de code, un genre inconnu comme l'absence de cible, en PHP comme en SQL ; un type inconnu
  tombe en `systeme`. La cible DÉDUITE (`NotificationTarget::derive()`, depuis `data`) n'est pas lue : le SQL ne
  saurait pas la refaire.
- Garde de recensement : `tests/Unit/Notifications/NotificationFamilyTableTest.php` — tout `NotificationCode`, tout
  genre de `NotificationTarget::PATHS` et tout `NotificationType` doit avoir sa ligne, et aucune ligne orpheline.
- Rangements par cible qui sont un jugement : `saved_searches` et `favorites` en `bien` ; `credits` et les pages
  d'agence (`team`, `audit`…) en `systeme` ; les pages de paiement en `paiement`.
- `meta.counts` : une requête `GROUP BY code, type, target->>'kind'` sur les non-lues, repliée en PHP par `of()` — pas de `CASE`
  SQL qui dériverait de la table. Le total `meta.unread` (inchangé) sort de la même requête : la liste fait une
  requête de moins qu'avant. Les comptes ignorent les filtres.
- `filter[unread]`, `filter[a_traiter]` : `1`/`true`/`0`/`false`, sinon 422 (`ListNotificationsRequest`) ; avant,
  `$request->boolean()` lisait toute valeur (`oui` → faux). Le front envoie `1`.
- Rangements qui sont un jugement (à revoir avec la maquette) : le bail (`lease.*`) en `systeme`, comme « Bail
  signé » dans la maquette ; les interventions (`maintenance*`) et les messages en `demande` ; KYC, gouvernance,
  délégations, invitations, moyens de reversement en `systeme` ; relevés bancaires, reversements, commissions en
  `paiement` ; `prospect_match.digest` et la modération d'un bien en `bien`.
- « À traiter » par code, d'après le destinataire réel : `lease_payment.overdue` (au locataire : payer) et
  `lease_payment.overdue_digest` (à l'agent, contact principal) sont vrais ; `lease_payment.overdue_landlord`
  (au bailleur, l'agence relance) est faux. `message.received` est faux (la messagerie a ses non-lus).
- Toute voie qui ajoute un `NotificationCode` lui doit désormais une ligne dans `CODES`
  (`NotificationFamilyTableTest` le nomme).
