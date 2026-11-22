---
id: TCK-452
title: "Aucune BASCULE de thème sombre n'existe : le bloc `.dark` sert de surface locale à deux composants et n'est atteignable par aucun utilisateur"
status: done
phase: P2
family: technique
estimate: M
wave: 49
created: 2026-08-27
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, design-system, tokens, dette, decision]
---

## Décision du porteur (2026-11-16) — option (B)

**Pas de thème sombre global.** Le sombre n'existe que comme **surface locale `.dark`** : des
sections volontairement sombres posées par le design (chrome super-admin, bandeau de modération,
toast…). On retire ce qui promet un sombre global inatteignable, on garde les jetons `.dark` dont
ces surfaces ont besoin, et les gardes de contraste ne mesurent le sombre que sous une portée `.dark`
locale. La classe **garde son nom `.dark`** (c'est elle que la variante `dark:` de shadcn vise) :
c'est son STATUT qui change, pas son nom.

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai, bloqué sur la décision produit (A ou B).** Aucune bascule : `ThemeProvider`,
`next-themes`, `documentElement.classList`, `prefers-color-scheme` ne paraissent qu'en commentaire. Rien
n'a été tranché (4 commits de docs/garde, aucun ADR). Fait entre-temps : l'en-tête de
`src/test/contraste-wcag.ts:35` ne promet plus « le jour où » (dae4fd103, TCK-458).

**Ce qui a changé, et pèse sur l'issue B** : la portée `.dark` s'est élargie de 2 à **six porteurs**
(liste dérivée par AST dans `src/test/portees-sombres.ts`, TCK-459), dont **`components/ui/toast.tsx:139`**
(d7e9cecb7, TCK-2688) : chaque toast du produit est rendu sombre, **vu par tout utilisateur, site
public compris**. La surface sombre n'est donc plus « la chrome super-admin ». Comptes repris plus bas.

**Décision attendue du porteur :** (A) une bascule globale de thème — mécanisme, `prefers-color-scheme`,
persistance sans clignotement, arbitrage visuel du bloc ; ou (B) pas de thème sombre — `.dark` (et
`@custom-variant dark` de `globals.css:19`) renommé en surface locale, périmètre dérivé des six portées,
garde contre le retour des `dark:` hors portée.

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
> *2026-11-16 : **six porteurs** — `SuperAdminSidebar.tsx:290`, `SuperAdminTopbar.tsx:52`,
> `SuperAdminShell.tsx:83` (`<SheetContent>`, par portail), `admin/super/agency-detail.tsx:443`,
> **`ui/toast.tsx:139` (tous les toasts, TCK-2688)**, `playground/vitrine/VitrineClient.tsx:857` ; liste
> dérivée par `src/test/portees-sombres.ts`. « La chrome super-admin » n'est plus la seule surface vivante.*
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

> *Re-mesuré le 2026-11-16 : bloc `.dark` principal `globals.css:802` = **40** jetons, plus trois blocs
> `.dark` d'appoint (`:1161`, `:1215`, `:1233`) ; utilitaires `dark:` (arbre suivi, hors tests) = **78**
> dans **28** fichiers, dont **43** primitives `components/ui/**` et **35** produit (maintenance 12 —
> `MaintenancePrioritySelector` 7, `MaintenancePriorityBadge` 5 —, `pipeline/constants.ts` 5,
> `SearchAutocomplete` 4…) ; `JETONS_SOMBRE` (`contraste-wcag.ts:259`) = **38** entrées. Le tableau
> ci-dessous est l'historique.*

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

- [x] Trancher entre A et B — décision produit, écrite, datée (B, 2026-11-16, ci-dessus)
- [ ] Issue A : mécanisme d'activation + `prefers-color-scheme` + persistance sans clignotement — sans objet (B)
- [ ] Issue A : arbitrage humain du bloc `.dark`, qui n'a jamais été affiché — sans objet (B)
- [x] Issue B : retrait des utilitaires hors portée et de la moitié sombre du harnais là où elle
      mesurait un fichier hors portée — le bloc et la variante RESTENT (décision du porteur : surface
      locale `.dark`)
- [x] Issue B : décision explicite et écrite sur les 46 `dark:` des primitives partagées
- [x] Dans les deux cas : une garde qui empêche l'état d'arrivée de redevenir l'état actuel
- [x] Dans les deux cas : mettre à jour l'en-tête de `src/test/contraste-wcag.ts`, qui promet
      aujourd'hui « pour le jour où un `ThemeProvider` existera » (tenu par TCK-458, dae4fd103,
      relevé 2026-11-16 : `contraste-wcag.ts:35`)

## Critères d'acceptation

- [x] AC1 — une commande décide, et pas une lecture : `grep` sur `ThemeProvider|next-themes|
      documentElement.classList|prefers-color-scheme` rend **> 0** (issue A), ou le bloc a été
      renommé en surface locale et plus rien ne l'appelle « thème » (issue B). L'état actuel — 0
      côté bascule, et un bloc nommé `.dark` que deux composants utilisent comme surface — fait
      échouer le test dans les deux lectures.
- [x] AC1bis — quelle que soit l'issue, la chrome super-admin **rend toujours ses couleurs**
      *(2026-11-16 : et le toast sombre de `ui/toast.tsx`, TCK-2688)*. Un
      test le vérifie sur les valeurs, pas à l'œil : c'est la surface que la première rédaction de
      ce ticket aurait cassée.
- [ ] AC2 — *sans objet (issue B retenue)* — issue A : un test éprouve la bascule **par le mécanisme réel**, pas par une table de
      jetons simulée. Un test qui résout deux tables sans activer la classe passerait déjà
      aujourd'hui : c'est celui de TCK-440, et il ne suffit pas ici.
- [x] AC3 — issue B : le compte d'utilitaires `dark:` **hors chrome super-admin** tombe à 0, et
      une garde échoue si un seul revient. Le périmètre exact se dérive de ce que les deux barres
      montent — il ne s'énumère pas à la main. *(2026-11-16 : se dérive des **six** portées de
      `portees-sombres.ts`, dont les primitives montées dans un toast.)*
- [x] AC4 — `JETONS_SOMBRE` (24 entrées ; **38** au 2026-11-16) reste cohérent avec le bloc, dans les deux issues :
      `src/test/__tests__/jetons-compiles.test.ts` le confronte déjà valeur par valeur à la
      feuille compilée, et ce contrôle doit rester vert.
- [x] AC5 — le coût est reconsigné après coup : le relevé de ce ticket date du 2026-08-27 et sera
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

## Livré (2026-11-16)

- **AC1, lecture B** : la classe garde son nom (`.dark`, visé par la variante `dark:` de shadcn) ; le
  bloc s'appelle « La SURFACE SOMBRE LOCALE (TCK-452) » au lieu de « Dark mode (non prioritaire) »,
  et `sombre-local.tck-452.test.ts` refuse tout mécanisme global (`ThemeProvider`, `next-themes`,
  `prefers-color-scheme`, `documentElement.classList`, `colorScheme`, code sans commentaires via le
  scanner TS), toute lecture de la préférence dans la feuille, toute portée sur `<html>`/`<body>`, et
  les mots « dark mode / thème sombre / mode sombre » dans `globals.css`. Ablation : un
  `@media (prefers-color-scheme: dark)` ajouté à la feuille → rouge.
- **Primitives partagées, décision** : la MÊME règle que le produit, sans exception — une variante
  `dark:` ne s'écrit que dans un fichier que la clôture d'import d'une portée atteint
  (`fichiersSousPorteeSombre()`). Gardent les leurs : `button`, `input`, `textarea`, `avatar`, `toast`
  (19 variantes). Les perdent : `badge`, `select`, `tabs`, `date-picker`, `date-time-picker`. Une
  primitive shadcn régénérée qui les ramène fait rougir la garde, et c'est voulu.
- **AC3** : 51 variantes retirées dans 21 fichiers (dont `MaintenancePrioritySelector` 7,
  `pipeline/constants.ts` 5, `SearchAutocomplete` 4, et neuf `dark:bg-transparent` qui annulaient le
  `dark:bg-input/30` du champ hors de toute portée). Le jeton `shadow-contour-vignette-sombre`, dont le
  seul appelant était hors portée, sort de `globals.css` et de `OMBRES`. Garde : lecture des littéraux
  par AST (`.ts` compris, commentaires exclus), plancher de non-vacuité, auto-épreuve. Ablation :
  `dark:hover:bg-muted/50` remis dans `badge.tsx` → rouge nommant le fichier.
- **AC1bis** : la garde exige les cinq porteurs vivants (super-admin ×3, `agency-detail`, `toast`) dans
  la liste dérivée et lit dans la feuille `--background #1f1812` / `--foreground #fcf9f3` du bloc,
  égaux à `JETONS_SOMBRE` ; `primitives-existantes-tck-2688` (AC6) éprouve le toast rendu. Ablation :
  `dark` retiré du toast → 3 rouges (les deux tests, et la garde AC3 sur `[.dark_&]`).
- **Moitié sombre du harnais** : `tabs.contrast.test.tsx` ne mesure plus l'onglet en sombre (il refuse
  désormais toute variante `dark:`) ; les autres mesures en sombre de fichiers hors portée restent
  vertes et sont déclarées comme cohérence des jetons, pas comme écran (en-tête de `JETONS_SOMBRE`).
- **AC4** : `jetons-compiles.test.ts` vert, `JETONS_SOMBRE` inchangé (38 entrées).
- **AC5, relevé du 2026-11-16 après coup** : 0 mécanisme global ; 6 portées dérivées ; 19 variantes
  sombres, toutes sous portée (contre 78 avant, 28 fichiers) ; bloc `.dark` principal 40 jetons.
- Angle mort déclaré dans la garde : un nœud INJECTÉ dans une portée (`toast.data.action`) n'est pas
  dans la clôture d'import ; les deux injections réelles n'atteignent que `button` (sous portée).
