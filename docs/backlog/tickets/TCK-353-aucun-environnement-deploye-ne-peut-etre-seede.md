---
id: TCK-353
title: "Aucun environnement déployé ne peut être seedé : `deploy.sh` installe `--no-dev`, les seeders exigent Faker"
status: done
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

- [x] Choisir la forme, et l'écrire quelque part de lisible — **retenu : (b)**, un script serveur
      (`scripts/seed-environnement.sh`) et son enveloppe poste (`scripts/seed-remote.sh`). Le
      raisonnement du choix est dans l'en-tête de l'enveloppe, pas ici
- [x] Documenter la manœuvre dans `docs/infra/premier-deploiement.md` — nouvelle section
      « Peupler un environnement déployé », plus un renvoi depuis l'étape 3
- [x] Mentionner l'écart dans l'en-tête de `scripts/deploy.sh`, à côté de la ligne `--no-dev`
- [x] Vérifier que la même impasse ne touche pas d'autres commandes utiles hors dev — **elle en
      touche une autre, et ce n'est pas une commande : voir TCK-354**

## Critères d'acceptation

- [x] Peupler la préproduction depuis zéro tient en **une** commande documentée, sans édition
      manuelle sur le serveur — `scripts/seed-remote.sh preview --fresh`
- [x] La release en service reste `--no-dev` après l'opération — prouvé par ablation, pas déduit
- [x] `fakerphp/faker` reste en `require-dev` dans `composer.json`
- [x] `docs/infra/premier-deploiement.md` décrit la manœuvre, avec la commande exacte
- [x] Rejouer la manœuvre deux fois de suite ne laisse aucun répertoire résiduel sous
      `/var/www/*/`

## Hors périmètre

- Le contenu et le volume des seeders (`SEED_*`) — c'est un réglage, pas ce défaut
- Le peuplement de la **production** : la question ne s'y pose pas, et si elle se posait ce serait
  un autre ticket avec d'autres garde-fous
- L'automatisation du seed au déploiement — explicitement refusée ci-dessus

## Notes d'implémentation

**Forme retenue : (b).** `scripts/seed-environnement.sh` fait le travail sur le serveur,
`scripts/seed-remote.sh` est l'enveloppe appelée depuis le poste. C'est la répartition de
`deploy.sh` / `deploy-preview.yml`, et pour la même raison : le script serveur reste appelable
directement le jour où l'enveloppe ne marche pas. Pourquoi ni (a) ni (c) — en-tête de
`seed-remote.sh`.

**Ce que le balayage du dernier point du delta a réellement trouvé.** Mesuré, pas déduit :
`grep -rn '::factory(' takussan-api/app/` et `grep -rn 'Faker\\' takussan-api/app/` ne rendent
**rien** — aucune commande artisan, aucun service n'atteint Faker, l'impasse est bien confinée aux
seeders. Mais la même *classe* de défaut existe ailleurs : `PaymentReceiptPdf` importe
`Dompdf\Dompdf`, qui n'arrive qu'en dév et transitivement. Le reçu PDF rend donc 500 sur tout
environnement déployé → **TCK-354**. *Une vérification qui ne trouve rien n'a pas la même valeur
qu'une vérification qui n'a rien cherché : celle-ci a trouvé.*

**Le `scout:import` final n'est pas de la ceinture-bretelles.** Avec `SCOUT_QUEUE=true`, le seed
n'indexe pas — il empile. Le 2026-08-24, quatre index sur sept sont restés vides après un seed
complet, sans une seule erreur. L'ordre importe aussi : `migrate:fresh`, **puis** `scout:flush`,
**puis** le seed. Vider les index après le seed effacerait ce que le seed vient d'indexer.

**Deux pièges payés pendant l'implémentation, tous deux dans l'enveloppe :**

1. *Les antislashs d'un espace de noms PHP ne survivent pas à deux shells.* `ssh` met ses
   arguments à plat et le shell distant les redécoupe : `--class=Database\Seeders\System\TagSeeder`
   arrivait en `--class=DatabaseSeedersSystemTagSeeder`, et le seeder était « introuvable » sous un
   nom que personne n'avait écrit. D'où le `printf %q`.
2. *Deux connexions SSH coup sur coup échouaient une fois sur deux*, sur un délai d'attente de
   77 s à la seconde connexion, pendant que les mêmes commandes tapées à la main passaient. **La
   cause n'est pas établie**, et le premier jet du commentaire l'attribuait à un `ufw limit` ou à
   fail2ban — les deux ont été vérifiés sur le serveur et **aucun des deux n'existe**
   (`22/tcp ALLOW IN Anywhere`, `fail2ban inactive`). L'explication a été retirée du commentaire
   plutôt que corrigée. La parade ne dépend pas de la cause : une connexion maîtresse multiplexée,
   ouverte d'abord et réessayée tant qu'aucune commande n'a tourné.

**Ce que ce ticket ne corrige pas, et qui reste vrai.** Rien n'empêchera le prochain
`composer install --no-dev` de rendre une commande utile indisponible : le défaut vit entre trois
fichiers et aucune garde de ce dépôt ne lit `composer.lock`. C'est ce que TCK-354 propose
d'attraper, pour les deux occurrences à la fois.

**Le troisième piège est le plus instructif, et il a coûté un run entier.** Le premier `--fresh`
de vérification a été lancé depuis une session dont le client SSH est mort en cours de route. Le
seed a continué **quarante minutes**, puis s'est arrêté en silence à `PropertyMediaSeeder`, à 3408
médias sur ~3431, **sans exécuter son trap de sortie** : espace de travail resté sur le disque,
base laissée à moitié peuplée, et rien nulle part pour dire que c'était incomplet. Le diagnostic
intermédiaire — « le processus a survécu à la coupure » — était faux, et il était le plus
rassurant des deux.

Trois corrections en sont sorties, toutes dans `seed-environnement.sh` :

- `trap '' HUP PIPE` — `sshd` envoie SIGHUP au chef de session quand le canal se ferme ;
- un journal écrit **sur le serveur** (`${APP_DIR}/seed-environnement.log`), écrasé à chaque
  exécution, parce qu'un compte rendu qui ne vit que dans la connexion qui l'a demandé disparaît
  avec elle — et une opération de trente minutes est exactement celle dont la connexion a le temps
  de tomber ;
- `tee -p --output-error=warn` et pas `tee` nu : un `tee` ordinaire meurt sur SIGPIPE et emporte le
  script derrière lui. Le mécanisme de traçabilité serait devenu un point de rupture de plus, dans
  le scénario même qu'il existe pour couvrir.

**Deux fois de suite pendant ce chantier, une boucle d'attente a annoncé « terminé » sur un seed
qui tournait encore** — une fois parce qu'un `ssh` en échec rend faux comme un `test -d` qui ne
trouve rien, une fois parce que `grep -c` imprime `0` **et** sort en 1, si bien qu'un `|| echo 0`
de repli en imprimait un second. *Un test doit exiger le « oui » ou le « non » explicite ; le
silence n'est pas une réponse, c'est une mesure qui n'a pas eu lieu.* La commande de diagnostic
proposée au lecteur dans le runbook porte cet avertissement.

**Vérification finale, 2026-08-24 :** `scripts/seed-remote.sh preview --fresh --oui`, sortie 0 en
**26 min** (15:04:34 → 15:30:40). 836 biens, 3386 médias, 4 agences, 302 utilisateurs, 564 clients,
569 baux ; les sept index Meilisearch repeuplés (`properties` à 797 et non 836 — c'est
`shouldBeSearchable()`, pas un manque). Ablation verte avant et après, aucun répertoire résiduel,
et une seconde exécution consécutive n'en laisse pas davantage.
