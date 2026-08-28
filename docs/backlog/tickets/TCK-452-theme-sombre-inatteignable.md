---
id: TCK-452
title: "Aucune BASCULE de thème sombre n'existe : le bloc `.dark` sert de surface locale à deux composants et n'est atteignable par aucun utilisateur"
status: todo
phase: P2
family: technique
estimate: M
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, design-system, tokens, dette, decision]
---

## Objectif utilisateur

Aucun — et c'est le point du ticket. **Aucun utilisateur ne peut choisir un thème sombre**, et
personne ne le pourra tant qu'une décision n'aura pas été prise. Ce ticket ne livre pas une
fonctionnalité : il ferme une ambiguïté qui coûte à chaque écran écrit.

## Contexte

**Il n'existe aucune BASCULE de thème.** Relevé du 2026-08-27 sur `takussan-web/` :

```
grep -rn "ThemeProvider|next-themes|documentElement.classList" src   → 1 occurrence,
    et c'est un COMMENTAIRE de src/test/contraste-wcag.ts qui dit
    « présent pour le jour où un ThemeProvider existera »
grep -c next-themes package.json                                     → 0
grep -rn "prefers-color-scheme" src                                  → 0
```

Aucun mécanisme **global** : ni bibliothèque de thème, ni fournisseur, ni écriture sur
`documentElement`, ni respect de la préférence système. **Un visiteur ne peut donc pas voir ce
produit en sombre, et aucun réglage ne le lui propose.**

> ⚠⚠ **CORRECTION DU 2026-08-28 — la première rédaction de ce ticket disait « il n'existe aucun
> mécanisme pour poser la classe ». C'ÉTAIT FAUX**, et la revue adverse l'a mesuré. La classe est
> posée, en toutes lettres, sur deux composants livrés :
>
> ```
> src/components/layout/SuperAdminSidebar.tsx:224   'dark flex h-full w-64 …'
> src/components/layout/SuperAdminTopbar.tsx:49     'dark flex h-14 shrink-0 …'
> ```
>
> Leurs docblocks le disent depuis TCK-358, et l'un d'eux prend soin de préciser : *« La classe
> `dark` n'est PAS le mode sombre de l'utilisateur : c'est une surface »*. **Le bloc `.dark` est
> donc VIVANT — il est le socle chromatique de la chrome super-admin, réellement rendue.**
>
> Ce que ça change, et c'est considérable : le sombre n'est pas du code mort. Il est **rendu sans
> être choisi**. Une partie est éprouvée par l'écran (la chrome super-admin), le reste — les 37
> jetons dans leur ensemble, les `dark:` du produit — ne l'est que pour les composants que ces
> deux barres montent. La distinction à tenir n'est donc pas « mort / vivant » mais **« portée
> locale assumée » contre « bascule globale absente »**.

### Ce que ça représente — mesuré le 2026-08-27, pas estimé

| | quantité | où |
|---|---|---|
| Jetons du bloc `.dark` | **37** sur 44 lignes | `src/app/globals.css` |
| Utilitaires `dark:` | **75 occurrences**, 40 formes distinctes, **18 fichiers** | `src/**` |
| — dont primitives partagées | **46** | `src/components/ui/**` |
| — dont code produit | **29** | `maintenance` 21, `pipeline` 7, divers |
| Table `JETONS_SOMBRE` | **24 entrées** | `src/test/contraste-wcag.ts` |
| Tests qui mesurent en sombre | **3 fichiers** | dont `chrome-publique.contraste.test.tsx` et `jetons-compiles.test.ts` |

⚠ Les 75 utilitaires sont une **borne basse** : le relevé est un `grep`, il ne voit pas une classe
composée à l'exécution.

**La répartition est le fait notable, pas le total** : les deux tiers vivent dans
`src/components/ui/**`, c'est-à-dire dans des primitives *shadcn* dont le `dark:` est livré avec
le composant plutôt que décidé par ce dépôt. Les deux issues ci-dessous ne les traitent pas de la
même façon, et c'est là que le coût se joue.

### Comment on l'a découvert

Par [TCK-440](TCK-440-chrome-publique-en-palette-brute.md), dont l'AC4 demandait qu'« un test
éprouve la bascule `.dark` sur les valeurs calculées ». En cherchant comment l'éprouver, on a
trouvé qu'il n'y a rien à basculer. Le § Contexte de TCK-440 disait « `.dark` n'a aucune prise »
et l'attribuait aux couleurs figées de la navbar — c'était vrai, et c'était la moitié la moins
grave de la vérité.

**Ce que le test de TCK-440 éprouve réellement, et qu'il faut lire comme tel** : pas une bascule,
mais que les classes rendues par la chrome **résolvent vers des valeurs différentes** selon la
table de jetons — clair ou sombre. Autrement dit, la chrome publique a **cessé d'être insensible
au thème** ; avant TCK-440 elle rendait des couleurs figées qui ne bougeaient d'aucun côté. C'est
le gain réel de ce ticket-là, et il est réel même si personne ne peut le voir. Son en-tête le dit
en toutes lettres : *« ce vert ne prouve pas qu'un utilisateur puisse voir un thème sombre »*.

## Contrat de données

Sans objet — aucun endpoint. Si l'issue A est retenue, le choix de thème est une préférence
d'affichage locale au navigateur ; le faire porter par le profil utilisateur serait un ticket
distinct.

## Direction UX / Artistique

**Ce ticket ne dessine rien et ne tranche rien : il pose l'alternative et son coût.** Les deux
issues sont défendables, et c'est précisément l'état actuel qui ne l'est pas.

### Issue A — le produit VEUT un thème sombre

Alors il faut le rendre atteignable, et le rendre atteignable est ce qui le rend éprouvable :

- un mécanisme d'activation (`ThemeProvider` maison ou `next-themes`) qui pose la classe sur
  `<html>` ;
- le respect de `prefers-color-scheme` par défaut — aujourd'hui absent du dépôt (0 occurrence) ;
- la persistance du choix explicite, qui doit survivre au rechargement **et** ne pas produire de
  clignotement au premier rendu (le piège classique : le thème appliqué après hydratation) ;
- une décision sur le périmètre : le site public, la console, ou les deux ;
- et alors seulement, les 24 entrées de `JETONS_SOMBRE` et les mesures de contraste sombres
  deviennent des garanties au lieu d'être des déclarations.

⚠ Ce n'est pas une case à cocher : `docs/design-guidelines.md` décrit la direction *« Ancrage
Local Contemporain »* sans thème sombre, et le bloc `.dark` actuel n'a jamais été arbitré par un
œil humain — il n'a jamais été affiché.

### Issue B — le produit N'EN VEUT PAS

⚠⚠ **Cette issue NE PEUT PAS être « retirer le bloc `.dark` ».** Sa première rédaction le
proposait : elle aurait retiré le socle chromatique de la chrome super-admin, qui porte la classe
délibérément. C'est le défaut que la revue adverse a attrapé, et il illustre le coût d'une prémisse
fausse — le remède proposé cassait la surface que la prémisse n'avait pas vue.

Ce qui se retire, si le produit ne veut pas de bascule utilisateur :

- le bloc `.dark` **RESTE**, mais change de nom et de statut : il n'est plus « le thème sombre »,
  il est **la surface sombre locale** que deux composants demandent. Le renommer (`.surface-sombre`
  ou un jeton dédié) est ce qui empêche la prochaine personne de croire qu'un thème existe ;
- les `dark:` du code produit sortent — **sauf ceux des composants que la chrome super-admin
  monte réellement**, qui sont la moitié utile et doivent être recensés avant d'être touchés ;
- `JETONS_SOMBRE` NE sort PAS : il mesure une surface réellement rendue. ⚠ C'est ce qui donne sa
  vraie portée à la correction faite pendant TCK-440 — les 14 jetons qui héritaient en silence des
  valeurs claires étaient **mesurés à faux sur un écran que des gens regardent**, pas sur un thème
  hypothétique ;
- ⚠ **les 46 utilitaires des primitives `src/components/ui/**` sont le vrai sujet** : ils viennent
  de *shadcn* et reviendront à la prochaine primitive ajoutée ou régénérée. Les retirer sans
  garde, c'est les voir repousser ; il faut donc soit une garde qui refuse `dark:` dans ce dépôt,
  soit les laisser en connaissance de cause et l'écrire.

## Contraintes strictes (métier)

- **Aucune troisième voie.** « On garde au cas où » est exactement l'état mesuré aujourd'hui : il
  fait payer l'entretien sans rendre le bénéfice, et il fait écrire du `dark:` à chaque écran neuf
  par des gens qui croient raisonnablement qu'il sert.
- La décision est **produit**, pas technique : ce ticket ne peut pas être « implémenté » par un
  agent qui choisit tout seul.
- Quelle que soit l'issue, l'état d'arrivée doit être **vérifiable par une garde**, sinon il
  redeviendra l'état actuel sans que personne le voie.

## Delta à produire

- [ ] Trancher entre A et B — décision produit, écrite, datée
- [ ] Issue A : mécanisme d'activation + `prefers-color-scheme` + persistance sans clignotement
- [ ] Issue A : arbitrage humain du bloc `.dark`, qui n'a jamais été affiché
- [ ] Issue B : retrait du bloc, de la variante, des utilitaires produit et de la moitié sombre du
      harnais de contraste
- [ ] Issue B : décision explicite et écrite sur les 46 `dark:` des primitives partagées
- [ ] Dans les deux cas : une garde qui empêche l'état d'arrivée de redevenir l'état actuel
- [ ] Dans les deux cas : mettre à jour l'en-tête de `src/test/contraste-wcag.ts`, qui promet
      aujourd'hui « pour le jour où un `ThemeProvider` existera »

## Critères d'acceptation

- [ ] AC1 — une commande décide, et pas une lecture : `grep` sur `ThemeProvider|next-themes|
      documentElement.classList|prefers-color-scheme` rend **> 0** (issue A), ou le bloc a été
      renommé en surface locale et plus rien ne l'appelle « thème » (issue B). L'état actuel — 0
      côté bascule, et un bloc nommé `.dark` que deux composants utilisent comme surface — fait
      échouer le test dans les deux lectures.
- [ ] AC1bis — quelle que soit l'issue, la chrome super-admin **rend toujours ses couleurs**. Un
      test le vérifie sur les valeurs, pas à l'œil : c'est la surface que la première rédaction de
      ce ticket aurait cassée.
- [ ] AC2 — issue A : un test éprouve la bascule **par le mécanisme réel**, pas par une table de
      jetons simulée. Un test qui résout deux tables sans activer la classe passerait déjà
      aujourd'hui : c'est celui de TCK-440, et il ne suffit pas ici.
- [ ] AC3 — issue B : le compte d'utilitaires `dark:` **hors chrome super-admin** tombe à 0, et
      une garde échoue si un seul revient. Le périmètre exact se dérive de ce que les deux barres
      montent — il ne s'énumère pas à la main.
- [ ] AC4 — `JETONS_SOMBRE` (24 entrées) reste cohérent avec le bloc, dans les deux issues :
      `src/test/__tests__/jetons-compiles.test.ts` le confronte déjà valeur par valeur à la
      feuille compilée, et ce contrôle doit rester vert.
- [ ] AC5 — le coût est reconsigné après coup : le relevé de ce ticket date du 2026-08-27 et sera
      périmé. Une mesure sans sa date devient une croyance.

## Hors périmètre

- La palette elle-même et la conversion de la chrome publique —
  [TCK-440](TCK-440-chrome-publique-en-palette-brute.md).
- Le stockage d'une préférence de thème côté profil utilisateur : préférence locale d'abord, le
  reste est un ticket distinct.
- Les primitives de la console et leur couleur brute —
  [TCK-384](TCK-384-primitives-partagees-couleur-brute.md).

## Notes d'implémentation

**`spec_refs` est VIDE, et c'est un constat, pas un oubli.** Aucune section de `docs/features.md`
ne décrit de thème sombre — c'est même la racine du problème : le sombre n'a jamais été une
fonctionnalité spécifiée, seulement un défaut de gabarit qu'on a entretenu. Citer une section
voisine pour remplir le champ aurait été pire que de le laisser vide. Si l'issue A est retenue,
elle commence par écrire cette section.

_(le reste à remplir par implementing-specs)_
