---
id: TCK-377
title: "Tableau de bord /app — la barre latérale est la moins mûre des trois, et c'est celle que tout le monde utilise"
status: todo
phase: P1
family: bug
estimate: M
wave: 48
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#17-communication--messagerie
tags: [front, dashboard, navigation, a11y, bug]
---

## Objectif utilisateur

Quel que soit son rôle, l'utilisateur connecté sait **où il est** dans le tableau de bord, trouve
l'entrée qu'il cherche sans parcourir une liste de vingt-trois lignes, et voit depuis le menu ce
qui l'attend.

## Contexte

Le dépôt porte **trois** barres latérales. Elles ont été écrites dans cet ordre : `AppSidebar`
(TCK-055, la plus ancienne), `AdminSidebar`, `SuperAdminSidebar` (TCK-357/359, la plus récente).
Chaque génération a appris quelque chose que la précédente n'a pas reçu en retour.

Relevé du 2026-08-26 :

| Propriété | `SuperAdminSidebar` | `AdminSidebar` | `AppSidebar` |
|---|---|---|---|
| Entrées groupées en sections | ✅ `NAV_GROUPS` (l. 56) | ❌ | ❌ |
| Actif sur les pages filles | ✅ `isActivePath` (l. 249-252) | ✅ en ligne (l. 194-197) | ❌ `pathname === item.href` (l. 316) |
| `aria-current="page"` | ✅ (l. 200, 230) | ❌ | ❌ |
| Compteurs sur les entrées | — | ✅ deux sondages 60 s (l. 154, 167) | ❌ aucun appel réseau |
| Entrées maximum, à plat | groupées | ~10 | **23** (`agency_admin`) |

Les deux premières lignes se voient tout de suite à l'usage :

- **Aucune entrée n'est surlignée sur une page de détail.** `/app/properties/42`,
  `/app/leases/7`, `/app/bookings/12`, `/app/visits/3`, `/app/maintenance/9`,
  `/app/documents/4`, `/app/inventories/5`, `/app/customers/8`, `/app/leases/new`,
  `/app/customers/new`, `/app/inventories/new`, `/app/maintenance/new` — douze routes de
  `/app` sur quarante-six, et sur chacune la barre latérale n'indique rien. `AdminSidebar`
  résout exactement ce cas depuis son commentaire l. 193 : *« prefix match for nested routes so
  "Paramètres" stays highlighted on /admin/settings/tags »*. `AppSidebar` ne l'a jamais reçu.
- **Vingt-trois entrées à plat pour un `agency_admin`** (comptées sur `buildNavItems`, après
  dédoublonnage) : tableau de bord, biens, publier, favoris, recherches, réservations, baux,
  maintenance, carnet prestataires, messagerie, documents, statistiques, exports, vue agence,
  KPI, alertes, bailleurs, CRM, états des lieux, visites, calendrier, onboarding en attente,
  administration. Treize pour un `customer`. Aucun repère, aucune césure.

Le troisième point est ce qui manque au menu, pas ce qui y est faux : **`AppSidebar` ne fait
aucun appel réseau.** Un locataire ne voit pas depuis le menu qu'il a un message non lu, un
agent ne voit pas qu'une demande de visite attend. `useConversations` sonde déjà toutes les
10 s (`src/lib/queries/conversations.ts:101`) — la donnée existe, le menu ne la lit pas.

*Une génération qui n'apprend rien de la suivante finit par servir les utilisateurs les moins
bien lotis : ici, tous.*

## Contrat de données

Aucun endpoint à créer. Les compteurs se prennent sur ce que le front consomme déjà :

- messages non lus — `GET /api/conversations` (déjà sondé par `src/lib/queries/conversations.ts`)
- demandes de visite en attente — `GET /api/visits?filter[status]=pending`, `per_page=1`, compte
  lu dans `meta` (la forme exacte qu'`AdminSidebar` emploie pour ses deux compteurs)

Le sondage suit la même règle que la console agence : `enabled` sur le rôle qui voit l'entrée,
jamais un appel pour un rôle qui n'a pas la ligne.

## Direction UX / Artistique

- **Le regroupement porte le parcours, pas l'inventaire technique.** Les sections se lisent dans
  l'ordre où le métier arrive : découvrir → demander → s'engager → piloter. L'étiquette de section
  est discrète (petite, en majuscules espacées) ; c'est une césure, pas un titre.
- Un rôle qui n'a que trois entrées ne doit pas se voir infliger trois en-têtes de section : le
  groupement s'efface quand il n'a plus de travail à faire.
- Le compteur est un **signal**, pas une alarme : il dit qu'il y a quelque chose, il ne crie pas.
  Il ne s'affiche jamais à zéro.
- L'entrée courante doit être reconnaissable **sans la couleur seule** — c'est la même exigence
  que TCK-359 pose sur la console super-admin.
- La barre reste utilisable au clavier de bout en bout, y compris repliée en tiroir sur mobile.

## Contraintes strictes (métier)

- **Le regroupement ne change aucun droit.** Les conditions de rôle de `buildNavItems` sont le
  contrat ; ce ticket réorganise l'affichage, il n'ajoute ni ne retire aucune entrée à aucun
  rôle. Toute entrée qui change de visibilité est hors périmètre (c'est TCK-379).
- L'entrée cadenassée (`isProRouteLocked`) garde son cadenas, sa sémantique et son
  `aria-disabled` : le cadenas n'est pas une autorisation, il n'en devient pas une.
- Le surlignage par préfixe ne doit **pas** faire de `/app` le parent de tout : la racine se
  compare par égalité stricte, exactement comme `AdminSidebar` traite `/admin` et
  `/admin/agency`. Même exception pour `/app/properties` vs `/app/properties/new`, et
  `/app/leases` vs `/app/leases/onboarding-pending` — sinon deux entrées s'allument ensemble.
- Un compteur qui échoue à se charger n'affiche rien ; il n'affiche jamais `0`, ni un `—`, ni un
  état d'erreur dans le menu.

## Delta à produire

- [ ] Surlignage par préfixe dans `AppSidebar`, avec la liste explicite des racines comparées par
      égalité — la même forme que `AdminSidebar`, factorisée pour que les trois shells la
      partagent plutôt que de la réécrire une quatrième fois
- [ ] `aria-current="page"` sur l'entrée active — dans les **trois** shells, `AdminSidebar`
      comprise, qui ne l'a pas non plus
- [ ] `aria-label` sur le `<nav>` de `AppSidebar`
- [ ] Sections de navigation dans `buildNavItems` : la donnée porte la clé de section, le rendu
      la résout (patron TCK-286, déjà appliqué aux libellés)
- [ ] Compteur « messages non lus » et compteur « visites en attente » sur les entrées
      correspondantes, sondés comme ceux d'`AdminSidebar`
- [ ] i18n fr/en/wo des étiquettes de section et du libellé accessible des compteurs
- [ ] Tests : un par défaut corrigé — surlignage sur une page fille, absence de surlignage
      croisé sur les trois couples de routes imbriquées, `aria-current` présent, compteur absent
      à zéro

## Critères d'acceptation

- [ ] AC1 — sur `/app/properties/42`, l'entrée « Mes biens » est active ; un test l'éprouve et
      **échouerait** si `pathname === item.href` revenait
- [ ] AC2 — sur `/app/properties/new`, **une seule** entrée est active, et c'est « Publier un
      bien » ; idem pour `/app/leases/onboarding-pending` contre « Baux ». Un test couvre les
      trois couples imbriqués et échouerait sur un préfixe naïf
- [ ] AC3 — l'entrée active porte `aria-current="page"` dans `AppSidebar` **et** `AdminSidebar`
- [ ] AC4 — pour un `agency_admin`, les 23 entrées sont réparties en sections ; la liste des
      `href` rendus est **identique** à celle d'avant le ticket, à l'ordre près — un test compare
      les deux ensembles pour chacun des six rôles
- [ ] AC5 — un compteur ne s'affiche pas quand la valeur est `0` ni quand la requête échoue ; un
      test l'éprouve dans les deux cas
- [ ] AC6 — aucun sondage réseau n'est armé pour un rôle qui ne voit pas l'entrée comptée
- [ ] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- **Changer qui voit quoi** : les entrées poussées sans garde de rôle et les écrans sans chemin
  sont l'objet de TCK-379.
- Repliage persistant de la barre, recherche dans le menu, navigation basse sur mobile.
- La palette et les primitives de rendu : TCK-380 et TCK-381.
- Le contenu des pages atteintes.

## Notes d'implémentation

_(à remplir par implementing-specs)_
