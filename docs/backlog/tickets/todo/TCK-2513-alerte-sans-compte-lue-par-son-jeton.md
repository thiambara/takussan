---
id: TCK-2513
title: Alerte sans compte : critères lisibles par le jeton du lien, et passage à un envoi par semaine
status: todo
phase: P1
family: back
estimate: S
wave: 85
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: [TCK-2514]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#23-savedsearch-"
tags: [back, alertes, audit-ux]
---

## Objectif utilisateur

Celui qui ouvre un lien de confirmation ou de désinscription voit à quelle alerte il répond, et peut choisir de recevoir moins de messages plutôt que plus du tout.

## Contrat de données

1. **`GET /api/public/search-alerts/by-token?token=`** (throttle `public-search-alert`) — accepte un jeton de **confirmation** encore valide ou un jeton de **désinscription** ; rend `{ data: { kind: 'confirm'|'unsubscribe', name, criteria, frequency, matches } }` où `matches` est le nombre de biens publics que les critères trouvent aujourd'hui. Jeton inconnu, expiré ou déjà consommé : **404**, la même réponse dans tous les cas.
2. **`POST /api/public/search-alerts/frequency`** — corps `token` (désinscription) + `frequency` ∈ `weekly` ; passe les recherches de l'abonné à `weekly`, rend `{ data: { status: 'weekly' } }`. Jeton inconnu : même réponse qu'un succès (comme `unsubscribe`, pour ne rien dire d'un contact).

## Direction UX / Artistique

Sans objet (back). Maquette servie : `/fr/playground/maquettes?p=liens&a=a` (écrans de confirmation et de désinscription d'alerte).

## Contraintes strictes (métier)

- **Aucune route ne dit si un contact est connu** (ADR-0050 § 4) : aucune réponse n'émet l'e-mail ou le téléphone, et un jeton faux ne se distingue d'un jeton consommé par aucun code ni délai.
- La lecture ne consomme pas le jeton et ne confirme rien : seule l'action au clic agit (un analyseur de liens de messagerie ne confirme ni ne désinscrit personne).
- Les critères émis sont ceux du vocabulaire fermé `SavedSearchCriteria::KEYS`, rien d'autre.

## Delta à produire

- [ ] Route de lecture par jeton + FormRequest.
- [ ] Route de fréquence + FormRequest.
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — Un jeton de désinscription valide rend les critères et `kind: 'unsubscribe'` ; après une lecture, la désinscription par le même jeton fonctionne toujours.
- [ ] AC2 — Jeton inconnu et jeton de confirmation déjà consommé rendent tous deux 404, corps identiques.
- [ ] AC3 — Après `frequency`, la recherche de l'abonné est `weekly`, il n'est pas désinscrit, et aucun champ de contact n'apparaît dans aucune réponse (assertion sur le JSON brut).

## Hors périmètre

- Les pages par lien (TCK-2514).
- Les alertes d'un utilisateur connecté (leur fréquence se règle déjà dans l'espace).

## Notes d'implémentation

_(à remplir par implementing-specs)_
