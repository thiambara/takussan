---
id: TCK-2385
title: "Console /super-admin/ai : affecter les modèles aux rôles, évaluer avant d'appliquer, budgets, coupe-circuits et tableau de bord"
status: done
phase: P1
family: full
estimate: L
wave: 80
created: 2026-10-26
updated: 2026-10-27
depends_on: [TCK-2383, TCK-2384]
blocks: [TCK-2397, TCK-2399]
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
    - "docs/features.md#29-administration--configuration"
  models: []
tags: [api, front, ia, socle-ia, super-admin, adr-0076]
---

## Objectif utilisateur

Le super-admin choisit, depuis la console, quel modèle tient chaque rôle et dans quel ordre de
bascule, en voyant d'abord ce que le changement coûte et vaut, et il suit ce que l'IA dépense et
réussit.

## Contexte

Décision du porteur du 2026-10-26 : **les modèles se configurent depuis la console super-admin**
([ADR-0076](../../adr/0076-le-socle-ia.md) §2, §3, §12 ; console détaillée dans le
[plan](../../plans/2026-10-26-radar-et-socle-ia.md#la-console-super-adminai)).

## Contrat de données

Routes sous `/api/admin/ai` :

- `GET roles` — rôles, chaîne affectée (source : base ou repli de configuration), modèles
  disponibles par fournisseur.
- `PUT roles/{role}` — remplace la chaîne ordonnée d'un rôle.
- `GET usages` · `PATCH usages/{usage}` — modèle forcé, budget, coupe-circuit.
- `GET providers` — par fournisseur : clé présente (booléen), jamais la valeur.
- `POST providers/{provider}/test` — un appel minimal, journalisé.
- `POST evaluations` — lance `ai:eval` pour un candidat (rôle ou usage, modèle) sur la file ;
  `GET evaluations/{id}` — état, score par champ et coût, face au modèle en place.
- `GET dashboard?from&to` — coût, latence, erreurs par usage et par jour ; taux d'acceptation ;
  dernier score.

## Direction UX / Artistique

Une salle des machines sobre, pas un tableau de bord tape-à-l'œil : on doit lire en trois secondes
ce qui tourne, sur quel modèle, et ce que ça coûte aujourd'hui. La chaîne d'un rôle se lit comme un
ordre de bascule (premier, puis…), et se réordonne directement. Changer un modèle n'est jamais un
simple menu déroulant : c'est un comparatif « en place / candidat » (score par champ, coût), avec
un verdict clair, et le bouton d'application suit le verdict. Les clés : un état (présente /
absente) et un test, rien d'autre — aucun champ de saisie de secret. Charte « Ancrage Local
Contemporain » (`docs/design-guidelines.md`), textes par next-intl (`fr`, `en` ; `wo` reprend le
français, wolof en pause).

## Contraintes strictes (métier)

- **Lecture** : tout `super_admin`. **Écriture** (rôles, usages, budgets, évaluations, test de
  connexion) : `super_admin` sous **second facteur récent** (`RequireRecentTwoFactor`), chaque
  écriture journalisée avec l'avant et l'après.
- Nouveaux gestes `PlatformAbility` : `platform.ai.view`, `platform.ai.manage` (`super_admin`).
- **Aucune route ne rend ni n'accepte une clé de fournisseur.**
- Un fournisseur hors de `ai.providers` est refusé (422) à l'écriture d'une chaîne.
- **Une affectation dont l'évaluation est sous le cliquet est refusée (422)**, sauf
  `override_reason` non vide, journalisé.
- Une chaîne vide est refusée : on revient au repli de configuration en supprimant l'affectation,
  explicitement.

## Delta à produire

- [x] `PlatformAbility` : `AiView`, `AiManage` (et la matrice `forLevel`).
- [x] `App\Http\Controllers\Api\Admin\AiRoleController`, `AiUsageController`,
      `AiProviderController`, `AiEvaluationController`, `AiDashboardController`.
- [x] FormRequests : `UpdateAiRoleRequest`, `UpdateAiUsageRequest`, `StoreAiEvaluationRequest`.
- [x] Routes `routes/api/admin-ai.php`, gardées par `platform-can:` et le second facteur récent
      sur les écritures.
- [x] Job `RunAiEvaluation` (file existante), état lisible par `GET evaluations/{id}`.
- [x] Front : pages de la console sous `/super-admin/ai`, route handler BFF, entrée de menu.
- [x] `NamespaceAccessGuardTest` : les nouvelles routes admin, paramètres compris *(couvertes par l'itération du test : leurs paramètres sont des chaînes, le repli `1` atteint la garde)*.
- [x] Tests API : `AdminAiRolesTest`, `AdminAiUsagesTest`, `AdminAiProvidersTest` (la clé n'est
      jamais dans la réponse), `AdminAiEvaluationsTest` (cliquet, dérogation journalisée),
      `AdminAiDashboardTest`. Tests front (Vitest) des écrans.

## Critères d'acceptation

- [x] AC1 — Réordonner la chaîne d'un rôle change le modèle appelé au prochain appel de chacun de
      ses usages (vérifié sur faux modèle).
- [x] AC2 — Un `support` ou un `viewer` reçoit 403 sur toute route ; un `super_admin` sans second
      facteur récent reçoit le refus du second facteur sur les écritures.
- [x] AC3 — Aucune réponse de `/api/admin/ai/*` ne contient la valeur d'une clé (recherche de la
      valeur de test dans le corps).
- [x] AC4 — Affecter un modèle dont l'évaluation est sous le cliquet rend 422 ; avec
      `override_reason`, réussit et l'entrée de journal porte le motif.
- [x] AC5 — Le tableau de bord rend, pour une journée de `ai_calls` semée, le coût et le nombre
      d'appels par usage exacts.
- [x] AC6 — Lancer `npm run lint`, `npx tsc --noEmit`, `npm run check:*` et les tests front : verts.

## Hors périmètre

- La saisie de clés dans la console (refusée par ADR-0076 §3).
- La facturation de l'IA aux agences.
- Tout écran du Radar (lot 1).

## Notes d'implémentation

Livré sur `feat/socle-ia-lot-0` (non fusionné : `doing`), 2026-10-27.

- API `/api/admin/ai/*` (`routes/api/admin-ai.php`) : rôles (chaîne de 1 à 5 maillons, jamais vide
  en base), usages (coupe-circuit, modèle forcé toujours avec son fournisseur, plafond — un champ
  non touché ne fige pas le défaut), fournisseurs (présence de clé en booléen, test de connexion par
  la passerelle, sans cache, sans jamais rendre le message du SDK), évaluations, tableau de bord
  (agrégats SQL). Lecture `platform.ai.view`, écriture `platform.ai.manage` sous second facteur
  récent (`ProtectedActions::STEP_UP`).
- Évaluations : `ai_evaluation_runs` + job `RunAiEvaluation` (une tentative : un worker tué échoue
  dès sa relivraison ; départ atomique ; écritures d'état conditionnelles ; évaluation orpheline lue
  `ai.eval.job_lost`) ; 409 `ai.eval.already_running` sous `Cache::lock` (Redis déployé). Le cliquet
  de `PUT roles/{role}` juge le nouveau premier maillon par `verdict()` : un candidat en panne ne passe
  pas ; `override_reason` journalisé.
- Front `/super-admin/ai` : rôles et dialogue de chaîne (évaluer, comparer score par champ, score
  global et coût, motif de dérogation sur 422), usages, fournisseurs, tableau de bord (coût,
  latence, acceptation, dernières références). `wo` = texte français (pause du wolof).
- Mesures : suite front entière 1199 fichiers / 8562 tests verts, `lint` et `tsc` propres ;
  `check-status-unions`, `check-status-labels` et les 63 gardes `scripts/check-*.mjs` vertes.
- Hypothèse de déploiement écrite des deux côtés (`RunAiEvaluation`, `deploy/takussan/compose.api.yml`) :
  un seul consommateur de `default`. En ajouter un exige `DB_QUEUE_RETRY_AFTER` > 1800.
- Suites : file `ai` dédiée (une évaluation de 30 min occupe l'unique worker de
  `notifications-urgent,default`) ; le cliquet ne juge que le premier maillon ; « Revenir à la
  configuration » sans confirmation.
