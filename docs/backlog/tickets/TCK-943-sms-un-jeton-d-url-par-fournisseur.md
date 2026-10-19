---
id: TCK-943
title: "Accusés SMS : un jeton d'URL par fournisseur, repli sur la clé commune le temps de la bascule — le jeton de LAM n'ouvre plus Orange ni Mtarget"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#69-notificationdeliveryattempt-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-36--webhooks-de-statut-sms-et-whatsapp"
tags: [back, sms, webhooks, securite, env, pistes]
---

## Contexte

Piste P36.04 (angle 36). Les trois routes d'accusés SMS (Orange, Mtarget, LAfricaMobile)
comparaient le même `sms.webhook_url_token`, et le pilote LAM l'écrit en clair dans le `ret_url` de
chaque SMS : il circule chez LAM, dans ses journaux et ses tableaux de bord. Le mesureur l'a établi
le 2026-10-17 : le jeton extrait d'un `ret_url` réel, posté sur la route d'Orange, y fait appliquer
un `DeliveredToTerminal` (200, tentative `delivered`). La rotation d'un jeton fuité chez LAM
obligeait aussi à reconfigurer Orange et Mtarget.

Décision du porteur (ligne Statut de la piste), recopiée mot pour mot :

> porteur (2026-10-18) : traité hors agents, en session : un jeton par fournisseur, avec repli sur la clé commune le temps de la bascule

## Objectif utilisateur

Le porteur peut faire tourner le jeton d'un fournisseur sans toucher aux deux autres, et un jeton vu
chez LAM n'authentifie plus d'accusé sur la route d'un autre opérateur.

## Delta à produire

- `config/sms.php` : `webhook_url_tokens.{orange,mtarget,lafricamobile}`, lus en `env('…', '')` :
  `SMS_ORANGE_WEBHOOK_URL_TOKEN`, `SMS_MTARGET_WEBHOOK_URL_TOKEN`, `SMS_LAM_WEBHOOK_URL_TOKEN`
  (style des voisins `SMS_{ORANGE,MTARGET,LAM}_WEBHOOK_IPS`).
- `App\Services\Notifications\Sms\SmsWebhookUrlToken` : le jeton du fournisseur s'il est posé, sinon
  `sms.webhook_url_token` ; comparaison `hash_equals`, échec fermé sur un jeton vide.
- Les trois contrôleurs d'accusés SMS passent par lui ; le pilote LAM écrit dans le `ret_url` le
  jeton de LAM, et son avertissement « envoi sans accusé » nomme les deux clés.
- Les trois clés déclarées, vides, dans `takussan-api/.env.example` et `takussan-api/.env.docker`
  (gardes `check-webhook-env-keys`, `check-env-parity`).
- `docs/integrations/sms.md` et `docs/configuration.md` : un jeton par fournisseur, la clé commune
  comme repli.

## Critères d'acceptation

- [x] **AC1** — Le `ret_url` que le pilote LAM envoie porte le jeton de LAM, et ce jeton est refusé
      (404) sur les routes Orange et Mtarget, sans écrire la tentative. *Mesuré :
      `SmsWebhookTokenPerProviderTest::test_the_lam_ret_url_carries_the_lam_token_and_it_does_not_open_the_orange_route`
      vert (jeton extrait du `ret_url` capturé dans la requête sortante, pas reconstruit) ; ablation
      (`SmsWebhookUrlToken::for` ramené à la seule clé commune) → rouge.*
- [x] **AC2** — Le jeton propre d'un fournisseur, s'il est posé, est le seul accepté sur sa route :
      la clé commune et le jeton d'un autre fournisseur y rendent 404. *Mesuré :
      `test_each_route_accepts_its_own_token_only` vert ; même ablation → rouge (la clé commune
      passait sur Orange, 200 au lieu de 404).*
- [x] **AC3** — Repli : un jeton propre vide laisse la clé commune ouvrir les trois routes, et le
      `ret_url` de LAM la porte. *Mesuré : `test_an_empty_own_token_falls_back_to_the_common_token`
      vert ; ablation (repli retiré, `return $own`) → rouge.*
- [x] **AC3b** — L'état cible de la bascule : les trois jetons propres posés, la clé commune VIDE.
      Le `ret_url` de LAM porte toujours `jeton-lam` et son rappel passe ; Orange et Mtarget
      acceptent leur jeton, et la clé commune ou le jeton de LAM y rendent 404. *Mesuré :
      `test_own_tokens_alone_work_once_the_common_key_is_emptied` vert ; ablation (la garde
      « sans jeton → sans accusé » du pilote LAM, l. 70, ramenée à la seule clé commune) → rouge.
      Ajouté après la vérification adverse, qui avait trouvé cette garde régressable sans rouge.*
- [x] **AC4** — Aucun des deux posé : échec fermé (404). *Mesuré :
      `test_no_token_at_all_still_fails_closed` vert.*
- [x] **AC5** — Les trois clés sont déclarées dans les deux fichiers d'environnement. *Mesuré :
      `node scripts/check-webhook-env-keys.mjs` → « ✓ gardes webhook : 10 clés déclarées » ;
      `node scripts/check-env-parity.mjs` → vert.*
- [x] **AC6** — Les classes existantes des webhooks et des pilotes SMS restent vertes. *Mesuré :
      `php artisan test tests/Feature/Http/Webhook tests/Feature/Webhooks tests/Feature/Services/Sms …`
      → 248 verts.*

## Reste — réglages du porteur dans Dokploy (à rejoindre TCK-720)

Clés à poser, une valeur aléatoire distincte par fournisseur et par environnement (aucune valeur
ici) : `SMS_ORANGE_WEBHOOK_URL_TOKEN`, `SMS_MTARGET_WEBHOOK_URL_TOKEN`, `SMS_LAM_WEBHOOK_URL_TOKEN`.
Puis reporter l'URL de Mtarget (et d'Orange, à sa mise en service, P36.06) avec SON jeton dans le
tableau de bord du fournisseur ; LAM n'a rien à reconfigurer (le `ret_url` est produit par envoi).
`SMS_WEBHOOK_URL_TOKEN` peut être vidée une fois les trois posées. Ce reste est un acte de
déploiement : il ne retient pas le statut du ticket, qui porte sur le code.

## Hors périmètre

- L'abonnement d'Orange aux accusés (P36.06, plus tard, sur la documentation d'Orange).
- Le retrait de la clé commune : il suit la bascule, une fois les trois jetons posés partout.

## Notes d'implémentation

- Re-mesure (2026-10-18, avant code) : `grep -rn webhook_url_token app config` → les trois
  contrôleurs et le pilote LAM lisaient toujours `sms.webhook_url_token` ; le constat tenait.
- `WebhookReplayer` rejoue par `process()`, après l'authentification : il n'est pas concerné.
