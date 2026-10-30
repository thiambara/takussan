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
- **Borne des indicatifs `1` et `7`** (vérification adverse 1) : sans elle, l'écriture espacée laissait passer en clair
  un vrai numéro qui suit « au RDC » en fin de ligne (`Appartement au RDC\n+1 514 555 0199`, `au RDC +7 701 234 56 78`).
  Un étage `1` ou `7` cesse d'être un étage quand les chiffres qui suivent forment un numéro complet de cet indicatif,
  soit les dix chiffres de `FOREIGN`, zone entre parenthèses comprise (`PhoneMasker::CC1_REST`, miroir `RESTE_CC1`),
  sauf si une marque monétaire les suit. `R+1 1 250 500 750 F` reste donc un étage suivi d'un prix. Ici, un `F` suivi
  d'un point puis d'une lettre (`… 0199 F. Diop`) est une initiale, pas une marque ; `… 750 F.` en fin de texte en est
  une. La limite de TCK-2428 (`R+1 202 555 0123`, `R+7 912 345 67 89` en clair) se ferme du même coup : ces deux
  textes sont masqués.
- **Formes fortes, marque ou non** (revérification) : un `+1` nord-américain suivi d'une marque restait en clair
  (`au RDC +1 514 555 0199 F Diop`, de même avec `F`, `F.`, `FCFA`, `F CFA`, `francs` ou `XOF` derrière). Il est masqué
  désormais. Derrière `1`, la forme `[2-9]XX [2-9]XX XXXX` (`NANP_REST`) est un numéro quelle que soit la marque ;
  derrière `7`, un mobile `9XX` ou `7XX` (`MOBILE_7_REST`) aussi. `PhoneMasker::CC1_NUMBER` réunit les deux formes, et
  `RadarPhone::FLOOR_PLUS` le lit sur sa première branche. Un prix d'étage n'a pas ces formes : il commence par 1, porte
  un 0 en quatrième chiffre, ou, derrière `R+7`, ne commence ni par 7 ni par 9.
- **Limite assumée, dans le sens sûr** : un prix de dix chiffres dont la forme est celle d'un numéro, même marqué, est
  masqué. Exemples : `Immeuble R+1 2 345 678 900 F`, et `Immeuble R+7 9 250 500 750 F` (de 7 à 9,99 milliards). Le
  prix est perdu, l'humain tranche. Aucun numéro masqué sur `dev` ne sort en clair.
- **Radar** : `RadarPhone::FLOOR_PLUS` gagne une seconde branche, de forme étroite (`RDC`, espaces, étage 0-19,
  `PhoneMasker::FLOOR_AFTER_PLUS`, borne comprise). La première branche (`R+` collé, large) prend la borne : un `+1` ou
  un `+7` suivi d'un numéro complet garde son `+`, et `RDC +1 5145550199` n'est plus lu comme un prix. Sans la seconde
  branche, `Villa RDC+1 77 123 45 67` et `Villa R + 1 77 123 45 67` perdaient leur contact, parce que
  `FOREIGN_PREFIX` lisait `+1` devant le numéro.
- **Parité PHP/JS hors fixture** : 0 écart sur 217 664 lignes distinctes. Ce sont les fichiers suivis qui portent un
  chiffre, plus les cas d'étage écrits à la main, dont les onze fuites de la vérification. Par rapport au masqueur de
  `dev`, 24 lignes gagnent un texte non masqué : ce sont toutes des écritures d'étage suivies d'un prix. Aucune ligne
  ne perd le masquage d'un numéro.
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
- **La borne vaut pour `1` et `7` seulement, et un prix marqué la lève.** Écarté : retirer `+1` et `+7` des étages.
  Raison : `R+1` est l'étage le plus écrit. Un numéro complet sans marque monétaire derrière se masque, et un prix de
  dix chiffres non marqué derrière `R+1` est perdu : l'humain tranche.
