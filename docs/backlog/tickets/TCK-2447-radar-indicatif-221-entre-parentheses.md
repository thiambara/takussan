---
id: TCK-2447
title: "Radar : `R+1 (221) 77 …` garde son contact sénégalais, et `(221)` n'est pas un prix"
status: done
phase: P3
family: back
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2445]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, socle-ia, donnees-personnelles]
---

## Objectif utilisateur

Une annonce qui écrit son étage puis un contact avec l'indicatif sénégalais entre parenthèses
(`Villa R+1 (221) 77 012 34 56`) garde ce contact au Radar, et l'opérateur ne voit pas un prix de 221 F.

## Contexte

Relevé par la vérification adverse de TCK-2445 (I2). Le défaut est antérieur à cette branche : il vient de TCK-2435 (#1612).
Mesuré sur trois arbres extraits par `git archive`, avec des numéros fictifs :

| Texte | 908d62321 | `dev` 20c2538a4 | TCK-2445 |
|---|---|---|---|
| `Villa R+1 (221) 77 012 34 56`, masque | `Villa R+1 (221) [TELEPHONE]` | `Villa R[TELEPHONE] 56` | `Villa R[TELEPHONE] 56` |
| même texte, `RadarPhone::fromText` | `["+221770123456"]` | `[]` | `[]` |
| même texte, `RadarAmountParser::parse` | 221 | `null` | `null` |
| `Villa R+2 (221) 77 012 34 56`, prix | 221 | 221 | 221 |
| `Villa (221) 77 012 34 56`, prix | 221 | 221 | 221 |
| `Contact +1 (221) 77 012 34 56`, masque | `Contact [TELEPHONE] 56` | même | même |

Deux causes :
- **Contact perdu.** La branche à parenthèses de `PhoneMasker::CC1_REST` lit `+1 (221) 77 012 34` comme un numéro `+1`
  complet. La fin d'un groupe suffit à `(?![0-9])`. Le `1` cesse donc d'être un étage, et le `56` reste en clair. Ce reste
  n'est pas une fuite utile, mais le contact sénégalais se perd.
- **Prix de 221**, antérieur à TCK-2435 : `RadarAmountParser::phoneSpans()` étend une plage jusqu'au `+` ou au `00` qui la
  précède (`RadarPhone::prefixStart()`), mais pas jusqu'à un `(221)` écrit devant. Le `221` reste un candidat, seul ou
  marqué.

## Contrat de données

Aucun endpoint, aucune migration. `App\Support\PhoneMasker` et son miroir `scripts/check-ai-evals-pii.mjs`,
`App\Support\RadarPhone`, `App\Services\Radar\RadarAmountParser`, le fixture partagé.

## Contraintes strictes (métier)

- Le masqueur et la garde JS reconnaissent toujours le même ensemble (fixture partagé, parité rejouée).
- Aucune ligne masquée sur `dev` ne sort en clair : `Contact +1 (221) 77 012 34 56` doit rester masqué en entier ou en
  partie.

## Delta à produire

- [x] Derrière l'indicatif `1`, une zone `(221)` suivie d'un numéro sénégalais n'est pas une zone nord-américaine. Pistes :
      exclure la zone `221`, ou exiger que ce qui suit ne soit pas un numéro de `PATTERN`. Mesurer avant de choisir.
- [x] `phoneSpans()` absorbe un `(221)` ou un `221` écrit juste devant une plage sénégalaise, comme `prefixStart()` le fait
      pour `+` et `00`.
- [x] Tests : les quatre textes ci-dessus. `Villa R+1 (221) 77 012 34 56` rend son contact et aucun prix.

## Critères d'acceptation

- [x] AC1 — `Villa R+1 (221) 77 012 34 56` rend `["+221770123456"]` (`fromText` et `contactsFromText`), et aucun prix.
- [x] AC2 — `Villa (221) 77 012 34 56` et `Villa R+2 (221) 77 012 34 56` ne rendent plus 221 comme prix.
- [x] AC3 — Parité PHP/JS : 0 écart ; face à `dev`, aucune ligne démasquée.
- [x] AC4 — Ablation de chaque correctif : rouge.

## Notes d'implémentation

- **Contact** : `PhoneMasker::NOT_SENEGAL_ZONE` (miroir `PAS_ZONE_221`), placé derrière le `1` et le `7` de `CC1_NUMBER` :
  `(221)` suivi d'un numéro de `PATTERN` (`SENEGAL` + `END`) n'est pas une zone. `CC1_NUMBER` ne sert qu'à l'étage
  (`FLOOR_AFTER_PLUS`, `RadarPhone::FLOOR_PLUS`) : `FOREIGN` est inchangé, et `Contact +1 (221) 77 012 34 56` reste
  `Contact [TELEPHONE] 56`, comme sur `dev`.
- **Mesure des deux pistes** (grille de 56 250 textes : 15 écritures, 10 zones, 5 séparateurs, 15 corps, 5 suites ;
  `origin/dev` extrait par `git archive`) :
  - piste 1, exclure toute zone `(221)` : 2 475 lignes démasquées, dont `Villa R+1 (221) 77 012 34 56 F` et
    `Villa R+1 (221) 555 0123`, en clair en entier ;
  - piste 2, retenue : 450 lignes « démasquées » au sens du compte de chiffres. Elles ont toutes la forme
    `<étage 1 ou 7> (221) [TELEPHONE]` : l'étage et l'indicatif sortent, le numéro est masqué en entier. Aucune ligne
    hors de cette forme.
  - `END` compte : sans lui, `Villa R+1 (221) 77 012 34 56 F` sortait en clair (un numéro suivi de `F` est un prix pour
    `PATTERN`, donc rien ne le masquait plus).
- **Prix** : `RadarAmountParser::phoneSpans()` étend une plage au `(221)` ou au `221` nu écrit devant elle (au plus trois
  séparateurs), après le `+` / `00` de `RadarPhone::prefixStart()`. La borne `(?<![0-9])` ne vaut que pour le `221` nu :
  `R+1(221) 77 …` collé rendait encore 221.
- **Limite antérieure, non touchée** : `Villa R+1 (221) 77 012 34 56 F` perd son contact et rend 56 comme prix, sur `dev`
  comme ici (le numéro suivi de `F` n'est pas un numéro pour `PATTERN`).

### Décisions prises en autonomie, à revoir

1. **Piste 2 (exclure `(221)` seulement devant un numéro de `PATTERN`).** Écarté : piste 1, toute zone `(221)`. Raison :
   la piste 1 démasque des lignes masquées sur `dev` (consigne de la session).
2. **L'exclusion vit dans `CC1_NUMBER`, pas dans `FOREIGN`.** Écarté : l'étendre à `FOREIGN`. Raison :
   `Contact +1 (221) 77 012 34 56` passerait de `Contact [TELEPHONE] 56` à `Contact +1 (221) [TELEPHONE]`. C'est plus
   juste, mais le compte de chiffres hors jeton monte. Réversible en une ligne de chaque côté.
3. **La plage s'étend au `221` devant tout numéro, pas seulement sénégalais.** Écarté : n'étendre que devant un numéro
   sénégalais (`canonical()`). Raison : c'est plus simple, et le seul effet possible est un prix perdu, ce qui est le sens
   sûr.
