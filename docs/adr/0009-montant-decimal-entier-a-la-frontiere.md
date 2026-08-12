# ADR-0009 — Le montant est décimal en base, entier ×100 à la frontière du driver de paiement

- **Statut** : Accepté
- **Date de la décision** : ~2026-04 · **Rédigé rétroactivement** : 2026-08-12

## Contexte

Les montants sont stockés en `decimal(14,2)` — un choix classique et sans surprise.

L'interface commune des drivers de paiement, elle, expose `initiate(..., int $amountCents, ...)` :
un entier en plus petite unité. C'est la convention de la plupart des passerelles internationales,
et elle évite les flottants sur le fil.

**Le problème est que le XOF n'a pas de sous-unité.** `Currency('XOF')->decimalPlaces()` vaut `0` :
1 000 F CFA, c'est mille, pas cent mille. Un montant multiplié par 100 pour entrer dans le contrat
générique doit donc être **re-divisé par 100** par chaque driver local avant d'atteindre l'API
d'Orange Money ou de Wave.

## Décision

**Le montant reste `decimal(14,2)` en base. Il devient un entier ×100 à la frontière du contrat
`PaymentDriverContract`. Tout driver dont la devise est à zéro décimale re-divise par 100 avant
d'appeler son fournisseur.**

Le contrat générique ne bouge pas : c'est ce qui permet à Lemon Squeezy (facturation SaaS, USD) et à
Wave (paiement local, XOF) de vivre derrière la même interface.

## Conséquences

**C'est un piège actif, et il est silencieux.** Un nouveau driver écrit sans la division facture
**cent fois** le montant. Rien ne l'attrape : le type est bon, la valeur est un entier plausible, et
l'erreur ne se voit qu'au relevé du client. C'est le genre de défaut dont le coût n'est pas
technique.

**La règle n'était écrite nulle part.** Jusqu'au 2026-08-12, sa seule trace était un commentaire
défensif dans `WaveDriver`. Aucune spec, aucun ADR, aucun test. Un contributeur qui ajoutait un
fournisseur n'avait aucune raison de la découvrir avant la production. C'est pour cette raison que
cette décision, pourtant ancienne et modeste, est classée **P0** dans l'ardoise (D-22).

**L'alternative écartée.** Passer le contrat en `Money` (un objet portant sa devise) supprimerait le
piège à la racine : la conversion deviendrait la responsabilité d'un seul objet, et un driver ne
pourrait plus se tromper d'échelle. Ce n'est pas fait, et c'est un chantier ouvert plutôt qu'un
refus.

## Application

- `database/migrations/2026_04_17_160012_create_booking_payments_table.php` — `decimal('amount', 14, 2)`.
- `app/Services/Payments/PaymentGatewayService.php` — la multiplication `×100`.
- `app/Contracts/Payments/PaymentDriverContract.php` — la signature `int $amountCents`.
- `app/Services/Payments/Drivers/{WaveDriver,OrangeMoneyDriver,LemonSqueezyDriver}.php`.
- **Aucune garde.** Le principe est rappelé dans `CLAUDE.md` (principe non négociable n°3) ; rien ne
  l'impose au code. Un test de contrat qui vérifierait, pour chaque driver, que le montant transmis
  au fournisseur correspond au montant en base dans la devise déclarée, serait la garde manquante.
