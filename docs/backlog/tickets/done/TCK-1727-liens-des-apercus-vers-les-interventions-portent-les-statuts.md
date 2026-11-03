---
id: TCK-1727
title: "« Devis à valider » et « Demandes d'intervention en cours » ouvrent la liste sur les statuts qu'ils comptent"
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
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-167--tuiles-et-lignes-cliquables-des-tableaux-de-bord--ce-que-le-lien-ouvre-face-à-ce-que-le-nombre-compte"
tags: [front, dashboard, maintenance, pistes]
---

## Contexte

Réf : **P167.01** du fichier de pistes (« « Devis à valider » du bailleur et « Demandes
d'intervention en cours » du locataire ouvrent toutes les interventions, tous statuts »).

« Devis à valider » compte les statuts `quote_submitted` et `awaiting_owner`
(`MaintenanceStateMachine::AWAITING_QUOTE_DECISION`), « Demandes d'intervention en cours » les
statuts de `MaintenanceRequest::scopeOpen()` (tout sauf terminée, clôturée, annulée). Les deux
menaient à `/app/maintenance` nu, et `MaintenanceList` tenait son statut dans un `useState('')`,
sans lire l'URL : le clic ouvrait toutes les interventions.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué, que la décision retient : « porter au lien la liste des statuts comptés
(`?status=quote_submitted,awaiting_owner`, et pour le locataire les statuts hors
`FINISHED_STATUSES`), faire lire `?status=` par `MaintenanceList` et l'envoyer en `filter[status]`,
et rendre la valeur composée dans le sélecteur par les libellés de statut existants joints
(« Devis soumis, En attente du bailleur »), sans clé neuve ».

## Delta à produire

- [x] `types/maintenance.ts` : les deux listes de statuts (miroir de l'API), `maintenanceListHref`,
      `parseMaintenanceStatuses` (statuts connus seuls, sans doublon).
- [x] `MaintenanceListParams.status` prend un statut ou une liste, envoyée `filter[status]=a,b`.
- [x] `MaintenanceList` lit `?status=` au montage ; une valeur à plusieurs statuts devient une
      option du sélecteur, nommée par les libellés joints.
- [x] Les deux aperçus portent leurs statuts dans le lien.

## Critères d'acceptation

- [x] AC1 — « Devis à valider » mène à `/app/maintenance?status=quote_submitted,awaiting_owner` ;
      « Demandes d'intervention en cours » aux neuf statuts hors terminée, clôturée, annulée.
- [x] AC2 — `MaintenanceList` montée sur `?status=quote_submitted,awaiting_owner` demande ces deux
      statuts, et le sélecteur affiche « Devis soumis, En attente du bailleur » ; un statut seul
      reste un statut ; un statut inconnu est ignoré.
- [x] AC3 — la requête envoie `filter[status]=quote_submitted,awaiting_owner`.

## Hors périmètre

- Écrire `?status=` dans l'URL quand on change le sélecteur (le retour arrière retrouve le filtre
  du lien, pas celui choisi ensuite) : la piste ne le demande pas.
- Les listes de statuts sont recopiées de l'API, sans garde qui les compare.

## Notes d'implémentation

- Hypothèse lue, non rejouée sur ce modèle : le filtre exact `status` de spatie lit une liste à
  virgules (`PaymentHistoryTest`, `PropertyCrudTest` le font sur deux autres modèles du même
  trait).
- Avant le correctif : 5 rouges (les deux `href` des aperçus, les trois cas d'AC2-AC3 hors statut
  inconnu).
- Ablation : `MaintenanceList.tsx`, `queries/maintenance.ts` et les deux pages d'aperçu rendus à
  leur version d'avant → les 5 mêmes rouges ; remis → 11 verts (avec `MaintenanceList.test.tsx`,
  qui ne simule pas `next/navigation` : `useSearchParams()` y rend `null`, d'où le `?.`).
