---
id: TCK-868
title: "Erreurs de champ reliées à leur contrôle et annoncées, hors des Form*"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#112-agence--équipe"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-7--accessibilité-du-front-wcag-22-aa"
tags: [front, accessibilite, pistes]
---

## Contexte

Réf : **P07.07** du fichier de pistes, `retenu · autonome` (classement A4). Les formulaires écrits à
la main hors des `Form*` posent `aria-invalid` sans `aria-describedby`, et leurs `<p>` d'erreur
(`text-destructive`) n'ont ni `id` ni `role` : un lecteur d'écran n'entend pas l'erreur, ni à son
apparition, ni en revenant sur le champ.

## Objectif utilisateur

Un visiteur ou un agent au lecteur d'écran entend l'erreur d'un champ quand elle apparaît, et la
retrouve en revenant sur le champ.

## Contraintes strictes

- Aucun texte neuf, aucun changement de rendu : seuls des attributs ARIA et des `id` s'ajoutent.
- **Hypothèse** : `DepositRefundModal` ne reçoit pas `aria-invalid`, qu'il n'avait pas. Le poser
  rougirait la bordure du champ (`aria-invalid:border-destructive` des primitives), ce qui change le
  rendu ; l'erreur y est seulement reliée (`aria-describedby`) et annoncée (`role="alert"`).
- **Hypothèse** : les erreurs de formulaire (`PropertyContactMessageDialog`,
  `PropertyReservationDialog`, `PropertyReviews`) ne décrivent aucun champ : elles reçoivent
  `role="alert"`, sans `id`.

## Delta à produire

- [x] `PropertyVisitDialog`, `CreateLeaseForm`, `InviteAgentDialog`, `InviteOwnerSheet`,
      `InviteServiceProviderSheet`, `KpiConfigList` : chaque contrôle `aria-invalid` cite l'`id`
      de son erreur par `aria-describedby`, posé seulement quand l'erreur est affichée.
- [x] Ces erreurs et celles de `DepositRefundModal` portent un `id` et `role="alert"`.
- [x] Les erreurs de formulaire des trois dialogues publics portent `role="alert"`.
- [x] Garde `src/test/__tests__/erreurs-de-champ-reliees.test.ts`, et un cas de rendu dans
      `PropertyVisitDialog.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Aucun contrôle de `src/` (hors primitives `ui/`) ne porte `aria-invalid=` sans
      `aria-describedby=`.
- [x] AC2 — Dans les dix fichiers relevés, tout `<p>` `text-destructive` porte un `role`.
- [x] AC3 — Dans la boîte de visite, l'erreur du téléphone est un `alert`, et elle fait partie de
      la description accessible du champ.

## Hors périmètre

- La migration de ces formulaires vers `FormInput`/`FormError`, que la `Piste` proposait en
  alternative : elle refond dix formulaires pour un résultat ARIA identique.
- Les autres `<p text-destructive>` sans `role` de `src/`, hors des dix fichiers relevés.

## Notes d'implémentation

- **Ablation** : les dix sources d'avant remises, tests gardés → 10 rouges sur 19 (la règle
  globale, 8 fichiers sur 10 pour le `role`, et le cas de rendu de la boîte de visite) ; correctif
  remis → verts.
- La règle globale lit la balise ouvrante entière : un `<Controller render={…}>` qui contient un
  `SelectTrigger` `aria-invalid` est compté avec lui, et se corrige avec lui.
- `PhoneInput` compose déjà sa description (indicatif, aide) avec l'`aria-describedby` reçu : le
  test du téléphone vérifie que l'erreur y figure, pas qu'elle soit seule.
