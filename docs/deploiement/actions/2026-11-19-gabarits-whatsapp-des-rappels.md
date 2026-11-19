---
titre: "Rendre conformes puis faire approuver les gabarits WhatsApp des rappels de loyer et de visite, et celui des alertes de recherche"
type: externe
tickets: [TCK-599, TCK-615, TCK-2980]
cles: [SEARCH_ALERTS_WHATSAPP_ENABLED]
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

La base porte neuf gabarits WhatsApp qu'**aucun compte Meta ne connaît** : `takussan_lease_payment_due_soon`,
`takussan_lease_payment_overdue` et `takussan_visit_reminder`, chacun en `fr`, `en` et `wo`.

1. **Code d'abord** : leurs corps enfreignent les règles de Meta (relevé ci-dessous) — un corps ne finit pas sur une
   variable, et ne porte pas plus d'une variable pour trois mots. Les réécrire par migration, comme 298600 l'a fait
   pour le pont, avec le test `GabaritsDuPontConformesAMetaTest` étendu.
2. `wo` : décision du porteur, le wolof étant en pause : les lignes `wo` se soumettent-elles, et dans quelle langue Meta.
3. Soumettre `fr` et `en` sur le compte de chaque environnement, comme le pont (E bis de
   `2026-11-19-ouvrir-le-pont-whatsapp.md`).
4. Le gabarit `utility` des alertes de recherche (TCK-599, TCK-615) : l'approuver, puis seulement
   `SEARCH_ALERTS_WHATSAPP_ENABLED=true`, puis un envoi réel.

## Comment vérifier

Chaque gabarit `APPROVED` dans WhatsApp Manager ; un rappel réel reçu.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : corps `Takussan : loyer de {{1}} dû le {{2}}. Payer : {{3}}` (finit sur `{{3}}`), `… en retard de {{2}} jours. Payer : {{3}}` (idem), `Takussan : visite de {{1}} le {{2}}.` (2 variables pour 5 mots) ; aucun de ces noms sur le compte Takussan, qui porte les six du pont (PENDING) et `otp_connexion` (APPROVED) ; `SEARCH_ALERTS_WHATSAPP_ENABLED=false`
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · idem
