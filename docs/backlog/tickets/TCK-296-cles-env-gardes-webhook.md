---
id: TCK-296
title: "Les 7 clés d'environnement des gardes webhook ne sont pas toutes déclarées"
status: review
phase: P1
family: technique
estimate: S
wave: 37
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: [TCK-288]
spec_refs:
  features:
    - docs/features.md#23-notifications
  models: []
tags: [back, securite, webhook, sms, whatsapp, environnement, dette]
---

## Objectif utilisateur

Qu'un accusé de livraison SMS ou WhatsApp arrive réellement après un déploiement — au lieu d'être
rejeté en silence par une garde dont la clé de configuration n'existe dans aucun fichier
d'environnement.

## ⚠️ Trois corrections mesurées le 2026-08-16, pendant l'implémentation

**1 — Les quatre clés `SMS_*` étaient DÉJÀ déclarées.** Le commit `e5da8238` (correctif D-51) les a
ajoutées à `.env.example` et `.env.docker`, avec un bloc de commentaires qui énonce déjà le
raisonnement de ce ticket : *« la garde `check-env-parity.mjs` ne pouvait pas le voir : elle compare
les deux fichiers entre eux, et une clé absente des DEUX est en parité parfaite »*. L'ardoise
annonçait `grep -c '^SMS_' … → 0 partout` ; c'était vrai le 2026-08-15, faux le lendemain.

**2 — Il y a SEPT clés, pas six.** `WHATSAPP_WEBHOOK_IPS` est lue par `config/whatsapp.php` avec le
même défaut vide et le même échec fermé. Elle ne figurait pas dans l'inventaire de l'ardoise. La
garde livrée **dérive** la liste au lieu de la recopier, précisément pour que cette omission ne
puisse pas se reproduire.

**3 — `.env.preview` et `.env.prod` sont IGNORÉS par git, et le ticket demandait l'impossible.**
`takussan-api/.gitignore` n'excepte que `.env.example` et `.env.docker`. Ces deux fichiers vivent sur
les machines et sur le serveur, **et n'existent pas en CI** : une garde qui les exige ferait rougir
le build sur des fichiers absents par conception. Les y déclarer est un acte de **déploiement**, pas
un changement de dépôt — c'est TCK-288, exactement comme la dette D-48 sur le `.env` de
développement. La garde les signale quand ils existent, et ne bloque jamais dessus.

## Contrat de données

Aucun modèle, aucun endpoint nouveau. Sept clés d'environnement, et une garde de couverture à
créer :

| Clé | Garde qui la lit | Comportement si absente |
|---|---|---|
| `SMS_WEBHOOK_URL_TOKEN` | jeton d'URL des webhooks SMS | jeton vide → **404** |
| `SMS_ORANGE_WEBHOOK_IPS` | `RestrictIpMiddleware` | allowlist vide → **403** |
| `SMS_MTARGET_WEBHOOK_IPS` | `RestrictIpMiddleware` | allowlist vide → **403** |
| `SMS_LAM_WEBHOOK_IPS` | `RestrictIpMiddleware` | allowlist vide → **403** |
| `WHATSAPP_WEBHOOK_URL_TOKEN` | jeton d'URL du webhook WhatsApp | jeton vide → **404** |
| `WHATSAPP_WEBHOOK_APP_SECRET` | vérification de signature Meta | secret vide → rejet |
| `WHATSAPP_WEBHOOK_IPS` | `RestrictIpMiddleware` | allowlist vide → **403** — *absente de l'inventaire de l'ardoise* |

## Contraintes strictes (métier)

- **Les gardes échouent fermé, et c'est correct.** Ce ticket ne les assouplit pas : il rend leur
  configuration visible. Un webhook rejeté faute de configuration doit le rester ; ce qui doit
  changer, c'est qu'on puisse le voir venir.
- **`.env.example` est l'environnement de TEST de la CI** (ardoise D-54, corrigé le 2026-08-16).
  Toute valeur ajoutée à ce fichier devient de la configuration de suite de tests, et une valeur
  vide y **écrase** le défaut de `config/`. Ici le défaut EST la chaîne vide : les déclarer vides
  est donc un no-op mesuré pour la suite, et c'est ce qui a été vérifié.
- `scripts/check-env-parity.mjs` compare `.env.example` et `.env.docker`. Il ne pouvait rien voir
  ici puisque la clé manquait **des deux côtés** — la garde n'est pas en défaut, son périmètre
  l'est.

## Delta à produire

- [x] Les 3 clés WhatsApp déclarées dans `.env.example` et `.env.docker` (vides — `.env.example` est
      l'env de test de la CI). Les 4 clés SMS l'étaient déjà (cf. correction 1)
- [~] `.env.preview` / `.env.prod` — **hors dépôt, renvoyé à TCK-288** (cf. correction 3). La garde
      les signale : 14 déclarations manquantes côté déploiement
- [x] Garde dédiée `scripts/check-webhook-env-keys.mjs` plutôt qu'extension de la parité : elle
      compare les `.env` au **code**, ce que la parité ne peut pas faire par construction
- [x] Parseur `.env` extrait dans `scripts/lib/env-keys.mjs` et partagé par les deux gardes — deux
      parseurs du même format, c'est deux verdicts qui divergent au premier affinage
- [x] Câblée dans `repo-ci.yml`
- [x] Prouvée **par mutation**, deux fois : clé retirée d'un fichier suivi → rouge nommant la clé ;
      **nouvelle clé fail-closed ajoutée à `config/`** → rouge automatiquement, ce qui prouve que la
      liste est dérivée et non recopiée
- [x] Test du rejet fermé WhatsApp avec jeton non configuré — le seul cas qui manquait, le pendant
      SMS étant couvert depuis TCK-283
- [n/a] Docblock d'`OrangeSmsStatusController` — déjà corrigé, il n'affirme plus de middleware `signed`

## Critères d'acceptation

- [x] AC1 — *(reformulé, cf. correction 3)* les **7** clés sont déclarées dans les deux fichiers
      **suivis par git** ; `node scripts/check-webhook-env-keys.mjs --report` rend la matrice
- [x] AC2 — retirer une clé d'un fichier suivi fait sortir la garde en 1, et le message nomme la clé
      et le fichier
- [x] AC3 — la suite reste verte : **2320 tests, 0 échec** avant, et les 28 tests de webhook verts
      après ajout des clés à `.env.example`
- [x] AC4 — vérifié : aucun docblock de contrôleur webhook n'affirme plus de middleware absent
- [x] AC5 — *(ajouté)* une clé fail-closed **ajoutée à `config/`** est gardée sans intervention —
      prouvé par mutation, c'est ce qui distingue une liste dérivée d'une liste recopiée

## Hors périmètre

- La vérification de signature Orange et Mtarget — **tranchée le 2026-08-16** : les opérateurs n'en
  émettent pas (ardoise D-49). Le basculement Mtarget est TCK-294.
- La mise en production elle-même — TCK-288.

## Notes d'implémentation

**Une garde qui compare deux sources ne vérifie jamais qu'elles couvrent la troisième.** C'est la
phrase que `.env.example` portait déjà en commentaire depuis le correctif D-51 ; ce ticket la
transforme en script. `check-env-parity.mjs` reste inchangé dans son objet — il compare
`.env.example` et `.env.docker` entre eux — et `check-webhook-env-keys.mjs` compare les `.env` au
**code**. Deux gardes, deux sommets du triangle.

**Le critère de sélection est le MODE DE DÉFAILLANCE, pas la sensibilité supposée.** `config/` lit
232 clés d'environnement ; exiger que les 232 soient déclarées serait faux — 155 ont un défaut sensé
et n'ont aucune raison d'être écrites, et une garde qui rougit sur 155 faux positifs est une garde
qu'on désactive dans la semaine. Le critère retenu est `env('X', '')` **dans un fichier de
configuration qui porte une garde de webhook entrant** : le défaut vide est précisément ce qui fait
échouer fermé en silence. Ce critère écarte au passage `SCOUT_PREFIX`, qui a lui aussi un défaut vide
et que `takussan-api/CLAUDE.md` interdit explicitement de déclarer — un critère plus large aurait
donc cassé l'isolation des tests.

**Ce qui est dérivé et ce qui est décidé.** La liste des *fichiers de configuration* est écrite à la
main : deux entrées, justifiées, `config/lemon-squeezy.php` exclu après mesure (aucune clé à défaut
vide). La liste des *clés* est dérivée à chaque exécution. La mutation qui compte est la seconde :
ajouter une clé fail-closed à `config/whatsapp.php` fait rougir la garde sans que personne ne l'ait
touchée.

**Un test qui passait pour la mauvaise raison, trouvé par ablation.** Le test WhatsApp initial
affirmait qu'un jeton non configuré refuse « tout », avec une seconde assertion sur un jeton vide.
Ablation de la clause `$token === ''` du contrôleur : le test reste **vert**. Ce n'est pas cette
clause qui tient la porte — `hash_equals('', $candidat)` rend déjà `false` pour tout candidat non
vide, et un jeton vide ne satisfait pas le paramètre de route, donc la seconde assertion testait le
routage, pas la garde. Le test a été réduit à ce qu'il prouve réellement, et son docblock le dit.
*Un test vert ne prouve rien tant qu'on ne l'a pas vu rougir.*

**Correction du périmètre en cours de route.** Le ticket demandait de déclarer les clés dans
`.env.preview` et `.env.prod`. Ces fichiers sont ignorés par git et absents en CI : la garde aurait
cassé le build sur des fichiers qui n'existent pas. Ils sont désormais *signalés sans bloquer*, et
leur remplissage est renvoyé à TCK-288 — qui dépend de ce ticket, ce que le frontmatter dit déjà.
