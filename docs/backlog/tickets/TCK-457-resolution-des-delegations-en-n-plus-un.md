---
id: TCK-457
title: "La résolution des délégations fait N requêtes là où une seule suffirait — et la sortie n'est PAS un cache"
status: todo
phase: P3
family: back
estimate: M
wave: 49
created: 2026-08-28
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#2-agency
tags: [back, performance, autorisation, delegation]
---

## Objectif utilisateur

Aucun aujourd'hui. Ce ticket existe pour que la sortie soit **déjà choisie** le jour où
`MeCapabilityController` devient chaud — et pour que ce ne soit pas un cache.

## Contexte

Relevé pendant la revue adverse de [TCK-395](TCK-395-delegation-role-delegue-sans-rapport-avec-les-capacites.md). Le coût est
mesuré : **268 requêtes contre 224** pour balayer les 45 capacités, soit environ **+20 %**, la
branche délégation ajoutant un `SELECT` par capacité refusée.

⚠️ **La mémoïsation a été essayée en revue, et elle casse la sécurité.** Le relecteur a
implémenté le cache que le ticket refusait — statique, par `(user, agence, capacité)` — et joué
la classe : **4 des 10 cas passent au rouge**, et ce sont précisément ceux qui encodent les
propriétés de TCK-395 : *la borne suit le délégant après la création*, *chaque rôle délégable
accorde un droit mesurable*, *une délégation n'accorde que ce que le rôle délégué porte*, *une
délégation échue n'accorde plus rien*.

**Le dernier est celui qui tranche.** Une mémoïsation exigerait une histoire d'invalidation
couvrant : délégation créée, révoquée, expirée, **et** le rôle du délégant dépouillé. Chacun de
ces événements a quelque chose à quoi s'accrocher — mais **la FENÊTRE n'en a aucun : rien
n'émet d'événement quand l'horloge franchit `ends_at`.** Un TTL bornerait la péremption, or *une
fenêtre d'autorisation périmée est exactement ce que cette borne existe pour fermer.*

**Le contre-exemple est dans le dépôt.** `AgencyRoleCapabilityCache` fonctionne — adossé au
store et non à l'instance, indexé **par rôle** précisément parce que l'invalidation y est totale
et locale, portée par les hooks `saved`/`deleted` du modèle. *Ce cache-là a une histoire
d'invalidation écrite ; une mémoïsation de délégation n'en aurait pas.*

Mesure annexe, qui ferme une autre issue : `app(MembershipCapabilityResolver::class)` appelé deux
fois rend deux `spl_object_id` **différents** — l'instance est neuve à chaque appel, donc un
cache d'instance n'aurait de toute façon aucun effet.

## La sortie, si elle devient nécessaire

**Charger les délégations du couple `(user, agence)` en UNE requête par requête HTTP, et
résoudre en mémoire.** Même fraîcheur — la fenêtre est réévaluée à chaque requête HTTP, donc
aucune péremption n'est introduite — mais un `SELECT` au lieu de N.

*Ce n'est pas un cache : c'est un chargement groupé. La distinction est toute la sécurité de ce
ticket.*

## Critères d'acceptation

1. Le nombre de requêtes est **mesuré avant et après**, sur le même parcours (balayage des 45
   capacités), et les deux chiffres figurent dans le ticket.
2. Les **10 cas de `RoleDelegationCapabilityTest` restent verts** — c'est le critère qui
   distingue un chargement groupé d'une mémoïsation. Les quatre cas nommés ci-dessus sont ceux
   qu'il faut regarder en premier.
3. Une délégation révoquée, expirée, ou dont le délégant a été dépouillé de son rôle **cesse
   d'accorder dans la même requête HTTP suivante**, sans purge et sans TTL.
4. Ablation prouvée dans les deux sens, avec preuve d'application avant lecture du résultat.

## Notes

Ne pas ouvrir ce chantier sans mesure de charge réelle : le +20 % est un coût connu et accepté,
et [ADR-0020](../../adr/0020-postgresql-sur-tous-les-environnements.md) rappelle qu'aucune clé
étrangère n'est plus indexée automatiquement sous PostgreSQL — il est possible que le vrai gain
soit un index sur `agency_id`, à décider **par `EXPLAIN`** et non par principe.
