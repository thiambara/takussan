---
id: TCK-505
title: "Responsive — douze défauts mesurés sur 135 écrans × 5 largeurs, dont un qui fait défiler tout `/app` et `/admin` sur tablette"
status: done
phase: P1
family: bug
estimate: M
wave: 59
created: 2026-09-02
updated: 2026-09-02
depends_on: [TCK-503]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#15-transactions--paiements
    - docs/features.md#17-communication--messagerie
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#29-administration--configuration
tags: [front, bug, responsive, a11y]
---

## Objectif utilisateur

Un utilisateur qui ouvre Takussan depuis un téléphone (360-390 px) ou une tablette en portrait
(768-1023 px) atteint chaque commande de l'écran, lit chaque table, et ne voit jamais le document
défiler horizontalement.

## Contexte — le relevé, pas l'estimation

**Campagne du 2026-09-02** : les 117 `page.tsx` du front, rendues avec le rôle qui y a droit
(anonyme, agent, propriétaire, locataire, prestataire, admin d'agence, super-admin, utilisateur
sans profil), soit **135 couples page × rôle, à 5 largeurs** (360, 390, 768, 1024, 1366) — 672
relevés, 0 erreur, par CDP direct sur Chrome headless (`Emulation.setDeviceMetricsOverride`,
sonde DOM dans la page). Rapport complet : `docs/qa/responsive-2026-09-02.md`.

**Ce que la campagne rend** :

| # | Défaut | Où | Largeurs | Mesure |
|---|---|---|---|---|
| 1 | **Le document défile horizontalement** — la coque `/app` et `/admin` déborde | `AppTopbar.tsx` (52 pages, +3 pages qui en héritent) | 768 | `scrollWidth − innerWidth` = **+81 px** (agent/propriétaire), **+118 px** (admin) |
| 2 | Barre publique : « Connexion » coupé, « Publier » invisible | `Navbar.tsx` (14 pages) | 768-~900 | cluster droit atteint **869 px** sur 768 |
| 3 | Barre publique mobile : bouton menu rogné de 10 px | `Navbar.tsx` | 360-767 | bouton à **400 px** sur 390 ; cause : `flex-1` sans `min-w-0` |
| 4 | Messagerie : bulles d'un mot par ligne | `MessagesPage.tsx` | 768-1023 | colonne conversation ≈ **150 px** (grille `md:[320px_1fr]` + sidebar 256) |
| 5 | Tables de paiements : colonnes de droite inaccessibles | `PaymentsHistoryTable`, `InvoicesTable`, `PayoutsTable`, `LeaseSchedule` | 360-768 | table à **571-875 px** sous `overflow-hidden` ; dates cassées sur 3 lignes |
| 6 | Agenda mensuel : puces d'événement hors cellule | `MonthView.tsx` | 360-1024 | `truncate` inopérant, puce à **410 px** sur 390 |
| 7 | Plans plateforme : champs de 20 px, boutons rognés | `AdminPlansClient.tsx` | 768-1023 | grille `md:[1fr_1fr_160px_140px_auto_auto]` dans ≈ 480 px |
| 8 | Recherche publique : « 252 biens trouvés » sur 3 lignes, bouton Filtres rogné | `SearchToolbar.tsx` | 360-390 | `<p>` réduit à < 80 px |
| 9 | KPI en 4 colonnes dès `md` : libellés sur 3-4 lignes | 5 pages `overview/*`, `PipelineStatsBar` | 768 | cartes ≈ 120 px |
| 10 | Bandeau équipe (fiche agence) : flèche « suivants » hors viewport | `TeamStrip.tsx` | 768-1024 | document **+4 px** |
| 11 | Biens similaires (fiche bien) : premier slide hors champ | `PropertySimilar.tsx` | 360-390 | premier slide à x ≈ 310 sur 390 — **à confirmer** avant correction |
| 12 | Fiche bien : le viewport s'élargit à 369 px (le document ne « défile » pas, il grandit) | `PropertyAgentCard.tsx`, `PropertyDetailContent.tsx` | 360 | `innerWidth` 369 pour 360 demandés ; cause : lien d'agence en `nowrap` dans un `<p class="flex truncate">`, et `<aside>` sans `min-w-0` — trouvé **après** le relevé initial, par ablation élément par élément |

Ce que la campagne **ne** rend **pas**, et qui compte autant : aucune table de la primitive `Table`
n'est coupée (elle porte son `overflow-x-auto`), les trois coques passent en tiroir sous `md`,
aucun `h-screen` ne subsiste (TCK-503), et **aucune page ne déborde à 1024 ou 1366** hors les cas
ci-dessus. ⚠ À 360 et 390, `scrollWidth − innerWidth` vaut 0 partout — mais sur **5 couples**
(`/fr/properties` ×2, la fiche bien à 360, `/app/profile/{notifications,reviews}` à 390, plus le
`/fr/playground` POC) c'est le **viewport** qui a grandi (`innerWidth` 369-435 pour 360-390
demandés) : en émulation mobile, un contenu plus large élargit la fenêtre au lieu de la faire
défiler, et la soustraction rend 0. *La mesure a menti dans le sens qui rassure* ; le relevé
compte désormais `max(scrollWidth − innerWidth, innerWidth − largeur demandée)`. Le point de rupture qui casse est **768 : c'est la largeur exacte où
`md:` déclenche la mise en page de bureau, dans un contenu qui n'a pas la place du bureau** —
la barre latérale y prend 256 px sur 768.

## Contrat de données

Aucun. Ticket de rendu strict : ni endpoint, ni contrat, ni comportement métier touché.

## Direction UX / Artistique

- **`md` n'est pas « bureau »** : entre 768 et 1023 px, la coque est celle du bureau (barre
  latérale visible) mais la zone de contenu a la largeur d'un téléphone en paysage. Tout ce qui
  se pose « en colonnes dès `md` » dans `/app` et `/admin` doit se poser **dès `lg`**.
- Une table large défile **dans son conteneur**, jamais le document (reconduction de TCK-371).
- Une barre du haut ne déborde jamais : ce qui n'a pas la place se cache, il ne pousse pas.

## Contraintes strictes (métier)

1. **Chaque correction est vérifiée par la même sonde qui a trouvé le défaut**, à la même largeur,
   et l'ablation doit rougir : un test qui reste vert sans le correctif ne garde rien
   ([[feedback_ac_qui_acceptent_le_mauvais_correctif]]).
2. Aucun changement de ce qui est affiché à 1366 px : le bureau est **inchangé**, relevé à
   l'appui (les 135 relevés à 1366 sont la référence).
3. TCK-501 a posé le gate JS de la messagerie à `767` pour ne pas monter deux panneaux qui
   sondent le réseau : le déplacer à `1023` déplace **les deux couches** (CSS et JS) au même pixel.
4. Pas de nouvelle dépendance, pas de valeur hexadécimale, pas de `!important`.

## Delta à produire

- [x] `AppTopbar` : recherche visible dès `lg` seulement, cluster droit qui ne pousse pas (#1).
- [x] `Navbar` public : mise en page bureau dès `lg`, `min-w-0` sur le bouton de recherche mobile (#2, #3).
- [x] `MessagesPage` : deux panneaux dès `lg`, gate `useMatchesMaxWidth(1023)` (#4).
- [x] Quatre tables : `overflow-x-auto` + `whitespace-nowrap` sur les cellules de date et montant (#5).
- [x] `MonthView` : `min-w-0` sur la cellule pour que `truncate` opère (#6).
- [x] `AdminPlansClient` : grille en colonnes dès `xl` (#7 — mesuré à 1024 : la ligne de plan à six colonnes ne laissait que 41 px aux champs, `lg` ne tenait pas l'AC5).
- [x] `SearchToolbar` : compteur `shrink-0`, rangée **et** groupe des contrôles qui passent à la ligne (#8 — le second relevé, à 360, a montré que le groupe seul faisait encore 336 px dans 328).
- [x] KPI : `sm:grid-cols-2 lg:grid-cols-4` sur les 5 pages overview + `PipelineStatsBar` (#9).
- [x] `TeamStrip` : flèches dans l'en-tête de section, comme sur l'accueil (#10).
- [x] `PropertySimilar` : relever, puis corriger si confirmé (#11 — **relevé, pas de défaut** : le « x ≈ 310 » était le bord gauche du deuxième slide ; fichier non touché).
- [x] `PropertyAgentCard` : le lien d'agence tronque lui-même (`min-w-0 truncate`), `<aside>` en `min-w-0` (#12).
- [x] Tests unitaires par correction, chacun rouge par ablation.
- [x] Re-campagne complète après correction, 0 débordement à 768.

## Critères d'acceptation

- [x] AC1 — à 768 px, **aucune** des 135 pages ne rend `scrollWidth > innerWidth` (0 au lieu de 55).
- [x] AC2 — à 768 px, `/app/messages?conversation=1` affiche **un** panneau, pleine largeur ; à
      1024 et 1366, deux, comme avant.
- [x] AC3 — à 390 px, `/app/payments`, `/admin/finances` et `/app/leases/1` : chaque table est
      atteignable jusqu'à sa dernière colonne par défilement de **son conteneur**, et aucune
      cellule de date ne tient sur plus d'une ligne.
- [x] AC4 — à 390 px, `/app/calendar` : aucune puce d'événement ne dépasse le bord droit de sa cellule.
- [x] AC5 — à 768 px, `/super-admin/plans` : chaque champ mesure au moins 120 px et chaque bouton
      est entièrement dans le viewport.
- [x] AC6 — à 390 px, `/fr/properties` : le compteur tient sur une ligne et le bouton Filtres est
      entier dans le viewport.
- [x] AC7 — à 390 px, le bouton menu de la barre publique est **entier** dans le viewport.
- [x] AC8 — à 1366 px, les 135 relevés sont **identiques** à ceux d'avant correction sur
      `docOverflow`, nombre de tables et éléments hors viewport.
- [x] AC9 — chaque test posé rougit si sa classe responsive est retirée (ablation, une par correction).
- [x] AC10 — à 360 et 390 px, `innerWidth` vaut la largeur demandée sur les 135 pages (le viewport
      n'est élargi par aucun contenu), `/fr/playground` excepté.

## Hors périmètre

- Les cibles tactiles sous 24 px (liens de pied de page à 21 px, boutons « Retirer » du
  comparateur à 16 px, puces d'agenda à 21 px) : relevées dans le rapport, à traiter dans un
  ticket a11y dédié.
- Le tour de bienvenue en plein écran sur téléphone (sheet vide sur 80 % de la hauteur) : design.
- La troncature du prix dans la barre d'action collante de la fiche bien (« /pa… » à 390).
- `/fr/playground` (POC de palette, +39 px à 390 par la rangée des commutateurs de typographie) :
  page de démonstration interne, hors produit.

## Résultat (2026-09-02, branche `fix/tck-505-responsive-tablette-et-mobile`)

Re-campagne sur 140 couples × 5 largeurs, 700 relevés, 0 erreur : débordements **55 → 0** à
768, **4 → 1** à 360 et **5 → 1** à 390 (le restant est `/fr/playground`, hors périmètre),
**1 → 0** à 1024 ; à 1366, 129 couples sur 134 strictement identiques, les 5 écarts lus un à un
sans régression. Suite front entière verte (379 fichiers, 3163 tests). Détail :
`docs/qa/responsive-2026-09-02.md` § 4.

## Notes d'implémentation

Plan détaillé : `docs/plans/2026-09-02-tck-505-responsive-tablette-et-mobile.md`.
