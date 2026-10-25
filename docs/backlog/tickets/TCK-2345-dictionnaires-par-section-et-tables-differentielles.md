---
id: TCK-2345
title: "Les dictionnaires de /app se découpent par section, la table devient différentielle, et un espace lu par le seul serveur n'est plus servi"
status: doing
phase: P2
family: technique
estimate: L
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-105--charge-rsc-dun-document-app-servi--les-dictionnaires-imbriqués"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-69--fiche-bien-recherche-et-accueil-sous-3g-simulé-servis-par-next-start"
  adr:
    - "docs/adr/0022-le-dictionnaire-i18n-est-decoupe-par-groupe-de-routes.md"
tags: [front, i18n, rsc, poids, garde, pistes]
---

## Objectif

Un document de `/app` ne sert plus que les dictionnaires que son écran peut lire. Une navigation
ne renvoie plus les espaces que le navigateur a déjà reçus. Un espace que seul le serveur lit ne
part plus vers le navigateur.

## Contexte

Réfs : **P105.01**, **P105.02**, **P105.04** et **P69.05** du fichier de pistes, `validé`. Le
précédent est TCK-1489 (P105.03), qui garde l'identité des espaces que `messagesPour` partage.

- **P105.01** : la frontière `(dashboard)/app` sert 50 espaces (73,1 Ko gzip, 66,3 % du
  dictionnaire), et un écran n'en atteint que 24 à 32. Mesuré en documents servis par
  l'explorateur : les dictionnaires pèsent 82 à 88 % de chaque document `/app` compressé.
- **P105.02** : un provider imbriqué remplace le dictionnaire de son parent, d'où une table
  cumulée. Une navigation vers `/app/agency` renvoie donc les 55 espaces de la section, dont 50
  sont déjà dans le navigateur (283,5 Kio bruts, 86,4 gzip, mesuré par l'explorateur).
- **P105.04** : le dérivateur compte `getTranslations` comme un lecteur client. `meta`,
  `serverActions` et `publicLeadErrors` sont ainsi sérialisés dans chaque document.
- **P69.05** : la frontière `[locale]/(public)` sert 30 espaces (33,9 Ko gzip), identiques sur la
  page légale et sur la liste.

## Décision du porteur

- P105.01 : validé — validation du porteur (2026-10-25) : frontières par section sous `/app`, chiffrées d'abord par `--report` étendu à la taille atteinte par écran, dans l'amendement d'ADR-0022
- P105.02 : validé — validation du porteur (2026-10-25) : un provider qui fusionne le dictionnaire du parent et une table différentielle, dans l'amendement d'ADR-0022 (règle C et contrat de la garde réécrits)
- P105.04 : validé — validation du porteur (2026-10-25) : lecteurs serveur et client distingués dans le dérivateur, dans l'amendement d'ADR-0022
- P69.05 : validé — validation du porteur (2026-10-25) : frontières fiche, liste et pages légales sous `(public)`, dans l'amendement d'ADR-0022 commun avec P105.01, P105.02 et P105.04, plafonds `plafondsPourcent` resserrés

## Contrat de données

Aucun : ni l'API ni le texte affiché ne changent. Seul change le sous-ensemble du dictionnaire
sérialisé pour le navigateur.

## Contraintes strictes

- Aucun écran ne perd un libellé. Une clé manquante lève hors production (`surErreurIntl`), et la
  garde compare toujours la table dérivée et la table déclarée dans les deux sens.
- La table reste dérivée du graphe d'imports. Aucune liste d'espaces écrite à la main.
- Une seule manière de charger un dictionnaire : `messagesPour('<frontière>')` dans le
  `layout.tsx` de la frontière.

## Delta à produire

- [ ] ADR-0022 : amendement du 2026-10-25, et sa ligne de `docs/adr/README.md`.
- [ ] P105.04 : le dérivateur range `getTranslations` côté serveur. Seuls les lecteurs client
      entrent dans la table, et le rapport nomme les espaces lus par le seul serveur.
- [ ] P105.01 : `--report` imprime, par écran, la taille servie et la taille atteinte.
- [ ] P105.02 : `IntlProvider` fusionne le dictionnaire du parent (`useMessages()`) et le sien. La
      table ne porte plus que le différentiel de chaque frontière. Règle C et contrat de la garde
      réécrits.
- [ ] P105.01 : une frontière par section de `/app`, et une règle de garde qui exige la frontière
      d'une section qui atteint un espace hors de la coque.
- [ ] P69.05 : frontières sous `(public)`.

## Critères d'acceptation

- [ ] AC1 — aucune frontière ne sert `meta`, `serverActions` ou `publicLeadErrors`.
      Remettre l'ancien dérivateur fait rougir la garde.
- [ ] AC2 — un provider imbriqué qui ne reçoit que ses propres espaces rend aussi ceux de son
      parent. Avec l'ancien provider, le même rendu lève.
- [ ] AC3 — aucune frontière ne répète un espace que sert déjà l'un de ses parents.
- [ ] AC4 — une section de `/app` sans frontière, qui atteint un espace hors de la coque, fait
      rougir la garde.
- [ ] AC5 — `--report` imprime, pour chaque écran, l'espace servi et l'espace atteint.

## Hors périmètre

- Un `useTranslations` dans un composant serveur reste compté côté client. Le distinguer
  demanderait de suivre la frontière `'use client'` dans le graphe.
- Le document servi par `next start` n'est mesuré par aucune garde. Le cliquet porte sur la part
  dérivée.

## Notes d'implémentation

