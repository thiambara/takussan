---
id: TCK-294
title: "Mtarget — basculer les accusés de livraison sur l'API Pulling plutôt qu'un webhook non signé"
status: done
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

- [x] Lire la documentation de l'API Pulling DLR / MO de Mtarget et en tirer le contrat réel
      (pagination, fenêtre de rétention des statuts, quotas).
- [x] Client d'API + commande `sms:pull-mtarget-dlr` sur le patron des 14 commandes maison.
- [x] Entrée planifiée dans `routes/console.php`, `->withoutOverlapping()`, avec le commentaire
      d'idempotence.
- [x] Clés d'environnement déclarées dans `.env.example` **et** `.env.docker` — le sous-système SMS
      avait ses 11 clés déclarées nulle part jusqu'au 2026-08-16, et la garde de parité ne pouvait
      pas le voir.
- [x] Période de recouvrement où webhook et pulling coexistent, puis retrait du webhook Mtarget.
      *Le recouvrement est défini et outillé ici ; le retrait lui-même est un basculement de config
      à faire à la fin de la fenêtre, pas dans ce ticket (AC4 l'interdit).*

## Critères d'acceptation

- [x] AC1 — un statut de livraison Mtarget remonte sans qu'aucune requête entrante non authentifiée
      ne soit nécessaire.
- [x] AC2 — rejouer le pulling sur la même fenêtre ne duplique aucun statut ni aucune notification.
- [x] AC3 — une panne de l'API Mtarget est visible (journalisée, et le statut reste `pending`) plutôt
      que silencieuse.
- [x] AC4 — le webhook Mtarget n'est retiré qu'après une période de recouvrement documentée.

## La période de recouvrement — définition mesurable

Une période de recouvrement qu'on ne peut pas mesurer n'est pas une garantie, c'est un délai. Celle-ci
a donc un début, une fin et un critère de sortie vérifiable.

**Début** — le jour où la production passe `SMS_DLR_PULL_DRIVER=mtarget` et `SMS_DLR_PULL_ENABLED=true`.
Ce jour n'est pas encore arrivé et ne peut pas l'être : **la production n'a jamais été déployée**
(dette D-04, [TCK-288](TCK-288-chaine-de-deploiement-master-fige.md)). La fenêtre démarre après.

**Durée minimale** — 14 jours d'exécution continue du planificateur, les deux voies actives.

**Critère de sortie** — sur 7 jours consécutifs, dans les journaux applicatifs :

1. le nombre de rapports appliqués par le pulling (compteur `applied` imprimé à chaque exécution de
   `sms:pull-mtarget-dlr`) est **≥** le nombre de lignes `[sms.mtarget.webhook] delivery report
   applied` sur la même fenêtre ;
2. aucune ligne `[sms.mtarget.pull] delivery report matched no attempt` qui ne s'explique pas par un
   envoi antérieur au démarrage du pulling ;
3. aucune ligne `[sms.mtarget.pull] unrecognised record shape` — elle signalerait que le nommage réel
   des champs DLR de la file diffère des deux jeux acceptés (cf. « Ce qui reste à confirmer »).

**Retrait** — `SMS_MTARGET_WEBHOOK_ENABLED=false`. La route rend alors 404 sans rien écrire
(`test_the_kill_switch_retires_the_webhook_without_a_deploy`). Le retour en arrière est le même
basculement dans l'autre sens, sans déploiement.

## Ce qui reste à confirmer auprès de l'opérateur

Le contrat ci-dessous vient de `developers.mtarget.fr/api-pulling` et `…/api-sms`, lus le 2026-08-16.
Trois points n'y sont **pas** documentés et ne sont donc pas inventés dans le code — ils sont traités
défensivement, et chaque hypothèse laisse une trace dans les journaux si elle est fausse :

1. **Le nommage des champs d'une ligne DLR de la file de pulling.** Le seul exemple publié sur la page
   est une ligne d'*erreur* (`msisdn`, `smscount`, `code`, `reason`, `ticket`) ; la documentation du
   push, elle, nomme les mêmes données `MsgId` / `DestinationAdress` / `StatusText`. Le driver accepte
   **les deux** graphies et journalise `unrecognised record shape` sur tout le reste, plutôt que de
   parier sur l'une.
2. **L'activation du mode pulling sur le compte.** Une note de support indique qu'il est optionnel et
   activé par Mtarget à la demande. À demander avant d'armer la production.
3. **Le quota d'appels.** Non documenté. La cadence retenue (5 min, plancher 288 appels/jour/compte)
   est un choix prudent, pas une valeur négociée.

Établi, en revanche : `POST https://api-public-2.mtarget.fr/notification`, corps form-urlencodé
`username`/`password` (+ `max`, défaut 50, + `serviceid` si le compte l'exige), réponse
`{"results":[…]}`, erreurs d'API rendues **dans** `results` avec un `code` négatif et un `ticket`
valant la chaîne `"null"`, rétention d'un mois, `Status=5` = MO et non accusé de livraison.

## Hors périmètre

- **Orange.** Orange n'offre pas de pulling équivalent : sa voie est HTTPS + liste blanche d'IP, que
  nous appliquons déjà. Voir ardoise D-49.
- Le webhook de paiement ([TCK-293](TCK-293-webhook-paiement-scope-agence.md)) — problème distinct,
  contraintes distinctes.


## Notes d'implémentation

**L'idempotence ne pouvait PAS venir de la fenêtre.** Le ticket parle de « rejouer le pulling sur la
même fenêtre » ; l'API de Mtarget n'a pas de fenêtre. Elle expose une **file, et la lecture la vide** :
un appel réussi consomme les rapports qu'il retourne, il n'y a ni paramètre de date ni pagination par
curseur — seulement `max`. Rejouer la même fenêtre est donc *impossible*, et l'idempotence a été
placée là où elle tient : **sur l'écriture**. Un rapport ne fait qu'`UPDATE` une tentative appariée sur
`(provider, provider_message_id)`, jamais d'`INSERT` ; réécrire le même statut est un no-op ; une
précédence de statuts bloque toute régression. Conséquence directe sur la conduite du job : **un appel
en échec arrête le drainage** au lieu de continuer — un rapport consommé pendant que notre côté est
cassé est un rapport perdu pour de bon.

**Le webhook est gardé, et outillé pour son retrait.** Le supprimer maintenant violerait l'AC4 et la
contrainte du ticket. Il gagne à la place `sms.mtarget.webhook_enabled` : le retrait devient un
basculement de configuration, réversible en secondes, et il est éprouvé par un test. Sa journalisation
`[sms.mtarget.webhook] delivery report applied` existe **uniquement** pour rendre la période de
recouvrement mesurable — sans elle, « le pulling remonte les mêmes statuts » resterait une opinion.

**Les deux voies ne partagent PAS leur table de statuts, délibérément.** Mtarget documente `Status=5`
comme un MO sur la file de pulling, alors que la documentation du push ne liste pas ce code du tout —
et un test existant du webhook (antérieur, TCK-285) traite `Status=5` comme un échec. Fusionner les
deux tables aurait cassé ce test ou, pire, fait passer un SMS entrant pour un accusé de livraison.
Seul l'appariement ticket→tentative est partagé (`MtargetTicketMatcher`), parce que c'est la seule
chose sur laquelle les deux chemins *doivent* s'accorder.

**Les codes intermédiaires (0/1/2) ne sont jamais écrits.** Ils décrivent un message encore en route ;
les écrire n'apporterait rien et exposerait à écraser un statut terminal drainé dans le désordre.

**Vérifié par ablation** (la mesure, pas la confiance) : en retirant `statusPrecedence` et la branche
des statuts intermédiaires, exactement les deux tests qui les nomment passent au rouge — 2 échecs,
14 verts. Les gardes sont donc portantes, et non décoratives.

**Mesures.** `MtargetDlrPullingTest` (16 tests) + `MtargetSmsWebhookTest` (9) : 25 verts, 59
assertions — y compris avec `.env.example` monté en `.env`, c'est-à-dire dans la configuration exacte
de la CI (D-54). Suites voisines non régressées : `SmsRouterDriverTest`, `OrangeOAuthLockTest`, les
trois webhooks SMS — 35 verts. `schedule:list` montre `*/5 * * * * php artisan sms:pull-mtarget-dlr`.
`check-env-parity` : 112 clés des deux côtés.

**Ce qui reste ouvert** est listé plus haut, section « Ce qui reste à confirmer auprès de l'opérateur ».
Rien de tout cela n'a été deviné dans le code : le driver accepte les deux nommages documentés et
journalise ce qu'il ne reconnaît pas. Le driver par défaut est `log` et `SMS_DLR_PULL_ENABLED=false`,
donc rien n'appelle Mtarget tant que la décision d'armer n'est pas prise.
