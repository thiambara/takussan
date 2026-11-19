---
titre: "Vérifier le domaine d'envoi chez Resend (DKIM, SPF, DMARC) et recevoir un vrai courriel signé"
type: externe
tickets: [TCK-517]
cles: [RESEND_API_KEY, MAIL_FROM_ADDRESS]
creee: 2026-11-19
preview: sans-objet
production: a-faire
---

## Quoi faire

[Plan, F3, étape 2 bis](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md) : domaine vérifié dans Resend, DKIM et `send.` (MX, SPF) chez Cloudflare, DMARC
`p=none`. Sans lui, `MAIL_MAILER=resend` part en production et les courriels (codes, invitations, quittances)
tombent en indésirables ou sont refusés.

## Comment vérifier

Un courriel réel reçu dont l'en-tête porte `dkim=pass` et `dmarc=pass`.

## Historique

- 2026-11-19 · preview · sans-objet · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : `MAIL_MAILER=log` en préproduction, aucun courriel ne part
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : la zone n'a aucun enregistrement `send.` ni DMARC
