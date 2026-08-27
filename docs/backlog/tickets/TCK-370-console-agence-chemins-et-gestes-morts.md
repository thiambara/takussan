---
id: TCK-370
title: "Console agence — quatre chemins et gestes morts"
status: todo
phase: P2
family: bug
estimate: S
wave: 47
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#27-médias--fichiers
    - docs/features.md#112-agence--équipe
tags: [front, admin, bug, navigation]
---

## Objectif utilisateur

L'admin d'agence n'est plus renvoyé vers une page qui ne lui explique rien, ne cherche plus une section qu'aucun lien ne dessert, et retrouve deux gestes que le produit a déjà payés.

## Contexte

Quatre défauts mesurés le 2026-08-26 sur `/admin`. Aucun n'est une fonctionnalité manquante :
chacun est un raccord qui n'a pas été fait. Ils tiennent dans un seul ticket parce qu'ils
partagent leur forme — *le code des deux côtés existe, le fil entre les deux est absent* — et
que chacun se vérifie en une commande.

| # | Constat | Mesure |
|---|---|---|
| 1 | `/admin/settings/tags` redirige vers `/admin?notice=tags-platform-managed` et **rien ne lit `notice`** | `grep -rn "tags-platform-managed" src/` → 1 seule occurrence, celle qui l'écrit |
| 2 | `/admin/settings/integrations` **n'est dans aucun menu** ; son seul chemin est l'onglet de `/admin/settings`, réservé au super-admin, et son onglet « Général » éjecte un `agency_admin` vers `/admin` | `AdminSidebar.tsx:56-90` ; `routes/api/integrations.php` ne pose qu'`auth:sanctum` |
| 3 | `POST /agencies/{agency}/regenerate-watermarks` n'a **aucun bouton** | `grep -rn "regenerate-watermarks" src/` → aucun résultat |
| 4 | `AdminFinancesTabs` accepte `defaultCommissionRate` ; `AdminFinancesClient` ne le passe pas | le curseur du dialogue de reversement démarre toujours au défaut, jamais au taux de l'agence — alors que [§1.12](../../features.md#112-agence--équipe) liste « Paramètres de commission par défaut » en P1 |

## Contrat de données

Aucun endpoint à créer. Le seul non consommé aujourd'hui est
`POST /api/agencies/{agency}/regenerate-watermarks`. Le taux de commission par défaut est déjà
servi par `/api/dashboard/agency`, que la page monte déjà.

## Direction UX / Artistique

Une redirection qui a une raison la dit. La regénération des filigranes est une action longue et
non anodine : elle se confirme, et elle dit ce qu'elle va toucher plutôt que de rendre la main
en silence.

## Contraintes strictes (métier)

- L'accès aux intégrations suit ce que l'API autorise, pas ce que le menu suppose : elle n'est
  pas réservée au super-admin. Le corriger **dans le sens de l'API**, sans élargir un accès que
  le backend refuserait.
- La regénération des filigranes est gardée côté serveur ; le bouton n'autorise rien.
- Rien ici ne change de contrat de réponse ni de schéma.

## Delta à produire

- [ ] Rendre le motif de la redirection depuis `/admin/settings/tags` visible à l'arrivée
      — ou supprimer le paramètre s'il ne sert plus, mais pas le laisser muet
- [ ] Entrée de menu vers les intégrations, visible par qui l'API laisse entrer, et onglets de
      `/admin/settings*` qui ne renvoient pas vers une page dont on sera éjecté
- [ ] Action de regénération des filigranes sur la configuration d'agence, avec confirmation
- [ ] Passer le taux de commission de l'agence au dialogue de reversement
- [ ] i18n fr/en/wo pour tout libellé neuf
- [ ] Tests : un par défaut corrigé

## Critères d'acceptation

- [ ] AC1 — un `agency_admin` atteint les intégrations **depuis la navigation**, sans URL
      tapée à la main, et aucun onglet de cet écran ne le renvoie vers une page qui le rejette
- [ ] AC2 — après la redirection depuis `/admin/settings/tags`, l'écran d'arrivée dit pourquoi
- [ ] AC3 — `grep -rn "regenerate-watermarks" src/` trouve un appel, et l'action demande
      confirmation avant de partir
- [ ] AC4 — le dialogue de reversement s'ouvre sur le taux de commission **de l'agence** ; un
      test l'éprouve avec un taux différent du défaut, et **échouerait** si la valeur codée en
      dur revenait
- [ ] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Refondre l'écran des intégrations lui-même.
- Rouvrir la question de qui peut gérer les tags : la redirection reste, seul son silence est
  corrigé.
- La file d'attente et le suivi de progression de la regénération des filigranes.

## Notes d'implémentation

### Ce que la re-mesure a contredit (2026-08-27)

Les quatre constats du tableau ont été rejoués un par un. **Trois sont exacts au mot près.** Ce
qui ne l'était pas est le **Contrat de données**, et il l'était dans le sens qui fait perdre du
temps :

> « Le taux de commission par défaut est déjà servi par `/api/dashboard/agency`, que la page monte
> déjà. »

Faux sur les deux moitiés.

- `DashboardAgencyService` rend `finance.commission_month` — une **somme** de
  `leases.commission_amount` sur le mois — et aucun taux. `DashboardAgencyPayload`
  (`src/lib/queries/dashboard-agency.ts`) n'a aucun champ de taux.
- `/admin/finances/page.tsx` ne monte pas cet endpoint. La page qui l'appelle est `/admin`.

La source réelle est `agencies.commission_rate`, déjà présente dans `AGENCY_ADMIN_FIELDS` et déjà
servie par `fetchAgencyAction` — celle-là même dont `/admin/agency` pré-remplit son champ
« Commission ». Les deux écrans lisent donc désormais la même colonne. *Un ticket qui nomme la
mauvaise source fait écrire un endpoint qui existait déjà ailleurs.*

Deux précisions mineures, sans effet sur le delta : le renvoi `AdminSidebar.tsx:56-90` désigne en
fait `buildAdminItems` (50-90), l'entrée super-admin étant à 86-88 ; et le défaut n°4 est un cran
plus profond que décrit — `AdminFinancesClient` ne **portait pas** la prop, il ne se contentait pas
de ne pas la passer.

### Décisions non évidentes

**`AdminNotice` est scindé en un résolveur `async` et un bandeau synchrone.** Ce n'est pas du
style : React ne rend pas un composant `async` imbriqué sous un autre (mesuré — l'arbre entier
suspend et le test ne voit qu'un `<div />` vide, donc ne distingue plus « le bandeau manque » de
« rien ne s'affiche »). Le défaut corrigé ici a vécu précisément parce que ce chemin n'était
éprouvé nulle part. Même contrainte rencontrée sur `SettingsTabs`, traitée là par un doublon qui
**capture les props réelles de la page** et les rejoue sur le vrai composant (`importActual`).

**`SettingsTabs.canSeeGeneral` est requis, sans défaut.** Un défaut à `true` aurait ramené
l'onglet éjectant au premier écran ajouté ; le typage pose la question à chaque site d'appel.

**Le bouton de filigranes ne cache pas le refus.** La garde serveur (`primary_admin_id` ou
super-admin) est plus étroite que l'`isAdmin` qui ouvre `/admin/agency`. Le bouton reste visible
et l'erreur 403 est affichée : le masquer aurait supprimé le message en même temps que le geste.
Il est monté **hors** du `<form>` d'`AgencyConfigForm` — un test le vérifie.

**`/app/payments` porte le même défaut n°4 et n'est PAS corrigé** : `PaymentsTabs` accepte
`defaultCommissionRate` et `app/payments/page.tsx` monte `<PaymentsTabs />` nu. Hors périmètre —
le ticket ne nomme que le chemin admin.

### Vérification

Chaque correctif a été **retiré puis rejoué** pour vérifier que ses tests rougissent : les deux
côtés du fil `notice`, l'entrée de menu, le surlignage par préfixe, `canSeeGeneral` au site
d'appel comme dans le composant, la confirmation du dialogue, et les deux maillons du taux de
commission. La valeur d'épreuve du taux est **7,5** et non 0 — le défaut se manifestait en `?? 0`,
donc une agence à 0 % aurait rendu le test vert avec et sans le correctif.
