---
id: TCK-2804
title: "Au téléphone, les onglets d'une page montent sous l'en-tête et y collent au défilement : le gabarit PageHeader, pour toutes les pages à onglets"
status: done
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#25-reporting--tableaux-de-bord"
tags: [front, gabarit, page-header, onglets, telephone, fidelite, suite-de-tck-2628, audit-ux, app]
---

## Objectif utilisateur

Au téléphone, sur une page à onglets, l'utilisateur voit les onglets dès le haut de l'écran et les garde sous le
pouce quand il fait défiler la page, pour changer d'onglet sans remonter.

## Contrat de données

**Origine.** Relevé de fidélité de TCK-2628 (fid-rapports), écart ouvert **O1** de
`docs/qa/audit-ux-2026-11/fidelite/TCK-2628.json`, reporté hors de TCK-2801 parce qu'il tient au gabarit et non à
Rapports.

**Mesure** (fiche de fidélité, écrans a-0, a-7 et a-8, téléphone) :

- Produit : la barre d'onglets est à y = 100 (texte à y ≈ 122). Maquette : y = 56 (texte à y ≈ 78). L'écart est de
  44 px.
- Après un défilement de 700 px, la barre est partie avec la page. La maquette la garde collée sous l'en-tête
  (`app-rapports.tsx`, `sticky top-0 z-20` sous l'en-tête).
- Masquer l'en-tête de page sous `md` ne change rien : les 44 px viennent de la marge haute du contenu de `<main>`
  (`EnveloppeDuContenu`, `AppShell`) et du `mt-5` de l'emplacement `dessous` de `PageHeader`.

**Relu sur HEAD (`ebc494478`) le 2026-11-14.** `src/components/console/PageHeader.tsx` rend
`{dessous ? <div className="mt-5">{dessous}</div> : null}` sans aucune règle `sticky`. Le `<main>` d'`AppShell`
est le conteneur qui défile (`overflow-y-auto`). Seize appelants passent `dessous` hors du terrain de jeu. Certains y
mettent des onglets (Rapports, Baux, Réservations, Visites, Interventions…), d'autres une barre de filtres.

> **Prémisse corrigée le 2026-11-14 (re-mesure, cf. « Notes d'implémentation »).** Des seize appelants, dix
> portent des onglets et six une barre de filtres (Interventions est une barre de filtres). **Un seul rend son
> `dessous` au téléphone : Rapports.** Les quinze autres le masquent sous `md` ou ont une branche téléphone ; Baux
> et Réservations y montrent des puces, pas des onglets. La seconde page de l'AC1 est **Paiements**
> (`OngletsDesLoyers`, hors de `PageHeader`), décision 1a de team-lead.

**Aucun changement d'API.**

## Direction UX / Artistique

Fidèle aux maquettes de la console (`playground/maquettes/pages/app/`), qui font foi : au téléphone, les onglets
soulignés d'une page commencent juste sous l'en-tête du téléphone, défilent horizontalement quand ils débordent, et
restent collés sous l'en-tête pendant que le contenu défile. La barre collée a un fond plein et un filet bas, sans
ombre. Au bureau, rien ne change.

## Contraintes strictes (métier)

- **La règle vaut pour le gabarit, pas page par page.** Toute page dont `dessous` porte des onglets de page en hérite,
  sans code propre à chaque page.
- **Une barre de filtres n'est pas un onglet.** Le ticket inventorie les seize appelants de `dessous` et classe
  chacun (onglets ou filtres). Seuls les onglets collent, sauf si la maquette de la page dit autre chose. Le
  classement est écrit dans les notes.
- La barre collée ne passe ni sous l'en-tête du téléphone ni sous les bandeaux du site qui défilent dans `<main>`
  (TCK-572). Elle ne recouvre pas la barre d'action collante du bas (TCK-2689).
- Rien ne change au-dessus de `md` : position et marges du bureau identiques, au pixel.
- Le DOM des appelants sans `dessous` ne change pas d'un nœud (engagement de TCK-2687).

## Delta à produire

- [x] Le gabarit `PageHeader` place les onglets de page à la hauteur de la maquette au téléphone et les fait coller
  sous l'en-tête au défilement.
- [x] Inventaire et classement des seize appelants de `dessous`.
- [x] Mise à jour de l'écart O1 dans `TCK-2628.json` (statut, preuve), et relevé de fidélité rejoué sur Rapports et
  sur une seconde page à onglets.
- [x] Tests vitest du gabarit.

## Critères d'acceptation

- [x] AC1 — _(relevé à 390, ADR-0106 ; seconde page : Paiements, cf. « Prémisse re-mesurée », décision 1a de team-lead)_ Relevé au navigateur à 360 px sur Rapports : la barre d'onglets est à y = 56 ± 2 (texte à y ≈ 78), la
  valeur de la maquette. Même relevé sur une seconde page à onglets (Baux ou Réservations), même valeur.
- [x] AC2 — Même largeur, après un défilement de 700 px : la barre d'onglets est toujours visible, à la même hauteur
  sous l'en-tête. Le relevé lit sa position, pas sa seule présence dans le DOM.
- [x] AC3 — À 1280 px, la position de la barre d'onglets et la marge au-dessus sont celles d'avant, au pixel près, et
  elle ne colle pas si la maquette du bureau ne le dit pas.
- [x] AC4 — Une page dont `dessous` porte une barre de filtres classée « filtres » ne colle pas.
- [x] AC5 — Test vitest du gabarit : `PageHeader` sans `dessous` rend exactement le DOM d'avant.
- [x] AC6 — Vérifié par ablation, une à la fois : la règle collante retirée rend AC2 rouge ; l'ancien `mt-5` remis au
  téléphone rend AC1 rouge.

## Hors périmètre

- Les autres écarts de fidélité de Rapports (TCK-2801).
- Le défilement horizontal des onglets eux-mêmes, s'il est déjà conforme.
- Les consoles hors de `/app` (`/super-admin`).

## Notes d'implémentation

### Prémisse re-mesurée (2026-11-14)

Sous `md`, **seul Rapports rend son emplacement `dessous`**. Les quinze autres appelants le posent derrière
`max-md:hidden`, `hidden lg:*`, ou dans une branche du bureau qu'une branche téléphone remplace. Baux et
Réservations n'ont pas d'onglets soulignés au téléphone : ils ont une rangée de puces (`RangeeDePuces`), hors de
`PageHeader`. La seconde page de l'AC1 est donc **Paiements** (« Loyers » du bailleur, `OngletsDesLoyers`). Ses
onglets sont hors de `PageHeader`, et team-lead a reporté ici leur écart de TCK-2651 (44 contre 32, y + 10). Ils
suivent la même règle, par le même marqueur. Tous les relevés sont à **390** (ADR-0106), pas à 360.

### Classement des seize appelants de `dessous`

| Appelant | Contenu | Famille | Rendu sous `md` ? |
|---|---|---|---|
| `app/reports/layout.tsx` | `OngletsDesRapports` (liens) | onglets | **oui** : seul cas |
| `agency/finances/AdminFinancesClient.tsx` | onglets du registre | onglets | non (`max-md:hidden`, branche téléphone) |
| `bookings/BookingsList.tsx` | segmenté des natures + onglets des statuts | onglets | non (`hidden lg:block`, `max-md:hidden`) |
| `bookings/liste/MesReservations.tsx` | onglets des groupes | onglets | non (`max-lg:hidden`) |
| `visits/par-le-temps/VisitesParLeTemps.tsx` | onglets des vues | onglets | non (bureau dès `lg`) |
| `admin/PropertyModerationWorkspace.tsx` | onglets Avis · Biens | onglets | non (branche téléphone) |
| `admin/ModerationWorkspace.tsx` | onglets Avis · Biens | onglets | non (branche téléphone) |
| `admin/equipe/ConsoleDeLEquipe.tsx` | onglets Membres · Invitations · Performance | onglets | non (branche téléphone) |
| `leases/LeaseDetail.tsx` | onglets Dossier · Documents · Historique | onglets | non (`max-md:hidden`) |
| `leases/liste/ListeDesBauxDeLAgence.tsx` | onglets des baux | onglets | non (`hidden lg:block`) |
| `pipeline/PageDuPipeline.tsx` | indicateurs + barre du pipeline | filtres | non (`hidden lg:flex`) |
| `leads/ContactLeadsInbox.tsx` | vues + filtres + recherche | filtres | non (bureau dès `lg`) |
| `journee/MaJournee.tsx` | semaine du bureau | filtres | non (`max-md:hidden`) |
| `owners/OwnersList.tsx` | recherche + pastilles | filtres | non (`hidden lg:flex`) |
| `maintenance/files/InterventionsDeLAgence.tsx` | filtres + vues | filtres | non (`hidden lg:flex`) |
| `customer-dashboard/liste/ListeDesClients.tsx` | vues (segmenté) | filtres | non (`hidden lg:flex`) |

### La règle

- **Le marqueur** `ONGLETS_DE_PAGE` (`data-onglets-de-page`, `console/PageHeader.tsx`) se pose sur la rangée
  d'onglets de page. `OngletsDesRapports` et `OngletsDesLoyers` le portent. Une barre de filtres ne le porte pas.
  La règle se déclenche par `:has()`, en CSS seul, sous `md` seulement.
- **Position** : l'enveloppe de la coque perd sa marge haute (`ENVELOPPE_DU_CONTENU`,
  `max-md:has-[[data-onglets-de-page]]:pt-0`). L'emplacement `dessous` perd son `mt-5`.
- **Collant** : c'est la **racine** de `PageHeader` qui colle (`sticky top-0 z-20 bg-background`), pas
  l'emplacement. Un élément collant ne colle que dans son bloc conteneur, et celui de l'emplacement est la racine,
  haute des seuls onglets. `OngletsDesLoyers` colle par son propre conteneur, posé dans la page. Les deux rangées
  vont bord à bord (`-mx-4 px-4`) et portent leur fond plein et leur filet bas, sans ombre.
- **Focus et ancre** : sous `md`, le `<main>` porte `scroll-pt-12` (48 px pour une rangée de 45 à 47) quand il
  contient le marqueur (`AppShell`).
- **Cible tactile** : Rapports garde `h-11` (44 px), comme `OngletsTel` de sa maquette. Paiements dessine
  l'onglet de sa maquette, 32 px visibles (texte de 20 + `pb-3`). L'appui reste à 44 px : un `::before`
  transparent prolonge le lien de 12 px vers le haut, dans le `pt-3.5` de la rangée. C'est le patron des onglets
  soulignés de `ui/tabs` (`before:h-controle`).
- **Limite assumée** : sous `md`, ce que `PageHeader` montre encore au-dessus des onglets colle avec eux. Rapports
  masque son en-tête au téléphone, et aucun autre appelant ne rend d'onglets à cette largeur.

### Preuves

Relevés de `fidelite.mjs releve`, scratchpad `impl/lot2/2804/` (`avant/`, `apres/`, `abl/`), 2026-11-14.

- **AC1** — Rapports à 390 : onglets à y = 56, h = 44 (avant 100 ; maquette 56). « Ce mois » à y = 111 (maquette
  111) : l'écart sous les onglets est gardé. Paiements : rangée à y = 56, onglets à y = 70, h = 32 (avant 80 et 44 ;
  maquette 70 et 32).
- **AC2** — défilé de 700 px dans `<main>` : onglets de Rapports à y = 56, de Paiements à y = 70 (rangée à 56).
  Les captures montrent le fond plein sur le contenu qui passe dessous. Feuille des notifications ouverte, verrou
  posé (`body` fixe) : y = 56 avant, pendant et après, et `scrollTop` de 700 gardé.
- **AC3** — à 1280, avant et après : Rapports 191 nœuds sur 191, Paiements 245 sur 245, Clients 395 sur 395, aucune
  boîte déplacée. Les règles compilées sont toutes sous `@media (width < 48rem)` (test).
- **AC4** — aucun appelant « filtres » ne rend `dessous` au téléphone : la preuve est structurelle. Les règles
  compilées exigent `:has([data-onglets-de-page])`, et les six fichiers « filtres » ne posent pas le marqueur (test).
  Clients à 390 : 116 nœuds sur 116 inchangés.
- **AC5** — `PageHeader` sans `dessous` rend le même DOM : `header` racine, classe de l'appelant seule. Avec un
  fil mais sans `dessous`, la racine n'a aucune règle collante (test).
- **AC6** — ablations au navigateur, une à la fois, md5 restauré : sans `sticky`, aucun onglet n'est à l'écran au
  défilé de 700 (rouge) ; avec le `mt-5` remis au téléphone, y = 76 (rouge) ; sans `scroll-pt-12`, un lien
  focalisé sous les onglets reste à y = 70, sous leur bas à 101, et l'ancre tombe à 56 (rouge). Avec la règle, le
  focus et l'ancre sont à y = 104.
- **Tests** : `src/components/console/__tests__/PageHeader.onglets.tck-2804.test.tsx`.
- **Cible de 44 px (Paiements)** — sonde `elementFromPoint` au navigateur : chaque onglet (haut à 70, 32 px) répond
  de 58 à 101, et plus à 57. L'appui fait donc 44 px.
  Le `::before` ne capte aucun clic destiné à un élément au-dessus : il commence à y = 58, DANS la rangée (haut à 56,
  `pt-3.5`), qui le coupe (`overflow-x-auto`). Sondé au repos et défilé de 700 : de y = 50 à 55, l'en-tête du
  téléphone reçoit le point ; 56 et 57, la rangée ; dès 58, l'onglet.
- **Paiements colle, sa maquette non** (décision 2a de team-lead) : la maquette pose ses onglets dans le contenu
  qui défile. Une seule règle vaut pour toute page à onglets (le marqueur et l'enveloppe). L'écart est noté dans
  la fiche de fidélité de TCK-2651 (`ecarts_acceptes`).
- **Bandeaux du site (TCK-572)** : aucun n'est collant dans `<main>` ; ils défilent au-dessus de la page. Au repos,
  les onglets sont sous eux, et au défilement ils collent en haut du `<main>`, sous l'en-tête. Aucun enfant collant
  dans les onglets de Rapports ni de Loyers : `DataTable` n'y est jamais rendu en `stickyHeader`.
- **Fidélité rejouée** (`fidelite.mjs compare` contre les références gelées, 390) :
  - Rapports a-0 : 14 conformes, 26 écarts, 55 absents, 19,38 % de pixels avant ; 21, 22, 52 et 16,91 % après.
  - Paiements a-4 : 25, 27, 11 et 20,18 % avant ; 26, 26, 14 et 19,2 % après.
  - Reste sur Paiements, hors de ce ticket : le contenu sous les onglets est à + 4 px (`space-y-5` de la page
    contre `pt-4` de la maquette).
