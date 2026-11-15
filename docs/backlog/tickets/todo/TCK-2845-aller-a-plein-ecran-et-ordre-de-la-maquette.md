---
id: TCK-2845
title: "« Aller à… » comme la maquette : plein écran au téléphone, loupe, « Échap » et pied de touches au bureau, l'ordre Actions · À traiter · Aller à · Récents · Espaces, compteurs en pastille, précisions et ligne active discrète"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2846]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, coque, palette, navigation, audit-ux, app]
---

## Objectif utilisateur

Où qu'il soit dans `/app`, l'utilisateur ouvre « Aller à… », lit d'abord ce qu'il peut faire et ce qui l'attend, puis où aller, et sait au clavier comment s'y déplacer.

## Contrat de données

Aucun endpoint neuf. La palette lit ce qu'elle lit déjà : le menu composé de la persona (`lib/navigation/palette.ts`), les compteurs du menu (`useCompteursDuMenu`), les épingles (`preferences.navigation`, ADR-0089 § 6), les espaces (`/api/me/profiles`). Les récents sont l'affaire de TCK-2846.

Relevé (RAPPORT.md, section « Aller à », vérifié par la session le 2026-11-15) : `components/layout/PaletteDeCommandes.tsx`, `lib/navigation/palette.ts` — `GROUPES_DE_LA_PALETTE` met « Récents » avant « Aller à » ; les compteurs sont écrits dans le libellé ; la seule précision est « Aussi … » ; la ligne active est un aplat `bg-accent` sans ↵ ; au téléphone, la palette est la fenêtre centrée de `DialogContent` (10 vh). **Écran jamais relevé** par l'outil de fidélité (aucune des fiches TCK-2617, 2618, 2619, 2621).

## Direction UX / Artistique

- **Référence de fidélité** : maquette `app-coque`, approche a, écran e4 « « Aller à… » » (`id: 'aller-a'`), **téléphone et bureau** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-coque.tsx` (`AAllerAMobile`, `AAllerABureau`, l. 160-210) et `app-coque-pieces.tsx` (`SECTIONS_ALLER`, `ContenuAllerA`, l. 591-665). Non versionnée : à ouvrir dans l'arbre du porteur.
- **Téléphone (manque propre au téléphone)** : la palette couvre **tout l'écran** (fond de page, pas de voile ni de fenêtre) ; en tête, le champ et un « ✕ » de 44 px ; le clavier s'ouvre (focus dès l'ouverture) ; lignes de 44 px.
- **Bureau (manques propres au bureau)** : fenêtre de 520 px à ~112 px du haut sur voile ; à droite du champ, la touche « Échap » en `kbd` (et non un ✕) ; pied grisé « ↑ ↓ naviguer · ↵ ouvrir · ⌘ K partout dans l'application » ; lignes denses de 36 px.
- **Les deux formats** :
  - **loupe** dans le champ ;
  - **ordre des groupes** : Actions → À traiter → Aller à → Récents → Espaces ;
  - **compteurs d'« À traiter » en pastille** à droite (« Visites à confirmer » ⓬), plus dans le libellé ;
  - **précisions à droite**, en petit gris : « Site public » sur « Chercher un bien sur Takussan », « Épinglé » sur une entrée épinglée, « Agence » sur une entrée du groupe Agence, le rôle sur « Basculer vers … » (« Propriétaire ») ;
  - **ligne active discrète** : fond gris léger (et non l'aplat vert) et l'icône ↵ à droite.

## Contraintes strictes (métier)

- « À traiter » et « Espaces » ne paraissent que s'il y a un compteur non nul ou un autre espace (comportement actuel, `palette.ts:119`, testé `PaletteDeCommandes.test.tsx:201`) : ne pas le perdre.
- ⌘K / Ctrl+K ouvre la palette partout ; Échap la ferme aux deux formats ; le ✕ du téléphone a un nom accessible « Fermer ».
- Navigation clavier complète (↑ ↓ ↵), `aria-activedescendant` ou équivalent : la ligne active est annoncée.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Forme plein écran de la palette sous `md` ; fenêtre de 520 px au-dessus.
- [ ] Loupe, `kbd` « Échap », pied de touches (bureau).
- [ ] Ordre des groupes ; pastilles de compte ; précisions (« Site public », « Épinglé », « Agence », rôle de l'espace).
- [ ] Style de la ligne active + ↵.
- [ ] Tests : ordre des groupes rendu ; pastille portant le compte et libellé sans le nombre ; précision « Épinglé » sur une épingle ; à 390 la palette occupe la largeur et la hauteur du viewport ; à 1440 le pied et « Échap » sont présents.

## Critères d'acceptation

- [ ] AC1 — À 390 × 844, palette ouverte : son conteneur mesure 390 × 844 (± 1 px), un bouton « Fermer » de 44 px la ferme, et le champ a le focus.
- [ ] AC2 — À 1440, la palette mesure 520 px de large, porte « Échap » à droite du champ et le pied « naviguer · ouvrir · partout dans l'application » ; Échap la ferme.
- [ ] AC3 — Admin avec 3 demandes non traitées, 2 épingles et un second espace : les titres de groupe se lisent dans l'ordre « Actions, À traiter, Aller à, Récents, Espaces » ; la ligne « Demandes non traitées » a pour libellé exact « Demandes non traitées » et une pastille « 3 ».
- [ ] AC4 — « Chercher un bien sur Takussan » porte « Site public » ; une entrée épinglée porte « Épinglé » ; « Basculer vers {agence} » porte le rôle.
- [ ] AC5 — La ligne active n'a pas la classe d'aplat `bg-accent` et porte l'icône ↵ ; ↓ déplace la ligne active, ↵ navigue.
- [ ] AC6 — Sans compteur ni second espace, ni « À traiter » ni « Espaces » ne sont rendus (pas de régression).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), forme de TCK-2619) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2845.json` : app-coque e4, téléphone 390 × 844 et bureau 1440 × 900 (densité d'[ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — l'écran n'avait jamais été relevé.
- [ ] AC-F2 — Zéro écart non expliqué par `fidelite compare` ; aucun manque de ce ticket n'est rangé en « donnée », « hors périmètre » ou « renvoyé à ».
- [ ] AC-F3 — À 1024 et 768 : `scrollWidth − innerWidth = 0`.

## Hors périmètre

- Les récents en entités (« Villa 4 chambres à Ngor · Bien ») : TCK-2846.

## Notes d'implémentation

_(à remplir par implementing-specs)_
