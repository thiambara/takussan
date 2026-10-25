---
id: TCK-2170
title: "Les demandes de contact d'un membre suivent sa passation et son effacement"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2164, TCK-2168]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-204--travail-dun-agent-laissé-à-son-compte-effacé"
tags: [back, front, crm, leads, account, agency, pistes]
---

## Objectif utilisateur

Les demandes de contact qu'un visiteur a adressées à un agent ne restent plus orphelines quand cet
agent quitte l'agence ou efface son compte : l'admin les voit dans la passation et les donne à un
collègue, et l'effacement les rend au contact actuel du bien.

## Contexte

Réf : **P204.04** du fichier de pistes, `validé`. `property_contact_leads.recipient_user_id`
n'était dans aucune catégorie du portefeuille ; après l'effacement, la demande gardait le compte
effacé pour destinataire.

## Décision du porteur

> validation du porteur (2026-10-24) : une catégorie `contact_leads` dans la passation ; à l'effacement, le destinataire est recalculé par `PrimaryPropertyContact::for()`, et laissé tel quel pour une demande sans bien ni agence

## Hypothèses (mode sans humain)

- La catégorie : demandes `form` non traitées (`handled_at` nul) dont le membre est destinataire,
  dans l'agence de la demande (`agency_id`) ; une demande traitée ou un clic restent de l'histoire.
- Dernière de `AgentPortfolio::TRANSFERABLE` : elle ne dépend d'aucun bien verrouillé.
- Une demande d'agence SANS bien (`forAgent` avec une agence) : destinataire remis à `null` à
  l'effacement, pour retomber chez qui lit toutes les demandes de l'agence (`crm.view_all`) ; la
  décision ne tranche que les demandes sur un bien et celles sans bien ni agence.
- La catégorie compte aussi dans l'avis de TCK-2164 (paramètre `contact_leads`) et dans le 422
  `agency_member.portfolio_not_empty`, qui lit le même inventaire.
- Libellé de l'assistant en `fr` et `en` ; `wo` en français (wolof en pause).

## Delta à produire

- [x] `AgentPortfolio` : catégorie `contact_leads`.
- [x] `AgentHandoverService::move()` : le repreneur devient destinataire.
- [x] `ErasedMemberPortfolio::release()` : recalcul à l'effacement.
- [x] Avis de TCK-2164 : paramètre et textes.
- [x] Front : `PortfolioCategory`, ordre de `HandoverWizard`, libellé `agentCrm.handover.category.contact_leads`.
- [x] Tests : `DemandesDeContactDuPartantTest` (4 cas), cas Vitest de `HandoverWizard` ; `AgentHandoverTest` et `AgentHandoverPropertiesTest` suivent la liste élargie.

## Critères d'acceptation

- [x] AC1 — L'inventaire compte une demande non traitée, pas la traitée ; la passation la donne au repreneur.
- [x] AC2 — À l'effacement, une demande sur un bien passe au contact que rend `PrimaryPropertyContact::for()`.
- [x] AC3 — Une demande sans bien ni agence garde son destinataire.
- [x] AC4 — Une demande d'agence sans bien retombe sans destinataire.
- [x] AC5 — L'assistant affiche « Demandes de contact non traitées » avec son compte, transmissible.

## Hors périmètre

- Les deux points du front non mesurés par l'explorateur (boîte, tableau de bord).

## Notes d'implémentation

- Ablation API : la catégorie retirée de `TRANSFERABLE` et le recalcul neutralisé → AC1, AC2, AC4 rouges, AC3 vert (il garde l'absence) ; remis → vert.
- Ablation front : `contact_leads` retiré de `CATEGORIES` → le cas Vitest rouge ; remis → vert.
