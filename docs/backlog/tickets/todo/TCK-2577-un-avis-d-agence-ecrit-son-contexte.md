---
id: TCK-2577
title: Un avis d'agence écrit son contexte d'éligibilité, comme un avis d'agent
status: todo
phase: P1
family: full
estimate: S
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [api, front, avis, agence, directory, audit-ux]
---

## Objectif utilisateur

Sur la fiche publique d'une agence, le visiteur lit d'où parle chaque avis (« Locataire · bail »,
maquette `?p=agence&a=d`, onglet Avis : « les avis liés à un bail »), comme il le lit déjà sur la fiche
d'un agent.

## Constat (mesuré le 2026-11-09, seconde contre-vérification de TCK-2522)

- **La table porte le contexte** : `reviews.context_type` / `context_id` désignent la preuve qui a rendu
  l'avis possible ([ADR-0043](../../../adr/0043-avis-cible-eligibilite-moderation-et-verrou-plateforme.md)
  § 3 : « la preuve d'éligibilité est vérifiée par le serveur, et elle est stockée »).
- **L'API le sert et la fiche l'affiche, depuis TCK-2522** : `ReviewResource` rend `context_kind`
  (`lease`, `booking`, `visit`, `maintenance_request`, ou `null`), le type seul ; `ReviewsSection` écrit
  « … · Locataire · bail » et rien sans contexte.
- **Un avis d'agent le pose** : `ReviewController::storeForAgent` écrit `context_type` / `context_id` depuis
  `StoreForAgentReviewRequest::proof()`. Prouvé par la route (dépôt, approbation, fiche publique) :
  `tests/Feature/Public/ReviewContextKindParLaRouteTest.php` rend `visit` et `lease`.
- **`storeForAgency` ne le pose pas** : l'avis est créé sans `context_*`
  (`ReviewController::storeForAgency`), alors que son `authorize()` a trouvé la preuve —
  `ReviewEligibility::forAgency()` rend le `Lease` dont l'auteur est le locataire — et la jette
  (`StoreForAgencyReviewRequest::authorize`, `… !== null`).
- **Mesure** (test jetable, hors dépôt) : agence active, bien publié, bail `active` n° 1 dont l'auteur est
  le locataire ; `POST /api/agencies/{id}/reviews` → 201 ; approbation par la plateforme (l'admin d'agence
  reçoit 403 : un avis d'agence relève de la plateforme seule, ADR-0043 § 1) ; relu :
  `context_type` null, `context_id` null ; `GET /api/public/agencies/{slug}` → `reviews.count` 1,
  `recent.0.context_kind` null. La fiche d'agence n'affiche donc aucun contexte, pour aucun avis.

## Delta à produire

- `StoreForAgencyReviewRequest` garde la preuve trouvée par `forAgency()` et l'expose (`proof()`), comme
  `StoreForAgentReviewRequest`.
- `storeForAgency` écrit `context_type` / `context_id` depuis cette preuve.
- Décider, avant de coder, le cas du super-administrateur que `authorize()` laisse passer sans bail :
  sans preuve, l'avis reste sans contexte (et n'affiche rien), ou le dépôt lui est refusé.
- Vérifier l'index `reviews_author_context_uniq` (ADR-0043 § 3) : il ne couvre aujourd'hui que les lignes
  à `context_id` non nul ; les avis d'agence y entrent. L'unicité par auteur et par agence reste vérifiée
  par le contrôleur sous verrou.

## Critères d'acceptation

- [ ] AC1 (a) — Un avis d'agence déposé par `POST /api/agencies/{agency}/reviews` écrit son contexte
  d'éligibilité (`context_type` du bail, `context_id` du bail trouvé par `forAgency()`), comme un avis
  d'agent. Le test passe par la route, jamais par la factory.
- [ ] AC2 (b) — La fiche publique d'agence affiche ce contexte (« Locataire · bail ») pour un avis déposé et
  approuvé par les routes ; l'API ne sert que `context_kind`, jamais `context_id` ni `context_type`.
- [ ] AC3 (c) — Une ablation le prouve : retirer l'écriture du contexte dans `storeForAgency` fait rougir
  le test de AC1 et celui de AC2.
- [ ] AC4 (d) — Les avis d'agence déjà déposés restent sans contexte et n'affichent rien : ni libellé, ni
  séparateur orphelin. Aucune donnée existante n'est réécrite.

## Hors périmètre

- `storeForProperty` crée aussi l'avis de bien sans `context_*` (relevé de la contre-vérification, non
  mesuré par la route) : la fiche de bien n'affiche pas de contexte d'avis aujourd'hui. Ticket à part s'il
  faut l'afficher.
- `ReviewResource` sert publiquement `author.id` et le nom complet de l'auteur (le front l'abrège) : relevé
  de la même contre-vérification, préexistant, à traiter dans un ticket d'API.

## Notes d'implémentation

- 2026-11-09 — AC transféré de TCK-2522 : la direction UX de la fiche d'agence (« les avis avec leur
  contexte (« Locataire · bail ») ») ne peut pas être tenue tant qu'un avis d'agence n'écrit pas son
  contexte. Décision de la session : ne pas changer l'écriture des avis dans la vague 3 (changement de
  données) ; TCK-2522 livre la lecture et l'affichage, ce ticket l'écriture.
