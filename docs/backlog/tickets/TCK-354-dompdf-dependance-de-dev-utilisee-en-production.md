---
id: TCK-354
title: "Le reçu de paiement PDF ne peut pas se générer sur un environnement déployé : `dompdf/dompdf` est une dépendance de dév"
status: todo
phase: P1
family: bug
estimate: S
wave: null
created: 2026-08-24
updated: 2026-08-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#6-bookingpayment
tags: [back, paiements, pdf, dependances, deploiement, dette]
---

## Objectif utilisateur

Qu'un gestionnaire puisse télécharger le reçu PDF d'un paiement depuis la préproduction et,
demain, depuis la production — pas seulement depuis un poste de développement.

## Ce que la mesure a établi (2026-08-24)

Trouvé en balayant, pour TCK-353, les autres usages d'une dépendance de dév depuis le code de
production. C'est **la même classe de défaut**, sur un chemin qui, lui, est exposé en HTTP.

```
$ grep -rn "Dompdf" takussan-api/app/
app/Services/Payments/PaymentReceiptPdf.php:7:  use Dompdf\Dompdf;
app/Services/Payments/PaymentReceiptPdf.php:71:  $dompdf = new Dompdf($options);

$ php -r '…' composer.lock
dompdf/dompdf en prod : False
dompdf/dompdf en dev  : True

# sur la préproduction, sur la release EN SERVICE
$ ssh takussan 'cd /var/www/takussan-preview/current && php -r "require \"vendor/autoload.php\";
                var_dump(class_exists(\"Dompdf\\\\Dompdf\"));"'
bool(false)
```

`App\Http\Controllers\Api\BookingPaymentController::receipt()` prend `PaymentReceiptPdf` en
injection de constructeur : la classe est donc résolue à chaque appel de la route, et
`new Dompdf(…)` lève une `Error` fatale. Sur tout environnement produit par `deploy.sh`
(`composer install --no-dev`), le téléchargement d'un reçu rend **500**.

> `dompdf/dompdf` n'est pas déclaré dans `composer.json` du tout — ni en `require`, ni en
> `require-dev`. Il n'arrive en dév que **transitivement**, par `phpoffice/phpspreadsheet` et
> `spatie/laravel-pdf`, qui le posent tous deux en `require-dev`. C'est ce qui rend le défaut
> invisible localement : *une dépendance qu'on n'a pas demandée est disponible en dév et absente
> en production, et rien dans le dépôt ne nomme l'écart.*

Aucun test ne l'attrape, et c'est cohérent : la suite tourne avec les dépendances de dév
installées. **Un test ne peut pas voir cette classe de défaut — seule une garde qui lit
`composer.lock` le peut.**

## Contraintes strictes (métier)

- **Ne pas remplacer le PDF par autre chose** parce que ce serait plus court. La vue
  `payments/receipt.blade.php` est la source unique du reçu (cf. l'en-tête de
  `PaymentReceiptPdf`) ; ce ticket règle la disponibilité du moteur, pas le format du document.
- **Ne pas se contenter d'attraper l'erreur** pour rendre un 503 propre. Un reçu qui ne se génère
  jamais reste un reçu qui ne se génère jamais ; l'endpoint doit fonctionner.
- Si le choix se porte sur `spatie/laravel-pdf` (déjà en dépendance de **production**), noter
  qu'il s'appuie sur Browsershot/Chromium — **rien ne dit que le VPS en dispose**, et le supposer
  serait refaire l'erreur de ce ticket un cran plus loin. À **mesurer** sur le serveur avant de
  trancher, pas à déduire de `composer.json`.

## Delta à produire

- [ ] Trancher entre : déclarer `dompdf/dompdf` en `require` de `composer.json` (le moteur devient
      explicite et livré), ou passer le reçu à `spatie/laravel-pdf` — après avoir mesuré ce dont
      le serveur dispose
- [ ] Un test qui échoue quand le moteur PDF est absent — donc qui vérifie sa **disponibilité**
      (`class_exists`), pas seulement que la route rend un PDF sur un poste où tout est installé
- [ ] Une garde `scripts/check-deps-dev-atteignables.mjs` : pour chaque `use <Namespace>\…` de
      `takussan-api/app/`, si le paquet qui fournit ce namespace est dans `packages-dev` de
      `composer.lock` et non dans `packages`, échouer en nommant le fichier
- [ ] Brancher la garde dans `.github/workflows/repo-ci.yml`, déclencheurs `takussan-api/app/**`,
      `takussan-api/composer.lock` et `scripts/**`
- [ ] Vérifier sur la préproduction, après correctif, que la route rend bien un PDF

## Critères d'acceptation

- [ ] `GET` du reçu d'un paiement rend un PDF sur la **préproduction** — mesuré par une requête
      réelle, pas déduit d'un test local
- [ ] La garde, **vérifiée par ablation** : remise dans l'état d'avant (Dompdf en dév seulement),
      elle doit échouer en nommant `app/Services/Payments/PaymentReceiptPdf.php`. Une garde qui
      n'a jamais été vue rouge sur le défaut qu'elle vise n'est pas vérifiée
- [ ] La garde ne rend aucun faux positif sur le reste de `app/` (elle passe sur `dev` une fois
      le correctif posé)
- [ ] `fakerphp/faker` reste en `require-dev` — la garde ne doit pas pousser à tout remonter en
      production ; elle ne lit que `app/`, où les seeders n'entrent pas

## Hors périmètre

- Le contenu et la mise en page du reçu
- TCK-353 (peupler un environnement déployé) : même classe de défaut, autre chemin, autre remède
- Les autres paquets de `require-dev` qui ne sont atteints par aucun `use` de `app/` — la garde
  les couvrira le jour où l'un le sera

## Notes d'implémentation

_(à remplir par implementing-specs)_
