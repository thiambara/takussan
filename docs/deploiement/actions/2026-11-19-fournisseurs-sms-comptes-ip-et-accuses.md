---
titre: "Ouvrir les fournisseurs SMS : identifiants en console, plages d'IP des accusés, URL d'accusé déclarées, envoi réel"
type: externe
tickets: [TCK-620, TCK-943, TCK-720]
cles: [SMS_ORANGE_WEBHOOK_IPS, SMS_MTARGET_WEBHOOK_IPS, SMS_LAM_WEBHOOK_IPS, SMS_ORANGE_WEBHOOK_URL_TOKEN, SMS_MTARGET_WEBHOOK_URL_TOKEN, SMS_LAM_WEBHOOK_URL_TOKEN, PHONE_LOGIN_ENABLED]
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

ADR-0033 et TCK-620 : **n'allumer la connexion par téléphone qu'après un envoi réel mesuré**.

1. Saisir les identifiants d'envoi de chaque fournisseur dans la console des intégrations (ce ne sont pas des clés
   d'environnement).
2. Demander à Orange, MTarget et LAfricaMobile leurs plages d'IP d'accusés : vides en production, chaque accusé
   reçoit un 403 sans bruit (ardoise D-49 ; [plan, F3, étape 1](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md)).
3. Déclarer l'URL d'accusé, avec son jeton, chez MTarget et Orange (TCK-943) ; LAfricaMobile la reçoit avec chaque SMS.
4. Un envoi réel, et son accusé accepté.

## Comment vérifier

Un code reçu sur un vrai téléphone ; l'accusé passe le message à `delivered`.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : `PHONE_LOGIN_ENABLED=true` alors que la table `integrations`, où les pilotes SMS lisent leurs identifiants (`IntegrationLocator`), ne porte aucune ligne SMS (seulement 4 Wave et 4 Orange Money) ; `SMS_*_WEBHOOK_IPS` vides ; jetons par fournisseur posés (2026-10-18)
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · comptes, plages et jetons neufs à poser
