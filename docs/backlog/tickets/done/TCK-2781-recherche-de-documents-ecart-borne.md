---
id: TCK-2781
title: "Recherche de documents : la lecture se dit au moteur par un filtre borné, et non par un `NOT id IN [...]` qui grandit avec les téléversements"
status: done
phase: P3
family: back
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#24-recherche--filtres"
  models:
    - "docs/models-spec.md#22-document-"
tags: [back, documents, recherche, meilisearch, performance, suite-de-tck-2759]
---

## Objectif utilisateur

La recherche de documents d'un membre du personnel reste juste et rapide, quel que soit le nombre de pièces qu'il a
téléversées dans une agence qu'il a quittée.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 25 : ticket de suivi. Relevé ab (TCK-2759 r4).

**Priorité, telle que la décision la pose.** Le défaut n'a aucun effet visible à l'échelle de la démo. Il devient réel
quand un auteur dépasse **quelques milliers de pièces** dans une agence quittée. Le ticket est rangé en P3 pour
cette raison : il ne s'ouvre pas avant ce seuil, sauf décision contraire du porteur. L'implémenteur mesure d'abord
le plus grand écart de la base de préproduction, en lecture seule, et l'écrit dans les notes.

**Constat, relu sur l'arbre du 2026-11-13.**

- `DocumentSearchService::search()` borne le moteur par `uploaded_by` (hors super-admin), puis lui passe
  `whereNotIn('id', $exclus)`.
- `exclus()` calcule en SQL l'écart entre ce périmètre et la lecture :
  - pour le personnel : `DocumentPolicy::restreindreAuTeleverseur` ;
  - pour le super-admin : `restreindreAuxLecteursDInternes`.
- Le docblock le dit lui-même : la liste n'est « pas bornée ». Pour un membre du personnel parti, elle contient
  tous ses téléversements dans l'agence quittée, envoyés en un seul filtre Meilisearch à chaque recherche.
- L'index des documents (`config/scout.php`) a pour attributs filtrables `id`, `type`, `documentable_type`,
  `documentable_id`, `uploaded_by` et `created_at`. Il n'a ni l'agence du porteur, ni `is_internal`, ni le sujet
  d'une fiche client : la règle de lecture ne peut donc pas s'y écrire autrement que par une liste d'identifiants.

**Endpoint touché :** `GET /api/search/documents`.

## Contraintes strictes (métier)

- **La recherche suit la lecture (ADR-0099 § 1)**, exactement comme aujourd'hui. Un document que `view()` refuse
  n'est ni rendu, ni compté dans le total, ni présent dans aucune page. Ce ticket ne change aucun verdict.
- **Le filtre passé au moteur est borné** par le nombre d'agences du lecteur, pas par son nombre de documents.
- **Le total et les pages restent justes.** Pas de filtrage après coup d'une page déjà découpée par le moteur
  (la leçon de TCK-786).
- La règle SQL (`restreindreAuTeleverseur`, `restreindreAuxLecteursDInternes`) reste la référence. Le filtre du moteur
  en est une **traduction**, gardée par un test de parité.
- Un attribut dénormalisé dans l'index est réindexé quand sa source change : un bien qui change d'agence, une fiche
  dont le `user_id` change, un document dont `is_internal` bascule.

## Delta à produire

- [x] `Document::toSearchableArray()` gagne :
  - `carrier_agency_id`, l'agence du porteur (bien, bail, réservation, fiche, état des lieux par son bien, agence,
    profils), ou `null` ;
  - `is_internal` ;
  - `subject_user_id`, le `user_id` de la fiche client ou le locataire du bail, quand la règle le lit.
- [x] `config/scout.php` : ces trois attributs deviennent filtrables. `docker/release.sh` les pousse par
  `search:sync-index-settings`. ⚠ Ils entrent dans l'empreinte `.search-shape` : le déploiement suivant réimporte
  les index.
- [x] `DocumentSearchService` : le `whereNotIn('id', …)` est remplacé par un filtre écrit avec ces attributs et les
  agences gardées du lecteur (`memberAgencyIds` plus les agences de ses profils de bailleur).
- [x] Observateurs : réindexation des documents d'un porteur dont l'agence ou le sujet change.
- [x] Test de parité `RechercheDocumentsPariteSqlMoteurTest`, sur Meilisearch réel. Pour une matrice de lecteurs
  (personnel actif, personnel parti, agent suspendu, bailleur, super-admin sujet d'une fiche) × porteurs, l'ensemble
  rendu par le moteur égale l'ensemble que la requête SQL de la liste rend.

## Critères d'acceptation

- [x] AC1 — Pour un membre du personnel parti avec 3 000 téléversements dans l'agence quittée, la requête envoyée à
  Meilisearch ne contient aucune liste d'identifiants. Le test l'épingle sur le filtre construit.
  *Preuve : `test_le_filtre_envoye_ne_depend_pas_du_nombre_de_documents` lit le filtre de l'appel réel au moteur
  (`interroger()` espionné) : identique avec 1 et 3 001 téléversements, aucune clause sur `id`, moins de 400
  caractères. Ablation (le `whereNotIn('id', …)` remis) : rouge.*
- [x] AC2 — Les huit tests de `DocumentInterneFicheEtRechercheTest` restent verts sans modification de leurs attentes.
  *Preuve : 9 tests sur 9 verts (le fichier en compte neuf), fichier non modifié.*
- [x] AC3 — Le test de parité est vert pour chaque case de la matrice.
  *Preuve : cinq lecteurs (personnel actif, personnel parti vers une autre agence, agent suspendu, bailleur bloqué,
  super-admin sujet d'une fiche) × 38 pièces sur tous les porteurs : ensemble, total et attente explicite égaux.*
- [x] AC4 — Un bien qui change d'agence voit ses documents réindexés : la recherche du personnel de l'ancienne agence
  ne les rend plus, celle de la nouvelle les rend.
  *Preuve : `test_un_bien_qui_change_d_agence_reindexe_ses_documents` (avec l'état des lieux du bien).*
- [x] AC5 — Vérifié par ablation. Un filtre qui oublie les profils de bailleur, ou un observateur retiré, rend un test
  rouge.
  *Preuve : 31 ablations, toutes rouges (liste dans les notes).*

## Hors périmètre

- La recherche dans le coffre (`filter[search]` de `GET /api/me/document-vault`) : TCK-2769.
- Changer qui lit quoi.

## Notes d'implémentation

**Relevé de l'écart (2026-11-14).** **La préproduction n'a pas été mesurée** (décision de team-lead : relevé sur la
démo locale seulement). Sur la base de démo locale, en lecture seule : 382 documents, 19 téléverseurs, **plus grand
écart : 27 identifiants**. La requête suivante le rend, à rejouer telle quelle sur la préproduction (lecture seule) ;
elle donne le même 27 que la règle PHP (`restreindreAuTeleverseur`) sur la démo :

```sql
-- TCK-2781 — le plus grand écart de la règle d'auteur : par téléverseur, ses documents que
-- `restreindreAuTeleverseur` retire (porteur d'une agence où il n'est ni membre actif ni bailleur de tout
-- statut, sans être le sujet du porteur). Lecture seule. Approximations : délégations prises par
-- statut et échéance seulement ; documents internes non comptés (leur règle est bornée par l'agence).
WITH porteur AS (
  SELECT d.id, d.uploaded_by,
    CASE d.documentable_type
      WHEN 'App\Models\Property' THEN (SELECT x.agency_id FROM properties x WHERE x.id = d.documentable_id AND x.deleted_at IS NULL)
      WHEN 'App\Models\Lease' THEN (SELECT x.agency_id FROM leases x WHERE x.id = d.documentable_id AND x.deleted_at IS NULL)
      WHEN 'App\Models\Booking' THEN (SELECT x.agency_id FROM bookings x WHERE x.id = d.documentable_id AND x.deleted_at IS NULL)
      WHEN 'App\Models\Customer' THEN (SELECT x.agency_id FROM customers x WHERE x.id = d.documentable_id AND x.deleted_at IS NULL)
      WHEN 'App\Models\Agency' THEN (SELECT x.id FROM agencies x WHERE x.id = d.documentable_id AND x.deleted_at IS NULL)
      WHEN 'App\Models\AgencyUpgradeRequest' THEN (SELECT x.agency_id FROM agency_upgrade_requests x WHERE x.id = d.documentable_id)
      WHEN 'App\Models\Inventory' THEN (SELECT p.agency_id FROM inventories x JOIN properties p ON p.id = x.property_id AND p.deleted_at IS NULL
                                        WHERE x.id = d.documentable_id AND x.deleted_at IS NULL)
      WHEN 'App\Models\Profiles\OwnerProfile' THEN (SELECT x.agency_id FROM owner_profiles x WHERE x.id = d.documentable_id AND x.deleted_at IS NULL)
      WHEN 'App\Models\Profiles\AgentProfile' THEN (SELECT x.agency_id FROM agent_profiles x WHERE x.id = d.documentable_id AND x.deleted_at IS NULL)
      WHEN 'App\Models\Profiles\AgencyAdminProfile' THEN (SELECT x.agency_id FROM agency_admin_profiles x WHERE x.id = d.documentable_id AND x.deleted_at IS NULL)
    END AS agence,
    CASE d.documentable_type
      WHEN 'App\Models\Lease' THEN (SELECT c.user_id FROM leases x JOIN customers c ON c.id = x.tenant_id AND c.deleted_at IS NULL WHERE x.id = d.documentable_id)
      WHEN 'App\Models\Booking' THEN (SELECT c.user_id FROM bookings x JOIN customers c ON c.id = x.customer_id AND c.deleted_at IS NULL WHERE x.id = d.documentable_id)
      WHEN 'App\Models\Customer' THEN (SELECT x.user_id FROM customers x WHERE x.id = d.documentable_id)
      WHEN 'App\Models\Profiles\OwnerProfile' THEN (SELECT x.user_id FROM owner_profiles x WHERE x.id = d.documentable_id)
      WHEN 'App\Models\Profiles\AgentProfile' THEN (SELECT x.user_id FROM agent_profiles x WHERE x.id = d.documentable_id)
      WHEN 'App\Models\Profiles\AgencyAdminProfile' THEN (SELECT x.user_id FROM agency_admin_profiles x WHERE x.id = d.documentable_id)
    END AS sujet
  FROM documents d
  WHERE d.deleted_at IS NULL AND d.uploaded_by IS NOT NULL AND d.is_internal = false
), gardees AS (
  SELECT user_id, agency_id FROM agent_profiles WHERE status = 'active' AND deleted_at IS NULL
  UNION SELECT user_id, agency_id FROM agency_admin_profiles WHERE status = 'active' AND deleted_at IS NULL
  UNION SELECT user_id, agency_id FROM owner_profiles WHERE deleted_at IS NULL
  UNION SELECT user_id, agency_id FROM role_delegations
        WHERE status = 'active' AND role IN ('agent', 'agency_admin') AND (ends_at IS NULL OR ends_at > now())
)
SELECT p.uploaded_by, count(*) AS ecart
FROM porteur p
WHERE p.agence IS NOT NULL
  AND (p.sujet IS NULL OR p.sujet <> p.uploaded_by)
  AND NOT EXISTS (SELECT 1 FROM gardees g WHERE g.user_id = p.uploaded_by AND g.agency_id = p.agence)
GROUP BY p.uploaded_by
ORDER BY ecart DESC
LIMIT 5;
```

**Le filtre** (`DocumentSearchService::filtreDeLecture`), en plus de `uploaded_by = U` :

- personnel et bailleur : `(is_internal = false OR (documentable_type = Customer AND carrier_agency_id = S AND
  subject_user_id != U)) AND (carrier_agency_id IS NULL OR carrier_agency_id IN [G] OR subject_user_id = U)`.
  `S` est `staffAgencyId()` et `G` vaut `DocumentPolicy::agencesGardeesDuTeleverseur()`. Cette méthode est extraite
  de `restreindreAuTeleverseur`, qui la lit aussi : le SQL et le moteur ont une seule liste d'agences ;
- super-admin : `is_internal = false OR (documentable_type = Customer AND carrier_present = true AND subject_user_id != U)`.

**Écarts au delta.**

1. Un quatrième attribut, `carrier_present`. Le super-admin lit l'interne d'une fiche présente, même sans agence
   (`customers.agency_id` peut être nul). Une fiche supprimée ne se lit pas. `carrier_agency_id` seul confondait
   les deux cas.
2. `subject_user_id` couvre quatre branches de la règle d'auteur : le locataire du bail, le client de la
   réservation, le `user_id` de la fiche et celui des trois profils. Le delta n'en nommait que deux.
3. `id` n'est plus filtrable : un `NOT id IN` réintroduit échoue tout de suite au lieu de grandir en silence.
4. Sous les pilotes `collection` et `database` (`DocumentSearchTest`), le rappel de Scout reçoit la requête
   Eloquent et ne pose plus les `where` : la règle SQL elle-même y est appliquée.
5. Les écritures de masse de `RadarClaims::absorbOrphan` (fiches et réservations) appellent la réindexation.
   Celle de `AccountDeletionService`, qui met `customers.user_id` à `null`, est laissée telle quelle : l'ancien
   sujet est le compte effacé, et aucun autre lecteur ne voit la différence (`U != V` et `null != V` donnent le
   même résultat).

**Déploiement.** Les réglages de l'index changent (`config/scout.php`), et l'empreinte `.search-shape` aussi :
`release.sh` pousse les réglages, puis réimporte. Entre les deux, un document de l'ancienne forme n'est rendu à
personne : le filtre échoue fermé (`test_un_document_indexe_sans_les_faits_du_porteur_n_est_pas_rendu`). La base
de démo locale reste sur l'ancienne forme jusqu'à `search:sync-index-settings` puis une réimportation.

**Défense en profondeur** (demandée par team-lead, 2026-11-14). Sous `SCOUT_QUEUE=true`, le filtre lit un index
qui peut être en retard sur la base : une pièce passée interne, ou dont le porteur a changé d'agence, y garde ses
anciens faits jusqu'au passage de la file. Seul, il échouerait donc ouvert. Les résultats hydratés repassent par la
règle SQL de référence (`$search->query(…)`, `restreindreLaLecture`) : rien de ce que `view()` refuse ne sort.
Pendant le retard, une page peut compter moins de lignes que `per_page`. Scout recompte le total en SQL sur les
identifiants rendus par le moteur, au plus `maxTotalHits` et seulement quand le résultat tient sur plusieurs pages.
Ce total ignore un document devenu lisible que l'index ne connaît pas encore. Le test
`test_un_index_en_retard_ne_rend_pas_ce_que_la_lecture_refuse` écrit les deux changements sans événement : il
rougit à l'ablation du post-filtre.

**Écart de fiabilité, connu et laissé.** Une suppression de profil en masse (`UserRoleController`,
`AgencyMemberRoleController` : `->agentProfiles()->where(…)->delete()`) ne réindexe pas les pièces de ces profils.
L'index garde alors leur agence, et la règle SQL ne les retire plus. L'écart échoue fermé : la recherche rend moins
que la liste, jamais plus.

**Retrait de `id` pendant un déploiement.** Pendant que `release.sh` synchronise les réglages, les anciens conteneurs
servent encore le `NOT id IN` : Meilisearch le refuse, et la recherche de documents tombe en erreur pour qui a une
liste d'exclusion non vide. Seule la préproduction est servie aujourd'hui, et la fenêtre se ferme au redémarrage. Le
choix (a/b) est posé à team-lead.

**Ablations, une à la fois, md5 restauré : 31, toutes rouges.**

- Filtre : profils de bailleur oubliés, dans le service puis dans la liste partagée ; sans clause d'auteur ; sans
  clause des internes ; super-admin sans `carrier_present` ; sans le sujet épargné ; état des lieux sans l'agence de
  son bien ; `is_internal` non indexé.
- AC1 : `whereNotIn('id', …)` remis, une fois seul (rouge au premier appel), puis avec `id` à nouveau filtrable. La
  seconde rougit sur l'égalité même du filtre.
- Post-filtre SQL des résultats hydratés retiré.
- Observateur : non enregistré ; `updated`, `deleted` et `restored` coupés un à un ; les 12 entrées de colonnes de
  `COLONNES` retirée une à une ; les dépendants retirés un à un (états des lieux du bien, baux et réservations de la
  fiche).

**Tests.** `RechercheDocumentsPariteSqlMoteurTest` compte 12 tests, dont celui de l'index en retard. Deux s'ajoutent à la matrice :
`test_la_parite_tient_apres_que_les_porteurs_changent`, qui fait 17 gestes, chacun retournant un verdict déjà indexé,
et `test_la_piece_qui_devient_interne_n_est_plus_trouvee`, qui passe par `PATCH /visibility`.
