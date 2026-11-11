---
id: TCK-2742
title: "Les icônes du menu et des onglets de /app suivent les maquettes : Commissions, Crédits, États des lieux et Recherches sauvegardées prennent l'icône que toutes les maquettes leur donnent"
status: todo
phase: P1
family: front
estimate: S
wave: null
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2618, TCK-2619]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
  tickets:
    - docs/backlog/tickets/done/TCK-2619-coque-sans-flottant-introuvable.md
    - docs/backlog/tickets/done/TCK-2618-menus-et-onglets-par-persona.md
    - docs/backlog/tickets/done/TCK-2477-moteur-du-menu-par-persona.md
  qa:
    - docs/qa/audit-ux-2026-11/fidelite/TCK-2619.absents.json
    - docs/qa/audit-ux-2026-11/fidelite/references/app-coque/gel.json
tags: [front, navigation, icones, coque, audit-ux, app, suivi-lot-2]
---

## Objectif utilisateur

Une entrée du menu a la même icône partout : dans la colonne, dans le tiroir, dans « Aller à… », et la même que
dans les maquettes que le porteur a choisies. Aujourd'hui, quatre entrées portent une icône que les maquettes ne
dessinent nulle part.

## Contexte

Les maquettes de référence sont `/fr/playground/maquettes?p=app-coque&a=a`, écrans 0, 3, 5 et 8 (colonne, tiroir,
compte, page introuvable). Elles ne sont pas versionnées et s'ouvrent dans l'arbre principal du porteur
([README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes)). S'y ajoutent toutes les pages
`app-*` gelées sous `docs/qa/audit-ux-2026-11/fidelite/references/`, dont chacune dessine la colonne ou le tiroir.

Relevé le 2026-11-11 sur `feat/audit-ux-app-lot-2`, à la vérification des réserves de TCK-2619
(`TCK-2619-reserves-verif.json`, défaut d1) :

- `TCK-2619.absents.json` renvoyait ces écarts d'icône à TCK-2618. Or TCK-2618 est `done`, et ni son ticket ni
  sa fiche n'en disent rien. Les icônes viennent du catalogue de TCK-2477 (`src/lib/navigation/catalogue.ts`).
- La divergence est **systématique** : elle touche l'AC-F3 de chaque page de `/app`, car chaque maquette dessine la
  colonne ou le tiroir autour de sa page.

**Mesure** : chaque icône lucide suivie d'un libellé sur la même ligne, à moins de 22 px, a été relevée. La
mesure porte sur toutes les références gelées `app-*` (maquettes) et sur tous les relevés `.fidelite/*/prod-*`
du produit, au 2026-11-11.

| Entrée (`catalogue.ts`) | Libellé | Produit | Maquettes | Relevés de maquette |
|---|---|---|---|---|
| `commissions` | Commissions | `HandCoins` (`lucide-hand-coins`) | `Receipt` (`lucide-receipt`) | 248 lignes, 25 pages ; aucune autre icône pour ce libellé, hors flèches de navigation |
| `credits` | Crédits | `Coins` (`lucide-coins`) | `CreditCard` (`lucide-credit-card`) | 118 lignes, 18 pages |
| `etats-des-lieux` | États des lieux | `ClipboardList` (`lucide-clipboard-list`) | `ClipboardCheck` (`lucide-clipboard-check`) | 201 lignes, 18 pages |
| `recherches` | Recherches sauvegardées | `BookmarkCheck` (`lucide-bookmark-check`) | `Search` (`lucide-search`) | 8 lignes, 3 pages (app-reservations, app-accueil, app-visites) |

Les autres entrées relevées des deux côtés ont déjà l'icône des maquettes. Ce sont Tableau de bord, Aujourd'hui,
Messagerie, Tâches, Demandes de contact, Clients, Visites, Calendrier, Mes biens, Réservations, Baux, Entrées en
attente, Interventions, Documents, Rapports et Vue agence, Propriétaires, Abonnement, Paiements, Loyers et Argent,
ainsi que les onglets Accueil, Aujourd'hui, Demandes, Clients, Biens, Messages et Menu.

Deux points restent tels quels :

- **La ligne « Crédits » du menu du compte garde `Coins`.** C'est la seule maquette qui la dessine (app-coque a-5,
  `LigneCompte icone={Coins}`), et `MenuDuCompte`/`FeuilleDuCompte` la rendent déjà ainsi. Le changement ne porte
  que sur l'entrée `credits` du catalogue, dans la colonne, le tiroir, « Aller à… » et les récents.
- **« Entrées en attente » et « États des lieux » partagent `ClipboardCheck` dans les maquettes.** C'est le dessin
  retenu, et la décision du lead (2026-11-11) est de suivre les maquettes.

## Décision

**Décision du lead, le 2026-11-11 : on suit les maquettes, que le porteur a choisies (« je valide tout »).** Aucune
autre décision n'est attendue.

## Contraintes strictes

- **Une seule source** : l'icône d'une entrée se change dans `catalogue.ts` (ou dans les `icones` d'une
  disposition s'il s'agit d'une persona), jamais chez un appelant. La colonne, le tiroir, « Aller à… », les
  récents et la barre d'onglets la lisent tous de là.
- Le libellé, l'ordre et l'accès d'une entrée ne bougent pas.
- La convention d'icône ne change pas : `size-icone`, trait 1,5, comme les entrées voisines.

## Delta à produire

- [ ] `catalogue.ts` : `commissions` → `Receipt`, `credits` → `CreditCard`, `etats-des-lieux` → `ClipboardCheck`,
      `recherches` → `Search`. Retirer les imports devenus inutiles.
- [ ] Un test du catalogue qui épingle les quatre icônes, par leur classe lucide rendue.
- [ ] La fiche `TCK-2619.absents.json` : les groupes renvoyés à TCK-2742 passent à « corrigé ». Les relevés a-0,
      a-3, a-5 et a-8 de TCK-2619 sont rejoués.

## Critères d'acceptation

- [ ] AC1 — Chaque entrée du tableau rend l'icône de la colonne « Maquettes » à **tous** les endroits où elle
      paraît : colonne du bureau (1440 et 1280), rail de 768, tiroir « Menu » du téléphone, « Aller à… » au
      téléphone et au bureau, et la barre d'onglets si une persona l'y met. Le contrôle se fait au navigateur, sur
      la persona qui voit l'entrée :
      - Commissions et États des lieux : agent ;
      - Crédits : admin d'agence ;
      - Recherches sauvegardées : locataire.
- [ ] AC2 — Les relevés de TCK-2619 rejoués (a-0 1280/1440, a-3 1440, a-5 1440, a-8 1280/1440) n'ont plus aucun
      absent `lucide-hand-coins`, `lucide-coins` (colonne), `lucide-clipboard-list` ni `lucide-bookmark-check`. Ils
      n'ont plus non plus d'absent du produit `lucide-receipt` ou `lucide-credit-card` sur ces lignes.
- [ ] AC3 — La ligne « Crédits » du menu et de la feuille du compte rend toujours `lucide-coins`.
- [ ] AC4 — Le test du catalogue rougit si l'une des quatre icônes revient à l'ancienne (ablation).

## Hors périmètre

- Les icônes **dans les pages**, hors navigation : grand livre des commissions (`CommissionsLedger`), liste des
  états des lieux (`InventoryList`), recherches sauvegardées (`SavedSearchesList`, `OngletRecherches`), pastille
  de crédits (`PastilleCredits`). Chacune relève du ticket de sa page.
- Le menu « Mon espace » du site public (`MenuMonEspace`) et la console super-admin.
- L'onglet « Argent » (`Wallet`) : il suit déjà la maquette (décision 12 a de TCK-2618).

## Notes d'implémentation

**Delta** (2026-11-11, `feat/audit-ux-app-lot-2`) :

- `src/lib/navigation/catalogue.ts` : `commissions` → `Receipt`, `credits` → `CreditCard`, `etats-des-lieux` →
  `ClipboardCheck`, `recherches` → `Search`. Les imports `ClipboardList`, `Coins` et `HandCoins` sont retirés.
  `BookmarkCheck` reste, pour l'icône de l'entrée « Avis » vue par le client (`iconeSelon`).
- `src/lib/navigation/__tests__/catalogue.icones.tck-2742.test.tsx` (4 tests) : il rend `iconeDe()` pour la persona
  qui voit l'entrée et épingle la classe lucide **rendue**, l'ancienne refusée. C'est la classe que compare l'outil
  de fidélité, et deux noms d'export peuvent désigner la même icône.
- AC3 est épinglé dans les tests existants de la coque. `AppShell.menu-et-credits.test.tsx` : l'entrée de colonne
  rend `lucide-credit-card`, la ligne « Crédits » du menu du compte `lucide-coins`, l'entrée du tiroir
  `lucide-credit-card`. `FeuilleDuCompte.tck-2619.test.tsx` : la ligne de solde de la feuille rend `lucide-coins`.

**AC1, au navigateur.** Le relevé DOM a été fait sur `/app`, par la persona qui voit l'entrée. Agent : Commissions et
États des lieux. Admin : Crédits. Locataire : Recherches sauvegardées. Il a couvert la colonne à 1440 et 1280, le
rail à 768, le tiroir « Menu » à 390 et la palette « Aller à… » au téléphone et au bureau. Partout, l'entrée rend
`lucide-receipt`, `lucide-clipboard-check`, `lucide-credit-card` ou `lucide-search`. Aucune de ces entrées n'est
dans une barre d'onglets de persona.

**AC2, les relevés de TCK-2619 rejoués** (`.fidelite/TCK-2742/`, non versionné) :

| Relevé | Avant (`.fidelite/TCK-2619`) | Après |
|---|---|---|
| a-0 1280 et 1440, admin | hand-coins ×1, receipt ×2, credit-card ×4 | credit-card ×4 |
| a-3 1440, admin, édition | hand-coins, coins, clipboard-list, receipt ×1, credit-card ×2 | aucun |
| a-5 1440, agent, compte | hand-coins, coins, clipboard-list, receipt ×2 | coins ×1 |
| a-5 1280, agent, compte (à la place d'a-8) | — | coins ×1 ; receipt et clipboard-check appariés |

Les absents qui restent ne viennent pas des icônes :

- **a-0, `lucide-credit-card` ×4** : ce sont les entrées « Crédits » et « Abonnement » de la maquette. Dans le
  produit, elles sont **hors du cadre** relevé, comme leurs libellés (classés « hors cadre » par TCK-2619). La
  colonne de l'admin descend plus bas, et sa dernière entrée relevée est « Commissions ». Les deux absents de la
  ligne « Crédits » étaient mal classés en TCK-2742. Ils restent identiques après le changement d'icône, ce qui
  prouve que l'icône n'en était pas la cause. Ils sont requalifiés « hors cadre ».
- **a-5, `lucide-coins` ×1** : c'est la ligne « Crédits 60 » du **menu du compte**, pas de la colonne. L'agent ne
  la voit pas depuis la décision du porteur du 2026-11-10 (« Argent » fermé à l'agent), et ce motif était déjà
  classé.
- **a-8 n'a pas pu être rejoué.** `/app/page-introuvable-tck-2619` répond désormais **404**, et le relevé refuse
  tout statut ≥ 400 (`motifsDeRejet`). À 19 h 30 Z, la même page se relevait encore. Le changement de statut est
  l'objet de TCK-2740, en cours dans l'arbre. La colonne de l'agent y est la même qu'en a-5, aux mêmes
  coordonnées : 698 pour « États des lieux », 723/763 pour « Commissions ». a-5 a donc été relevé à 1280 en plus de
  1440.

`TCK-2619.absents.json` : les 19 éléments d'icône renvoyés à TCK-2742 passent à « corrigé (TCK-2742) ». Les 4
éléments `credit-card` d'a-0 deviennent « hors cadre ». `par_renvoi` est recompté et une ligne est ajoutée à
`ecarts_reels_trouves` (script : `requalifier.py`, dans le brouillon de session).

**AC4, ablation.** Chacune des quatre icônes a été remise à l'ancienne, une à la fois. Chaque fois, 1 test rouge sur
4. Ramener l'entrée `credits` à l'ancienne fait aussi rougir 2 tests de `AppShell.menu-et-credits`. Le passage de
`Coins` à `ShieldCheck` dans `FeuilleDuCompte` fait rougir 1 test sur 5. Tout a été restauré.
