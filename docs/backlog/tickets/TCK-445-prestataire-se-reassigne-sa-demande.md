---
id: TCK-445
title: "Un prestataire assigné peut se réassigner sa propre demande et en changer la priorité — `PATCH /api/maintenance-requests/{id}` ne restreint aucun champ"
status: todo
phase: P1
family: bug
estimate: S
wave: 50
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#18-maintenance--interventions
    - docs/features.md#22-rôles--permissions
tags: [back, maintenance, authorization, policy, bug]
---

## Objectif utilisateur

Celui qui exécute une intervention la fait avancer ; c'est le donneur d'ordre qui décide à qui
elle est confiée et à quel point elle est urgente.

## Contexte

Relevé le 2026-08-27 pendant [TCK-420](TCK-420-acteur-prestataire-absent-de-features.md), en
plaçant l'acteur 🔧 sur les lignes de [§1.8](../../features.md#18-maintenance--interventions).
La chaîne est complète et chaque maillon a été lu :

| # | Maillon | Fichier |
|---|---|---|
| 1 | `authorize()` délègue à `can('update')` | `UpdateMaintenanceRequestRequest.php:32` |
| 2 | la policy `update` accorde à `assigned_to === $user->id` | `MaintenanceRequestPolicy.php:48` |
| 3 | `rules()` accepte `assigned_to` **et** `priority` | `UpdateMaintenanceRequestRequest.php:39-40` |
| 4 | les deux champs sont `$fillable` | `MaintenanceRequest.php:28-29` |
| 5 | le contrôleur fait `fill($data)->save()`, sans restriction de champ | `MaintenanceRequestController.php:155-165` |

Le maillon 4 est celui qui ferme la démonstration : sans lui, `fill()` aurait silencieusement
jeté les deux champs et il n'y aurait aucun défaut. *Une chaîne d'autorisation ne se vérifie pas
en lisant la policy — elle se vérifie jusqu'au `save()`.*

**La preuve que c'est un oubli et non une décision est ailleurs, et c'est elle qui rend le ticket
décidable : le chemin de CRÉATION s'en protège.** `store()` calcule `$isStaff` (super-admin,
propriétaire du bien, ou même agence) et fait `unset($data['assigned_to'])` pour qui n'en est pas
(`MaintenanceRequestController.php:81-92`). Le prestataire assigné n'appartient pas à `$isStaff`.

*Une asymétrie entre deux chemins du même contrôleur sur le même champ est la signature d'un
oubli, pas d'un arbitrage.* C'est pourquoi §1.8 **n'a pas** été modifiée pour accorder ce pouvoir
à 🔧 : elle porte une note qui dit que la policy est plus large que la spec, et renvoie ici.

**Second point, présenté pour ARBITRAGE et non comme un défaut.**
`POST /api/maintenance-requests/{id}/photos` ne demande que `can('view')`
(`UploadPhotosMaintenanceRequestRequest.php:30`), que la policy accorde au **demandeur**
(`MaintenanceRequestPolicy.php:29`) : un locataire peut donc alimenter la collection `photos`
d'une demande tant qu'elle n'est ni close ni annulée. Ce n'est vraisemblablement pas un bug —
compléter son propre signalement est légitime — et la collection sensible est bien gardée :
`completion_photos` re-autorise `update` (`MaintenanceRequestController.php:213-215`). Ce qui
manque est la **décision écrite**, pas le code.

## Contrat de données

Aucun endpoint à créer, aucune migration. Les routes concernées existent
(`routes/api/maintenance-requests.php:11-12` et `:21`).

## Contraintes strictes (métier)

- Le prestataire assigné **garde** ce que §1.8 lui accorde : faire avancer le statut, déposer le
  rapport et les photos de fin, soumettre un devis.
- `assigned_to` et `priority` ne sont modifiables que par le côté **donneur d'ordre** — la même
  définition que `$isStaff` dans `store()`, pour que les deux chemins cessent de diverger.
- Aucun accès n'est élargi : ce ticket **retire** un pouvoir, il n'en donne aucun.
- Un refus doit être un **403**, pas un 422 silencieux ni un champ ignoré sans le dire.

## Delta à produire

- [ ] Restreindre les champs assignables de `update()` selon le côté donneur d'ordre — soit dans
      `MaintenanceRequestController::update()`, soit par une règle dédiée du FormRequest, soit
      en scindant la policy ; la forme est au choix de l'implémenteur, l'invariant ne l'est pas
- [ ] Factoriser la définition de `$isStaff` pour que `store()` et `update()` la partagent au
      lieu de la réécrire
- [ ] Trancher le second point et **l'écrire** : soit `photos` reste ouvert au demandeur (et la
      décision est consignée), soit il passe sous `update`
- [ ] Répercuter la décision dans la note de [§1.8](../../features.md#18-maintenance--interventions),
      qui pointe aujourd'hui vers ce ticket
- [ ] Tests : un prestataire assigné se voit refuser `assigned_to` et `priority` ; un agent de
      l'agence les obtient ; le prestataire conserve statut, rapport et photos de fin

## Critères d'acceptation

- [ ] AC1 — un `PATCH` d'un prestataire assigné portant `assigned_to` **ou** `priority` est
      refusé, et le test échoue avant le correctif
- [ ] AC2 — le même `PATCH` par un agent de l'agence ou le propriétaire du bien réussit
- [ ] AC3 — le prestataire assigné peut toujours faire avancer le statut et déposer son rapport
      (non-régression sur ce que §1.8 lui accorde)
- [ ] AC4 — `store()` et `update()` partagent **une seule** définition du côté donneur d'ordre ;
      une ablation sur cette définition fait rougir des tests des deux chemins
- [ ] AC5 — le sort de `POST .../photos` est écrit quelque part de durable, dans un sens ou dans
      l'autre

## Hors périmètre

- Redécouper la policy de maintenance au-delà de ces deux champs.
- Le tableau de bord prestataire, tranché par [§2.5](../../features.md#25-reporting--tableaux-de-bord).

## Notes d'implémentation

_(à remplir par implementing-specs)_
