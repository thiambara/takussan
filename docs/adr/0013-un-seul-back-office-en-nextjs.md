# ADR-0013 — Il n'y a qu'un back-office, et il est en Next.js

- **Statut** : Accepté
- **Date** : 2026-08-15
- **Remplace** : la non-décision inscrite au tableau de `README.md` (« Filament v4 conservé pour une
  seule ressource »), qui ne vivait nulle part

## Contexte

Le dépôt portait **deux** administrations. La première, en Next.js, couvre 36 pages réparties sur
deux surfaces : `/admin/*` (10 pages) pour l'admin d'agence sur **son** agence, et `/super-admin/*`
(26 pages) pour l'équipe Takussan sur **la plateforme**. C'est celle que `docs/features.md` décrit.

La seconde était un panel **Filament v4** monté sur `/admin` du domaine de l'API — vestige du premier
échafaudage (`docs/superpowers/plans/2026-04-16-mvp-implementation.md`, tâche 8, MVP-004), à une
époque où le front n'existait pas et où il fallait saisir des annonces à la main. Il n'a jamais
grandi : **une seule Resource** (`Property`), six fichiers, aucun commit depuis quatre mois.

Le fait que les deux s'appellent `/admin` a rendu le sujet illisible — y compris pour l'auteur de ce
dépôt, qui a demandé une re-vérification avant de trancher. *Deux choses qui portent le même nom
finissent par être discutées comme si elles n'en faisaient qu'une.*

**Le diagnostic d'origine était faux, et il faut le dire.** L'ardoise (D-41) et le ticket TCK-287
concluaient « surface d'administration exposée » **à partir de deux absences** : pas de middleware
`super-admin` sur le panel, et `User` n'implémentant pas `FilamentUser`. Les deux absences sont
réelles ; la conclusion ne l'était pas, parce que personne n'avait lu ce que Filament fait quand
l'interface manque :

```php
// vendor/filament/filament/src/Http/Middleware/Authenticate.php:32-39
// Security: If the user model does not implement `FilamentUser`,
// access is only allowed in local environments.
abort_if(
    $user instanceof FilamentUser ? (! $user->canAccessPanel($panel))
                                  : (config('app.env') !== 'local'),
    403,
);
```

Le panel était donc **fail-closed** : 403 pour tout utilisateur authentifié dès que `APP_ENV` vaut
autre chose que `local` — `staging` et `production` comprises. L'interface manquante fermait la
porte que le middleware manquant était censé avoir laissée ouverte.

L'arbitrage réel n'était donc pas « supprimer ou sécuriser » mais **« supprimer ou assumer »**, et
« assumer » aurait voulu dire implémenter `canAccessPanel()` — c'est-à-dire **ouvrir** hors local un
panel aujourd'hui fermé. Le sécuriser à moitié aurait été strictement pire que de ne rien faire.

Le coût, lui, était réel et n'avait jamais été chiffré : **29 paquets composer exclusifs** (tout
`livewire/livewire`, `blade-ui-kit`, `openspout`, `tiptap-php`, `highlight.php`…) déclarés en
`require` et donc **installés en production**, plus **37 fichiers d'assets compilés, 4,12 Mo**,
suivis par git et republiés à chaque déploiement.

## Décision

**Le panel Filament est supprimé. L'administration de Takussan est en Next.js, et il n'y en a
qu'une.** Aucun back-office PHP ne sera réintroduit sans un ADR qui remplace celui-ci.

La raison de fond n'est pas le poids : c'est la **cohérence du modèle d'autorisation**. Le principe
n°1 du dépôt veut qu'une capacité se juge toujours pour un couple *(utilisateur, agence)*, l'agence
étant la frontière d'isolation (ADR-0002, ADR-0003). Un panel d'administration transverse, qui
présente les biens de toutes les agences derrière une session Blade sans profil actif, n'a pas de
place dans ce modèle — il faudrait lui réinventer une autorisation parallèle, et ce dépôt paie déjà
cher ses conventions concurrentes.

## Conséquences

**Ce qui disparaît** : `app/Filament/` (6 fichiers) et `app/Providers/Filament/AdminPanelProvider.php` ;
les racines `filament/filament` et `filament/spatie-laravel-media-library-plugin` et leurs 29 paquets
exclusifs ; les 37 fichiers de `public/{css,js,fonts}/filament/` ; l'entrée de
`bootstrap/providers.php` ; et `@php artisan filament:upgrade` du `post-autoload-dump` de
`composer.json`.

**Cette dernière ligne était le vrai piège.** Elle s'exécute à *chaque* `composer install`, donc en
CI et pendant le déploiement. Retirer le paquet sans elle aurait fait échouer toute installation
ultérieure sur une commande introuvable — panne invisible en local, où `vendor/` est déjà peuplé, et
donc découverte au pire moment. **Retirer une dépendance, c'est aussi retirer ce qu'on avait branché
sur son cycle de vie.**

**Trois paquets transitifs ressemblaient à des dépendances vivantes ; vérifié avant de supprimer.**
Le 2FA passe par `pragmarx/google2fa` et `bacon/bacon-qr-code`, tous deux déclarés *directement* en
`require` — le paquet emporté, `pragmarx/google2fa-qrcode`, est un homonyme jamais importé
(`app/Services/Auth/TwoFactorService.php:6-12`). Les exports passent par `maatwebsite/excel` ;
`openspout` avait 0 usage. Les 28 autres : 0 import dans `app/`, `config/`, `database/`, `tests/`,
`routes/`.

**La chaîne npm/Vite de l'API reste.** Elle ne servait pas Filament : elle construit
`resources/css/app.css` et `resources/js/app.js` pour `welcome.blade.php`. Confondre les deux aurait
fait supprimer un maillon encore utilisé du déploiement.

**Aucun test ne visait `/admin`** (hors `/api/admin/*`, qui est l'API de la console super-admin et
n'a aucun rapport). La suppression ne retire donc aucune couverture.

## Application

- `docs/backlog/tickets/TCK-287-filament-supprimer-ou-securiser.md` — le ticket, dont l'intitulé
  portait la prémisse fausse.
- `docs/ardoise.md` D-41 — le diagnostic d'origine, sa correction, puis son solde.
- `takussan-api/CLAUDE.md`, section « Il n'y a pas de back-office PHP » — qui nomme aussi les trois
  surfaces appelées « admin », pour que la confusion ne se rejoue pas.
- `docs/configuration.md` §2 et §3.16.
