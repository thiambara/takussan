---
id: TCK-1120
title: "La boîte « Demandes » lit `?lead=` et rend la demande désignée en tête, mise en avant"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#67-propertycontactlead-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-97--liens-daction-des-courriels--page-visée-authentification-hôte"
tags: [front, leads, notifications, pistes]
---

## Contexte

Réf : **P97.04** du fichier de pistes, `validé (délégué)` (V7 accordé : la forme visible de
l'ouverture sur la demande).

La cible de notification `lead` vaut `/app/leads?lead={id}` (« la boîte « Demandes », ouverte sur
la demande », TCK-590) : bouton du courriel `LeadReceived` et lien de la cloche. Ni la page ni
`ContactLeadsInbox` ne lisent de paramètre de requête : la demande annoncée n'est ni ouverte, ni
mise en avant.

## Décision du porteur (déléguée)

garder le paramètre et le faire lire par la boîte : `ContactLeadsInbox` lit `?lead={id}`, charge la demande par `GET /api/contact-leads/{id}` (route et policy existantes) et la rend en tête de liste, mise en avant, quel que soit l'onglet ou la page ; un identifiant invalide ou refusé est ignoré sans erreur ; garde : un test de `ContactLeadsInbox` monté avec `?lead=` qui attend la demande désignée

## Objectif utilisateur

L'agent qui clique le courriel ou la cloche d'une demande reçue la trouve en tête de sa boîte,
distinguée des autres, sans la chercher.

## Contrat de données

- `GET /api/contact-leads/{id}` (existant, policy `view`), avec les mêmes `fields` et `include`
  que la liste.

## Direction UX / Artistique

Mise en avant sobre sur un jeton existant (anneau `primary`), aucun texte neuf.

## Contraintes strictes (métier)

- Un identifiant non entier ou non positif n'appelle pas l'API.
- Un 403/404 n'affiche aucune erreur : la boîte se rend comme sans paramètre.
- La demande désignée n'apparaît pas deux fois quand elle figure aussi dans la page courante.

## Delta à produire

- [x] `src/lib/queries/contact-leads.ts` : un hook de lecture d'une demande, clé de la factory.
- [x] `ContactLeadsInbox` : lit `lead` de l'URL, rend la demande en tête, mise en avant, quel que
      soit l'onglet ou la page ; la retire de la liste en dessous.
- [x] Tests `ContactLeadsInbox.test.tsx` : `?lead=` désigne une demande hors de la page ;
      identifiant invalide ; lecture refusée.

## Critères d'acceptation

- [x] AC1 — monté avec `?lead=42`, la demande 42 est rendue en premier, marquée `aria-current`,
      même si la page de la liste ne la contient pas.
- [x] AC2 — `?lead=abc` : aucune lecture de demande n'est lancée, la liste se rend.
- [x] AC3 — lecture refusée (erreur) : la liste se rend, sans message d'erreur.
- [x] AC4 — la demande désignée présente dans la liste n'y est pas rendue une seconde fois.

## Hors périmètre

- La perte de la chaîne de requête par la garde de `/app` hors session : P97.02.
- Tout défilement ou ouverture d'un détail.

## Notes d'implémentation

- Ablation : `ContactLeadsInbox.tsx` rendu à `HEAD` → 2 rouges sur les 7 cas neufs (tête de liste,
  doublon) ; le seul filtre de la liste retiré → 1 rouge (doublon) ; correctif remis → 15/15.
- Les cas « identifiant invalide » et « lecture refusée » sont verts sans le correctif : ils gardent
  le comportement d'avant (aucune lecture, aucune erreur), que le correctif ne doit pas défaire.
- La mise en avant est `aria-current="true"` et un anneau sur le jeton `primary` : aucun texte neuf.
