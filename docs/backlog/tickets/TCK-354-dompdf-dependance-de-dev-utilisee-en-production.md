---
id: TCK-354
title: "Le reçu de paiement PDF ne peut pas se générer sur un environnement déployé : `dompdf/dompdf` est une dépendance de dév"
status: done
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

## Le pilote PDF ne suffit pas, et le service central existait déjà — mesuré le 2026-08-24

Question posée : puisque la préproduction et la production visent `LARAVEL_PDF_DRIVER=cloudflare`,
Dompdf devient-il inutile ? **Non — parce que ce chemin-ci n'a jamais consulté le pilote.**

```
$ ssh takussan 'cd /var/www/takussan-preview/current && php artisan tinker --execute="…"'
driver configure : cloudflare
paiement de test : 1
ECHEC : Error — Class "Dompdf\Options" not found
```

Le serveur déclare **déjà** `LARAVEL_PDF_DRIVER=cloudflare`, avec ses identifiants, et le reçu
échoue quand même. `PaymentReceiptPdf::renderPdf()` fait `new Options` puis `new Dompdf($options)`
en dur : aucune valeur d'environnement ne peut l'atteindre.

Le pilote, lui, **fonctionne** — vérifié séparément sur la même release :

```
$ Spatie\LaravelPdf\Facades\Pdf::html("<h1>Essai Takussan</h1>")->save(…)
RENDU OK : 16396 octets
entete : %PDF-1.4
```

**Et il ne s'agit même pas d'ajouter un chemin : il en existe déjà un.**
`App\Services\Pdf\DocumentPdfService` (TCK-077) est le service central de rendu, passe par la
façade, impose le gabarit commun `pdf.layouts.base`, et sait déjà rendre, diffuser et **stocker**
un PDF en `Document` via medialibrary. Son propre docblock annonce que *« New templates only
require a Blade file; no code change here »*. Il porte même déjà un gabarit de reçu :
`resources/views/pdf/receipts/rent.blade.php`.

`PaymentReceiptPdf` (TCK-172) a donc redéveloppé le mécanisme à côté, avec son propre gabarit
`payments/receipt.blade.php` et son propre moteur. **Il y a deux implémentations du reçu**, et
c'est celle qui a contourné le service central qui est cassée en déploiement.

> *Un réglage ne corrige que le code qui le lit, et une abstraction ne protège que les appelants
> qui passent par elle.* Le pilote configuré et le pilote réellement employé divergent ici sans
> qu'aucun fichier ne se contredise — même forme que TCK-353, un cran plus haut.

**Ce que ça tranche.** Il n'y a plus d'arbitrage à faire : router le reçu par `DocumentPdfService`
fait disparaître Dompdf du graphe de production sans rien déclarer de neuf dans `composer.json`, et
supprime au passage un doublon. La suite de tests continue d'employer dompdf — `phpunit.xml` force
`LARAVEL_PDF_DRIVER=dompdf` et le paquet reste disponible en dév, ce qui est exactement sa place.
*Le paquet n'a pas besoin d'être promu ; il a besoin d'être appelé par le seul chemin qui sait dans
quel environnement il tourne.*

## Contraintes strictes (métier)

- **Ne pas remplacer le PDF par autre chose** parce que ce serait plus court. La vue
  `payments/receipt.blade.php` est la source unique du reçu (cf. l'en-tête de
  `PaymentReceiptPdf`) ; ce ticket règle la disponibilité du moteur, pas le format du document.
- **Ne pas se contenter d'attraper l'erreur** pour rendre un 503 propre. Un reçu qui ne se génère
  jamais reste un reçu qui ne se génère jamais ; l'endpoint doit fonctionner.
- **Ne pas supposer que le pilote configuré est celui qui rend.** La contrainte écrite ici à la
  création — « `spatie/laravel-pdf` s'appuie sur Browsershot/Chromium, rien ne dit que le VPS en
  dispose » — était juste dans sa prudence et fausse dans son objet : le pilote retenu est
  `cloudflare`, qui ne demande ni Chromium ni Node, seulement deux identifiants. C'est la mesure
  qui l'a dit, pas `composer.json`.
- `CurrencyPdfRegressionTest` compare l'octet-à-octet d'une sortie **dompdf**. Le changement passe
  par le pilote, pas par la classe, donc la suite doit continuer de rendre avec dompdf — à
  vérifier, pas à supposer.

## Delta à produire

- [ ] Router `PaymentReceiptPdf` par `App\Services\Pdf\DocumentPdfService` — **tranché par la
      mesure ci-dessus**, plus par un arbitrage. Ne pas déclarer `dompdf/dompdf` en `require` :
      ce serait livrer un moteur que la production n'emploiera pas
- [ ] Décider du sort des DEUX gabarits — `payments/receipt.blade.php` (celui du contournement) et
      `pdf/receipts/rent.blade.php` (celui du service central). Converger, ou dire pourquoi non
- [x] ~~Un test qui échoue quand le moteur PDF est absent~~ — **abandonné, et c'est le bon
      résultat** : la suite tourne avec les dépendances de dév installées, donc aucun test ne peut
      distinguer « disponible ici » de « livré ». Un `class_exists` dans un test serait vert des
      deux côtés. C'est la garde qui porte la vérification, et elle seule
- [x] Une garde `scripts/check-deps-dev-atteignables.mjs` : pour chaque `use <Namespace>\…` de
      `takussan-api/app/`, si le paquet qui fournit ce namespace est dans `packages-dev` de
      `composer.lock` et non dans `packages`, échouer en nommant le fichier
- [x] Brancher la garde dans `.github/workflows/repo-ci.yml`, déclencheurs `takussan-api/app/**`,
      `takussan-api/composer.lock` et `scripts/**`
- [ ] Vérifier sur la préproduction, après correctif, que la route rend bien un PDF

## Critères d'acceptation

- [ ] `GET` du reçu d'un paiement rend un PDF sur la **préproduction** — mesuré par une requête
      réelle, pas déduit d'un test local
- [x] La garde, **vérifiée par ablation** : remise dans l'état d'avant (Dompdf en dév seulement),
      elle doit échouer en nommant `app/Services/Payments/PaymentReceiptPdf.php`. Une garde qui
      n'a jamais été vue rouge sur le défaut qu'elle vise n'est pas vérifiée
- [x] La garde ne rend aucun faux positif sur le reste de `app/` (elle passe sur `dev` une fois
      le correctif posé)
- [x] `fakerphp/faker` reste en `require-dev` — la garde ne doit pas pousser à tout remonter en
      production ; elle ne lit que `app/`, où les seeders n'entrent pas

## Hors périmètre

- Le contenu et la mise en page du reçu
- TCK-353 (peupler un environnement déployé) : même classe de défaut, autre chemin, autre remède
- Les autres paquets de `require-dev` qui ne sont atteints par aucun `use` de `app/` — la garde
  les couvrira le jour où l'un le sera

## Notes d'implémentation

**Le correctif tient en une délégation** : `PaymentReceiptPdf` prend `DocumentPdfService` au lieu de
`ViewFactory`, et `renderPdf()` disparaît avec les deux `use Dompdf\…`. Le gabarit
`payments/receipt.blade.php` est inchangé — converger avec `pdf/receipts/rent.blade.php` change ce
que l'utilisateur voit sur un document officiel, et ce n'est pas une décision à prendre en passant.
Elle reste ouverte dans le delta.

**`forLeasePayment()` n'a AUCUN appelant.** Mesuré : `grep -rn "forLeasePayment" app/ routes/` ne
rend que sa propre déclaration. Le reçu de bail est servi par `DocumentPdfController` avec
`pdf.receipts.rent`, c'est-à-dire par le service central — il y a donc **deux implémentations du
reçu, et celle qui était cassée était à moitié morte**. La méthode est conservée telle quelle,
corrigée comme sa sœur : la supprimer est un autre geste, avec un autre risque.

**La garde ne pouvait pas être un test, et c'est le cœur du ticket.** La suite tourne avec les
dépendances de développement installées : un test qui appelle le reçu est vert en local, vert en CI,
et la production rend 500. Un `class_exists("Dompdf\Dompdf")` dans un test serait vert lui aussi.
*Seule une lecture de `composer.lock` distingue « disponible ici » de « livré ».* Le point du delta
qui demandait un test a donc été abandonné au profit de la garde — pas oublié.

**L'index namespace→paquet est dérivé du lock**, jamais écrit à la main : `autoload.psr-4` et
`psr-0` de chaque paquet, le préfixe le plus long gagnant, `packages` écrasant `packages-dev` pour
qu'un paquet présent des deux côtés compte comme livré. L'`autoload-dev` du dépôt (`Tests\`) y entre
au même titre — même interdit, autre source. Trois planchers de non-vacuité font rougir la garde si
le lock devient illisible, si l'index se vide, ou si l'appariement cesse de résoudre : *une garde qui
passe parce qu'elle ne trouve plus sa cible est pire qu'aucune garde.*

**Vérification par ablation, 2026-08-24.** Version d'avant remise en place → rouge, nommant
`app/Services/Payments/PaymentReceiptPdf.php:7` et `:8`, les deux imports. Version corrigée → vert,
4506 imports de `app/` résolus vers 22 paquets, aucun en `require-dev`.

**Tests** : `BookingPaymentTest`, `ReceiptPdfTest`, `CurrencyPdfRegressionTest` — 25 verts, 70
assertions. `CurrencyPdfRegressionTest` compare l'HTML pré-compilation et non le binaire, il ne
dépendait donc pas du moteur ; la crainte inscrite dans les contraintes n'avait pas lieu d'être, ce
que seule la lecture du test a pu dire.
