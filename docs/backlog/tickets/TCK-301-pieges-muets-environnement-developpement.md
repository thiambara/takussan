---
id: TCK-301
title: "Les pièges muets de l'environnement de développement : seeding, PDF, et un `.env` qui vise le natif"
status: todo
phase: P2
family: technique
estimate: S
wave: 38
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, onboarding, seeding, environnement, dev-experience, dette]
---

## Objectif utilisateur

Qu'un développeur qui installe le projet en suivant la documentation obtienne un environnement qui
marche — et que ce qui ne marche pas le dise, au lieu d'échouer en silence.

## Contrat de données

Aucune donnée applicative. Trois pièges, tous muets, mesurés le 2026-08-16 :

**1 — `SEED_DOWNLOAD_MEDIA` (ardoise D-13).** `.env.example:57` livre `SEED_DOWNLOAD_MEDIA=true`
alors que le défaut du code est `false` (`config/database.php:193`,
`database/seeders/Support/SeedingConfig.php:126`). Le premier `migrate:fresh --seed` d'un nouveau
développeur déclenche 1000 à 2700 téléchargements HTTP vers picsum.photos, timeout 15 s chacun,
**avec tous les échecs avalés**.

**2 — `LARAVEL_PDF_DRIVER` (ardoise D-13).** `.env.example:192` livre `cloudflare` avec
`CLOUDFLARE_ACCOUNT_ID=` et `CLOUDFLARE_API_TOKEN=` vides : la génération de PDF est cassée par
défaut. Le seul driver disponible en local est `dompdf`, et il n'est déclaré que dans `phpunit.xml`.
*(Déjà corrigé dans `.env.docker`.)*

**3 — Le `.env` local vise les services natifs (ardoise D-48).** `takussan-api/.env` est ignoré par
git : cette entrée ne décrit pas un fichier à corriger mais l'écart entre ce que le dépôt
provisionne et ce que la machine utilise. Les ports sont décalés d'un cran exprès (3307, 7701, 6380,
1026/8026) et un `.env` hérité pointe sur les ports canoniques — donc sur les instances brew, pas
sur les conteneurs du dépôt.

## Contraintes strictes (métier)

- **`.env.example` est l'environnement de TEST de la CI** (D-54). Changer `SEED_DOWNLOAD_MEDIA` ou
  `LARAVEL_PDF_DRIVER` dans ce fichier change la configuration de la suite : vérifier que la suite
  reste verte, et le vérifier **en CI**, pas seulement en local.
- Le piège n°3 n'est pas corrigible par un fichier du dépôt, **par construction**. La seule sortie
  est de le rendre *visible* : `./dev.sh doctor` sonde déjà ce que le `.env` déclare — il doit
  nommer l'écart entre le service sondé et celui que le dépôt provisionne.
- **Un échec avalé est pire qu'un échec bruyant.** Le téléchargement de médias qui échoue en
  silence produit un jeu de données incomplet dont personne ne sait qu'il l'est.

## Delta à produire

- [ ] Aligner `SEED_DOWNLOAD_MEDIA` dans `.env.example` sur le défaut du code, ou documenter
      pourquoi il diverge — et vérifier la suite en CI après le changement
- [ ] Faire remonter les échecs de téléchargement du seeder : compte des échecs en fin de seeding,
      et sortie non nulle au-delà d'un seuil
- [ ] Aligner `LARAVEL_PDF_DRIVER` sur un driver utilisable sans identifiant, ou faire échouer
      bruyamment le driver `cloudflare` quand ses identifiants sont vides
- [ ] `./dev.sh doctor` : détecter et nommer le cas « le `.env` vise un service natif alors que le
      dépôt en provisionne un autre sur un port décalé »
- [ ] Documenter les trois pièges là où un nouveau développeur les rencontre

## Critères d'acceptation

- [ ] AC1 — un `migrate:fresh --seed` sur un dépôt fraîchement cloné ne déclenche pas 1000+
      requêtes HTTP sans que ce soit un choix explicite
- [ ] AC2 — un échec de téléchargement de média est compté et affiché ; le seeding ne prétend pas
      avoir réussi
- [ ] AC3 — la génération d'un PDF fonctionne en développement sans configuration supplémentaire,
      ou échoue avec un message qui nomme la clé manquante
- [ ] AC4 — `./dev.sh doctor` signale un `.env` qui vise `localhost:7700` quand le dépôt sert
      Meilisearch sur `127.0.0.1:7701`, et la même chose pour MySQL et Redis
- [ ] AC5 — la suite de tests reste verte **en CI** après modification de `.env.example`

## Hors périmètre

- La correction du `.env` d'une machine donnée — il est ignoré par git.
- La parité des clés entre `.env.example` et `.env.docker`, déjà gardée par
  `scripts/check-env-parity.mjs`.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
