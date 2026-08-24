---
id: TCK-353
title: "Aucun environnement déployé ne peut être seedé : `deploy.sh` installe `--no-dev`, les seeders exigent Faker"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-08-24
updated: 2026-08-24
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [infra, deploiement, seeders, dependances, dette]
---

## Objectif utilisateur

Qu'on puisse peupler un environnement déployé — préproduction, démonstration, environnement de
recette — sans bricoler sur le serveur.

## Ce que la mesure a établi (2026-08-24)

Rencontré en peuplant la préproduction juste après la bascule PostgreSQL (ADR-0020) :

```
$ php artisan db:seed --force
  Database\Seeders\YearOfActivitySeeder .............................. RUNNING
In SeedingContext.php line 96:
  Class "Faker\Factory" not found
=== CODE DE SORTIE : 1 ===
```

L'enchaînement, et chaque maillon est correct pris isolément :

1. `scripts/deploy.sh` lance `composer install --no-dev` — ce qui est **juste** pour un déploiement.
2. `fakerphp/faker` est une dépendance de **développement** — ce qui est **juste** aussi.
3. Les 48 fichiers de seeders passent tous par `Database\Seeders\SeedingContext`, qui instancie
   `Faker\Factory`.

⇒ **`php artisan db:seed` est structurellement impossible sur toute release produite par cette
chaîne**, sur tous les environnements, depuis toujours. Ce n'est pas un effet de la bascule : le
défaut n'était simplement jamais apparu, la préproduction n'ayant jamais été re-peuplée après un
déploiement.

> *Trois décisions justes qui ne se contredisent nulle part dans le code produisent quand même une
> capacité absente.* Rien dans le dépôt ne l'écrit, et aucune garde ne peut l'attraper : le défaut
> ne vit dans aucun fichier, il vit entre trois.

**Le contournement effectivement employé le 2026-08-24**, pour mémoire et non comme solution : copie
de la release (`cp -a`, ce qui préserve les liens symboliques `.env` et `storage` vers le répertoire
partagé), `composer install` **avec** les dépendances de dev dans la copie, `db:seed` depuis la
copie, puis suppression. La release en service est restée `--no-dev` — vérifié par ablation
(`class_exists("Faker\Factory")` sur son autoloader → `false`). Résultat : 836 biens, 3431 médias,
0 échec, 30 min 42 s.

## Contraintes strictes (métier)

- **La release en service ne doit jamais porter les dépendances de dev.** Toute solution qui fait
  `composer install` sans `--no-dev` dans `current/` est refusée : elle change ce qui est déployé
  pour obtenir ce qui ne l'est pas.
- **Ne pas déplacer `fakerphp/faker` en dépendance de production.** Elle partirait alors sur
  `api.takussan.com`, et le poids n'est pas le problème : c'est qu'une bibliothèque de génération de
  fausses données deviendrait chargeable en production.
- Ce ticket ne rend **pas** le seed automatique au déploiement. `deploy.sh` ne doit jamais seeder :
  la commande écrase des données.

## Delta à produire

- [ ] Choisir la forme, et l'écrire quelque part de lisible — trois options, à trancher :
      **(a)** une commande `php artisan takussan:seed-environnement` qui monte un espace de travail
      jetable comme ci-dessus ; **(b)** un script `scripts/seed-remote.sh` qui fait la même chose
      depuis le poste ; **(c)** un job GitHub `seed-preview.yml` à déclenchement **manuel**, avec
      confirmation typée sur le modèle de `deploy.yml`
- [ ] Documenter la manœuvre dans `docs/infra/premier-deploiement.md` — le runbook décrit
      aujourd'hui `migrate --force` et ne dit rien du peuplement
- [ ] Mentionner l'écart dans l'en-tête de `scripts/deploy.sh`, à côté de la ligne `--no-dev` :
      *ce que ce drapeau rend impossible ailleurs*
- [ ] Vérifier que la même impasse ne touche pas d'autres commandes utiles hors dev
      (`db:seed --class=…`, commandes de démonstration, générateurs de fixtures)

## Critères d'acceptation

- [ ] Peupler la préproduction depuis zéro tient en **une** commande documentée, sans édition
      manuelle sur le serveur
- [ ] La release en service reste `--no-dev` après l'opération — prouvé par ablation, pas déduit
- [ ] `fakerphp/faker` reste en `require-dev` dans `composer.json`
- [ ] `docs/infra/premier-deploiement.md` décrit la manœuvre, avec la commande exacte
- [ ] Rejouer la manœuvre deux fois de suite ne laisse aucun répertoire résiduel sous
      `/var/www/*/`

## Hors périmètre

- Le contenu et le volume des seeders (`SEED_*`) — c'est un réglage, pas ce défaut
- Le peuplement de la **production** : la question ne s'y pose pas, et si elle se posait ce serait
  un autre ticket avec d'autres garde-fous
- L'automatisation du seed au déploiement — explicitement refusée ci-dessus

## Notes d'implémentation

_(à remplir par implementing-specs)_
