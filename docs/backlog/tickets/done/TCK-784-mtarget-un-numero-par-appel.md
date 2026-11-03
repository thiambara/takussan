---
id: TCK-784
title: "Mtarget : un seul numéro par appel, et un résultat par numéro"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-27--routeur-sms--double-envoi-sur-un-timeout-suivi-dun-repli"
tags: [back, sms, mtarget, pistes]
---

## Contexte

Réf : **P27.05** du fichier de pistes, `validé` (critère accordé : V7, le choix entre lire le
résultat par numéro et n'envoyer qu'un numéro par appel). `MtargetSmsDriver` envoyait les numéros
par lots de 500 et lisait le code et le ticket du lot dans `results[0]` : un numéro refusé passait
`sent` avec le premier.

## Décision du porteur

un seul numéro par appel chez Mtarget

## Delta à produire

- [x] `MtargetSmsDriver::send()` : un appel HTTP par numéro ; `sms.mtarget.batch_max` n'est plus lu.
- [x] `MtargetOneNumberPerCallTest`.

## Critères d'acceptation

- [x] AC1 — Deux numéros font deux appels, chacun avec un seul `msisdn`.
- [x] AC2 — Chaque numéro porte le résultat de son appel : un `code` négatif ne rend `sent` aucun
      autre numéro.

## Hors périmètre

- Les deux autres points de la piste (compteur de tentatives après les heures calmes, renvoi Orange
  après 401 hors `try`) : la décision ne retient que Mtarget.
- La clé `sms.mtarget.batch_max` de `config/sms.php`, devenue sans lecteur, reste : la retirer
  ferait jouer la suite entière pour une ligne morte. À retirer avec le prochain changement de ce
  fichier.

## Hypothèses (mode sans humain)

- Aucun appelant n'envoie aujourd'hui plus d'un numéro (mesure du 2026-10-16) : le coût d'un appel
  par numéro ne se paie donc nulle part.

## Notes d'implémentation

- Ablation : pilote remis à `pre-dev` → 1 rouge (1 appel pour 2 numéros) ; remis → vert, et les 65
  tests de `tests/Feature/Services/Sms` verts.
