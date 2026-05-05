---
id: TCK-172
title: Paiement passerelle (Wave / Orange Money / Stripe) — flow customer côté acompte, solde, loyer
status: review
phase: P2
family: applicatif
estimate: L
created: 2026-05-05
updated: 2026-05-05
depends_on: [TCK-171]
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#15-leasepayment
tags: [back, front, payments, integration]
---

## Objectif utilisateur

Le locataire/acheteur doit pouvoir payer son acompte, son solde de réservation et son loyer mensuel directement depuis l'app via une passerelle externe (Wave, Orange Money, Stripe), avec un suivi de statut automatique et une quittance/reçu téléchargeable.

## Contrat de données

État actuel (smoke test 2026-05-05) :

- `/app/bookings/[id]` et `/app/leases/[id]` n'exposent qu'un bouton « Enregistrer un paiement » qui ouvre une modale **manuelle** (Montant / Type / Moyen `Espèces, Wave, …` / ID transaction / Notes / Enregistrer). Ce flow est conçu pour un agent qui encaisse en cash et saisit la trace — pas pour un client qui paie en ligne.
- Aucune redirection vers la passerelle, aucune callback URL `/app/payments/return`, aucun statut auto-mis à jour, aucune quittance PDF générée.
- Tables existantes : `booking_payments`, `lease_payments` (vues côté smoke test, schéma à confirmer dans `models-spec.md`).

Endpoints à créer / étendre :

- POST `/api/bookings/{booking}/payments/checkout` → renvoie l'URL de redirection passerelle (Wave / OM / Stripe selon `provider` reçu).
- POST `/api/leases/{lease}/payments/checkout` → idem pour un loyer mensuel.
- GET `/api/payments/{payment}/receipt.pdf` → quittance PDF.
- Webhook(s) passerelle pour confirmer le paiement et mettre à jour `status`.
- Page `/app/payments/return` côté Next : page de retour de passerelle qui affiche succès / annulation / échec.

## Contraintes strictes (métier)

- L'utilisateur ne doit jamais être débité côté navigateur — la création du paiement et l'appel passerelle se font côté serveur (server action / API).
- Le statut local d'un paiement passe à `succeeded` **uniquement** quand le webhook passerelle confirme — pas sur le simple retour navigateur (qui peut être mocké).
- Un paiement annulé ou échoué n'altère pas le statut de la réservation/du bail.
- La quittance PDF n'est générée que pour les paiements `succeeded` et porte la mention « acquittée » + référence.
- Le total réservation = somme des paiements `succeeded` ; le solde restant = `total_amount - sum(succeeded)`.
- La pénalité de retard (s'il y en a, cf. `late_fee_percent` sur leases) doit être proposée comme ligne additionnelle au moment du paiement.

## Delta à produire

- [ ] Service `App\Services\Payments\PaymentGatewayRouter` (interface + 3 implémentations Wave / OM / Stripe — au minimum sandbox configurable).
- [ ] Endpoints POST `bookings.payments.checkout`, `leases.payments.checkout` qui créent une ligne `booking_payments`/`lease_payments` au statut `pending`, appellent la passerelle, renvoient l'URL.
- [ ] Webhook handler générique avec vérification de signature par provider, mise à jour du `status` et de `confirmed_at` du paiement, fire des notifications.
- [ ] Page `/app/payments/return` (succès / cancel / fail).
- [ ] Génération PDF quittance (helper `PaymentReceiptPdf` + endpoint download).
- [ ] Frontend : remplacer (côté customer) le bouton « Enregistrer un paiement » par CTA `Payer l'acompte` / `Payer le solde` (sur `/app/bookings/[id]`) et `Payer le loyer` sur chaque ligne d'échéancier (`/app/leases/[id]`).
- [ ] Frontend : `/app/payments` (déjà câblé après TCK-168) doit lister les paiements customer avec lien quittance PDF + filtre par méthode / statut + export CSV.
- [ ] Tests : feature tests Laravel des 3 endpoints checkout, du webhook (provider mock), de la génération PDF.

## Critères d'acceptation

- [ ] Un customer cliquant `Payer l'acompte` sur une booking `confirmed` est redirigé vers une URL externe de la passerelle choisie.
- [ ] Après confirmation passerelle (sandbox), `/app/payments/return` affiche succès, le statut booking passe à `acompte payé`, le paiement apparaît dans la timeline et dans `/app/payments`.
- [ ] Un paiement annulé côté passerelle revient sur `/app/payments/return?status=cancelled` sans débit, statut booking inchangé.
- [ ] La quittance PDF d'un paiement `succeeded` se télécharge avec entête, locataire, période, montant, mention « acquittée » + référence.
- [ ] Un échéancier de loyer en retard propose la pénalité dans le récap avant paiement.
- [ ] L'export CSV de `/app/payments` retourne les colonnes attendues (entité, montant, devise, statut, date, méthode, référence).

## Hors périmètre

- Côté agent : workflow de saisie manuelle de paiement cash (déjà existant — pas régressé par ce ticket).
- Réconciliation bancaire (TCK-109).
- Multi-devises (P2 plus tard).
- 3DS / SCA spécifiques Stripe (à traiter au moment de l'intégration prod).

## Notes d'implémentation

L'infrastructure passerelle (drivers Wave / Orange Money / Lemon Squeezy, `PaymentGatewayService`, `PaymentWebhookController`, `PayOnlineButton`, `PaymentProviderPicker`) existait déjà avant ce ticket (TCK-079 et suivants).

### Ce qui a été livré
- **Backend** : `PaymentController::authorizeBookingManage` / `authorizeLeaseManage` et `BookingPaymentController::authorizeBookingManage` étendus pour autoriser le customer (`booking.customer.user_id === user.id` / `lease.tenant.user_id === user.id`) à créer une ligne de paiement `pending` sur sa propre booking/bail.
- **Backend** : `BookingPaymentController::store` accepte `status` ; force `pending` + nettoie `payment_method`/`paid_at` quand l'appelant est le customer (et pas un staff). Empêche un client de marquer un paiement directement comme `paid`.
- **Backend** : nouveau service `App\Services\Payments\PaymentReceiptPdf` (Dompdf direct) + view Blade `payments/receipt.blade.php` + endpoint `GET /api/booking-payments/{payment}/receipt` qui rend la quittance PDF d'un paiement `paid`. Quittance lease déjà existante (`leases/{lease}/receipts/{payment}/pdf`).
- **Frontend** : `BookingDetail` ajoute le composant `CustomerPayCta` qui calcule le pas suivant (acompte vs solde), crée la ligne de paiement `pending` puis laisse `PayOnlineButton` enchaîner avec la passerelle. Affiche un lien `Quittance PDF` sur chaque paiement `paid`.
- **Frontend** : la modale agent « Enregistrer un paiement » est désormais cachée pour les customers (cf. TCK-171).

### Hors scope (à reporter)
- **CSV export** côté `/app/payments` — l'endpoint `payments/history` n'a pas encore de `format=csv` ; à filer dans un nouveau ticket P2.
- **Pénalité de retard** proposée comme ligne additionnelle au moment du paiement loyer — la spec le prévoit mais nécessite un endpoint `GET /api/leases/{lease}/payments/{payment}/quote` qui n'existe pas.
- **Lease customer CTA** : `LeasePaymentController::store` n'a pas été élargi (équivalent backend du flow booking) ; à porter au moment où la fiche bail accueille un CTA `Payer le loyer` côté tenant.
- **Test feature** sur le scénario customer (`POST /api/bookings/{id}/payments` + assertion status=`pending`) — à ajouter quand on stabilisera le périmètre lease.
