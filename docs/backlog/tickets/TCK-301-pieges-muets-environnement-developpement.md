---
id: TCK-301
title: "Les pièges muets de l'environnement de développement : seeding, PDF, et un `.env` qui vise le natif"
status: review
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

- [x] Aligner `SEED_DOWNLOAD_MEDIA` dans `.env.example` sur le défaut du code, ou documenter
      pourquoi il diverge — et vérifier la suite en CI après le changement *(aligné dans
      `.env.example` ET `.env.docker`, que le ticket ne citait pas)*
- [x] Faire remonter les échecs de téléchargement du seeder : compte des échecs en fin de seeding,
      et sortie non nulle au-delà d'un seuil *(seuil 10 %)*
- [x] Aligner `LARAVEL_PDF_DRIVER` sur un driver utilisable sans identifiant, ou faire échouer
      bruyamment le driver `cloudflare` quand ses identifiants sont vides *(`dompdf` ; le driver
      cloudflare levait déjà en nommant les deux clés)*
- [x] `./dev.sh doctor` : détecter et nommer le cas « le `.env` vise un service natif alors que le
      dépôt en provisionne un autre sur un port décalé »
- [x] Documenter les trois pièges là où un nouveau développeur les rencontre

## Critères d'acceptation

- [x] AC1 — un `migrate:fresh --seed` sur un dépôt fraîchement cloné ne déclenche pas 1000+
      requêtes HTTP sans que ce soit un choix explicite *(`SEED_DOWNLOAD_MEDIA=false` dans les deux
      fichiers ; `.env.docker` est celui que `./dev.sh` recopie)*
- [x] AC2 — un échec de téléchargement de média est compté et affiché ; le seeding ne prétend pas
      avoir réussi *(6 tests, ablation : 6 rouges sans le correctif)*
- [x] AC3 — la génération d'un PDF fonctionne en développement sans configuration supplémentaire,
      ou échoue avec un message qui nomme la clé manquante *(les deux : `dompdf` par défaut, et le
      driver cloudflare nomme `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`)*
- [x] AC4 — `./dev.sh doctor` signale un `.env` qui vise `localhost:7700` quand le dépôt sert
      Meilisearch sur `127.0.0.1:7701`, et la même chose pour MySQL et Redis *(+ Mailpit ; mesuré
      sur un `.env` réel, ablation : 5 lignes avec, 0 sans, 0 faux positif)*
- [ ] AC5 — la suite de tests reste verte **en CI** après modification de `.env.example`
      *(38 tests concernés verts avec `.env` = `.env.example` en local ; la CI reste à exercer)*

## Hors périmètre

- La correction du `.env` d'une machine donnée — il est ignoré par git.
- La parité des clés entre `.env.example` et `.env.docker`, déjà gardée par
  `scripts/check-env-parity.mjs`.

## Notes d'implémentation

**Trois écarts entre le ticket et la mesure du 2026-08-16.**

1. **Le piège n°1 vivait aussi dans `.env.docker`**, que le ticket ne cite pas. `.env.docker:81`
   portait le même `SEED_DOWNLOAD_MEDIA=true` — et c'est CE fichier que `./dev.sh` recopie en
   `takussan-api/.env` au premier démarrage. Le scénario visé par AC1 (« un dépôt fraîchement
   cloné ») passait donc par le fichier que le ticket n'incriminait pas. Les deux sont à `false`.

2. **Le driver `cloudflare` n'était pas muet.** `CloudflareDriver::__construct()` lève déjà
   `CouldNotGeneratePdf::missingCloudflareCredentials()` — « Set CLOUDFLARE_API_TOKEN and
   CLOUDFLARE_ACCOUNT_ID in your .env file ». La seconde branche d'AC3 était donc déjà satisfaite par
   le paquet ; c'est la première qui a été retenue (`dompdf`, sans identifiant). À noter aussi :
   `config/laravel-pdf.php` **n'est pas publié** dans `config/` — la clé n'est lue que par le défaut
   du vendor.

3. **`scripts/check-webhook-env-keys.mjs` n'existe pas** sur cette branche (`e53ce847`). Seul
   `check-env-parity.mjs` garde la parité, et il reste vert (106 clés des deux côtés).

**Décisions.**

- **Seuil de 10 %, pas zéro.** picsum.photos rend un 5xx sporadique sous rafale ; faire échouer un
  `migrate:fresh --seed` de vingt minutes sur une photo perdue apprend à ignorer le message. Le
  bilan est imprimé dès la première tentative, la levée n'intervient qu'au-delà du seuil.
- **La levée est APRÈS la réindexation Scout**, en toute fin de `run()` : ce qu'on veut interrompre
  est le message « seeding réussi », pas le seeding. Chaque seeder ayant sa propre transaction, la
  base garde ce qu'elle a acquis.
- **Un échec compte une seule fois par tentative** — `resolveCachedMedia()` enregistre la raison et
  rend `null`, `downloadMedia()` ne la ré-enregistre pas. Sans cela le taux dépasserait 100 %.
- **`./dev.sh doctor` ne bascule rien.** Il compare le port déclaré au port publié et ne parle que
  du cas exact « déclaré == canonique ≠ publié ». Un `.env` visant un troisième port (tunnel,
  serveur distant) est un choix explicite dont il n'a rien à dire.

**Gotchas payés (deux, dans les tests).**

- **`Http::fake()` MERGE les stubs, il ne les remplace pas.** Un `['*' => 500]` posé au premier tour
  d'une boucle répondait encore au vingtième : les 20 tentatives échouaient là où une seule devait.
  Un seul `Http::fake(closure)` qui décide d'après l'URL.
- **`storage/app/seed-media-cache/` survit à la suite.** Avec des URL fixes, la deuxième exécution
  trouvait en cache les fichiers de la première, sautait l'appel HTTP, et le test du seuil passait
  au vert sans exercer le compteur. Les URL portent un jeton par exécution, et `tearDown()` nettoie.

**Vérifications par ablation.**

| Correctif | Avec | Sans |
|---|---|---|
| Compteurs + bilan de seeding | 6 tests verts | **6 rouges** |
| `dev.sh doctor` (`.env` sur ports canoniques) | 5 lignes de diagnostic | **0** |
| `dev.sh doctor` (`.env` sur ports du dépôt) | 0 ligne — pas de faux positif | 0 |

**AC5** — vérifié dans l'environnement ÉQUIVALENT à la CI (`cp .env.example .env`, `key:generate`) :
38 tests PDF / export / seeders verts. La vérification **en CI même** reste à faire au push.
