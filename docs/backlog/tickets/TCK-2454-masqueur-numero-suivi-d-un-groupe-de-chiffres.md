---
id: TCK-2454
title: "Socle IA : un numéro à indicatif derrière un étage, suivi d'un groupe de chiffres sans mot, ne laisse plus sa fin en clair"
status: done
phase: P2
family: back
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-31
depends_on: [TCK-2451]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, socle-ia, donnees-personnelles]
---

## Objectif utilisateur

Une annonce qui écrit son étage, puis un contact à indicatif sénégalais, puis aussitôt un autre nombre
(`Villa R+1 00221 77 012 34 56 12 500 F`) n'envoie au modèle aucun chiffre de ce numéro en clair.

## Contexte

Relevé par la vérification adverse de TCK-2451 (I1). TCK-2451 ferme le cas courant : un nombre d'un à trois chiffres suivi
d'un mot (`… 34 56 3 chambres`, une ligne suivante `2 salons`). Il reste les suites qui ne sont pas « un petit nombre puis un
mot ». Elles sont identiques sur `dev` `90676e7f6` et sur la branche de TCK-2451 (mesure faite sur les deux arbres extraits par
`git archive`, numéros fictifs) :

| Texte | Masque | Contact | Prix |
|---|---|---|---|
| `Villa R+1 00221 77 012 34 56 78 90` | `Villa R[TELEPHONE] 34 56 78 90` | `[]` | — |
| `Villa R+1 00221 77 012 34 56 12 500 F` | `Villa R[TELEPHONE] 34 56 12 500 F` | `[]` | 12 500 |
| `Villa R+1 00221 77 012 34 56 000 F` | `Villa R[TELEPHONE] 34 56 000 F` | `[]` | 56 000 |
| `Villa R+1 00221 77 012 34 56 1234 m2` | `Villa R[TELEPHONE] 34 56 1234 m2` | `[]` | — |
| `Villa R+1 00221 77 012 34 / 78 123 45 67` (tronqué) | `Villa R[TELEPHONE] 34 / [TELEPHONE]` | `["+221781234567"]` | — |

Mesure sur une grille de 1 379 840 textes (`scratchpad/tck-2451/geni1.mjs`) : 10 écritures de l'étage × 12 étages ×
12 écritures de l'indicatif × 14 corps × 32 suites. Pour les trois corps entiers (`77 012 34 56`, `770123456`, `77 01 234 56`),
18 240 textes par suite :
- avec une suite « petit nombre puis mot » (`3 chambres`, `\n2 salons`, `1er étage`, `78 F`, `2 SDB`…), 1 170 textes laissent
  deux chiffres ou plus du numéro en clair. Ce sont exactement les 1 170 qui en laissent sans aucune suite : des écritures hors
  du champ de TCK-2451 (`0221`, `+10 00221`, `R+20 0221`) ;
- avec `123 45 67 ch`, `45 67 ch`, `4 56 ch`, `1234 ch`, `3 / 78 123 45 67`, `\n3`, `3 ` en fin de texte, `3.5 ch` ou `3-ch`,
  3 790 textes par suite laissent deux chiffres ou plus du numéro en clair, autant que sur `dev` (les 1 170 précédents compris).
- relevés par la contre-vérification de TCK-2451, identiques sur `dev` et sur la branche (masque et prix) :
  - `Villa R+1 00221 77 012 34 56 3,5 pièces` → `Villa R[TELEPHONE] 34 56 3,5 pièces` : la virgule décimale française ;
  - `Villa R+1 00221 77 012 34 56 3 /mois` → `Villa R[TELEPHONE] 34 56 3 /mois`, et 3 est rendu comme prix ;
  - un nombre à 0 en tête (`… 34 56 0 frais`, `… 34 56 03 chambres`) → `34 56` en clair. C'est la conséquence voulue de la
    décision 6 de TCK-2451 : `000 F` est la fin d'un montant, pas un compte.

Élargi le 2026-10-31 par la relecture de la spec (mesures identiques sur `dev` `90676e7f6`) :

| Texte | Masque | Contact | Prix |
|---|---|---|---|
| `Immeuble R+20 0221 77 123 45 67` | `Immeuble R[TELEPHONE] 67` | `[]` | — |
| `Villa R+1 221 770123456 F`, `Villa R+1 (221) 770123456 F` | inchangé | `[]` | 770 123 456 |
| `Villa R+1 221 77 01 23 456 F` | inchangé | `[]` | 23 456 |
| `Villa R+1 221 770 123 456` (98 groupements sur 256 sortent ainsi) | inchangé | `[]` | 221 770 123 456 |
| `Villa R+1 (221) 7 7 0 1 2 3 4 56` (95 sur 127), `Villa R+1 (221) 770 123 456` | inchangé | `[]` | — |
| `Villa R+1 (221) 7 7 0 1 2 3 4 5 6 3 chambres`, de même derrière `221` nu | `… 7 [TELEPHONE] chambres` | `[]` | 221 |
| `Villa R+1 (221) 7 7 0 1 2 3 4 5 6 2 salons`, derrière `221` nu, sans étage ; `1 salon`, `3 villas` | `… 7 [TELEPHONE] salons` | **`+221701234562`, écrit nulle part** | 221 |

Sans indicatif, `Villa 770123456 F` reste ambigu avec un vrai prix de 770 millions : il ne change pas.

Cause : derrière l'étage `1` ou `7`, `NOT_SENEGAL_ZONE` n'exclut l'indicatif que si rien de chiffré ne prolonge le numéro
(`NOTHING_GLUED`) ; `CODED_SENEGAL` s'arrête de même (`WHOLE_NUMBER_END`). Sinon, `CC1_REST` lit le `1` et dix chiffres
(`+1 0022177012`) et le reste du numéro sort en clair. Admettre tout chiffre derrière ferait lire au masque sénégalais les
neuf premiers chiffres d'un groupe plus long (`77 012 34 56 78` est-il un numéro suivi de `78` ?), et un numéro tronqué
suivi d'un autre déborderait sur le second.

## Contrat de données

Aucun endpoint, aucune migration. `App\Support\PhoneMasker` et son miroir `scripts/check-ai-evals-pii.mjs`,
`App\Support\RadarPhone`, `App\Services\Radar\RadarAmountParser`, le fixture partagé.

## Contraintes strictes (métier)

- Comparaison code point par code point contre `dev` extrait par `git archive`. **Ce qui était visé : aucun chiffre d'un numéro masqué sur `dev` ne sort en clair. Ce qui est tenu n'est pas cela** : le classement AC2 nomme ce qui sort, et `77 012 34 78 123 45 67` laisse `123 45 67`, masqué sur `dev` (décision 9).
- Parité PHP/JS : 0 écart.
- Le motif compile avec le PCRE2 de l'image de production : `deploy/takussan/smoke-api.sh image` reste vert, avec une marge
  mesurée dans l'image.
- Visé : un prix réel n'est pas perdu au profit d'un fragment de numéro. Tenu sur `77 012 3 / 450 000 F` derrière `221`, pas partout : `Villa 221 77 012 3 500 F` perd 3 500, `Tel 00221 77 012 3 / 450 000 F` perd son prix, comme `dev`.

## Delta à produire

- [x] Mesurer, puis choisir : masquer aussi le groupe qui suit (le plus masquant), ou s'arrêter au neuvième chiffre en
      laissant l'étage, au cas par cas des suites du tableau.
- [x] Fixture partagé et tests Radar : les textes du tableau, dont les limites épinglées par TCK-2451.
- [x] Le relevé du 2026-10-31 : `0221`, `221` ou `(221)` devant tout groupement de neuf chiffres, marque comprise, et le faux contact.

## Critères d'acceptation

- [x] AC1 — `Villa R+1 00221 77 012 34 56 12 500 F` et `Villa R+1 00221 77 012 34 56 78 90` ne laissent aucun chiffre de
      `77 012 34 56` en clair.
- [x] AC2 — Parité PHP/JS : 0 écart ; face à `dev`, les chiffres masqués sur `dev` qui sortent en clair sont classés un à un par script (`dem.mjs`, voir les notes) : ils ne portent que sur le chiffre ou le groupe qui suit neuf chiffres, un montant, l'indicatif, ou le reste d'un numéro entier (décision 9). Le script ne couvre que les grilles nommées, et ne juge pas de l'intention d'une écriture.
- [x] AC8 — Un numéro à indicatif suivi d'un prix ou d'un autre numéro reste entier et garde le prix (`Contact : +221 76 330 45 67`, à la ligne, `25 000 F par mois`).
- [x] AC9 — Masqué sans contact, sur une forme assemblée ou une forme de montant : `221 77 012 3 500 F`, `221 77 012 - 78 12`, `221 770123/500 F`, `+221 30 31 32 33 5 3 500` (premier numéro seulement), `Prix 221 750 500 250 F`, `Lots 219 220 221 330 331 332` ne donnent aucun contact inventé.
- [x] AC3 — `deploy/takussan/smoke-api.sh image` vert sur l'image construite depuis la branche.
- [x] AC4 — Ablation de chaque correctif : rouge.
- [x] AC5 — `Immeuble R+20 0221 77 123 45 67` ne laisse aucun chiffre du numéro en clair.
- [x] AC6 — Derrière `221` nu ou `(221)`, les 256 groupements de `770123456`, avec ou sans marque, sont masqués et ne donnent aucun prix ; `Villa 770123456 F` ne change pas. Limite mesurée : suivi de `450 000 F`, voir plus bas.
- [x] AC7 — Un chiffre seul qui suit un numéro chiffre à chiffre n'entre jamais dans le contact : `Villa 7 7 0 1 2 3 4 5 6 2 salons` donne `+221770123456`.

## Notes d'implémentation

Choix par suite : un numéro écrit par groupes (`SHAPED`) s'arrête au neuvième chiffre, sauf s'il se coupe sur un autre numéro
(`NOT_CUT`) ou un groupe `000` (`NO_THOUSANDS`). Un numéro tronqué derrière `00221` va jusqu'à ce qui n'en est plus
(`CUT_CODED_SENEGAL`). Derrière `221` nu ou `(221)`, neuf chiffres qu'aucune lecture ne prend pour un numéro entier sont masqués avec
l'indicatif (`BARE_CODE_NINE`). Chiffre à chiffre suivi d'un chiffre seul, les neuf premiers sont le numéro (`SENEGAL_NOT_SHIFTED`).
`RadarAmountParser` lit les candidats hors des numéros. `RadarPhone` refuse en contact une barre entre deux groupes écrits autrement et
`30 00221 …` (`fromText` les lit encore).

AC2, précision, mesurée sur `7034bdf9e` face à `dev` `08ea557dc` extrait par `git archive`. Chaque suite de chiffres masquée sur `dev` et en clair ici est classée par `scratchpad/tck-2454/dem2.mjs`, sur 11 jeux, 5,4 M de textes : l'étage ou le `(0)` rendus, l'indicatif rendu, un chiffre ou un montant derrière un numéro, le reste derrière un numéro entier. **Reste hors de ces classes : 72 passages**, tous `Villa R+1 (221) 77 012 34/33 821 00 00 F`, où `33` sort en clair et `821 00 00` y était déjà sur `dev`. Le classement lit des positions, pas une intention : il ne dit pas qu'un groupe rendu n'était pas la fin d'un numéro, et ne couvre rien hors de ces jeux.

**Le numéro entier gagne, et ce n'est pas tenu pour le second numéro** : `R+1 00221 77 012 34 78 123 45 67` laisse `123 45 67` en clair, là où `dev` le masquait (décision 9). Grilles : 2 016 passages de 7 chiffres sur `g2451b`, 105 sur la grille du vérificateur, plus 9 de `45 67` et 14 de `67`.

Contacts face à `dev`, grille `g1` du vérificateur (451 980 textes), sur `c3b56a0a5` : **15 279 neufs** : 9 306 du numéro écrit, 4 992 de forme `221 300 123 456` (indiscernables, limite), 185 second numéro derrière une barre, **796 assemblés** (284 + 454 sur un nombre, 58 sur un second numéro). **7 944 perdus**, dont 765 vrais numéros (`PERDU-vrai-corps` : neuf chiffres collés derrière `Lot`, `Lot 221 770123456`). Grille `g2` (945 000 textes, vrais numéros) : 0 contact réel perdu, 0 `fromText` perdu, 0 faux contact neuf, 0 chiffre du numéro rendu ; 9 232 prix perdus, tous lus par `dev` sur des fragments ou sur `221` (`… 3 chambres`).

Parité 0 écart sur les 11 jeux. Marge PCRE dans l'image (10.44) : `MASK_PATTERN` 24 348 o, 4 copies de `SENEGAL_LOOSE`, `dev` 7. 52 entrées de 40 ko : 0 erreur PCRE, masque au pire 107,8 ms sous charge 6 à 10 sur 8 cœurs (`dev` 106,2 sous une autre charge : à ne pas soustraire). 97 ablations rouges (PHP et miroir JS), restauration prouvée par `cmp`. Une garde du miroir, `PAS_COUPE` devant `CORPS_A_INDICATIF`, n'a aucun effet mesuré côté JS (parité 0 écart sans elle sur `g1`) : gardée pour la lecture, son ablation PHP rougit. AC3 : `smoke-api.sh image` et `masqueur` sortent en 0 sur l'image de `7034bdf9e`. Rapport : `.superpowers/rapport-TCK-2454.md`.

### Limites connues (mesurées, identiques à `dev` sauf mention)

- `… 34 56 000 F` : neuf chiffres puis `000` sont un numéro tronqué et un montant. `Villa R+1 00221 77 012 34 56 000 F` donne
  `Villa R[TELEPHONE] 56 000 F`, 56 000, pas de contact : **`56` reste en clair**, pour garder le montant.
- Groupement libre devant un montant : `Villa R+20 00221 77 0 12 34 56 450 000 F` donne `Villa R[TELEPHONE] 56 450 000 F`.
- `Villa R+1 00221 77 012 34 56 500 F` se lit numéro + 500 F, pas 56 500 F.
- Ce qui suit le neuvième chiffre reste en clair : `Villa R+1 00221 77 012 34 56 78 90` donne `Villa R+1 [TELEPHONE] 78 90`.
- **Faux contact restant** : `Villa 7 70 12 34 56 2 salons` donne `+221701234562`, comme `dev` : le `7` seul peut y être un compte
  (`7 77012345 6`, qu'un correctif plus large recollait). 372 contacts sur 26 694 de la grille des 256 groupements.
- **`77 012 34 78 123 45 67`, numéro entier + reste** : `123 45 67` en clair (décision 9). Un tiret recolle de même : `77 012 34-78 12 345 67`.
- `77 012 34/56` ne donne pas de contact, mais `fromText` le garde (STOP et opérateur).
- **Faux contacts, coût accepté de la décision 10** : `Lots 221 30 31 32 333` donne `+221303132333`, `Charges 221 30 20 15 100` donne `+221302015100`.
- `Tel +221 75 81 0 17 78 78 123 45 67` donne le faux `+221787812345`, perd le vrai numéro, et `67` reste en clair.
- `Tel +33 00221 77 01 78 123 45 67` : `45 67` en clair, sans contact.
- **Faux contacts neufs face à `dev`, indiscernables de `221 770 123 456`** : neuf chiffres écrits en 3-3-3 derrière `221` nu ou `(221)` donnent un contact même si c'est une référence (`Réf 221 300 123 456`) ou un nombre (`221 300 123 500`, `221 750 500 250`). Le mot de prix ou de liste devant, une marque derrière et une liste à trois chiffres devant l'écartent.
- **Assemblé sur un nombre nu ou un mot** : `Villa 221 77 012 3 500` donne `+221770123500`, comme `dev` ; `221 77 012 34 78 123 45 67` et `22177 78 123 45 67` se lisent numéro entier + reste (décision 9).
- Comme `dev`, un tiret recolle (`Villa R+1 00221 77 012 34-78`), comme `fromText`, et `Villa R+1+33 6 12 34 56 78` donne `+221336123456`.
- Derrière `221` nu ou `(221)`, un groupement libre suivi de `450 000 F` reste en clair pour garder le montant (`Villa 221 7 70123456 450 000 F`,
  131 groupements sur 256 ; 153 derrière `R+1`).
- `Villa 770123456 F`, sans indicatif, reste un prix : ambigu avec un vrai prix de 770 millions.
- Identiques à `dev` : `Villa R+1 00221 77 012 34/33 821 00 00 F`, `Tel 00221 77 012 34 / 33 821 00 00 F` (masque ; plus de contact),
  `Tel 00221 77 012 3 / 450 000 F`, `Tel 77 012 34 78 123 45 67`, `Tel 77 012 34 / 78 123 45 67` ; `Villa R+1 221 77 012 3 / 450 000 F`
  et `Villa R+1 221 7 7 0 1 2 3 4 56 000 F` restent en clair pour garder leur montant ; un nombre qui finit par `000` derrière `221`
  ou `(221)` (`Villa (221) 770 123 000`, `Villa 221 770123000 F`) ; `0221770123456` ; `Villa 7 7 0 1 2 3 4 56` et
  `Villa 7 7 0 1 2 3 4 5 6 3 chambres` sans indicatif ; `Villa R+1 (221) 77 012 34 56 7` (TCK-2447).

## Décisions prises en autonomie, à revoir

1. `000` derrière neuf chiffres est un montant : le numéro est tronqué et `56` reste en clair. Écarté : tout masquer et perdre le prix.
2. Arrêt au neuvième chiffre : l'étage et le contact sont gardés, le groupe suivant reste en clair. Écarté : masquer aussi ce groupe.
3. Les candidats de prix se lisent hors des numéros : `Tel 77 123 45 67 450 000 F` rend 450 000 (`dev` : rien), `… 500 F` rend 500.
4. **Étendu au-delà du ticket, parce que la spec fusionnée entre-temps (#1622) range ces écritures sous TCK-2454** : derrière
   `221` nu ou `(221)`, neuf chiffres sont masqués avec leur indicatif, quel que soit le groupement, marque comprise
   (`BARE_CODE_NINE`). Le `3` de `(221) 7 7 0 1 2 3 4 5 6 3 chambres`, masqué sur `dev` comme fin d'un numéro mal lu, sort donc en
   clair : ce n'est pas un chiffre du numéro, et le premier `7` du numéro cesse d'y être. Coût : `Villa 221 77 012 3 500 F` perd son prix. Même classe pour `SENEGAL_NOT_SHIFTED`, sans indicatif.
5. Étendu aussi : `+221`/`00221` tronqué suivi d'un autre numéro, y compris hors étage ; `+30 +75 +93 …`, `33 00221` sans `+`, `+10`,
   `+105`, `0221`. Les faux contacts recollés (`+2213300221 77`…) disparaissent.
6. `CUT_CODED_SENEGAL` limité à `00221` : `+33 221 77 01 23` reste un numéro français.
7. Contact refusé quand une barre sépare deux groupes écrits autrement : `77 012 34/56` perd son contact, masqué. `fromText` le lit encore.
8. `SENEGAL_NOT_SHIFTED` limité au strict chiffre à chiffre : la marge PCRE passe de 5 à 4 copies, `dev` 7.
9. **Tranché le 2026-10-31 par la session** : sans barre, le numéro entier gagne. `Villa R+1 00221 77 012 34 78 123 45 67` donne `+221770123478` et laisse `123 45 67` en clair, là où `dev` masquait le second numéro. Avec une barre (`77 012 34/78 123 45 67`, `77 012 34 / 78 123 45 67`), le second numéro est le contact et tout est masqué.
10. **Règle de la session, resserrée le 2026-10-31** (« dans le doute, sans contact » coûtait 25 contacts sur 57 annonces plausibles) : derrière `221` nu ou `(221)`, le mot devant, l'unité derrière et `bareCodeInAList` ne jouent que sur une forme de montant, 3-3-3 ou neuf chiffres collés. Pour les autres groupements, seule une marque monétaire refuse. `Lot 221 77 012 34 56`, `Prix : 221 77 012 34 56`, `Studio 150 221 77 012 34 56`, `Contact 221 77 012 34 56 M Diop` donnent le contact ; `Prix 221 750 500 250 F`, `Lots 221 300 301 302`, `221 77 012 3 500 F`, `221 77 012 34 56 F` n'en donnent pas.
11. Un numéro tronqué n'est lu devant un autre que s'il a au moins cinq chiffres et n'est pas écrit par groupes : `+221 30 31 32 33 5 3 500` est un numéro entier et un prix.
