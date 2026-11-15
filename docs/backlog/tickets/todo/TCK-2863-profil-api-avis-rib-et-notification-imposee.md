---
id: TCK-2863
title: "Profil, côté API : la répartition des notes et le compte des avis en attente, l'avis à laisser après un bail clôturé, l'envoi du RIB d'un compte à confirmer, et la rangée « Vérification d'identité · Toujours envoyée » des préférences"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2864]
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#23-notifications"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#11-review"
    - "docs/models-spec.md#76-payoutmethod-"
tags: [back, profil, avis, versement, notifications, audit-ux, app]
---

## Objectif utilisateur

L'agent lit la répartition de ses notes et ce qui attend validation ; le locataire dont le bail est clos est invité à noter ; le bailleur envoie le RIB qui manque à son compte de versement ; et chacun voit, dans ses préférences, ce qui part toujours.

## Contrat de données

Relevé le 2026-11-15 (`dev` 8c60f4c58) :

- `GET` des avis reçus (`ReviewController::received`) : `data` + pagination — **ni répartition 5→1, ni compte « en attente de validation »** (TCK-2635 : « à proposer », et la répartition rangée en « donnée »).
- `GET /api/me/review-opportunities` (`ReviewController::opportunities`, `ReviewEligibility`) : **pas d'opportunité « bail clôturé »** (TCK-2635 a-4, carte `CarteAvisEnAttente`).
- `PayoutMethod` / `PayoutMethodVerification` : un compte bancaire « À confirmer » existe ; **aucun envoi de RIB** (TCK-2635 a-6 : « l'API ne connaît ni l'envoi d'un RIB »).
- Préférences de notification : **aucun événement « vérification d'identité »** réglable ni imposé ; tous les événements sont rendus, même ceux qu'une persona ne reçoit jamais (TCK-2636, ticket « — »).

## Contraintes strictes (métier)

- **Avis reçus** : `meta.distribution {5,4,3,2,1}` (avis approuvés seulement) et `meta.pending_count` (avis reçus non encore validés), sur l'ensemble filtré par ce que l'appelant peut voir, indépendamment de la page.
- **Bail clôturé** : `review-opportunities` gagne, pour le locataire, les baux terminés depuis moins de N jours (N en configuration, défaut 90) sans avis de sa part, `{kind: "lease_closed", lease {id, end_date, property_title}, target}` ; même règle d'éligibilité que les autres opportunités (`ReviewEligibility`, sans la recopier).
- **RIB** : `POST /api/me/payout-methods/{payoutMethod}/bank-statement` — un PDF ou une image (bornes de `MediaUploadRequest` pour les documents), privé (ADR-0029), sous step-up 2FA comme les autres écritures des moyens de versement (TCK-589) ; passe la vérification à « en revue ». Seulement pour un compte bancaire du titulaire.
- **Préférences** : le catalogue rend un événement `identity_verification` **imposé** (`locked: true`, canaux fixes) ; et chaque événement porte les personas qui le reçoivent, pour que l'écran masque ceux que la persona active ne reçoit jamais.
- Codes d'erreur neufs dans les langues de l'API (`LangGroupParity`).

## Delta à produire

- [ ] `meta.distribution`, `meta.pending_count` sur les avis reçus.
- [ ] Opportunité `lease_closed`.
- [ ] Envoi du RIB (route, FormRequest, collection privée, transition de vérification).
- [ ] Catalogue des préférences : événement imposé + personas destinataires.
- [ ] Tests `ReceivedReviewsMetaTest`, `LeaseClosedReviewOpportunityTest` (clos depuis 10 j → présent ; avis déjà laissé → absent ; clos depuis 200 j → absent), `PayoutMethodBankStatementTest` (sans 2FA → refus ; compte d'un autre → 403 ; mobile money → 422), `NotificationPreferencesCatalogTest`.

## Critères d'acceptation

- [ ] AC1 — Agent avec 4 avis 5★, 1 avis 3★ approuvés et 1 en attente : `meta.distribution = {5: 4, 4: 0, 3: 1, 2: 0, 1: 0}` (approuvés seulement : un avis en attente ne compte pas dans la répartition) et `meta.pending_count = 1`, à la page 1 comme à la page 2.
- [ ] AC2 — Locataire dont le bail a pris fin le 31 octobre : une opportunité `lease_closed` le nomme ; après son avis, elle disparaît.
- [ ] AC3 — Bailleur, compte bancaire « à confirmer », RIB PDF envoyé sous 2FA : 201 et la vérification passe « en revue » ; sans 2FA : refus du step-up.
- [ ] AC4 — Le catalogue rend `identity_verification` avec `locked = true` ; un agent ne reçoit pas les événements réservés au locataire dans la liste filtrée par persona.

## Hors périmètre

- Les écrans : TCK-2864.
- Le jour des reversements (« reversements du 5 de chaque mois ») : `payout_day` du mandat ou de l'agence, porté par TCK-2909 / TCK-2915 (famille 4).

## Notes d'implémentation

_(à remplir par implementing-specs)_
