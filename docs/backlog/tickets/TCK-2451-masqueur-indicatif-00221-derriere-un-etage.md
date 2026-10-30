---
id: TCK-2451
title: "Socle IA : `R+1 00221 77 …` ne laisse plus de chiffres d'un numéro en clair, et garde son contact au Radar"
status: todo
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

- [ ] Mesurer, puis choisir : étendre `NOT_SENEGAL_ZONE` à `(?:\(221\)|00221|221)` suivi d'un numéro sénégalais, et
      au groupement libre (`SENEGAL_LOOSE`) derrière `(221)`. Mesurer contre `dev` les formes NANP et russe.
- [ ] Pour un étage de 20 ou plus qui est un indicatif, suivi de `00221` ou `221` : le numéro sénégalais doit l'emporter
      sur la lecture étrangère dans le masqueur. À mesurer.
- [ ] Fixture partagé et tests Radar : les textes du tableau.

## Critères d'acceptation

- [ ] AC1 — `Villa R+1 00221 77 012 34 56` est masqué sans aucun chiffre du numéro en clair, et rend
      `["+221770123456"]` (`fromText` et `contactsFromText`).
- [ ] AC2 — `Villa R+1 221 77 012 34 56` et `Villa R+1 (221) 77 01 234 56` font de même.
- [ ] AC3 — `Immeuble R+20 00221 77 123 45 67` ne laisse aucun chiffre du numéro en clair.
- [ ] AC4 — Parité PHP/JS : 0 écart ; face à `dev`, aucun chiffre d'un numéro démasqué.
- [ ] AC5 — Ablation de chaque correctif : rouge.

## Notes d'implémentation
