# ADR-0035 — L'absence d'un agent est une délégation qui nomme l'absent et n'accorde aucun droit

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tickets** : [TCK-591](../backlog/tickets/TCK-591-crm-agenda-agent-et-passation.md)

## Contexte

Un agent en congé, malade ou en déplacement laisse des tâches et reçoit de nouvelles affectations
qu'il ne traitera pas. L'agence n'a aucun moyen de dire « Awa est absente jusqu'au 20, Moussa la
remplace ».

Relevé le 2026-10-07, sur `5f872f1f` :

- `role_delegations` (`2026_04_28_000000_create_role_delegations_table.php`) porte déjà tout le cycle
  d'une période bornée : `starts_at`, `ends_at`, statut `scheduled → active → expired | revoked`,
  activation et expiration planifiées toutes les cinq minutes (`ProcessRoleDelegationsJob`,
  `routes/console.php:66`), quatre événements, journal (`RoleDelegation` est `Auditable`, et
  `RoleDelegationService` écrit `role_delegation.created|revoked|activated|expired`).
- Mais une délégation ne sait pas dire **qui est absent** : `delegator_id` est l'auteur du geste
  (l'admin), `user_id` le bénéficiaire.
- Et une délégation **accorde** : le résolveur prête au bénéficiaire les capacités du rôle système
  délégué, bornées par celles du délégant (`MembershipCapabilityResolver::delegationsAllow`, TCK-395).
  Le prédicat « personnel de l'agence » de TCK-587 (`isStaffAt`) compte aussi une délégation active
  de rôle `agent` / `agency_admin`. Un remplaçant au rôle personnalisé restreint recevrait donc, par
  une absence modélisée en délégation de rôle `agent`, des capacités qu'il ne détient pas.

Le ticket pose la contrainte : *l'absence ne crée aucun droit que le remplaçant ne détient pas, et
ne modifie aucune ligne existante.*

## Décision

**Une absence est une ligne de `role_delegations` qui porte l'absent dans une colonne neuve
`replaces_user_id`, et dont le rôle `absence_cover` n'existe dans aucun catalogue : elle réutilise le
cycle de vie des délégations et n'accorde aucune capacité.**

1. **Schéma** — `role_delegations.replaces_user_id` : FK nullable vers `users`, nommée
   `role_delegations_replaces_user_fk`, `cascadeOnDelete`, indexée avec `agency_id`. `user_id` est le
   **remplaçant**, `replaces_user_id` l'**absent**, `delegator_id` l'auteur du geste, `ends_at`
   obligatoire (déjà `NOT NULL`), `reason` libre.
2. **Aucun droit** — `role = 'absence_cover'` (`RoleDelegation::ABSENCE_ROLE`). Ce n'est pas un
   `AgencyRoleBaseType` : `delegationsAllow` l'ignore (`tryFrom` → `null`), et `isStaffAt` ne le
   compte pas (il ne lit que `agent` / `agency_admin`). Le remplaçant garde exactement ses
   capacités. Un test le garde (une absence ne fait passer aucune capacité de `false` à `true`).
3. **Effets, et eux seuls**, pendant la fenêtre active :
   - **la vue des tâches** : `TaskPolicy::view` (et la liste `GET /api/tasks`) ouvre au remplaçant
     les tâches **assignées à l'absent** — lecture et mise à jour (cocher), jamais la suppression,
     qui reste au créateur ;
   - **le routage des nouvelles affectations** : une tâche créée ou réassignée vers l'absent est
     assignée au remplaçant. Le résolveur est
     `App\Services\Agency\AgentAvailability::substituteFor(User $absent, int $agencyId): User` — il
     rend le remplaçant de l'absence active, sinon l'absent lui-même. TCK-590 le consomme pour les
     visites et les leads. **Pas de transitivité** : si le remplaçant est lui-même absent, la chaîne
     s'arrête au premier remplaçant (une chaîne se lit mal et peut boucler).
   - **rien d'autre** : aucune ligne existante n'est réécrite (tâches, visites, clients, biens) ; la
     fin de l'absence suffit à tout rendre.
4. **Qui la déclare** — le titulaire de `team.delegate_role` dans l'agence, ou l'agent lui-même pour
   sa propre absence. L'absent et le remplaçant sont tous deux **personnel** de l'agence (prédicat de
   TCK-587) et distincts ; une absence ne chevauche pas une autre absence planifiée ou active du
   même agent (422 `absence_overlaps`).
5. **Surface** — `GET|POST /api/agencies/{agency}/absences`, `DELETE
   /api/agencies/{agency}/absences/{delegation}` (révocation). La console des délégations
   (`RoleDelegationController::index`) **exclut** les lignes d'absence : elles ne sont pas des
   délégations de rôle, et l'écran ne saurait pas les nommer. Les notifications de délégation
   (`NotifyDelegation*`) ne partent pas pour une absence : leur texte annonce un rôle accordé.

## Options écartées

- **Table `agent_absences`**. Écartée : elle recopierait statut, fenêtre, activation, expiration,
  événements et journal — exactement la duplication de fenêtre que TCK-456 a soldée sur les
  délégations (trois définitions, trois comportements).
- **Délégation du rôle `agent` au remplaçant**. Écartée : elle accorde les capacités du rôle système
  (bornées par le délégant, pas par le remplaçant), et fait du remplaçant un « personnel » au sens de
  TCK-587 par la délégation — un droit créé par l'absence, ce que le ticket interdit.
- **Réécrire les affectations de l'absent** (tâches, visites) vers le remplaçant au début de
  l'absence. Écartée : irréversible sans journal fin, et faux au retour de l'agent. C'est le rôle de
  la passation (départ définitif), pas de l'absence.

## Conséquences

- `RoleDelegation` porte deux sortes de lignes ; toute nouvelle lecture de la table qui veut des
  délégations de rôle filtre `replaces_user_id IS NULL`. Le résolveur et `isStaffAt` n'en ont pas
  besoin (le rôle les écarte déjà).
- Le remplaçant ne voit pas l'agenda de l'absent : seules les tâches lui sont ouvertes. Étendre la
  vue (visites, agenda) est une décision à part.

## Application

- Migration `add_replaces_user_id_to_role_delegations_table` ; `RoleDelegation::scopeAbsences()`,
  `ABSENCE_ROLE` ; `App\Services\Agency\AgentAbsenceService` ; `App\Services\Agency\AgentAvailability`.
- `tests/Feature/Agency/AgentAbsenceTest.php` (AC14 de TCK-591) : pendant l'absence le remplaçant voit
  les tâches et le résolveur le rend ; après la date de fin, plus rien ; aucune ligne existante n'a
  changé ; aucune capacité n'est accordée.
