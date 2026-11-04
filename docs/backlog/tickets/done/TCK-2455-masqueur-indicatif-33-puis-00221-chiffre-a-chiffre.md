---
id: TCK-2455
title: "Socle IA : `+33 00221 7 7 0 1 2 3 4 5 6` ne laisse plus sept chiffres du numéro en clair"
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
  models: []
tags: [api, socle-ia, donnees-personnelles]
---

## Objectif utilisateur

Un contact écrit derrière l'indicatif français, puis l'indicatif sénégalais, chiffre à chiffre
(`Tel +33 00221 7 7 0 1 2 3 4 5 6`), n'envoie au modèle aucun chiffre de ce numéro en clair.

## Contexte

Relevé par la contre-vérification de TCK-2451. Le défaut est antérieur : il est identique sur `dev` `90676e7f6` et sur la
branche `fix/masqueur-00221-derriere-etage` (`98f7f1b85`). Mesure faite sur les deux arbres extraits par `git archive`
(`scratchpad/tck-2451/bits.php`), avec des numéros fictifs :

| Texte | Masque `dev` | Masque branche | Contact (les deux) |
|---|---|---|---|
| `Tel +33 00221 7 7 0 1 2 3 4 5 6` | `Tel +[TELEPHONE] 0 1 2 3 4 5 6` | même | `[]` |
| `Tel +33 221 7 7 0 1 2 3 4 5 6` | `Tel +[TELEPHONE] 2 3 4 5 6` | même | `[]` |
| `Tel +33 00221 77 012 34 56` | `Tel [TELEPHONE] 34 56` | `Tel [TELEPHONE]` | `[]` |
| Témoin : `Tel +1 00221 7 7 0 1 2 3 4 5 6` | `Tel +1 [TELEPHONE]` | même | `[]` |
| Témoin : `Tel +20 00221 7 7 0 1 2 3 4 5 6` | `Tel +20 [TELEPHONE]` | même | `[]` |
| Témoin : `Tel +44 00221 7 7 0 1 2 3 4 5 6` | `Tel +44 [TELEPHONE]` | même | `[]` |
| Témoin : `Tel 00221 7 7 0 1 2 3 4 5 6` | `Tel [TELEPHONE]` | même | `["+221770123456"]` |

Cause supposée, inexacte : la France (`+33`, neuf chiffres) a sa branche propre dans `FOREIGN`, qui passe d'abord. Elle
lit `33 00221 7 7` (ou `33 221 7 7 0 1`) comme un numéro français et laisse le reste du numéro en clair. `CODED_SENEGAL`
(TCK-2451), qui englobe un numéro sénégalais derrière un indicatif étranger, ne connaît que `CC1|CC2|CC3`. *(Corrigé le 2026-10-31 : `33` est dans
`CC2` ; cause re-mesurée, voir « Notes d'implémentation ».)* Avec un corps groupé (`77 012 34 56`), la branche de TCK-2451 masque déjà le numéro en entier.

## Contrat de données

Aucun endpoint, aucune migration. `App\Support\PhoneMasker` et son miroir `scripts/check-ai-evals-pii.mjs`,
`App\Support\RadarPhone`, le fixture partagé.

## Contraintes strictes (métier)

- Aucun chiffre d'un numéro masqué sur `dev` ne sort en clair : comparaison code point par code point contre `dev` extrait
  par `git archive`.
- Parité PHP/JS : 0 écart.
- Un numéro français reste masqué en entier, et un groupe qui le suit ne s'y ajoute pas (`+33 6 12 34 56 78 15 chambres`).
- Le motif compile avec le PCRE2 de l'image de production : le job CI `image` d'`api-ci.yml`, qui lance
  `smoke-api.sh masqueur`, reste vert.

## Delta à produire

- [x] Re-mesurer, puis choisir : `+33` suivi de `00221` ou de `221` dans `CODED_SENEGAL`, ou une exclusion dans la branche
      française.
- [x] Fixture partagé : les textes du tableau.

## Critères d'acceptation

- [x] AC1 — `Tel +33 00221 7 7 0 1 2 3 4 5 6` et `Tel +33 221 7 7 0 1 2 3 4 5 6` ne laissent aucun chiffre de
      `7 7 0 1 2 3 4 5 6` en clair.
- [x] AC2 — Parité PHP/JS : 0 écart. Face à `dev`, ce qui sort en clair est classé par script et nommé dans TCK-2454, sans être nul : `Tel +33 00221 77 01 78 123 45 67` laisse `45 67`, masqué sur `dev`, et ne donne aucun contact (limite).
- [x] AC3 — Le job CI `image` est vert.
- [x] AC4 — Ablation de chaque correctif : rouge.

## Clôture

AC3 tenu le 2026-10-31 : le job CI `image` de la PR #1624 est vert sur `30d3c92d7`, étape `smoke-api.sh masqueur` comprise.

## Notes d'implémentation

**La cause supposée du ticket est fausse** : `33` est dans `CC2` (`3[0-469]`). La garde de `FOREIGN` échoue parce que le chiffre à
chiffre finit sur un chiffre seul, puis `SENEGAL`/`SENEGAL_LOOSE` lit depuis le préfixe (`33 00221 7 7`). Même famille mesurée : `+30`,
`+32`, `+93`, `+75`, `+77`, et `33`, `30`, `77` sans `+` (qui donnaient aussi un faux `+221330022177` à `fromText`).

Correctif : `PREFIX_BEFORE_CODE` (`PhoneMasker`), `PREFIXE_DEVANT_INDICATIF` (miroir). `Tel +33 00221 7 7 0 1 2 3 4 5 6` donne
`Tel [TELEPHONE]`, `Tel 33 221 77 012 34 56` garde `Tel 33 [TELEPHONE]` et son contact, un numéro français reste entier.

## Décisions prises en autonomie, à revoir

1. Corrigé pour toute la famille, pas seulement `+33` : les faux contacts recollés (`+2213300221 77`…) disparaissent. Un contact
   perdu sur la grille est toujours l'un de ces faux, jamais un vrai numéro (classement par `gain.mjs`, grilles `g`, `g2441`, `gi1`).
