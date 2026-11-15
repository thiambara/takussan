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

**2026-11-15 — livré (front seul), relevé au pixel non fait** (brief du lot : pas de navigateur).

- **Prémisse re-mesurée, conforme** : `GROUPES_DE_LA_PALETTE` mettait `recents` avant `aller-a` ; le
  libellé « À traiter » venait de `nav.sidebar.aTraiter.noms` (« 3 demandes non traitées ») ; la seule
  précision était « Aussi … » ; ligne active `bg-accent text-accent-foreground` sans ↵ ; `top-[10vh]`.
- **Piège évité** : réordonner la constante ne suffisait pas — `optionsDeLaPalette` poussait « Récents »
  avant « Aller à », et sur un champ vide la liste plate (celle des flèches) n'est pas triée. Les pushes
  sont réordonnés ; un test garde que ↓ parcourt les options dans l'ordre du DOM, avec des récents.
- **Libellés neufs** (`nav.palette.*`) : `aTraiterLignes.*` (« Demandes non traitées », « Visites à
  confirmer »… — la barre garde « Demandes à traiter » de `nav.sidebar.aujourdhui.lignes`, que je n'ai
  pas repris pour coller à AC3), `basculerVers` (« Basculer vers {espace} », remplace `passerA`,
  supprimée), `precisions.sitePublic`, `precisions.epinglee`, `echap`, `pied.*`. Le raccourci du pied
  réutilise `raccourciMac`/`raccourciAutre` par `useSurApple`.
- **Précisions** : « Épinglé » (entrée `epinglee`) passe avant celle du groupe ; « Agence » sur le groupe
  `titre: 'agence'` ; une précision qui redit le libellé (la fiche « Agence ») est omise. L'espace :
  libellé « Basculer vers {nom de l'agence} », rôle en précision ; sans agence, le rôle est le nom et
  n'est pas répété. Le rôle, sorti du libellé, reste un mot-clé de l'option (« propriétaire » trouve la
  bascule) — la précision n'est jamais cherchée.
- **Revue I2 amendée** : le test exigeait un fond actif ≥ 3:1 contre la surface (`bg-accent`) ; la
  maquette veut un gris léger. Le repère non textuel est désormais ↵ (≥ 3:1 sur `bg-muted`), texte
  ≥ 4,5:1, en clair et en sombre ; plus un test « ↵ ne marque que la ligne active ».
- **Écart à la maquette** : la ligne active est `bg-muted` (jeton) et non `bg-foreground/[0.07]` ;
  le test exige qu'elle peigne son propre fond. Le champ du téléphone fait 44 px (hauteur de la primitive, garde
  `check-champs-uniformes`, TCK-2460) et non 48 ; au bureau, c'est le conteneur du champ qui fait 52 px.
  Le texte du champ reste celui de la primitive (16 px sous le pouce : iOS ne zoome pas). Le voile du
  bureau est celui de `DialogOverlay` (non modifié, `ui/dialog.tsx` hors zone).
- **jsdom** : les formes (plein écran sous `md`, `md:w-130` = 520 px, `md:top-28` = 112 px) sont
  éprouvées sur les classes rendues. AC1/AC2 en mesure, AC-F1 à AC-F3 : **non mesurés**.
- Consigne `check-valeurs-arbitraires-app` : la palette n'a plus de valeur arbitraire (ligne retirée).
- **Reste hors zone** : `SecoursDeLIntrouvable` ne rend que `libelle` — une ligne « À traiter » trouvée
  depuis la page introuvable n'y montre plus son nombre (`compte`) ; les clés `nav.sidebar.aTraiter.noms.*`
  n'ont plus de lecteur.

