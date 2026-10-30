---
id: TCK-2451
title: "Socle IA : `R+1 00221 77 …` ne laisse plus de chiffres d'un numéro en clair, et garde son contact au Radar"
status: done
phase: P2
family: back
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2447]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, socle-ia, donnees-personnelles]
---

## Objectif utilisateur

Une annonce qui écrit son étage puis un contact précédé de l'indicatif sénégalais `00221` ou `221` nu
(`Villa R+1 00221 77 012 34 56`) n'envoie au modèle aucun chiffre de ce numéro en clair, et le Radar en garde le contact.

## Contexte

Relevé par la vérification adverse de TCK-2441 et TCK-2447. Le défaut est antérieur à ces tickets : il est identique sur
`dev` `b891d5d86` et sur la branche `fix/radar-etage-et-indicatif-221`. Mesure faite sur les deux arbres extraits par
`git archive`, avec des numéros fictifs :

| Texte | masque (`dev` = branche) | contact `dev` | contact branche |
|---|---|---|---|
| `Villa R+1 00221 77 012 34 56` | `Villa R[TELEPHONE] 34 56` | `[]` | `[]` |
| `Villa R+7 00221 77 012 34 56` | `Villa R[TELEPHONE] 34 56` | `[]` | `[]` |
| `Villa RDC +1 00221 77 012 34 56` | `Villa RDC [TELEPHONE] 34 56` | `[]` | `[]` |
| `Villa R+1 221 77 012 34 56` | `Villa R[TELEPHONE] 56` | `[]` | `[]` |
| `Villa R+7 221 77 012 34 56` | `Villa R[TELEPHONE] 56` | `[]` | `[]` |
| `Villa R+1 (221) 77 01 234 56` (groupement 2-2-3-2) | `Villa R[TELEPHONE] 56` | `[]` | `[]` |
| `Immeuble R+20 00221 77 123 45 67` | `Immeuble R[TELEPHONE] 45 67` | `["+221771234567"]` | `[]` |
| `Immeuble R+30 221 77 123 45 67` | `Immeuble R[TELEPHONE] 67` | `["+221771234567"]` | `[]` |
| Témoin : `Villa R+2 00221 77 012 34 56` | `Villa R+2 [TELEPHONE]` | `["+221770123456"]` | même |
| Témoin : `Villa 00221 77 012 34 56` | `Villa [TELEPHONE]` | `["+221770123456"]` | même |

Causes :
- **Étage `1` / `7`.** `PhoneMasker::CC1_REST` lit le `1` (ou le `7`) puis dix chiffres, `0022177012`, comme un numéro
  complet de cet indicatif : l'étage n'en est plus un, et `34 56` reste en clair. Avec `221` nu, ce sont `2217701234`, et
  `56` reste. `NOT_SENEGAL_ZONE` (TCK-2447) n'exclut que `(221)` suivi d'un numéro de `PATTERN`.
- **Groupement 2-2-3-2 derrière `(221)`.** `NOT_SENEGAL_ZONE` ne reconnaît que les groupements de `PATTERN` (2-3-2-2,
  2-2-2-3, 3-2-2-2, collé) : `77 01 234 56` laisse `ZONE_REST` lire `(221) 77 01 234`.
- **Étage de 20 et plus qui est un indicatif.** `FOREIGN` lit `+20 00221 77 123` (ou `+30 221 77 123 45`) comme un numéro
  étranger, ce qui laisse en clair `45 67` (ou `67`). Depuis TCK-2441, le Radar suit le masqueur et perd le contact.

## Contrat de données

Aucun endpoint, aucune migration. `App\Support\PhoneMasker` et son miroir `scripts/check-ai-evals-pii.mjs`,
`App\Support\RadarPhone`, le fixture partagé.

## Contraintes strictes (métier)

- Le masqueur et la garde JS reconnaissent toujours le même ensemble (fixture partagé, parité rejouée).
- Aucun chiffre d'un numéro masqué sur `dev` ne sort en clair. La comparaison se fait code point par code point, contre
  `dev` extrait par `git archive`, sur la grille de la vérification de TCK-2447 (`scratchpad/v2441/`).
- Les formes nord-américaine et russe derrière `+1` / `+7` restent masquées : `R+1 202 555 0123`, `RDC +7 495 123 45 67`.

## Delta à produire

- [x] Mesurer, puis choisir : étendre `NOT_SENEGAL_ZONE` à `(?:\(221\)|00221|221)` suivi d'un numéro sénégalais, et
      au groupement libre (`SENEGAL_LOOSE`) derrière `(221)`. Mesurer contre `dev` les formes NANP et russe.
- [x] Pour un étage de 20 ou plus qui est un indicatif, suivi de `00221` ou `221` : le numéro sénégalais doit l'emporter
      sur la lecture étrangère dans le masqueur. À mesurer. (Fait autrement : le numéro étranger l'englobe, décision 2.)
- [x] Fixture partagé et tests Radar : les textes du tableau.

## Critères d'acceptation

- [x] AC1 — `Villa R+1 00221 77 012 34 56` est masqué sans aucun chiffre du numéro en clair, et rend
      `["+221770123456"]` (`fromText` et `contactsFromText`).
- [x] AC2 — `Villa R+1 221 77 012 34 56` et `Villa R+1 (221) 77 01 234 56` font de même.
- [x] AC3 — `Immeuble R+20 00221 77 123 45 67` ne laisse aucun chiffre du numéro en clair.
- [x] AC4 — Parité PHP/JS : 0 écart ; face à `dev`, aucun chiffre d'un numéro démasqué.
- [x] AC5 — Ablation de chaque correctif : rouge.

## Notes d'implémentation

- **Deux mécanismes, dans le sens qui masque le plus.**
  - `PhoneMasker::NOT_SENEGAL_ZONE` (miroir `PAS_ZONE_221`) : derrière l'étage `1` ou `7`, l'étage reste un étage quand le
    numéro qui suit sera masqué en entier par le masque sénégalais : `(221)` devant `PATTERN` (TCK-2447) ou `SENEGAL_LOOSE`,
    `00221` ou `221` nu devant `PATTERN`, sans chiffre derrière à trois séparateurs près. Le contact est gardé.
  - `PhoneMasker::CODED_SENEGAL` (miroir `SENEGAL_A_INDICATIF`), dans `FOREIGN` : ailleurs, là où `FOREIGN` lisait déjà un
    numéro étranger (garde par lookahead, bornes comprises), un indicatif suivi d'un numéro sénégalais à indicatif l'englobe en
    entier, à groupement libre, sans s'étendre sur un numéro tronqué suivi d'un autre (`WHOLE_NUMBER_END`). Pas de contact.
- **`NOT_SENEGAL_ZONE` n'a plus qu'un exemplaire dans `CC1_NUMBER`** (devant le `(0)` de trunk, qu'elle lit) : PCRE refusait le
  motif (« regular expression is too large »). Marge mesurée après coup : `MASK_PATTERN` (36 368 octets de source) casse si on lui
  ajoute 4 copies de `SENEGAL_LOOSE` (~5,5 ko) ; `RadarPhone::FLOOR_PLUS`, 8 copies.
- **Limites, identiques à `dev`** : `Villa R+1 00221 77 012 34 56 78` (un groupe de plus derrière) laisse `34 56 78` en clair ;
  `Villa R+1 00221 77 012 34 / 78 123 45 67` (numéro tronqué) laisse `34`. Épinglées dans le fixture.

### Décisions prises en autonomie, à revoir

1. **L'étage `1` / `7` ne gagne que si le masque couvre le numéro entier ; sinon le numéro étranger l'englobe.** Écarté : étendre
   la garde à tout groupement derrière `221` nu (le `221` sortirait en clair, `Villa R+1 221 [TELEPHONE]`). Raison : consigne,
   masquer le plus. Coût : `Villa R+1 221 77 01 234 56` et `Villa R+1 221 77 012 34 56 F` ne gagnent pas de contact (aucun sur `dev`).
2. **Étage de 20 ou plus qui est un indicatif, puis `00221` / `221` nu : le numéro étranger englobe le numéro sénégalais**
   (`Immeuble R[TELEPHONE]`, aucun contact, comme depuis TCK-2441). Écarté : le numéro sénégalais l'emporte
   (`Immeuble R+20 [TELEPHONE]`, contact gagné). Raison : consigne, masquer le plus ; `+20` masqué sur `dev` resterait en clair.
3. **`Contact +1 (221) 77 012 34 56` → `Contact [TELEPHONE]`** (était `Contact [TELEPHONE] 56`), et `Villa R+1 (221) 77 012 34 56 F`
   → `Villa R[TELEPHONE] F` (était `… 56 F`, prix 56 → `null`). La décision 2 de TCK-2447 refusait d'exclure `(221)` hors d'un étage ;
   ici on englobe, ce qui masque davantage. Écarté : laisser `56`.
4. **La garde de l'étage s'en tient à « aucun chiffre derrière à trois séparateurs près »** ; seule `CODED_SENEGAL` tolère un autre
   numéro entier derrière. Écarté : la même tolérance dans la garde (+5 ko par copie, motif trop grand). Coût :
   `Villa R+1 00221 77 012 34 56 / 78 123 45 67` est masqué en entier, mais ne donne que le second contact, comme sur `dev`.
5. **`CODED_SENEGAL` seulement là où `FOREIGN` lisait déjà un numéro.** Écarté : sans garde. Raison : sans elle,
   `Immeuble R+20 221 7 7 1 2 3 4 5 6 7` et `Contact +1 (221) 770123456` perdaient un contact sans qu'aucune fuite ne soit fermée.
