---
id: TCK-1802
title: "La file `sync` de la suite attend le commit, comme le worker"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-156--variables-denvironnement-que-la-suite-le-développement-et-la-préproduction-posent-différemment"
tags: [back, queue, tests, pistes]
---

## Contexte

Réf : **P156.01** du fichier de pistes, `validé` par le porteur (critère V6 accordé).

**Décision du porteur** : validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

La recommandation du délégué, que la décision reprend : poser `'after_commit' => true` sur `sync`
et étendre `QueueAfterCommitTest` à `sync`. La décision lève la contrainte de TCK-746 « `sync` ne
porte pas la clé ».

La suite tourne en `QUEUE_CONNECTION=sync` (`phpunit.xml`). Sans `after_commit`, un job mis en
file dans une transaction s'y exécutait **avant** la ligne qui suit le dispatch, et son échec
annulait l'écriture qui le précédait. Le développement et la préproduction (`database`, à
`after_commit`) n'ont ni cet ordre ni cette atomicité.

## Contraintes strictes

- Hors transaction, l'exécution reste immédiate.
- La clé vaut aussi pour `dispatchSync()` appelé dans une transaction (seul appelant :
  `NotificationDigestPreviewCommand`, hors transaction) : accordé avec le critère V6.

## Delta à produire

- [x] `config/queue.php` : `after_commit => true` sur la connexion `sync`.
- [x] `QueueAfterCommitTest` : `sync` dans la liste des connexions qui attendent le commit ; un
      job mis en file sous `sync` dans une transaction s'exécute après le commit ; son échec
      remonte à l'appelant sans annuler l'écriture validée.

## Critères d'acceptation

- [x] AC1 — Sous `sync`, l'ordre observé est `["apres-dispatch", "job"]`.
- [x] AC2 — Sous `sync`, un job qui lève dans une transaction laisse la ligne écrite avant lui.

## Hors périmètre

- Les autres valeurs de régime de `phpunit.xml` (cache, session, Scout) : P156.03, TCK-1804.
- Les tests de la suite qui reposeraient sur l'ancien ordre : seule la CI de la PR joue la suite
  entière ; ceux qu'elle fera rougir se reprennent en réparation.

## Notes d'implémentation

- Ablation : sans la clé, les trois tests neufs ou étendus rougissent (clé absente ;
  `["job","apres-dispatch"]` ; ligne annulée, 0 au lieu de 1). Avec, 6/6.
- Sous `RefreshDatabase`, le gestionnaire de transactions de test ignore la transaction de la
  méthode de test : les callbacks partent au commit de la transaction du code, pas en fin de test.
- Un `catch` posé autour d'un `notify()` **dans** une transaction ne voit plus l'échec d'une
  notification en file sous `sync` : il remonte au commit. C'est ce que fait le worker (le `catch`
  y est déjà inerte, P179.03). Vingt classes exposées (repli de notification, signature de bail,
  modération, relevés bancaires, alertes de recherche…) jouées une à une : toutes vertes.
