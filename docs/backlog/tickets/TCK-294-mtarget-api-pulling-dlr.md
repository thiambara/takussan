---
id: TCK-294
title: "Mtarget — basculer les accusés de livraison sur l'API Pulling plutôt qu'un webhook non signé"
status: todo
phase: P2
family: technique
estimate: M
wave: null
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, sms, securite, integration]
---

## Objectif utilisateur

Que les statuts de livraison des SMS Mtarget nous parviennent sans qu'il faille exposer sur Internet
un point d'entrée que personne ne peut authentifier.

## Ce que la mesure et l'opérateur ont établi (2026-08-16)

**Mtarget n'émet aucune signature cryptographique sur ses webhooks** — vérifié auprès de
l'opérateur, cf. ardoise D-49. Ce n'était donc pas un oubli de notre côté : notre webhook
`POST /api/webhooks/sms/mtarget/status/{token}` est protégé par tout ce qui était disponible (jeton
d'URL, liste blanche d'IP fail-closed, limitation de débit), et cela reste faible par construction —
le jeton d'URL circule dans le tableau de bord de l'opérateur, dans les journaux d'accès et dans les
échanges d'intégration.

**Mtarget recommande lui-même une autre voie : l'API Pulling DLR / MO.** Le sens du flux s'inverse —
c'est notre serveur qui interroge périodiquement Mtarget, en s'authentifiant avec nos identifiants et
jetons d'API. La question de la signature disparaît avec le webhook : on n'a plus à prouver que
l'appelant est bien Mtarget, puisque c'est nous qui appelons.

## Contraintes strictes

- **Ne pas supprimer le webhook dans le même geste.** Le basculement doit être réversible : tant que
  le pulling n'a pas prouvé qu'il récupère les mêmes statuts, les deux voies coexistent. Un accusé de
  livraison perdu ne se rattrape pas.
- **Idempotence obligatoire.** Le pulling relira des statuts déjà traités. La convention du dépôt
  veut que chaque tâche planifiée soit `->withoutOverlapping()` et porte un commentaire `TCK-NNN`
  expliquant son idempotence (`routes/console.php`).
- **Le rythme d'interrogation est un arbitrage à écrire** : trop lent, les statuts traînent ; trop
  rapide, on consomme du quota d'API pour rien. Le fixer explicitement, avec son motif.
- Suivre le patron driver/registry du dépôt (`SmsDriverInterface` + drivers par opérateur) plutôt
  que d'ajouter un chemin parallèle.

## Delta à produire

- [ ] Lire la documentation de l'API Pulling DLR / MO de Mtarget et en tirer le contrat réel
      (pagination, fenêtre de rétention des statuts, quotas).
- [ ] Client d'API + commande `sms:pull-mtarget-dlr` sur le patron des 14 commandes maison.
- [ ] Entrée planifiée dans `routes/console.php`, `->withoutOverlapping()`, avec le commentaire
      d'idempotence.
- [ ] Clés d'environnement déclarées dans `.env.example` **et** `.env.docker` — le sous-système SMS
      avait ses 11 clés déclarées nulle part jusqu'au 2026-08-16, et la garde de parité ne pouvait
      pas le voir.
- [ ] Période de recouvrement où webhook et pulling coexistent, puis retrait du webhook Mtarget.

## Critères d'acceptation

- [ ] AC1 — un statut de livraison Mtarget remonte sans qu'aucune requête entrante non authentifiée
      ne soit nécessaire.
- [ ] AC2 — rejouer le pulling sur la même fenêtre ne duplique aucun statut ni aucune notification.
- [ ] AC3 — une panne de l'API Mtarget est visible (journalisée, et le statut reste `pending`) plutôt
      que silencieuse.
- [ ] AC4 — le webhook Mtarget n'est retiré qu'après une période de recouvrement documentée.

## Hors périmètre

- **Orange.** Orange n'offre pas de pulling équivalent : sa voie est HTTPS + liste blanche d'IP, que
  nous appliquons déjà. Voir ardoise D-49.
- Le webhook de paiement ([TCK-293](TCK-293-webhook-paiement-scope-agence.md)) — problème distinct,
  contraintes distinctes.
