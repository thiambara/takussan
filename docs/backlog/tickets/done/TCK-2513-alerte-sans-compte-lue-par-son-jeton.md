---
id: TCK-2513
title: Alerte sans compte : critères lisibles par le jeton du lien, et passage à un envoi par semaine
status: done
phase: P1
family: back
estimate: S
wave: 85
created: 2026-11-08
updated: 2026-11-09
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

- [x] Route de lecture par jeton + FormRequest.
- [x] Route de fréquence + FormRequest.
- [x] Tests.

## Critères d'acceptation

- [x] AC1 — Un jeton de désinscription valide rend les critères et `kind: 'unsubscribe'` ; après une lecture, la désinscription par le même jeton fonctionne toujours.
- [x] AC2 — Jeton inconnu et jeton de confirmation déjà consommé rendent tous deux 404, corps identiques.
- [x] AC3 — Après `frequency`, la recherche de l'abonné est `weekly`, il n'est pas désinscrit, et aucun champ de contact n'apparaît dans aucune réponse (assertion sur le JSON brut).

## Hors périmètre

- Les pages par lien (TCK-2514).
- Les alertes d'un utilisateur connecté (leur fréquence se règle déjà dans l'espace).

## Notes d'implémentation

**Mesures du 2026-11-09 (agent favoris-alertes, vague 1) :**

- Une ligne `alert_subscribers` = UNE demande, qui porte UNE recherche (`RecordPublicSearchAlert`). `by-token` lit
  la première recherche de l'abonné (`orderBy('id')`) ; `frequency` passe à `weekly` les recherches de CET abonné
  (la demande du lien), pas celles des autres demandes du même contact — au contraire de la désinscription, qui
  efface tout le contact (`eraseContact()`). Choix fait sur le texte du ticket (« les recherches de l'abonné »).
- Un jeton de confirmation consommé a perdu son empreinte (`confirmation_token_hash = null`) : il se cherche et se
  manque par les MÊMES deux requêtes qu'un jeton faux (testé : mêmes SQL, même ordre, même corps 404). La recherche
  du jeton de confirmation passe par `pendingConfirmation()`, partagée avec `confirm` (même TTL, `confirmed_at` nul).
- Seul le canal e-mail a un jeton de confirmation (WhatsApp confirme par code) : `kind: 'confirm'` n'arrive que d'un
  lien e-mail. Le jeton de désinscription existe dès la demande (avant confirmation).
- `matches` passe par `SearchService::countMatchingProperties()` (le moteur de l'alerte, `hitsPerPage: 0`), appelé
  sans le modifier. Moteur indisponible → `matches: null` et un `search_alert.count_failed` journalisé sans message,
  plutôt qu'un 500 sur la page du lien.
- `frequency` n'accepte que `weekly` (422 sinon) ; un jeton inconnu rend `{data:{status:'weekly'}}` comme un succès.
  Elle ne prend que le jeton de DÉSINSCRIPTION : un jeton de confirmation valide rend le même corps qu'un inconnu et
  ne change rien (testé, revue du 2026-11-09).
- Les deux routes sont sous `throttle:public-search-alert` (10 / 10 min par visiteur), comme `confirm`/`unsubscribe`.

**Contrat exposé au front (TCK-2514) :**

- `GET /api/public/search-alerts/by-token?token=<jeton du lien>` → `200 { data: { kind: 'confirm'|'unsubscribe',
  name: string, criteria: { …clés de SavedSearchCriteria::KEYS… }, frequency: 'off'|'daily'|'weekly',
  matches: number|null } }` ; `404 { message }` pour tout jeton qui ne sert pas ; `422` sans jeton. Ne consomme rien.
- `POST /api/public/search-alerts/frequency` `{ token: <jeton de désinscription>, frequency: 'weekly' }` →
  `200 { data: { status: 'weekly' } }`, jeton connu ou non.
- La confirmation et la désinscription restent `POST …/confirm` et `POST …/unsubscribe` (inchangées), au clic.
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.2 (alerte sans compte : `by-token`, `frequency`).
