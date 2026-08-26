---
id: TCK-375
title: "Tableau de bord agence — les files d'attente d'abord"
status: todo
phase: P2
family: front
estimate: M
wave: 47
created: 2026-08-26
updated: 2026-08-26
depends_on: [TCK-373]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#112-agence--équipe
tags: [front, admin, dashboard]
---

## Objectif utilisateur

L'admin d'agence ouvre `/admin` et voit d'abord ce qui l'attend — un dossier KYC à compléter, des biens à modérer, une invitation sans réponse, des impayés — plutôt qu'une rangée de compteurs sur lesquels il n'y a rien à faire.

## Contexte

`/admin` rend aujourd'hui 6 tuiles KPI, un flux d'activité de 4 compteurs et un graphe de
revenus. C'est un écran de **constat**, pas de **travail** : rien n'y indique qu'une action est
attendue, et rien n'y mène.

Ce que l'écran ne montre pas, alors que la console le sait déjà :

- le dossier KYC de l'agence et son statut (`/admin/agency/kyc` l'affiche, la barre latérale
  n'en porte aucun compteur) ;
- les biens en attente de modération — la barre latérale **porte déjà** ce compteur
  (`AdminSidebar.tsx`, sondage toutes les 60 s), le tableau de bord l'ignore ;
- les invitations sans réponse — objet de [TCK-368](TCK-368-equipe-cycle-de-vie-des-invitations.md) ;
- les impayés, présents en tuile mais sans chemin vers l'onglet qui les traite.

Le flux d'activité, lui, renvoie vers `/app/bookings`, `/app/maintenance`, `/app/customers` :
trois liens sur quatre sortent de la console où l'utilisateur se trouve.

## Contrat de données

Aucun endpoint à créer. Tout est déjà servi :

- `/api/dashboard/agency` — compteurs et séries, déjà consommé par l'écran
- la file de modération des biens — déjà sondée par la barre latérale
- le dossier KYC de l'agence — déjà consommé par `/admin/agency/kyc`
- les invitations en attente — livrées par TCK-368

Si un compteur manque à l'appel, **le constater et le dire** plutôt que d'ajouter un endpoint :
un tableau de bord qui invente sa donnée est pire que celui qui ne l'affiche pas.

## Direction UX / Artistique

L'ordre de lecture porte la priorité : **ce qui demande une action passe avant ce qui décrit un
état.** Une file vide ne se masque pas — elle se dit vide, calmement, parce que « rien à
traiter » est une information que l'admin est venu chercher.

Un compteur n'est utile que s'il mène quelque part : chaque file est un chemin, pas un chiffre.
Les KPI restent — ils ont leur valeur — mais ils cessent d'occuper la première ligne.

Éviter le réflexe du grand nombre en gros caractères : c'est le patron par défaut de tous les
back-offices, et il ne dit rien de plus qu'un nombre lisible bien placé.

## Contraintes strictes (métier)

- Une agence `individual` n'a ni modération de biens, ni invitations internes : les files
  correspondantes ne s'affichent pas, et leur absence ne se lit pas comme une erreur.
- Aucun compteur n'est calculé côté client à partir d'une liste rapatriée : c'est le serveur qui
  compte, via `filter[…]` et l'enveloppe de pagination.
- Les liens de la console mènent dans la console : ce qui a un écran sous `/admin` y renvoie.
- Le sondage périodique existant de la barre latérale ne se duplique pas — une seule source pour
  un même compteur.

## Delta à produire

- [ ] Bloc de files d'attente en tête de `/admin`, chaque file portant son compteur et son chemin
- [ ] Files couvertes : KYC de l'agence, biens à modérer, invitations en attente, impayés
- [ ] KPI et graphe conservés, repositionnés sous les files
- [ ] Flux d'activité : les liens qui ont une destination dans `/admin` y renvoient
- [ ] État « rien à traiter » explicite pour chaque file
- [ ] i18n fr/en/wo
- [ ] Tests : présence des files, masquage en agence `individual`, état vide

## Critères d'acceptation

- [ ] AC1 — depuis `/admin`, chacune des quatre files est atteignable **en un clic**
- [ ] AC2 — une file sans élément affiche un état vide explicite, et un test le vérifie
- [ ] AC3 — en agence `individual`, les files sans objet ne sont pas rendues ; un test l'éprouve
- [ ] AC4 — aucun compteur de cet écran n'est obtenu en comptant les éléments d'une liste
      rapatriée côté client (vérifier par lecture des requêtes : `per_page` et `filter[…]`
      côté serveur)
- [ ] AC5 — le compteur de modération n'est sondé qu'**une** fois par l'application, pas deux
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Décider depuis le tableau de bord : les files mènent aux écrans qui décident, elles ne
  décident pas.
- Le contenu des écrans de destination.
- Une API d'activité dédiée : la spec n'en demande pas, et les compteurs existants suffisent.

## Notes d'implémentation

_(à remplir par implementing-specs)_
