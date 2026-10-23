---
id: TCK-1513
title: "« Baux à signer » de l'agent ouvre la liste des baux sur `pending_signature`"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-167--tuiles-et-lignes-cliquables-des-tableaux-de-bord--ce-que-le-lien-ouvre-face-à-ce-que-le-nombre-compte"
tags: [front, dashboard, leases, pistes]
---

## Contexte

Réf : **P167.03** du fichier de pistes, `validé (délégué)`.

« Baux à signer » de l'aperçu de l'agent compte les baux `pending_signature`
(`DashboardAgentService.php:107-111`), mais son lien mène à `/app/leases` nu, et `LeasesList`
tient son statut en `useState('all')` sans lire l'URL : le clic ouvre tous les baux, tous statuts.

## Décision du porteur (déléguée)

validé (délégué) — le lien « Baux à signer » mène à `/app/leases?status=pending_signature`, et `LeasesList` lit `?status=` à l'ouverture pour initialiser son sélecteur de statut existant (valeur hors `STATUS_ORDER` ignorée, retour à « Tous »), comme `BookingsList` depuis TCK-1293 ; test de la page de l'agent sur le `href` et test de `LeasesList` monté sur `?status=pending_signature` qui attend `filter[status]=pending_signature` dans l'appel ; reste : la portée « Mes chiffres » (`agent_id`, filtre que la liste n'affiche pas), au porteur, à trancher avec P167.05

## Reste à faire

la portée « Mes chiffres » (`agent_id`, filtre que la liste n'affiche pas), au porteur, à trancher avec P167.05

## Objectif utilisateur

L'agent qui clique « Baux à signer » arrive sur les baux à signer, pas sur tout le parc.

## Delta à produire

- [x] `overview/agent/page.tsx` : le lien porte `?status=pending_signature`.
- [x] `LeasesList` : `?status=` initialise le sélecteur, borné à `STATUS_ORDER`.

## Critères d'acceptation

- [x] AC1 — le lien « Baux à signer » a pour `href` `/app/leases?status=pending_signature`.
- [x] AC2 — `LeasesList` montée sur `?status=pending_signature` envoie
  `filter[status]=pending_signature` et affiche ce statut dans le sélecteur.
- [x] AC3 — une valeur hors des statuts est ignorée : aucun `filter[status]`, sélecteur sur « Tous ».

## Hors périmètre

- La portée `agent_id` sous « Mes chiffres » (reste, au porteur).
- Le sélecteur n'écrit pas son choix dans l'URL (la décision ne demande que la lecture à l'ouverture).

## Notes d'implémentation

- Ablation : `LeasesList.tsx` et `overview/agent/page.tsx` rendus à `pre-dev` → les deux tests
  neufs rouges (`href="/app/leases"`, requête sans `filter[status]`) ; remis → verts.
- `LeasesList.test.tsx` ne montait pas le routeur : `useSearchParams` y rend `null`. Il moque
  désormais `next/navigation` (URL vide).
