---
id: TCK-2454
title: "Socle IA : un numéro à indicatif derrière un étage, suivi d'un groupe de chiffres sans mot, ne laisse plus sa fin en clair"
status: todo
phase: P2
family: back
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
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

- [ ] Mesurer, puis choisir : masquer aussi le groupe qui suit (le plus masquant), ou s'arrêter au neuvième chiffre en
      laissant l'étage, au cas par cas des suites du tableau.
- [ ] Fixture partagé et tests Radar : les textes du tableau, dont les limites épinglées par TCK-2451.

## Critères d'acceptation

- [ ] AC1 — `Villa R+1 00221 77 012 34 56 12 500 F` et `Villa R+1 00221 77 012 34 56 78 90` ne laissent aucun chiffre de
      `77 012 34 56` en clair.
- [ ] AC2 — Parité PHP/JS : 0 écart ; face à `dev`, aucun chiffre d'un numéro démasqué.
- [ ] AC3 — `deploy/takussan/smoke-api.sh image` vert sur l'image construite depuis la branche.
- [ ] AC4 — Ablation de chaque correctif : rouge.
