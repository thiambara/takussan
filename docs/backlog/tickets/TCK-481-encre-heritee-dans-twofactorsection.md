---
id: TCK-481
title: "`TwoFactorSection` hérite l'encre de son conteneur : 3,94:1, seconde occurrence du motif de TCK-471"
status: doing
phase: P2
family: front
estimate: S
wave: 53
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-471]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, accessibilite, contraste, dette]
---

## Objectif utilisateur

L'écran de sécurité du compte doit se lire. Son texte est aujourd'hui sous le seuil AA, pour la
même raison mécanique que le bouton invisible de la fiche agence.

## Le défaut

`takussan-web/src/components/profile/security/TwoFactorSection.tsx:212` — **3,94:1**, mesuré le
2026-08-30 par `scripts/check-heritage-encre.mjs` à sa mise en service.

C'est le motif de TCK-471 : un conteneur qui pose `bg-foreground text-background` **retourne deux
propriétés, il ne retourne pas les jetons**, et tout descendant qui tire son fond d'une variante
continue de lire la palette claire.

⚠ **Le ticket TCK-471 affirmait qu'il n'y avait qu'un seul conteneur concerné, et il le disait sur
un relevé.** Le relevé cherchait la chaîne `bg-foreground` et concluait « un seul conteneur ».
La garde, elle, cherche le **motif** — et en a trouvé un second le jour où elle a tourné.
*Une chaîne n'est pas un motif ; un relevé qui cherche l'une ne trouve jamais l'autre.*

## Pourquoi ce n'est pas 1,00:1 comme la fiche agence

Le descendant n'est pas ici un bouton `outline` : le couple rendu est moins violent, donc le
défaut est **lisible mais insuffisant** plutôt qu'invisible. C'est ce qui l'a fait tolérer sous
cliquet à sens unique par TCK-471 plutôt que corriger dans son lot — et c'est aussi ce qui le rend
plus durable, puisque personne ne le signalera spontanément.

## Contrat de données

Aucun.

## Delta à produire

- [ ] Appliquer la forme tranchée par TCK-471 — la classe `dark`, qui bascule les jetons pour tout
      le sous-arbre — ou dire pourquoi cet écran demande autre chose.
- [ ] Retirer l'entrée du cliquet de `scripts/check-heritage-encre.mjs` **dans le même diff** : le
      cliquet est à sens unique, une entrée corrigée qui y reste est une tolérance qui ne
      correspond plus à rien.

## Critères d'acceptation

- [ ] **AC1** — le contraste du texte concerné atteint **≥ 4,5:1** en thème clair, mesuré par
      calcul sur les couleurs RENDUES.
- [ ] **AC2** — les autres textes de la même section sont mesurés, pas seulement celui-là : *un
      correctif qui réparerait l'un en cassant l'autre passerait un contrôle qui n'en regarde
      qu'un* (AC2 de TCK-471, qui a servi).
- [ ] **AC3** — `node scripts/check-heritage-encre.mjs` reste vert **avec une entrée de moins** au
      cliquet, et rougit si l'entrée est réintroduite sans le défaut.
- [ ] **AC4** — ablation : rétablir le couple d'origine fait rougir AC1 et la garde, changement
      prouvé par `md5` **avant** lecture du résultat.

## Hors périmètre

- Le jeton `--destructive`, qui a son propre ticket (TCK-480).
- Les autres entrées du cliquet, qui n'ont pas été mesurées ici.

## Notes d'implémentation

### La décision : une encre explicite, et NON la portée `dark`

`TwoFactorSection.tsx` — le bouton « Copier tout » porte désormais
`bg-card text-warning shadow-sm hover:bg-secondary`.

**Pourquoi pas la forme de TCK-471.** La classe `dark` y était juste parce que le conteneur ÉTAIT
une surface sombre (`bg-foreground`) : basculer la table de jetons y rendait la même surface au
pixel près, avec des jetons accordés. Ici le conteneur est une surface **claire teintée** — un
aplat d'avertissement à 10 % sur `--card` blanc. Sous `dark`, `--card` vaut #2a2018 et `--warning`
#e0a458 : le bandeau deviendrait une boîte SOMBRE au milieu d'une carte claire. *La forme juste
n'est pas la même parce que le défaut n'est pas le même : ici le conteneur ne ment pas sur sa
surface, c'est le descendant qui n'a pas d'encre.* La forme retenue est celle que le DS écrit déjà
pour un bouton dans un bandeau `warning` (`CalendarPage.tsx:280`, `BrandingBanner.tsx:46`).

### Ce que la mesure a trouvé EN PLUS, et que le ticket ne savait pas

1. **Le SURVOL était à 1,00:1**, pire que le repos. `hover:bg-warning` repeignait le fond avec la
   couleur EXACTE de l'encre héritée : le libellé disparaissait sous le curseur qui allait le
   cliquer — le défaut de la fiche agence, dans un état que `check-heritage-encre.mjs` ne lit pas
   (elle ne mesure que le repos). Il n'apparaît que parce que `fondsPossibles()` de
   `src/test/contraste-wcag.ts` rend un fond par ÉTAT.

2. **Le premier correctif écrit était `hover:bg-warning/15` — il ne tient PAS le seuil (4,41:1),
   et c'est la mesure qui l'a refusé.** `background-color` REMPLACE, il ne se superpose pas au fond
   propre du bouton : l'aplat à 15 % se compose donc sur le bandeau teinté qui est DESSOUS
   (#f3eee7), pas sur le blanc du bouton, et rend #e3d7c7. Le survol retenu est donc **opaque**.
   ⚠ *Les deux précédents du DS portent le même écart* (`CalendarPage.tsx:280`,
   `BrandingBanner.tsx:46`, tous deux `bg-card … hover:bg-warning/15` dans un bandeau `warning`) :
   hors périmètre de ce ticket, à ouvrir.

3. **Un commentaire `//` entre deux attributs rend `check-heritage-encre.mjs` AVEUGLE sur
   l'élément** — et c'est mesuré, pas déduit : la première version du correctif portait sa note
   DANS la balise ouvrante, et la garde restait **verte sur le défaut rétabli**. Ses apostrophes
   ouvrent, dans `finDeBaliseOuvrante()`, une chaîne que la lecture ne referme jamais. Le
   commentaire est donc en `{/* … */}`, hors de la balise, et l'ablation a été rejouée AVEC lui
   pour le prouver. *Une garde à lecture de texte ne meurt pas en rougissant ; elle meurt en ne
   voyant plus.*

### Le cliquet, et le sens qui lui manquait

L'entrée `TwoFactorSection.tsx · <button> bg-warning/20` est retirée : `TOLERES` est **vide**.

`check-heritage-encre.mjs` refusait déjà qu'un couple SORTE de la liste sans être corrigé. Il
laissait passer l'inverse — une entrée pour un couple corrigé — et AC3 l'exigeait : le contrôle
`TOLÉRANCE PÉRIMÉE` a été ajouté. *Une tolérance qui ne correspond à aucun défaut mesuré n'est pas
une tolérance, c'est une porte* : la ligne reste, elle cite une mesure devenue fausse, et le jour
où le défaut revient elle l'absorbe sans un mot.

### AC1 + AC2 — le relevé, sur l'arbre RENDU (jsdom), thème clair, 2026-08-30

Mesuré par `src/components/profile/__tests__/TwoFactorSection.contrast.test.tsx`, qui réutilise la
formule et les jetons de `src/test/contraste-wcag.ts` (jamais réécrite), remonte l'encre effective
ancêtre par ancêtre et compose les alphas ; les fonds viennent de `fondsPossibles()`, **un par
état**. Le fond du bandeau est #f3eee7 (`bg-warning/10` sur `--card` #ffffff) avant comme après.

| texte du bandeau | encre | avant | après | |
|---|---|---|---|---|
| `<p>` « Codes de récupération » | `text-warning` hérité | #8a5410 sur #f3eee7 — **5,42:1** | inchangé | ✓ |
| `<p>` conseil de conservation | `text-warning` hérité | **5,42:1** | inchangé | ✓ |
| `<li>` × 2, les codes | `text-warning` hérité | **5,42:1** | inchangé | ✓ |
| **`<button>` « Copier tout », repos** | héritée → **à lui** | #8a5410 sur #decfbc — **4,10:1** | #8a5410 sur #ffffff — **6,26:1** | ✓ |
| **`<button>` « Copier tout », survol** | héritée → **à lui** | #8a5410 sur #8a5410 — **1,00:1** | #8a5410 sur #f3ead8 — **5,24:1** | ✓ |

Le test mesure aussi **toute la carte 2FA**, pas seulement le bandeau (titre, description, pastille
d'état, libellés du formulaire) : aucun texte sous 4,5:1. `--destructive` reste le seul jeton
COMPTÉ et non mesuré, comme dans `agency-detail-contrast.test.tsx`.

En thème sombre (jetons `.dark`), le correctif améliore aussi : le bouton passe de 4,09:1
(`bg-warning/20` sur le bandeau) à **7,30:1** (`bg-card` #2a2018), survol **6,03:1**.

### AC3

```
$ node scripts/check-heritage-encre.mjs
✓ Encre héritée : 10 couple(s) mesuré(s) ≥ 4.5:1 sur 300 conteneur(s) « bg + text »,
  minimum 5,80:1, 84 jeton(s) non résolu(s), comptés et non mesurés.
```

Plus de mention « 1 couple(s) TOLÉRÉ(s) » : `TOLERES` est vide. Le compte de conteneurs passe de
299 à 300 — le bouton corrigé pose maintenant `bg-` ET `text-` dans un même littéral, il est donc
lui-même un conteneur ; c'est attendu, et sous la tolérance de ±35 %.

**Et l'entrée réintroduite sans le défaut fait rougir**, ce que le cliquet ne faisait pas avant :

```
$ node scripts/check-heritage-encre.mjs          # entrée remise, code corrigé
✗ TOLÉRANCE PÉRIMÉE — 1 entrée(s) ne désignent aucun couple sous 4.5:1 :
    src/components/profile/security/TwoFactorSection.tsx · <button> bg-warning/20
exit 1
```

### AC4 — l'ablation, 2026-08-30

Couple d'origine rétabli par édition en place, **le commentaire `{/* … */}` conservé** (c'est ce qui
prouve qu'il n'aveugle pas la garde) ; la modification est prouvée avant lecture du résultat :

```
md5 CORRIGÉ  : c4c868230df271255417ea1282cc6ae3
md5 ABLATÉ   : 05c4bccb6dd03ee1c33c5427db68d1be
```

| contrôle | ablaté |
|---|---|
| **AC3** `node scripts/check-heritage-encre.mjs` | **code 1** — `<div> bg-warning text-warning → <button> bg-warning/20 · encre #8a5410 sur fond #dccbb3 = 3,94:1` |
| **AC1/AC2** `npx vitest run …/TwoFactorSection.contrast.test.tsx` | **2 tests rouges sur 4** — `repos … = 4,10:1` **et** `hover … #8a5410 sur #8a5410 = 1,00:1` |

Restauration par `cp` depuis le scratchpad (jamais par `git checkout` : l'arbre est partagé),
prouvée par `md5` → `c4c868230df271255417ea1282cc6ae3`. Les deux contrôles repassent au vert.

⚠ **Une première ablation a donné un FAUX VERT de la garde**, et c'est elle qui a trouvé le défaut
n°3 ci-dessus : le commentaire était alors dans la balise ouvrante. *Une ablation qui rend le
résultat attendu ne prouve rien ; c'est celle qui ne le rend pas qui instruit.*

### Ce qui n'est PAS fait

- **Vérification à l'écran** : non faite, et non exigée par les AC de ce ticket (contrairement à
  l'AC5 de TCK-471). Le bandeau n'apparaît qu'après une confirmation TOTP réussie.
- Le survol translucide de `CalendarPage.tsx:280` et `BrandingBanner.tsx:46` (**4,41:1**), hors
  périmètre — cf. le point n°2 ci-dessus.


Trouvé par `scripts/check-heritage-encre.mjs` (TCK-471) le jour de sa mise en service — comme la
classe morte de TCK-453 l'avait été par la sienne. *Une garde neuve rapporte le plus à sa première
exécution : c'est le seul moment où elle regarde un parc que personne n'a écrit en pensant à elle.*
