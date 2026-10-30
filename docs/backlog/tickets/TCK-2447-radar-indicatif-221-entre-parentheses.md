---
id: TCK-2447
title: "Radar : `R+1 (221) 77 …` garde son contact sénégalais, et `(221)` n'est pas un prix"
status: doing
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

- [ ] Derrière l'indicatif `1`, une zone `(221)` suivie d'un numéro sénégalais n'est pas une zone nord-américaine. Pistes :
      exclure la zone `221`, ou exiger que ce qui suit ne soit pas un numéro de `PATTERN`. Mesurer avant de choisir.
- [ ] `phoneSpans()` absorbe un `(221)` ou un `221` écrit juste devant une plage sénégalaise, comme `prefixStart()` le fait
      pour `+` et `00`.
- [ ] Tests : les quatre textes ci-dessus. `Villa R+1 (221) 77 012 34 56` rend son contact et aucun prix.

## Critères d'acceptation

- [ ] AC1 — `Villa R+1 (221) 77 012 34 56` rend `["+221770123456"]` (`fromText` et `contactsFromText`), et aucun prix.
- [ ] AC2 — `Villa (221) 77 012 34 56` et `Villa R+2 (221) 77 012 34 56` ne rendent plus 221 comme prix.
- [ ] AC3 — Parité PHP/JS : 0 écart ; face à `dev`, aucune ligne démasquée.
- [ ] AC4 — Ablation de chaque correctif : rouge.
