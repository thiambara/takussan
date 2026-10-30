---
id: TCK-2435
title: "Socle IA : le masqueur ne lit plus `RDC+1` ni `R + 1` d'une annonce comme un indicatif"
status: done
phase: P1
family: technique
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2428]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
  models: []
tags: [api, ia, socle-ia, donnees-personnelles, radar]
---

## Objectif utilisateur

Le porteur envoie au modèle une annonce qui écrit son étage `RDC+1` ou `R + 1`, sans que le prix qui suit soit
remplacé par `[TELEPHONE]` : le modèle lit le vrai prix.

## Contexte

Hors du périmètre de TCK-2428, qui n'exempte que `R+` suivi d'un ou deux chiffres que rien ne colle derrière
(`PhoneMasker::NOT_A_FLOOR`, miroir `PAS_UN_ETAGE` dans `scripts/check-ai-evals-pii.mjs`). Mesuré sur la branche de
TCK-2428 (numéros fictifs) :

- `Immeuble RDC+1 1 250 500 750 F` est masqué en `Immeuble RDC[TELEPHONE] F` : `+1` suivi de dix chiffres ;
- `Immeuble R + 1 1 250 500 750 F` est masqué en `Immeuble R [TELEPHONE] F` : le `+` admet une ou deux espaces derrière lui.

Dans les deux cas, `RadarAmountParser` ne rend aucun prix, puisque `RadarPhone::withoutFloorPlus()` ne neutralise que `R+`
collé.

## Contrat de données

Aucun endpoint, aucune migration. `App\Support\PhoneMasker` et son miroir `scripts/check-ai-evals-pii.mjs`, le
fixture partagé `tests/fixtures/ai/donnees-personnelles.json`, et `RadarPhone::withoutFloorPlus()` si le Radar doit
suivre.

## Contraintes strictes (métier)

- Le masqueur et la garde JS reconnaissent toujours le même ensemble (fixture partagé, parité rejouée sur les lignes
  distinctes du dépôt comme TCK-2410).
- Un numéro collé derrière l'étage (`RDC+33612345678`) reste masqué, comme `R+33612345678` depuis TCK-2428.
- `R + 33 6 12 34 56 78` est ambigu : le mesurer avant de choisir.

## Delta à produire

- [x] Mesurer les écritures d'étage réellement rencontrées (`RDC+1`, `Rdc+1`, `R + 1`, `R +1`, `R+ 1`), puis étendre
      l'exemption côté PHP et côté JS.
- [x] Fixture : `Immeuble RDC+1 1 250 500 750 F` et `Immeuble R + 1 1 250 500 750 F` en non-cas ;
      `RDC+33612345678` en forme avec contexte (`RDC[TELEPHONE]`).

## Critères d'acceptation

- [x] AC1 — Les formes ci-dessus sont éprouvées des deux côtés (PHP et JS) par le fixture partagé.
- [x] AC2 — Les formes existantes du fixture restent vertes.
- [x] AC3 — Ablation de chaque garde nouvelle : rouge.

## Hors périmètre

- Les étages écrits en toutes lettres (« rez-de-chaussée plus un ») : rien ne les lit comme un numéro.

## Notes d'implémentation

- **Forme** : `PhoneMasker::NOT_A_FLOOR` (miroir `PAS_UN_ETAGE`) lit désormais derrière le `+` un mot d'étage `R` ou `RDC`
  isolé (aucune lettre devant), suivi de zéro, une ou deux espaces, puis jusqu'à deux espaces après le `+`, et le même
  étage de 0 à 19 que rien ne colle derrière. Le mot est énuméré en six branches (`FLOOR_WORD`, `MOT_ETAGE`), parce
  qu'un lookbehind PCRE n'admet que des branches de longueur fixe : `(?:r|rdc)\s{0,2}` serait refusé par un PCRE2
  antérieur à 10.43. La garde JS écrit les mêmes branches.
- **Radar** : `RadarPhone::FLOOR_PLUS` gagne une seconde branche, de forme étroite (`RDC`, espaces, étage 0-19), et la
  première (`R+` collé, large) reste telle quelle. Sans cette branche, `Villa RDC+1 77 123 45 67` et
  `Villa R + 1 77 123 45 67` perdaient leur contact : `FOREIGN_PREFIX` lisait `+1` devant le numéro. Le masqueur, lui,
  laissait déjà ces deux textes intacts, puisque `+1` suivi de neuf chiffres n'est pas un numéro nord-américain.
- **Parité PHP/JS hors fixture** : 0 écart sur 217 155 lignes distinctes (les fichiers suivis qui portent un chiffre,
  plus 34 cas d'étage écrits à la main). 28 lignes changent de rendu côté PHP entre avant et après : toutes sont des
  écritures d'étage, plus `RDC+1 202 555 0123` et `R + 1 202 555 0123`, la limite assumée ci-dessous.
- **Limite étendue** : comme `R+1 202 555 0123` depuis TCK-2428, un indicatif d'un chiffre (`+1`, `+7`) derrière
  `RDC` ou derrière un `R` espacé s'écrit comme un étage et n'est plus masqué (`RDC+1 202 555 0123`).
- **Suite** : `R+33 6 12 34 56 78` est lu par le Radar comme un fixe sénégalais `+221 33…`, à cause de la première
  branche, large, de `FLOOR_PLUS`. Le défaut existait avant ce ticket, qui ne l'a pas créé → TCK-2441.

### Décisions prises en autonomie, à revoir

- **`R + 33 6 12 34 56 78` reste un numéro.** Écarté : l'exempter comme étage. Raison : l'étage reste borné à 0-19,
  comme dans TCK-2428. Un étage pris pour un numéro coûte un prix, l'humain tranche ; un numéro pris pour un étage
  part en clair chez le fournisseur.
- **Au plus deux espaces de chaque côté du `+`.** Écarté : un nombre quelconque d'espaces. Raison : c'est déjà la
  tolérance du `+` d'un indicatif (`\+\s{0,2}`). Au-delà, `R   + 1 1 250 500 750 F` reste masqué (un test le garde).
- **Le Radar suit avec la forme étroite.** Écarté : élargir à `RDC` la branche large de `R+`. Raison : la forme large
  fabrique un numéro sénégalais à partir d'un numéro étranger (TCK-2441). La forme étroite rend le contact des
  écritures d'étage sans créer ce défaut sur `RDC+33…`.
