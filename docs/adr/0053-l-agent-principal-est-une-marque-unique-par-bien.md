# ADR-0053 — L'agent principal d'un bien est une marque posée sur sa ligne de collaboration, unique par bien et garantie par le schéma ; une seule écriture la déplace

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-504](../backlog/tickets/TCK-504-agent-principal-choisi-plutot-que-deduit.md) ; consommé par
  [TCK-603](../backlog/tickets/TCK-603-agent-responsable-bulk-assign-et-biens-a-la-passation.md)
- **Applique** : [ADR-0036](0036-l-agent-responsable-est-le-collaborateur-principal.md) (l'agent responsable est le
  collaborateur `agent` principal)

## Contexte

Relu sur `dev` à `3ae586cd` (2026-10-08).

- **Qui répond pour un bien se déduit, il ne se choisit pas.** `App\Services\Property\PrimaryPropertyContact::for()`
  (TCK-502, TCK-590) rend le collaborateur `agent` **éligible** le plus anciennement invité (`invited_at`
  croissant, nuls en dernier, puis `id`), à défaut le propriétaire. Éligible : joignable, et personnel
  actif de l'agence du bien (`PersonnelDeLAgence::estPersonnel`, prédicat de TCK-587). Une agence qui
  veut mettre l'autre agent en avant n'a aucun moyen de le dire, sauf supprimer et recréer une ligne.
- Cette fonction sert la carte de contact (`primary_contact`), `GET …/contact` (le téléphone public),
  `contact-lead`, `contact-message`, la résolution `…/conversation`, `VisitNotifier` et
  `SendLeasePaymentReminders`. **Elle est la seule définition**, et ADR-0036 en fait aussi celle de
  l'« agent responsable ».
- La table `property_collaborators` porte `UNIQUE (property_id, user_id)`, `role` (`manager`,
  `co_owner`, `agent`, `viewer`), `commission_share`, `invited_at`, `accepted_at`, `metadata`.
- La fiche publique se lit dans un cache de données de 300 s (ADR-0052). `PropertyPublicCacheObserver`
  n'invalide que sur une colonne de `properties` ou sur l'adresse : un changement de contact attend
  aujourd'hui la revalidation temporelle.
- ADR-0036 réserve à TCK-504 « la marque, son unicité et son service », et TCK-603 appellera ce service
  depuis `ResponsibleAgentAssigner` (réattribution unitaire, en lot, passation, réparation).

## Décision

**Le principal est un booléen `is_primary` sur la ligne `property_collaborators`, au plus un par bien
par un index unique partiel, réservé au rôle `agent` par une contrainte `CHECK`. Une seule écriture le
déplace : `PrimaryAgentDesignator::designate()`, sous le verrou de la ligne du bien.
`PrimaryPropertyContact` lit la marque d'abord et retombe sur la règle de TCK-502 ensuite.**

### 1. Le schéma

```sql
ALTER TABLE property_collaborators ADD COLUMN is_primary boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX property_collaborators_one_primary_per_property
    ON property_collaborators (property_id) WHERE is_primary;
ALTER TABLE property_collaborators ADD CONSTRAINT property_collaborators_primary_is_agent
    CHECK (NOT is_primary OR role = 'agent');
```

- **L'unicité est dans la base**, pas dans l'écran ni dans le service (contrainte 1 du ticket) : deux
  écrivains qui se croiseraient sans verrou ne peuvent pas laisser deux principaux, le second échoue
  en `23505`.
- **Le rôle est dans la base aussi.** La règle applicative refuse d'abord (`422`) ; le `CHECK` garantit
  qu'aucun chemin — `PUT …/collaborators/{c}` qui change le rôle, une commande, une écriture SQL — ne
  laisse un `viewer` marqué. Le modèle efface la marque quand le rôle quitte `agent` (évènement
  `saving`), pour que ce changement de rôle passe au lieu de heurter la contrainte : retirer le rôle
  au principal, c'est le retirer comme principal, et le repli reprend.
- `is_primary` n'est **pas** `fillable` : ni `store` ni `update` des collaborateurs ne peuvent la
  poser. Seul le service l'écrit.

### 2. La règle de lecture : `PrimaryPropertyContact` reste la seule définition

1. La ligne marquée, si elle est de rôle `agent` et **éligible** (même éligibilité que le repli) ;
2. sinon, la règle de TCK-502 et TCK-590, inchangée : le collaborateur `agent` éligible le plus
   anciennement invité ;
3. sinon, le propriétaire s'il est joignable et bailleur actif (`estProprietaire`) ou éligible.

Une marque posée sur un agent devenu inéligible (bloqué, suspendu, retiré de l'agence) **reste en
place mais ne vaut rien** tant qu'il l'est : le contact retombe sur le repli, et revient à l'agent
désigné s'il est réactivé. Effacer la marque à la suspension ferait perdre le choix de l'agence pour
une absence passagère.

La méthode publique `collaborateurPrincipal(Property): ?PropertyCollaborator` rend la ligne qui répond
(marquée ou déduite), `null` si c'est le propriétaire ou personne. `for()` s'écrit à partir d'elle :
les surfaces ne changent pas.

### 3. L'écriture : un service, que TCK-603 appelle

```php
namespace App\Services\Property;

final class PrimaryAgentDesignator
{
    /**
     * @throws \App\Exceptions\ApiError 404 property.collaborator_not_found
     *                                  422 property.primary_requires_agent
     *                                  422 property.primary_not_eligible
     */
    public function designate(Property $property, PropertyCollaborator $collaborator, ?User $actor): PrimaryAgentDesignation;
}

final class PrimaryAgentDesignation
{
    public function __construct(
        public readonly PropertyCollaborator $primary,           // la ligne marquée, relue
        public readonly ?PropertyCollaborator $previous,         // la ligne qui portait la marque, ou null
        public readonly ?int $previousContactUserId,             // qui répondait avant (marque ou repli)
        public readonly bool $changed,                           // false : la cible était déjà marquée
    ) {}
}
```

Garanties, dans l'ordre d'exécution :

1. **Transaction et verrou de la ligne parent.** `DB::transaction` puis
   `Property::query()->whereKey($id)->lockForUpdate()->firstOrFail()` — jamais `lockForUpdate()` sur
   les lignes de collaborateurs ni sur un agrégat (pièges PostgreSQL n° 1 et n° 2). Appelé **dans** la
   transaction de l'appelant (603), la transaction devient un point de sauvegarde et le verrou, déjà
   tenu par l'appelant s'il l'a pris, est réentrant.
2. **La cible est relue sous le verrou** : une ligne supprimée ou changée de rôle entre la lecture de
   l'appelant et le verrou est jugée sur son état réel.
3. **Refus** : ligne absente ou d'un autre bien → `404 property.collaborator_not_found` ; rôle autre
   qu'`agent` → `422 property.primary_requires_agent` ; titulaire inéligible au sens du §2 → `422
   property.primary_not_eligible`. Les erreurs sont des `ApiError` (ADR-0032) : un appelant en lot les
   attrape et lit `->code`.
4. **Déjà principale** → `changed = false`, aucune écriture, aucun journal, aucune invalidation.
5. **Déplacement** : l'ancienne ligne perd la marque **puis** la cible la reçoit (l'ordre inverse
   heurterait l'index). L'ancien principal **garde sa ligne, son rôle et sa `commission_share`**.
6. **Journal** : `activity('Property')`, sujet le bien, acteur `$actor` (nul pour une commande),
   évènement `property.primary_agent_designated`, propriétés `agency_id` (l'agence du bien, que l'audit
   d'agence de TCK-601 lit), `previous_collaborator_id`, `previous_user_id`, `previous_contact_user_id`,
   `collaborator_id`, `user_id`.
7. **Invalidation** de la fiche publique : `RevalidatePublicPropertyPage` sur le slug du bien, mis en
   file après la validation de la transaction (ADR-0052 §2).

Ce que le service **ne fait pas**, et que TCK-603 fait autour de lui : créer la ligne de la cible,
changer son rôle (`viewer`/`manager` → `agent`, refus de `co_owner`, ADR-0036 §2), juger la cible par
la règle de cible de 587 avant de créer quoi que ce soit, et écrire `properties.user_id` — il ne
l'écrit **jamais**.

### 4. L'endpoint

`PUT /api/properties/{property}/collaborators/{collaborator}/primary`
(`properties.collaborators.primary`), sans corps. `DesignatePrimaryCollaboratorRequest::authorize()`
**délègue** à `update` de `PropertyPolicy`, la règle qui gouverne déjà `store`, `update` et `destroy`
des collaborateurs (contrainte 4) : aucune règle neuve en contrôleur. Réponse : la liste des
collaborateurs et `primary_contact` (`user_id`, `collaborator_id`, `source` ∈ `designated` |
`invitation_order` | `owner`), la même forme que `GET …/collaborators`.

### 5. L'invalidation hors désignation

Toute écriture d'une ligne de collaboration (création, rôle, titulaire, suppression) peut changer le
contact par le repli : `PropertyPublicCacheObserver::collaborationModifiee()` invalide le slug du bien
sur `saved` et `deleted` de `PropertyCollaborator`. Le service écrit par le constructeur de requêtes
(pas d'évènement de modèle) et invalide lui-même, une fois.

### 6. Le backfill

La migration pose la marque, pour chaque bien (supprimés en douceur compris), sur la ligne que
`PrimaryPropertyContact::collaborateurPrincipal()` rend **au moment de la migration** — avant toute
marque, c'est la règle de TCK-502/590. Aucun contact ne change à la migration ; un bien dont le contact
est le propriétaire ne reçoit aucune marque. La migration appelle la définition unique plutôt que d'en
recopier une seconde : une copie divergerait au premier changement de l'éligibilité. Écritures par
le constructeur de requêtes : ni évènement, ni invalidation en masse pendant la migration.

`down()` retire la contrainte, l'index et la colonne. Les choix posés depuis sont perdus et le repli
reprend : c'est le comportement d'avant, pas un état incohérent.

## Options écartées

- **(B) `properties.primary_collaborator_id`** (FK vers `property_collaborators`, `nullOnDelete`).
  L'unicité y est gratuite et la suppression du principal ramènerait le repli d'elle-même. Écartée :
  rien n'empêche la FK de viser la ligne d'un **autre** bien (il faudrait une FK composite
  `(id, property_id)` et une colonne de rôle recopiée pour le `CHECK`), la marque vivrait sur
  `properties` — dont chaque écriture invalide la fiche, réindexe Meilisearch et passe par
  `PropertyObserver` —, et ADR-0036 pose la marque sur la collaboration.
- **(C) Un rang (`primary_rank`, ordre manuel)** qui remplacerait `invited_at` dans le tri. Écartée :
  un ordre total demande de renuméroter à chaque geste, et ne dit pas plus qu'« un principal » ; le
  repli de 502 reste l'ordre pour le reste.
- **(D) Unicité tenue par le seul service** (verrou, sans index). Écartée : la contrainte 1 exige la
  base ; un chemin qui oublie le service (une commande, une réparation à la main) laisserait deux
  principaux sans erreur.
- **Effacer la marque d'un agent suspendu ou retiré.** Écartée (§2) : le choix de l'agence survit à
  une absence ; la marque ne vaut que tant que son titulaire est éligible.

## Conséquences

- Le choix est explicite sur tous les biens d'agence à un agent dès la migration, sans qu'aucune fiche
  ne change. Un agent invité plus tôt et réactivé plus tard ne reprend plus la place d'un agent marqué.
- Un geste de plus pour le personnel, et la surface d'un défaut de plus : une désignation qui n'atteint
  pas la fiche. Elle est fermée par l'invalidation signée, et par la revalidation de 300 s à défaut
  (environnement sans clés).
- `AgentHandoverService::move('collaborations')` (591) réécrit `user_id` de la ligne du partant : la
  marque suit le repreneur. Quand le repreneur a déjà une ligne, celle du partant est supprimée et la
  marque tombe ; TCK-603 reprend ce cas par `ResponsibleAgentAssigner`.
- `docs/models-spec.md` §8 ne décrit pas la colonne : `/sync-specs` après fusion (l'écart des colonnes
  d'acceptation, relevé par le ticket, y est déjà).

## Application

- Migration `2026_10_08_120000_add_is_primary_to_property_collaborators` (schéma + backfill).
- `App\Models\PropertyCollaborator` (cast, évènement `saving`), `App\Services\Property\PrimaryPropertyContact`,
  `App\Services\Property\PrimaryAgentDesignator`, `App\Services\Property\PrimaryAgentDesignation`,
  `PropertyCollaboratorController::designatePrimary`, `DesignatePrimaryCollaboratorRequest`,
  `PropertyPublicCacheObserver::collaborationModifiee`.
- Tests : `tests/Feature/Property/PrimaryAgentDesignationTest.php` (AC1, AC3, AC4, invalidation,
  journal, autorisation), `tests/Feature/Property/PrimaryAgentSchemaTest.php` (index et `CHECK`),
  `tests/Feature/Property/PrimaryAgentBackfillTest.php` (AC5) ; la course à deux processus (AC2) se
  rejoue hors PHPUnit sur une base jetable, résultats dans les notes du ticket.
