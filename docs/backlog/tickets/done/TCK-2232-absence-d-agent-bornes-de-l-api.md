---
id: TCK-2232
title: "La fin d'une absence d'agent se choisit du jour de l'API à J+365, comme l'API l'accepte"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-230--règles-de-date-relatives-au-jour-de-lapi-face-aux-bornes-des-champs-du-front"
tags: [front, crm, absences, dates, pistes]
---

## Contexte

Réf : **P230.03** du fichier de pistes, `retenu · autonome` (A1 : la borne est écrite par
`StoreAgentAbsenceRequest` : `ends_at` `after:now` et `before_or_equal:` l'instant
`now()->addDays(config('role_delegations.max_duration_days', 366))`).

« Jusqu'au » (`AgentAbsencesSection`) était un champ de date sans `min` ni `max`. L'écran envoie le
soir du jour choisi (`AAAA-MM-JJ 23:59:59`, lu en UTC) : un jour passé, ou J+366 dont le soir
dépasse toujours l'instant J+366, n'étaient refusés qu'à l'envoi.

## Delta à produire

- [x] « Jusqu'au » : `min` au jour de l'API, `max` à J+365 (miroir de la configuration, 366 jours,
      comme `CreateDelegationDialog`).
- [x] Test : `AgentAbsencesSection.bornes.p230-03.test.tsx` (navigateur à New York, 01:00 Z).
- [x] Les deux tests existants qui saisissent le 20 octobre 2026 ont leur horloge figée au
      15 octobre : sans cela, le `min` neuf rend ce jour passé et le formulaire ne part plus.

## Critères d'acceptation

- [x] AC1 — À 01:00 Z le 25 octobre 2026 sous `America/New_York`, le champ porte
      `min="2026-10-25"` et `max="2027-10-25"`.

## Hors périmètre

- Faire juger la borne haute de l'API sur le jour plutôt que l'instant : change ce que l'API
  accepte, non retenu par le classement.
- La fin de journée posée par l'écran (P163.03).

## Notes d'implémentation

- Piège : jsdom applique `min` à la soumission d'un formulaire. `AgentAbsencesSection.test.tsx`
  et `…double-facteur.test.tsx` saisissaient le 20 octobre 2026 sous l'horloge réelle, déjà passé
  le 24 : ils rougissaient (3 tests) jusqu'à ce que leur horloge soit figée (`toFake: ['Date']`).
- Ablation : bornes retirées → le test neuf rouge (`min` absent) ; remises → vert, avec les trois
  autres fichiers de la section (8 tests).
