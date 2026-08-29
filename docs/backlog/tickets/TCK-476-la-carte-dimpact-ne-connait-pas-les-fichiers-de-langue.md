---
id: TCK-476
title: "La carte d'impact ne connaît pas les fichiers de langue, et retombe sur la suite entière"
status: todo
phase: P2
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-29
depends_on: []
blocks: []
spec_refs: {}
tags: [outillage, tests, dette]
---

## Objectif utilisateur

Aucun, directement. C'est la boucle de retour quotidienne : `php bin/impacted-tests.php --run` doit
ne lancer que les tests que le diff touche, sinon plus personne ne l'emploie.

## Le défaut

Mesuré pendant le lot des vagues 50-51 : un diff qui ne touche qu'un fichier de langue —
`takussan-api/lang/en/invitations.php` — fait résoudre la carte d'impact à **la suite ENTIÈRE**.
Le fichier est inconnu de `tests/impact-map.json`, et l'inconnu est traité comme « tout ».

Ce repli est **le bon défaut** : face à un fichier qu'elle ne sait pas situer, une carte d'impact
doit sur-sélectionner, jamais sous-sélectionner. Le problème n'est pas le repli, c'est sa
**fréquence** : les fichiers de `lang/` changent souvent, et à chaque fois l'outil du quotidien
coûte 470 à 610 secondes au lieu de quelques dizaines.

⚠ **Un outil qui retombe souvent sur son pire cas cesse d'être employé** — et c'est alors la boucle
de retour qui disparaît, pas seulement sa vitesse.

## Contrat de données

Aucun.

## Delta à produire

- [ ] Faire connaître `lang/**` à la carte, ou lui donner une règle explicite pour cette famille.
- [ ] ⚠ **Sans casser le repli** : un fichier vraiment inconnu doit continuer de rendre la suite
      entière.

## Critères d'acceptation

- [ ] **AC1** — un diff limité à un fichier de `lang/` résout un ensemble **strictement plus
      petit** que la suite entière, et le compte est écrit.
- [ ] **AC2** — l'ensemble résolu **contient** les tests qui asserten sur ces clés. Le vérifier par
      ablation : casser une clé et constater que l'ensemble résolu la rougit. *Une carte d'impact
      qui va plus vite en oubliant un test est pire que celle qui lance tout.*
- [ ] **AC3** — un fichier hors de toute règle connue rend **toujours** la suite entière. Le
      vérifier avec un chemin inventé.
- [ ] **AC4** — le relevé qui motive le ticket est reproduit dans le ticket, avec sa commande.

## Hors périmètre

- La régénération de la carte, qui a son propre chemin.

## Notes d'implémentation

Relevé pendant le lot des vagues 50-51, en essayant d'employer la boucle du quotidien sur un diff
qui touchait des dictionnaires.
