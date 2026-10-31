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

Cause : derrière l'étage `1` ou `7`, `NOT_SENEGAL_ZONE` n'exclut l'indicatif que si rien de chiffré ne prolonge le numéro
(`NOTHING_GLUED`) ; `CODED_SENEGAL` s'arrête de même (`WHOLE_NUMBER_END`). Sinon, `CC1_REST` lit le `1` et dix chiffres
(`+1 0022177012`) et le reste du numéro sort en clair. Admettre tout chiffre derrière ferait lire au masque sénégalais les
neuf premiers chiffres d'un groupe plus long (`77 012 34 56 78` est-il un numéro suivi de `78` ?), et un numéro tronqué
suivi d'un autre déborderait sur le second.

## Contrat de données

Aucun endpoint, aucune migration. `App\Support\PhoneMasker` et son miroir `scripts/check-ai-evals-pii.mjs`,
`App\Support\RadarPhone`, `App\Services\Radar\RadarAmountParser`, le fixture partagé.

## Contraintes strictes (métier)

- Aucun chiffre d'un numéro masqué sur `dev` ne sort en clair : comparaison code point par code point contre `dev` extrait
  par `git archive`.
- Parité PHP/JS : 0 écart.
- Le motif compile avec le PCRE2 de l'image de production : `deploy/takussan/smoke-api.sh image` reste vert, avec une marge
  mesurée dans l'image.
- Un prix réel n'est pas perdu au profit d'un fragment de numéro (`77 012 3 / 450 000 F` garde son prix de 450 000 F).

## Delta à produire

- [x] Mesurer, puis choisir : masquer aussi le groupe qui suit (le plus masquant), ou s'arrêter au neuvième chiffre en
      laissant l'étage, au cas par cas des suites du tableau.
- [x] Fixture partagé et tests Radar : les textes du tableau, dont les limites épinglées par TCK-2451.

## Critères d'acceptation

- [x] AC1 — `Villa R+1 00221 77 012 34 56 12 500 F` et `Villa R+1 00221 77 012 34 56 78 90` ne laissent aucun chiffre de
      `77 012 34 56` en clair.
- [x] AC2 — Parité PHP/JS : 0 écart ; face à `dev`, aucun chiffre d'un numéro démasqué.
- [x] AC3 — `deploy/takussan/smoke-api.sh image` vert sur l'image construite depuis la branche.
- [x] AC4 — Ablation de chaque correctif : rouge.

## Notes d'implémentation

Choix par suite : un numéro écrit par groupes (`SHAPED`) s'arrête au neuvième chiffre, sauf s'il se coupe sur un autre numéro
(`NOT_CUT`) ou un groupe `000` (`NO_THOUSANDS`). Un numéro tronqué derrière `00221` va jusqu'à ce qui n'en est plus
(`CUT_CODED_SENEGAL`). Derrière `221` nu ou `(221)`, neuf chiffres qu'aucune lecture ne prend pour un numéro entier sont masqués avec
l'indicatif (`BARE_CODE_NINE`). `RadarAmountParser` lit les candidats hors des numéros.

AC2, précision : **une seule classe de chiffres masqués sur `dev` sort en clair**, le chiffre qui suit neuf chiffres derrière `221` ou
`(221)` (`… 5 6 3 chambres`, 505 à 12 078 passages selon la grille, tous classés par script, 0 autre). Sur `dev`, il était masqué comme
fin d'un numéro mal lu, et le premier chiffre du vrai numéro restait en clair. Voir la décision 4.

Grilles et corpus, face à `dev` `08ea557dc` extrait par `git archive`, 4,3 M de textes : parité 0 écart ; marge PCRE dans l'image
(10.44) : `MASK_PATTERN` 5 copies de `SENEGAL_LOOSE`, `dev` 7. 47 entrées de 40 ko : 0 erreur PCRE, masque au pire 61,7 ms
(`dev` 61,2). 61 ablations rouges (PHP et miroir JS), restauration prouvée par `cmp`. AC3 : `smoke-api.sh image` et `masqueur` verts
sur l'image de `496f9dea4`. Rapport complet : `.superpowers/rapport-TCK-2454.md`.

### Limites connues (mesurées, identiques à `dev` sauf mention)

- `… 34 56 000 F` : neuf chiffres puis `000` sont un numéro tronqué et un montant. `Villa R+1 00221 77 012 34 56 000 F` donne
  `Villa R[TELEPHONE] 56 000 F`, 56 000, pas de contact : **`56` reste en clair**, pour garder le montant.
- Groupement libre devant un montant : `Villa R+20 00221 77 0 12 34 56 450 000 F` donne `Villa R[TELEPHONE] 56 450 000 F`.
- `Villa R+1 00221 77 012 34 56 500 F` se lit numéro + 500 F, pas 56 500 F.
- Ce qui suit le neuvième chiffre reste en clair : `Villa R+1 00221 77 012 34 56 78 90` donne `Villa R+1 [TELEPHONE] 78 90`.
- **Faux contact neuf par rapport à `dev`** : `Villa R+1 00221 77 012 34/78 1` donne `+221770123478` (recollé, comme
  `Tel 00221 77 012 34 / 33 821 00 00 F` sur `dev`), `Villa 221 77 012 3 500 F` donne `+221770123500` et perd son prix de 3 500.
- Identiques à `dev` : `Villa R+1 00221 77 012 34/33 821 00 00 F`, `Tel 00221 77 012 34 / 33 821 00 00 F`,
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
   clair : ce n'est pas un chiffre du numéro, et le premier `7` du numéro cesse d'y être. Coût : `Villa 221 77 012 3 500 F` perd son prix.
5. Étendu aussi : `+221`/`00221` tronqué suivi d'un autre numéro, y compris hors étage ; `+30 +75 +93 …`, `33 00221` sans `+`, `+10`,
   `+105`, `0221`. Les faux contacts recollés (`+2213300221 77`…) disparaissent.
6. `CUT_CODED_SENEGAL` limité à `00221` : `+33 221 77 01 23` reste un numéro français.
