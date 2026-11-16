# ADR-0117 — Les vues d'un bien se comptent aussi par jour, sans visiteur

- **Statut** : Accepté le 2026-11-15 — décision du porteur « implémente tout », modalités à revoir
- **Date** : 2026-11-15
- **Tickets** : TCK-2905 (API), TCK-2908 (écran)
- **S'appuie sur** : [ADR-0052](0052-cache-public-de-la-fiche-et-ip-du-visiteur.md) §1 (la vue se compte par un seul chemin, `PropertyViewCounter`), [ADR-0021](0021-sparse-fieldsets-au-niveau-ressource.md) (un champ calculé n'est pas un champ de `fields[]`), [ADR-0097](0097-en-ligne-est-un-etat-derive.md) § 1 (inclusions calculées lues par le contrôleur)

## Contexte

La liste des biens en mode Annonces doit dire ce qu'une annonce a rapporté **le mois passé** : « 312 vues · 9 contacts · 3 visites (30 j) » (audit `app-biens`, e1).

Mesuré le 2026-11-15 (worktree `feat/audit-manques-2026-11-15`) :

- `properties.views_count` est un **compteur cumulé**, incrémenté par `PropertyViewCounter::record()` (3 vues par bien, par réseau d'IP et par heure). Aucune vue n'est datée — `RadarActivationReminders` le dit et contourne l'absence par une ligne de base.
- Les contacts (`property_contact_leads`, fils directs `conversations` d'un bien) et les visites (`property_visits`) sont datés : ils se comptent sur une fenêtre sans rien ajouter.
- Seule table quotidienne existante : `property_boost_daily_stats`, propre aux boosts.

## Décision

### 1. Une table `property_daily_views` : (bien, jour, nombre)

- Colonnes : `property_id` (clé étrangère, suppression en cascade), `day` (date), `views` (entier), horodatages. Unique `(property_id, day)`, index sur `day` pour la purge.
- **Aucune adresse IP, aucun identifiant de visiteur** : la déduplication reste celle du limiteur de `PropertyViewCounter`, en cache, jamais en base. La table ne dit que combien, et quel jour.
- Pas d'`agency_id` : la table se lit toujours par bien, sous la portée de la liste qui l'a amorcée.

### 2. Écrite au seul point qui compte une vue

`PropertyViewCounter::record()`, après la décision du limiteur, écrit `views_count` puis la ligne du jour par **un `upsert` atomique** (`ON CONFLICT (property_id, day) DO UPDATE SET views = views + 1`) — jamais une lecture suivie d'une insertion, jamais une violation d'unicité rattrapée (PostgreSQL abandonne la transaction). Le rendu de la fiche publique n'écrit toujours rien (ADR-0052).

`views_count` reste la vérité du cumul ; la table ne le remplace pas et n'est pas rétro-remplie : les vues antérieures au déploiement ne sont pas datées, la fenêtre de 30 jours se remplit d'elle-même.

### 3. Purgée au-delà de 400 jours

`properties:purge-daily-views` (planifiée chaque nuit) supprime les jours de plus de 400 jours : treize mois, de quoi comparer un mois à celui de l'an passé. Idempotente.

### 4. Lue par la liste agence, sur demande

`GET /api/properties?include=stats30d` rend `stats_30d { views, contacts, visits }` par bien, en **un nombre constant de requêtes** pour la page (trois agrégats groupés). C'est une inclusion calculée lue par le contrôleur (ADR-0097 § 1), **pas** un champ de `fields[properties]` : ADR-0021 a écarté le champ calculé derrière les sparse fieldsets. Aucune route publique ne l'amorce.

La fenêtre est la même pour les trois nombres : les 30 derniers jours, aujourd'hui compris (depuis le début du jour J-29).

- **vues** : la somme de `property_daily_views.views` sur la fenêtre ;
- **contacts** : les pistes `property_contact_leads` du bien (formulaire, clic WhatsApp, appel — la définition de `RadarActivationReminders`) et les fils directs `conversations` ouverts sur le bien (`contact-message`, qui ne crée pas de piste), créés dans la fenêtre ;
- **visites** : les `property_visits` du bien créées dans la fenêtre, ou terminées dans la fenêtre, hors annulées.

## Conséquences

- Une écriture de plus par vue comptée (déjà dédupliquée) ; aucune au rendu.
- La table croît d'au plus une ligne par bien vu et par jour, bornée à 400 jours.
- Les 30 premiers jours après le déploiement, `stats_30d.views` sous-compte : il ne voit que les vues datées.

## Application

- Migration `2026_11_15_2905_create_property_daily_views_table`, `App\Models\PropertyDailyView`, `PropertyViewCounter::record()`, `App\Services\Property\PropertyStats30d`, commande `properties:purge-daily-views`.
- Tests : `PropertyDailyViewsWriteTest`, `PropertyStats30dTest`, `PropertyOwnerFilterTest`.
