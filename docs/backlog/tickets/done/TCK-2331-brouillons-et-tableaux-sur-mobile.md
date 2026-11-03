---
id: TCK-2331
title: "Le brouillon se réenregistre au retour du réseau, et DataTable passe en cartes sous md (paiements et factures d'abord)"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-8--parcours-sur-téléphone"
tags: [front, mobile, wizard, payments, pistes]
---

## Objectif utilisateur

Sur téléphone, la personne qui remplit un assistant pendant une coupure de réseau retrouve son
brouillon enregistré dès que le réseau revient, sans retaper ; et celle qui consulte ses
paiements et ses factures atteint « Ouvrir » et le lien vers le bail sans faire défiler une table
de côté.

## Contexte

Réfs : **P08.05** et **P08.07** du fichier de pistes, toutes deux `validé`.

- P08.05 — `useWizardDraft.performSave` fait un `PUT` seul ; une sauvegarde débouncée qui échoue
  hors ligne n'est jamais rejouée (aucun `online` dans `src/`, hors tests).
- P08.07 — sur 32 consommateurs de `DataTable`, seuls `CustomerList` et `PropertyList` ont une
  vue mobile ; `DataTable` enveloppe la table sans vue en cartes.

## Décision du porteur

P08.05 :

> validation du porteur (2026-10-25) : l'enregistrement automatique du brouillon reprend au retour du réseau (`online`) ; reste : copie hors ligne des valeurs et des photos (IndexedDB), plus tard

P08.07 :

> validation du porteur (2026-10-25) : option `carteMobile` de `DataTable` (cartes sous `md`), sur le patron de `CustomerList` et `PropertyList`, adoptée d'abord sur les écrans de paiements et de factures ; reste : les autres consommateurs de `DataTable`, par lots

## Reste à faire

- P08.05 : copie hors ligne des valeurs et des photos (IndexedDB), plus tard
- P08.07 : les autres consommateurs de `DataTable`, par lots

## Hypothèses

- P08.05 — ce qui se rejoue est la **dernière écriture échouée**, telle qu'elle était partie. Une
  écriture plus récente en attente (debounce) ou en vol la remplace : le retour du réseau ne rejoue
  alors rien, pour ne pas écrire un état plus ancien par-dessus. Une réussite ou `clear()` efface
  ce qui était à rejouer. Le hook ne lit pas `navigator.onLine` : il n'empêche aucun envoi.
- P08.07 — « les écrans de paiements et de factures » sont les onglets **Paiements**
  (`PaymentsHistoryTable`) et **Factures** (`InvoicesTable`) de `/app/payments` ; `InvoicesTable`
  est le fichier que cite l'entrée. Ni l'un ni l'autre ne consommait `DataTable` (des `<table>`
  écrites à la main) : les adopter, c'est les convertir. Colonnes, ordre, `caption`, défilement
  horizontal et `whitespace-nowrap` sont gardés.
- P08.07 — la bascule se fait à `md`, comme la décision l'écrit. `CustomerList` et `PropertyList`
  basculent à `lg` (la barre latérale laisse 464 px à `md`, TCK-505) : entre `md` et `lg`, ces deux
  écrans montrent la table, qui défile dans son conteneur.
- La carte porte l'action dans le flux, à pleine largeur et en 44 px (`h-11`, `min-h-11`).
  `rowProps` ne s'applique pas aux cartes : un `data-testid` de ligne s'y dédoublerait.

## Delta à produire

- [x] `useWizardDraft` : dernière écriture échouée gardée, rejouée sur `online`.
- [x] `DataTable` : option `carteMobile` (liste nommée par `caption`, `md:hidden` ; table en
  `hidden md:block` ; état vide aussi dans la vue en cartes).
- [x] `InvoicesTable` et `PaymentsHistoryTable` sur `DataTable`, avec `carteMobile`.

## Critères d'acceptation

- [x] AC1 — Une sauvegarde échouée par coupure repart, telle quelle, à l'évènement `online` ;
  l'erreur s'efface et le brouillon connu est celui du serveur.
- [x] AC2 — Sans échec, après une réussite qui le remplace, ou après `clear()`, `online` n'envoie
  rien.
- [x] AC3 — Sans `carteMobile`, `DataTable` ne change pas : aucune liste, aucune classe `hidden`.
- [x] AC4 — Avec `carteMobile`, une carte par ligne dans une liste nommée par la légende, sous `md`
  seulement ; la table seulement dès `md` ; `className` et `data-testid` sur le cadre commun.
- [x] AC5 — La carte d'une facture porte référence, montant, statut, échéance, et « Ouvrir la
  facture <référence> » ouvre la facture.
- [x] AC6 — La carte d'un paiement porte référence, montant, statut, moyen, et le lien vers le bail.
- [x] AC7 — Les tests existants de ces deux tables (défilement, `whitespace-nowrap`, `caption`,
  nom du bouton) restent verts, lus sur la table.

## Hors périmètre

- La copie hors ligne des valeurs et des photos (IndexedDB) : reste, plus tard.
- Les autres consommateurs de `DataTable`, dont `OverduePaymentsTable` et la console super-admin
  des paiements, et les autres onglets de `/app/payments` (reversements, approbations, factures
  des prestataires) : reste, par lots.

## Notes d'implémentation

- Ablation P08.05 : l'écouteur `online` retiré → AC1 rouge ; l'effacement sur réussite retiré →
  le test « réussite qui remplace » rouge ; l'effacement dans `clear()` retiré → le test
  « brouillon effacé » rouge ; remis → 4/4.
- Ablation P08.07 : `DataTable` rendue sans la vue en cartes → 4 rouges (2 de `DataTable`, 2 des
  écrans), le témoin « sans carteMobile » vert ; remis → verts.
- jsdom n'applique pas `md:hidden` : la table et les cartes sont toutes deux dans le DOM. Un test
  qui cherche un bouton ou un lien par son nom le lit dans la table (`within(getByRole('table'))`)
  ou dans la liste. La bascule elle-même n'est pas mesurée au navigateur.
