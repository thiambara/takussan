---
id: TCK-1274
title: "Les pages des rôles et du KYC d'agence ne s'ouvrent qu'avec la capacité que l'API exige pour leur lecture"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-148--section-appagency-gardée-par-le-rôle-gestes-jugés-par-la-capacité"
tags: [front, agency, access, pistes]
---

## Contexte

Réf : **P148.04** du fichier de pistes, `retenu · autonome` (A1). Entrée dans le lot de l'angle
146 par complément du même côté (front).

`PAGES_ADMIN` sait exiger une capacité (`/app/agency/billing`), mais `/app/agency/roles` et
`/app/agency/kyc` ne jugent que le rôle. Leur lecture exige `team.assign_role`
(`AgencyRolePolicy::viewAny`) et `agency.update_kyc` (`KycController`) : un admin au rôle
personnalisé sans elles voit les deux entrées au menu, et chaque page rend son seul état d'erreur
(403 de l'API, mesuré par le mesureur).

## Objectif utilisateur

Un admin d'agence ne se voit proposer que les pages qu'il peut lire.

## Contrat de données

Aucun changement d'API. Les capacités se lisent sur `GET /api/me/capabilities`, comme pour
`billing`.

## Delta à produire

- [x] `PAGES_ADMIN` : `capacite: 'team.assign_role'` sur `/app/agency/roles`,
  `capacite: 'agency.update_kyc'` sur `/app/agency/kyc`.
- [x] `pages-admin.test.ts` : admin au rôle personnalisé sans ces capacités.
- [x] Fixtures des tests voisins : l'admin type porte les capacités du rôle système.

## Critères d'acceptation

- [x] AC1 — Sans `team.assign_role`, `/app/agency/roles` n'est ni au menu ni accessible.
- [x] AC2 — Sans `agency.update_kyc`, `/app/agency/kyc` non plus.
- [x] AC3 — Avec les deux, les deux pages restent ouvertes ; le super-admin ouvre tout.

## Hors périmètre

- Les autres pages de la section (`audit`, `moderation`, `finances`, `integrations`,
  `/app/agency`), que la Piste n'a pas confrontées à leur lecture.

## Notes d'implémentation

- Sous le repli sans fournisseur (`contexteDeRepli`, capacités inconnues), le KYC sort de la liste
  comme `billing` déjà : fail-closed. La première page d'un admin (`entreeAdmin`) ne change pas.
- Fixtures mises à jour (elles modélisaient un admin à la seule capacité `agency.update_billing`) :
  `pages-admin.test.ts`, `pages-admin-server.test.ts`, `acces-admin-contexte.test.tsx`,
  `AppSidebar.section-agence.test.tsx`.
- Ablation : `pages-admin.ts` rendu à `HEAD` → 2 rouges (table, admin sans capacité) ; correctif
  remis → 21/21 verts, et les neuf fichiers de test qui lisent la table verts.
