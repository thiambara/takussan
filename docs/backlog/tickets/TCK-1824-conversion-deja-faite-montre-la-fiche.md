---
id: TCK-1824
title: "Une demande de contact déjà convertie montre sa fiche au lieu d'un toast d'erreur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-182--gestes-de-transition-rejoués-sur-un-état-déjà-atteint"
tags: [api, front, crm, demandes-de-contact, pistes]
---

## Contexte

Réf : **P182.03** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

**Décision du porteur (déléguée)** : validé (délégué) — le 409 `lead.already_converted` porte l'identifiant de la fiche (`customer: { id }`, la forme du 201), sans passer en 200 ; la carte lit `lead.customer_id` relu en plus de son état local, et sur ce 409 pose la fiche et montre le lien « Ouvrir la fiche » existant au lieu du toast d'erreur, sans texte neuf

La seconde conversion d'une demande (réponse perdue, autre onglet, autre membre) rendait 409
`lead.already_converted` sans la fiche, que la carte de `ContactLeadsInbox` traitait par le toast
générique ; et la carte tenait la fiche dans un `useState(lead.customer_id)` que la relecture de la
demande ne changeait pas (`key={lead.id}`, la carte n'est pas remontée). Le bouton « Convertir »
restait, et chaque clic rendait une erreur.

## Objectif

Le 409 nomme la fiche, et la carte la montre, qu'elle vienne de ce 409 ou de la demande relue.

## Delta à produire

- [x] `ContactLeadService::convert` : le 409 `lead.already_converted` porte
      `customer: { id }` (`ApiError::with`, comme `customer.duplicate`), code et statut inchangés.
- [x] `ContactLeadsInbox` (`DemandeDeContact`) : la fiche affichée est celle que la conversion pose,
      sinon `lead.customer_id` relu ; sur ce 409, la fiche est posée sans toast.
- [x] Tests : `ContactLeadConvertTest` (second appel) et `ContactLeadsInbox.test.tsx` (409, relecture).

## Critères d'acceptation

- [x] AC1 — Un second `POST /api/contact-leads/{id}/convert` rend 409 `lead.already_converted`
      avec `customer.id` égal à la fiche créée, sans seconde fiche.
- [x] AC2 — Sur ce 409, la carte remplace « Convertir en client » par le lien existant vers la
      fiche, et n'affiche aucun toast.
- [x] AC3 — Une demande relue avec `customer_id` change la carte déjà montée : lien vers la fiche,
      plus de bouton de conversion.

## Hypothèse retenue

La décision nomme le lien « Ouvrir la fiche » ; le libellé existant de la carte est
`contactLeads.actions.openCustomer` (« Voir la fiche client »). C'est lui qui s'affiche : aucun
texte neuf.

## Hors périmètre

- Le 200 sans effet sur l'état atteint (P182.04, au porteur).
- La relecture après erreur des autres gestes de transition (P182.02, au porteur).

## Notes d'implémentation

- Ablations : `->with([...])` retiré du 409 → `ContactLeadConvertTest` rouge (`customer.id` nul) ;
  la branche du 409 neutralisée côté carte → le test du 409 rouge (lien absent) ; la fiche remise
  dans un `useState(lead.customer_id)` → le test de relecture rouge. Correctifs remis → verts.
- Le second rouge établit ce que la piste notait « à vérifier » : l'état local ne suivait pas la
  prop relue.
