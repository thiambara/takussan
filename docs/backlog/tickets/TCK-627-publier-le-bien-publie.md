---
id: TCK-627
title: "« Publier l'annonce » ne publiait pas : le bien partait en pending_review privé, le quota ne se voyait qu'au 422 final et le brouillon n'était pas reprenable"
status: doing
phase: P1
family: full
estimate: M
wave: null
created: 2026-10-10
updated: 2026-10-10
depends_on: [TCK-464, TCK-587, TCK-625]
blocks: []
spec_refs:
  features:
    - docs/features.md
  models: []
tags: [api, front, publication, quota, abonnement, brouillon, moderation]
---

## Objectif utilisateur

- **Hôte, agent, admin d'agence** : « Publier l'annonce » met l'annonce en ligne — ou dit
  précisément pourquoi pas (vérification par l'agence, limite de l'offre).

Plan d'ensemble : [`docs/plans/2026-10-10-parcours-entrer-publier.md`](../../plans/2026-10-10-parcours-entrer-publier.md).

## Contexte (relevé le 2026-10-10)

- `toCreatePayload(…, 'submit')` écrivait `status: pending_review` + `visibility: private`, sans
  `published_at`. Chez un hôte solo (`moderation_required` faux), l'annonce n'était jamais
  publiée ; même approuvée, elle restait privée.
- `PropertyController::publish` ne contrôlait pas le quota ; `store` le contrôlait seul, par un
  422 `quota.listings_exceeded` reçu après les six étapes.
- `property-create-wizard` était écrit à chaque saisie mais absent de `WIZARD_RESUME_RULES`.
- La bannière de modération parlait d'un « administrateur de votre agence » qui est l'hôte lui-même.

## Décision

1. L'assistant crée un **brouillon privé**, puis le publie par `PUT …/visibility` (→ `publish`).
   Le message de fin lit le statut rendu : `available` → « en ligne », `pending_review` → « en
   vérification ». La proposition du bailleur (TCK-587) ne publie pas : « proposition envoyée ».
2. Un refus de publication laisse un brouillon réel : on le dit, « Publier » réessaie sans
   recréer le bien, « Ouvrir le brouillon » y mène.
3. API : `QuotaResolver::listingUsage()` → `GET /api/me/quota` (`{limit, used, can_create}`,
   `null` = illimité) ; `publish` contrôle le quota quand le bien n'est pas déjà actif.
4. `/app/properties/new` lit le quota avant l'assistant : limite atteinte → message et sorties
   (offres, annonces) ; sinon l'usage en sous-titre.
5. Brouillon reprenable (`property-create-wizard`, vierge s'il n'a ni type, ni titre, ni ville,
   ni prix). Bannière de modération neutre ; titre d'étape « Un titre, et c'est prêt ».

## Critères d'acceptation

- [x] Création en `draft`, puis `updatePropertyVisibilityAction(id, 'public')`, message « en
      ligne » / « en vérification » selon le statut rendu (`PropertyWizard.test.tsx`, rouges sans
      l'appel de publication).
- [x] Un refus garde le brouillon et réessaie sans recréer (`PropertyWizard.test.tsx`).
- [x] `publish` refuse au-delà du quota (`BillingPlansTest`, rouge sans le contrôle) ;
      `GET /api/me/quota` rend l'usage.
- [x] Limite atteinte → pas d'assistant (`page.quota.test.tsx`, rouge sans la garde).
- [x] Le brouillon d'un bien est proposé à la reprise (`wizard-drafts.test.ts`).

## Hors périmètre

- La bannière de modération ne distingue pas encore « votre agence » et « l'équipe Takussan » :
  le détail du bien ne porte pas le type d'agence.

## Vérification

- API : `BillingPlansTest` vert ; Pint propre.
- Front : `src/components/property-form`, `src/lib/__tests__/wizard-drafts.test.ts`,
  `src/app/(dashboard)/app/properties/new` — verts. `tsc`, ESLint, `check:i18n` : verts.
