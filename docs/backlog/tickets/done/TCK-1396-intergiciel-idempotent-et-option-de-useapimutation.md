---
id: TCK-1396
title: "Une écriture rejouée sous la même `Idempotency-Key` rend la première réponse : l'intergiciel `idempotent` et l'option `idempotence` de `useApiMutation`"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-144--écritures-du-navigateur-quune-réponse-perdue-invite-à-rejouer"
  adr:
    - "docs/adr/0072-une-cle-d-idempotence-commune-pour-les-ecritures-rejouees.md"
tags: [api, web, idempotence, pistes]
---

## Contexte

Réf : **P144.01** du fichier de pistes, `validé` par le porteur, appliqué par ADR-0072 (lot 1). Seul
l'achat de boost (TCK-822) savait reconnaître un rejeu ; aucune autre route ne pouvait reprendre
sa forme, et le front n'avait aucun moyen d'envoyer une clé stable d'un essai à l'autre.

## Décision du porteur

> validé — porteur (2026-10-22) : appliquer ADR-0072, lot 1 : l'intergiciel `idempotent` et l'option `idempotence` de `useApiMutation`, avec les messages

## Objectif

Donner à toute route d'écriture et à tout formulaire la brique d'ADR-0072, sans encore l'appliquer
à une route (les entrées suivantes de l'angle le font).

## Delta à produire

- [x] `app/Http/Middleware/EnsureIdempotentWrite.php`, alias `idempotent` dans `bootstrap/app.php`
      (ADR-0072 § 1 à § 6).
- [x] Trois codes dans `lang/{fr,en,wo}/errors.php` : `idempotency.key_invalid`, `key_reused`,
      `in_progress` (en `wo`, le texte français, wolof en pause).
- [x] Option `idempotence` de `useApiMutation` et `renouvelerCleIdempotence` (ADR-0072 § 7).
- [x] Tests : `tests/Feature/Middleware/EnsureIdempotentWriteTest.php`,
      `src/hooks/__tests__/useApiMutation.idempotence.tck-1396.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Même clé, même requête : même statut, même corps, `Idempotent-Replayed: true`, une écriture.
- [x] AC2 — Même clé, autre corps, autre chemin, autre profil actif ou autre fichier : 422 `idempotency.key_reused`.
- [x] AC3 — Un 422 de validation ne se range pas ; verrou pris → 409 `idempotency.in_progress` ; sans
      en-tête, comportement d'avant ; clé hors forme → 422 `idempotency.key_invalid` ; 25 h plus tard, écriture neuve.
- [x] AC4 — Front : même clé après un échec, neuve après un succès et après `idempotency.key_reused`,
      renouvelable à la main ; l'en-tête de l'appelant l'emporte ; rien sans l'option.

## Hors périmètre

- L'application aux routes : P144.02 à P144.08 (tickets suivants du lot).
- `IdempotentRoutesTest` naît avec la première route équipée (TCK-1398).
- L'achat de boost garde sa propre clé (ADR-0072 § 8).

## Notes d'implémentation

- Ablation API : `handle()` réduit à `return $next($request)` → 6 rouges sur 10 (les 4 verts sont
  les cas où l'intergiciel ne doit rien changer) ; remis → 10 verts.
- Ablation front : en-tête jamais posé → 3 rouges sur 4 ; remis → 4 verts.
- L'empreinte hache `$request->input()` et, à part, le `sha256` de chaque fichier : `all()` y
  mêlerait des `UploadedFile` que `json_encode` rend tous `{}`.
- Piège de test : un `mockRejectedValue` persistant laissé en fin de test fait échouer vitest sur
  l'erreur, même attrapée par `mutateAsync().catch` ; le dernier envoi d'un test doit réussir.
