# L'ardoise — inventaire des manquements

> **Mesuré le 2026-08-12**, à la reprise du développement, par un audit parallèle de sept axes
> (architecture back, architecture front, véracité du backlog, décisions non écrites, environnement
> de développement, fraîcheur documentaire, tests & CI) suivi d'une passe de vérification
> adversariale sur les constats les plus structurants.
>
> **Chaque entrée porte sa preuve.** Un inventaire de dettes se re-mesure avant d'être utilisé,
> jamais lu : les chiffres ci-dessous datent du 2026-08-12 et vieillissent à partir de là.
>
> **Ce document n'est pas un backlog.** Il nomme ce qui est faux ou absent aujourd'hui. Ce qui mérite
> d'être fait devient un ticket dans `docs/backlog/`, et l'entrée d'ardoise se ferme en le citant.

## Comment lire

| Marque | Sens |
|---|---|
| 🔴 **P0** | Casse la production, ou peut la casser au prochain déploiement. |
| 🟠 **P1** | Fait perdre du temps ou induit en erreur à chaque reprise du projet. |
| 🟡 **P2** | Incohérence réelle, coût diffus, pas de sinistre immédiat. |
| ✅ | Soldé pendant le chantier de reprise du 2026-08-12. |

---

## 🔴 Production — ce qui est cassé ou dangereux maintenant

**D-01 à D-04 ne se voient pas depuis le code.** Aucun test, aucun lint, aucune lecture de `app/` ne
peut les trouver : ils vivent dans l'écart entre ce que le dépôt déclare et ce que la machine fait.

**D-49 à D-52, ajoutés le 2026-08-15, sont l'exact inverse** : ils étaient dans `app/`, lisibles,
depuis des mois — et personne ne les avait vus parce qu'aucun test ne passait par là. Ils ont tous
les quatre été trouvés **en écrivant les tests de [TCK-285](backlog/tickets/TCK-285-couverture-tests-services-policies.md)**,
pas en les lisant. *Un chemin que rien n'exécute n'est pas du code peu testé : c'est du code dont
personne ne sait s'il marche.*

### D-01 — `composer.lock` ininstallable sur le PHP documenté ✅ *soldé côté dépôt le 2026-08-12*

> **Soldé côté dépôt** : `composer.json` déclare `"php": "^8.4"` et fige la résolution par
> `config.platform.php = 8.4.1`, pour que `composer` refuse lui-même l'écart au lieu qu'on le
> découvre au déploiement. Le guide de déploiement passe en `php8.4-*` et porte un encadré de
> migration.
>
> **✅ LE SERVEUR EST DÉJÀ EN 8.4 — correction du 2026-08-12, après mesure.** Une première
> rédaction de cette entrée annonçait une migration serveur à faire. C'était faux, et voici la
> preuve : le déploiement de **preview du 2026-06-20 a RÉUSSI**, `deploy.sh:134` lance
> `composer install --no-dev`, et le `composer.lock` de `origin/preview` à cette date exigeait
> **déjà** `php >=8.4.1` sur 17 paquets `symfony/*`. Un `composer install` ne peut pas réussir sur
> une version que le lock exclut.
>
> Preview et production **partagent le même serveur** (`178.18.247.62` pour les deux domaines).
> Il n'y a donc rien à migrer : **seule la documentation était en retard**, et elle est corrigée.
>
> *La leçon vaut plus que le correctif : « le guide dit 8.3 » ne prouve rien de ce que la machine
> exécute. Un déploiement réussi, lui, prouve une borne inférieure.*


`composer.json` annonce `"php": "^8.3"`. Le guide de déploiement prescrit
`apt install -y php8.3-fpm php8.3-mysql …`. Mais **19 paquets verrouillés exigent PHP ≥ 8.4** :
17 `symfony/*` en `php >=8.4.1` (`console`, `http-foundation`, `http-kernel`, `routing`, `mailer`,
`translation`, `var-dumper`…), plus `lcobucci/clock` (`~8.4.0 || ~8.5.0`) et
`spatie/laravel-activitylog` (`^8.4`).

Il n'y a **aucun `config.platform`** dans `composer.json` pour figer la cible. Un
`composer install --no-dev` sur un serveur en PHP 8.3 échoue.

> **Le piège est dans l'asymétrie** : la CI tourne sur PHP **8.4** (`shivammathur/setup-php` avec
> `php-version: '8.4'`), donc rien n'a jamais signalé l'écart. La machine qui valide et la machine qui
> sert ne parlent pas la même version, et c'est la seconde qui casse.

**Preuve** : `composer.json` ligne `"php": "^8.3"` · parsing de `composer.lock` → 19 paquets dont la
contrainte exclut 8.3 · `.github/workflows/api-ci.yml` → `php-version: '8.4'` ·
`docs/infra/deploy-preview.html` → `apt install -y php8.3-fpm`.

**Trancher** : soit la production passe en 8.4 et `composer.json` + le guide le disent, soit on
rétrograde les paquets. Dans les deux cas, poser un `config.platform.php` pour que `composer` refuse
lui-même l'écart au lieu de le découvrir au déploiement.

### D-02 — Le worker de production ne consommait qu'une file sur quatre ✅ *soldé le 2026-08-12*

> **Soldé** : `scripts/server-setup.sh` pose désormais
> `--queue=notifications-urgent,default,media,reconciliation` (l'ordre est la priorité).
>
> **Et la garde existe** : `scripts/check-queues.mjs` compare les `onQueue()` du code à la
> commande de production, et tourne dans `repo-ci.yml`. Prouvée par mutation, y compris sur le
> cas réaliste — « on ajoute une file nommée et on oublie de l'inscrire dans l'unité ».
>
> **⚠️ RESTE À FAIRE SUR LE SERVEUR** : rejouer `sudo bash scripts/server-setup.sh` pour réécrire
> l'unité systemd, puis `sudo systemctl restart takussan-queue`. Les jobs déjà empilés dans la
> table `jobs` seront alors consommés — vérifier leur volume avant, ils datent de mai.


`scripts/server-setup.sh:375` :

```
ExecStart=/usr/bin/php artisan queue:work --sleep=3 --tries=3 --max-time=3600
```

**Aucun `--queue`.** Le worker ne consomme donc que la file `default`. Or le code pousse
explicitement sur trois files nommées : `onQueue('media')` (2 sites), `onQueue('reconciliation')`
(2 sites), `onQueue('notifications-urgent')` (1 site).

Ces jobs sont écrits en base et **ne sont jamais consommés**. Ils ne produisent ni erreur, ni
timeout, ni alerte : la ligne s'empile dans `jobs`, l'API a répondu 200, et l'effet attendu
n'arrive simplement jamais. *Une file sans consommateur est le défaut le plus silencieux qui soit.*

**Preuve** : `scripts/server-setup.sh:375` · `grep -rn "onQueue(" takussan-api/app/` → 5 sites sur
3 files nommées.

**Correctif** : `--queue=notifications-urgent,default,media,reconciliation` (l'ordre est la priorité).

### D-03 — La liste d'extensions PHP du guide était incomplète ✅ *soldé le 2026-08-12*

> **Soldé** : la ligne `apt install` du guide porte désormais `php8.4-intl`, `php8.4-gd`,
> `php8.4-bcmath` et `php8.4-redis`, et `docs/configuration.md` §5.1 a été réécrite — Meilisearch
> y était classé « optionnel » alors qu'il est obligatoire, et Redis obligatoire alors qu'il est
> optionnel. Les deux étaient exactement inversés.


Le guide prescrit `php8.3-fpm php8.3-mysql php8.3-mbstring php8.3-xml php8.3-curl php8.3-zip`.
Manquent : **`intl`** (requis par `filament/support`), **`gd`** (`phpspreadsheet`, et les watermarks
`intervention/image`), **`bcmath`** (`moneyphp/money`), **`redis`** (`phpredis`, si `CACHE_STORE=redis`).

Une extension manquante ne dégrade pas une fonction : elle **empêche l'application entière de
démarrer**. Sur une installation neuve suivie à la lettre, l'application ne boote pas.

**Preuve** : `docs/infra/deploy-preview.html` (ligne `apt install`) confrontée aux `require` de
`composer.lock`.

### D-04 — La production n'a **jamais** été déployée 🔴 → [TCK-288](backlog/tickets/TCK-288-chaine-de-deploiement-master-fige.md)

> **DIAGNOSTIC CORRIGÉ le 2026-08-12.** L'entrée d'origine disait *« la production ne reçoit plus
> rien depuis trois mois »*, ce qui suppose qu'elle en recevait. **Elle n'en a jamais reçu.**
> Mesuré :
>
> - `gh run list` — **`deploy.yml` n'a jamais tourné, pas une seule fois**. Le seul workflow de
>   déploiement qui se soit exécuté est *Deploy Laravel API (Preview)*, cinq fois, sur `preview`.
> - `https://api.takussan.com/up` → **404**. `https://preview.api.takussan.com/up` → **200**.
> - `deploy.yml`, `deploy-preview.yml`, `deploy.sh` et `server-setup.sh` **n'existent pas sur
>   `master`** : la branche est antérieure au commit `14246ce6` qui a créé toute la chaîne.
> - `origin/dev..origin/master` = **0** — `master` n'a aucun commit propre, c'est un ancêtre strict
>   de `dev`. Un merge serait un simple *fast-forward*.
>
> **L'infrastructure est prête et attend** : DNS résolu, serveur répondant, et **les cinq secrets**
> exigés par `deploy.yml` — dont `ENV_FILE`, le `.env` de production — posés le 2026-05-19.
>
> **Et elle est BLOQUÉE, mécaniquement.** GitHub : `HTTP 404: workflow deploy.yml not found on the
> default branch`. La branche par défaut du dépôt est `master`, `deploy.yml` n'y existe pas, et
> GitHub n'expose `workflow_dispatch` que depuis la branche par défaut. Le blocage est **circulaire**
> — y pousser `deploy.yml` déclencherait le déploiement automatique, puisque son filtre `paths:`
> inclut ce fichier même. Ce qui dénoue : faire de `dev` la branche par défaut, ce qui ne déclenche
> rien et ne fait que rattraper la réalité. Séquence exacte dans TCK-288.
>
> **Résidu trouvé au passage** : `deploy-api-preprod.yml` est enregistré **actif** chez GitHub alors
> qu'il n'existe sur **aucune** branche, et ses deux seuls runs ont échoué en mai. Un workflow
> supprimé dont l'enregistrement survit — inoffensif, mais il fait croire à un pipeline de plus.
>
> Ce n'est donc pas une chaîne cassée à réparer, c'est **une première mise en production à faire**.
> Et cela change le risque : le workflow de production n'a **jamais été exercé**. Son jumeau de
> preview, oui, cinq fois — ce qui est rassurant sans être une preuve.

> **Seule dette P0 non soldée par le chantier du 2026-08-12, et c'est délibéré.** Les deux issues
> cohérentes — amener `dev` sur `master`, ou faire suivre le déclencheur à `dev` — passent par un
> **déploiement de production**. C'est une action sortante et difficilement réversible : elle
> appartient à une personne, pas à un agent. Le ticket pose l'arbitrage, ses deux branches, et son
> prérequis (la migration PHP, D-01).

`origin/master` est figé au **2026-05-18**, **31 commits derrière `dev`**. Or `deploy.yml` ne
déclenche le déploiement de production que sur un push vers `master`.

Tout le travail depuis mai — recherche Meilisearch, canal WhatsApp, refonte RBAC, profils
polymorphes, corrections de sécurité — vit sur `dev` et **n'a jamais été déployé**. Aucun document,
aucune alerte, aucun badge ne le signale ; la configuration du dépôt continue même d'annoncer
`master` comme branche principale.

**Preuve** : `git log origin/master -1` → 2026-05-18 · `git rev-list --count origin/master..dev` → 31 ·
`.github/workflows/deploy.yml` (trigger `push: branches: [master]`).

**Trancher** : soit `master` redevient la branche de production et on l'y amène, soit le déclencheur
suit `dev`. L'état actuel — une branche de production abandonnée qui reste le déclencheur — est le
seul qui ne soit défendable d'aucune façon.

### D-05 — Aucune garde MySQL, alors que les pièges sont documentés ✅ *soldé le 2026-08-12*

`CLAUDE.md` documente quatre familles de pièges « qui passent en CI mais cassent en prod » (DEFAULT
sur JSON/TEXT, `dropUnique` sous FK, nom d'index > 64 caractères, `enum()`). **Aucun job ne les
vérifiait** : la CI n'installait que `pdo_sqlite`/`sqlite3` et tournait sur `:memory:`, puis
`scripts/deploy.sh:148` lance `php artisan migrate --force` directement sur la base de production. La première
machine à exécuter ce DDL en conditions réelles était donc le serveur.

Le dépôt avait déjà payé ce défaut **deux fois**, et les correctifs sont dans son propre historique :
`c473081b` (« JSON column without DEFAULT for MySQL compat ») et `9815694f` (« name long
auto-generated index/FK to stay under MySQL 64-char limit »).

*Une famille de pièges connue, documentée, déjà rencontrée deux fois, et que rien n'attrapait : la
documentation avait remplacé la garde.*

**Soldé** : `api-ci.yml` porte un job `migrations-mysql` qui rejoue les migrations sur un service
MySQL 8.0, puis les **roule en arrière et les rejoue**. Il ne lance pas la suite de tests — c'est
le DDL qu'on éprouve.

> ⚠ **Ce job a tourné sur le mauvais moteur du 2026-06-29 au 2026-08-13** — `mariadb:11.4`, choisi
> sur la foi d'un `apt install mariadb-server` que personne n'avait exécuté. Le serveur est en
> **MySQL 8.0.46**, `utf8mb4_0900_ai_ci` (mesuré). Corrigé, et gardé par
> `scripts/check-db-engine.mjs` (D-43 ci-dessous).

> **Il a trouvé un défaut réel à sa PREMIÈRE exécution**, et c'était exactement le piège n°2.
> `2026_06_18_000001_add_performance_indexes_to_transactional_tables` posait un index composite
> `(agency_id, status)` sur `bookings`, `leases` et `invoices`. Comme `agency_id` est le préfixe
> gauche de ce composite, InnoDB retire l'index auto qui back la FK et **le composite devient le
> seul support de la contrainte** — si bien que le `down()` se voyait refuser sa suppression :
> `SQLSTATE[HY000] 1553 — Cannot drop index 'bookings_agency_id_status_index': needed in a foreign
> key constraint`. Sur les trois tables. Corrigé selon le patron documenté (lâcher la FK, retirer
> l'index, reposer la FK à l'identique), et vérifié sur MariaDB 11.4 — puis rejoué sur MySQL 8.0
> quand le moteur du banc d'essai a été corrigé.
>
> Ce défaut était **invisible par construction** : la CI tournait sur SQLite, qui accepte tout, et
> **la suite de tests n'exécute aucun `down()`**. Le `down()` est le code le moins exécuté du dépôt,
> et le seul dont on ait besoin le jour où un déploiement tourne mal.

### D-05bis — Aucun chemin de rollback au-delà du cutover RBAC ✅ *documenté le 2026-08-12*

> **Documenté** (la contrainte, elle, ne se corrige pas) : le guide de déploiement porte un
> encadré en tête de sa section Rollback. Il dit ce que le rollback ne peut PAS annuler — il
> restaure le code, jamais le schéma — et impose le dump pré-déploiement comme seule marche
> arrière réelle, **avec la vérification que le dump est relisible**. Un dump qu'on n'a jamais
> relu n'est pas une sauvegarde.


`2026_05_18_120000_drop_spatie_permission_tables` est **délibérément irréversible** : son `down()`
lève une `RuntimeException` avec le message *« Restore from a pre-cutover SQL dump if needed »*.

La décision est défendable — reconstituer des rôles historiques depuis un seeder n'aurait restauré
qu'une approximation, ce qui est pire qu'un refus (cf. [ADR-0002](adr/0002-role-est-un-profil-polymorphe.md)).
Mais sa conséquence n'était écrite nulle part : **un déploiement qui tourne mal au-delà de cette
migration n'a pas de marche arrière**, seulement une restauration de dump.

C'est une contrainte d'exploitation, pas un défaut de code. Elle doit figurer dans le runbook de
déploiement — et la procédure de dump pré-déploiement doit exister avant qu'on en ait besoin.

**Preuve** : `database/migrations/2026_05_18_120000_drop_spatie_permission_tables.php:26-32` ·
`php artisan migrate:refresh` sur MySQL → échec à cette migration.

---

### D-49 — Deux webhooks entrants sur cinq ne vérifient AUCUNE signature 🟠 *question tranchée le 2026-08-16 — les opérateurs n'en proposent pas* → [TCK-294](backlog/tickets/TCK-294-mtarget-api-pulling-dlr.md) · [TCK-296](backlog/tickets/TCK-296-cles-env-gardes-webhook.md)

> **RÉPONSE DES OPÉRATEURS, obtenue le 2026-08-16. La question ouverte plus bas est CLOSE :**
> **ni l'API SMS globale d'Orange ni celle de Mtarget n'émettent de signature.** Le constat n'était
> donc pas un oubli d'implémentation — c'est le plafond de ce que ces fournisseurs offrent. Ce qu'ils
> proposent à la place :
>
> - **Orange** — point de terminaison **HTTPS obligatoire sur le port 443, certificat valide** (les
>   auto-signés sont rejetés), et Orange **fournit à la configuration une adresse IP officielle** à
>   mettre en liste blanche pour bloquer tout autre serveur.
> - **Mtarget** — recommande de **ne pas exposer de webhook public non signé** et de basculer sur son
>   **API Pulling DLR / MO** : c'est notre serveur qui interroge périodiquement Mtarget en
>   s'authentifiant avec nos jetons d'API. Le sens du flux s'inverse, et la question de la signature
>   disparaît avec lui. → [TCK-294](backlog/tickets/TCK-294-mtarget-api-pulling-dlr.md)
>
> **Ce que nous faisons déjà, et qui est correct.** `RestrictIpMiddleware` applique la liste blanche,
> **échoue fermé en production** (`abort(403)` si la liste est vide, pour qu'une variable oubliée ne
> puisse pas exposer le webhook en silence), et `TRUSTED_PROXIES=127.0.0.1,::1` est bien posé dans
> `.env.prod` et `.env.preview` — sans quoi n'importe qui pourrait usurper `X-Forwarded-For` et la
> liste blanche ne vaudrait rien. Pour Orange, nous exploitons donc déjà le maximum disponible ; il
> ne reste qu'à **renseigner l'IP qu'Orange fournit** au moment de la configuration.
>
> **⚠️ Le piège opérationnel du fail-closed, à connaître avant la mise en production.** Laisser
> `SMS_ORANGE_WEBHOOK_IPS` vide en production ne « désactive » pas le filtre : cela **refuse tous les
> accusés de livraison en 403**, sans erreur bruyante côté Takussan. Les statuts d'envoi ne
> remonteraient jamais, et le diagnostic partirait du mauvais côté — on chercherait un défaut d'envoi
> là où c'est la réception qui est fermée. À porter au runbook de
> [TCK-288](backlog/tickets/TCK-288-chaine-de-deploiement-master-fige.md).
>
> **✅ Les 11 clés d'environnement SMS sont désormais déclarées** dans `.env.example` et
> `.env.docker` (2026-08-16), avec le motif écrit à côté. Elles ne l'étaient nulle part, et
> `check-env-parity.mjs` ne pouvait rien y faire : **il compare deux fichiers, et une clé absente des
> deux est en parité parfaite.** *Une garde qui confronte deux sources ne vérifie jamais qu'elles
> couvrent la troisième — le code.* Le même trou existe encore pour les deux clés WhatsApp.
>
> **Gravité ramenée de 🔴 à 🟠** : ce n'est plus une protection manquante par négligence, c'est le
> plafond du fournisseur, exploité jusqu'à son maximum et documenté. Le risque résiduel (statistiques
> de livraison faussées, renvois facturés) est borné et assumé.

**Orange SMS et Mtarget SMS** ne sont protégés que par un **jeton dans l'URL** (comparé par
`hash_equals`) et une **allowlist d'IP**. Les trois autres webhooks entrants exigent en plus une
empreinte cryptographique : Wave HMAC-SHA256 sur `t.body`, Orange Money HMAC-SHA256 sur le corps,
Lemon Squeezy `X-Signature`, WhatsApp `X-Hub-Signature-256`, LAfricaMobile route signée Laravel.

**Ce que ça coûte concrètement.** Le jeton d'URL n'est pas un secret qui se garde : il circule dans
le tableau de bord de l'opérateur, dans les journaux d'accès (c'est un composant d'URL, donc il est
journalisé partout où l'URL l'est), et dans les échanges d'intégration par courriel. Qui l'obtient
peut nous faire croire qu'un SMS a été livré alors qu'il ne l'a pas été, ou l'inverse — fausser nos
statistiques de livraison et déclencher des renvois facturés. **Cela ne touche ni les paiements ni
les données clients** : le périmètre est borné.

**Ce qui n'est PAS mesuré, et qui décide de la suite** : nous n'avons pas vérifié si Orange et
Mtarget **proposent** une signature. Le constat porte sur notre code, pas sur leur offre. Y répondre
exige de lire leur documentation d'API.

> **La question posée à l'équipe** — et le motif pour lequel cette entrée existe plutôt qu'un
> correctif : *accepte-t-on ce niveau pour ces deux opérateurs, ou va-t-on leur réclamer une
> signature avant la mise en production ?* **Ajouter une vérification de signature à l'aveugle
> serait le pire des deux mondes** : si l'opérateur n'en émet pas, on casse la réception des accusés
> de livraison, et le diagnostic partira du mauvais côté.

**Un docblock décrivait une garde absente — corrigé.** `OrangeSmsStatusController` annonçait une
« signed Laravel route (`signed` middleware) ». **La route Orange ne porte pas ce middleware** ;
seule la route LAfricaMobile l'a (`routes/api/sms-webhooks.php`). C'était le schéma D-21 un cran
plus bas : un commentaire qui décrit une protection qui n'existe pas est pire que pas de commentaire,
parce qu'il dispense le lecteur de vérifier.

**Et les 6 clés d'environnement de ces gardes ne sont déclarées NULLE PART** —
`SMS_WEBHOOK_URL_TOKEN`, `SMS_{ORANGE,MTARGET,LAM}_WEBHOOK_IPS`, `WHATSAPP_WEBHOOK_URL_TOKEN`,
`WHATSAPP_WEBHOOK_APP_SECRET` sont absentes de `.env.example`, `.env.docker`, `.env.preview` et
`.env.prod`. `check-env-parity.mjs` ne peut rien garder ici : il compare deux fichiers, et la clé
manque **des deux côtés**. Les gardes échouant fermé (jeton vide → 404, allowlist vide → 403), les
webhooks SMS et WhatsApp seront simplement **muets** au premier déploiement, sans erreur bruyante.
→ [TCK-296](backlog/tickets/TCK-296-cles-env-gardes-webhook.md), qui **bloque** désormais
[TCK-288](backlog/tickets/TCK-288-chaine-de-deploiement-master-fige.md).

> **Requalifié le 2026-08-16.** Cette ligne renvoyait le sujet à la mise en production. C'était une
> erreur de rattachement : les six clés manquent **dans le dépôt**, et rien n'oblige à toucher au
> serveur pour les y déclarer. Rattacher un travail faisable maintenant à un ticket qui attend une
> décision, c'est le geler sans le dire.

**Preuve** : `app/Http/Controllers/Webhook/OrangeSmsStatusController.php:35-38` ·
`MtargetSmsStatusController.php:22-25` · `routes/api/sms-webhooks.php:20-30` ·
`grep -c '^SMS_' .env.example .env.docker .env.preview .env.prod` → 0 partout.

---

### D-50 — Le webhook de paiement accepte le secret de N'IMPORTE QUELLE agence 🔴 *mesuré le 2026-08-15* → [TCK-293](backlog/tickets/TCK-293-webhook-paiement-scope-agence.md)

> **ARBITRAGE DIFFÉRÉ, sciemment, le 2026-08-16.** Le constat est acté et ne bouge pas ; la
> correction attend une décision qui n'est pas technique. La route `POST webhooks/payments/{provider}`
> ne porte aucun identifiant d'agence : il faut l'intégration pour vérifier la signature, et la
> charge utile pour connaître l'agence. Les trois sorties possibles — URL de webhook par agence,
> essai successif des signatures, ou intégration unique globale par fournisseur — engagent la
> configuration chez Wave et Orange Money, l'onboarding d'une agence, ou le modèle d'affaires. Elles
> sont détaillées et chiffrées dans TCK-293.
>
> *Différer n'est pas oublier* : le défaut porte son ticket, son ADR à écrire, et un test qui sonde
> la CAUSE (`PaymentWebhookMultiTenantTest`) et se rallumera seul le jour de la correction.

**Le comportement est inversé, dans les deux sens à la fois.** `PaymentGatewayService::handleWebhook`
(lignes 132-137) résout l'`Integration` **sans aucun scope d'agence** — la première active du
fournisseur — alors que `::initiate` la scope correctement (ligne 70, via
`resolveIntegration($provider, $agencyId)`). C'est le secret de cette intégration arbitraire, et lui
seul, qui valide les signatures de **toute la plateforme**.

**Mesuré** avec deux agences ayant chacune leur intégration Wave active et leur propre
`webhook_secret` :

| Webhook visant le paiement de l'agence A | Attendu | **Mesuré** |
|---|---|---|
| signé avec le secret de l'agence **B** | 401 | **HTTP 200 — et le paiement de A passe à `paid`** |
| signé avec le secret de l'agence **A** | 200 | **HTTP 401** |

**Une agence connaît forcément son propre secret.** Elle peut donc marquer « payé » n'importe quel
encaissement de n'importe quelle autre agence — et, symétriquement, ses propres webhooks légitimes
sont rejetés dès qu'une autre intégration la précède dans l'ordre de résolution. La faille est
ouverte **et** la fonction est cassée.

**Pourquoi ce n'est pas corrigé dans TCK-285.** Le correctif n'est pas d'une ligne. Pour connaître
l'agence il faut connaître le paiement ; pour connaître le paiement il faut analyser la charge
utile ; et l'analyse est aujourd'hui faite par le driver **derrière** la vérification de signature.
Sortir de cette boucle change le contrat de `PaymentDriverContract` — **c'est une décision
d'architecture (ADR), pas une correction de test.**

Les deux tests qui l'établissent existent, dans
`tests/Feature/Api/PaymentWebhookMultiTenantTest.php`. Ils sont **suspendus par une sonde qui
interroge la cause** (la résolution est-elle scopée ?) et non le symptôme : ils se rallument seuls
le jour du correctif et en deviennent la garde. Les écrire à l'endroit du comportement mesuré aurait
figé le défaut en contrat ; les laisser rouges aurait cassé la CI de tout le monde.

**Preuve** : `app/Services/Payments/PaymentGatewayService.php:132-137` contre `:70` ·
`php artisan test --filter=PaymentWebhookMultiTenantTest` (sonde retirée) → 2 échecs, statuts
ci-dessus.

---

### D-51 — La passerelle de paiement était morte EN ENTIER, pas seulement sur les factures ✅ *soldé le 2026-08-16*

> **⛔ LE DIAGNOSTIC D'ORIGINE SOUS-ESTIMAIT SA PROPRE PORTÉE D'UN ORDRE DE GRANDEUR.** Il concluait
> « la branche `invoices` est morte », donc une fonctionnalité secondaire indisponible. Mesuré le
> 2026-08-16 : **aucun paiement, d'aucun type, ne pouvait être confirmé en production.**
>
> `PaymentGatewayService::paymentsForEvent()` boucle sur les **trois** payables et interroge chacun
> par `transaction_id` à chaque webhook entrant :
>
> ```php
> foreach ([BookingPayment::class, LeasePayment::class, Invoice::class] as $class) {
>     $rows = $class::query()->where('transaction_id', $event->transactionId)->lockForUpdate()->get();
> ```
>
> La troisième requête lève `SQLSTATE[42S22] Unknown column` sur MySQL. Or l'appelant,
> `applyEventToMatchingPayment()`, enveloppe la boucle dans `DB::transaction()` : le paiement de
> réservation ou de loyer trouvé aux **deux premiers tours** était donc annulé par le rollback, et le
> webhook rendait 500. Le fournisseur réessaie, échoue encore, indéfiniment.
>
> **Et la suite de tests ne pouvait STRUCTURELLEMENT pas le voir.** Mesuré, la même requête :
>
> | Moteur | Où | Comportement |
> |---|---|---|
> | SQLite | la suite de tests (`phpunit.xml`) | rend **0 ligne, en silence** |
> | MySQL 8.0.46 | la production (mesuré le 2026-08-13) | **lève `Unknown column`** |
>
> C'est la règle n°4 du `CLAUDE.md` — *« une migration se pense pour MySQL, jamais pour SQLite »* —
> transposée au **REQUÊTAGE**, où rien ne la gardait. Les 2 294 tests étaient verts pendant que la
> passerelle était morte, et **aucun test supplémentaire du chemin de paiement n'y aurait rien
> changé** : le défaut n'était pas dans ce que la suite teste, il était dans ce que son moteur
> *pardonne*. Le job CI `migrations-mysql` ne pouvait pas l'attraper non plus — il rejoue les
> migrations, pas les requêtes.
>
> **Un troisième point de rupture est apparu quand le test s'est rallumé**, preuve que la branche
> n'avait jamais été exécutée une seule fois : `applyStatusToPayment()` faisait
> `PaymentStatus::tryFrom((string) $payment->status)`, et `(string)` sur un enum lève
> `Object of class InvoiceStatus could not be converted to string` — 500 mesuré sur
> `GET /api/invoices/{id}/verify`. `invoices` n'a pas davantage de colonne `paid_at`.
>
> **Correctif livré** : migration `2026_08_16_090000_add_gateway_columns_to_invoices_table`
> (`transaction_id`, `payment_method`, index nommé ; aller-retour prouvé sur MySQL 8.0.46) ·
> `paymentAmount()`, une seule définition de « combien est dû » là où la règle était corrigée dans la
> garde de sous-paiement et violée dix lignes plus haut · `currentPaymentStatus()`, `writeStatus()`
> et `hasColumn()` pour que chaque payable n'écrive que ce que son enum et sa table savent porter.
> Preuve directe : `applyEventToMatchingPayment()` exécuté sur MySQL 8.0 passe désormais.
>
> **Garde** : `tests/Feature/Api/PaymentGatewaySchemaContractTest.php` vérifie que chaque payable
> porte les colonnes que la passerelle interroge — sans exiger un second moteur en CI, puisqu'il
> vérifie l'EXISTENCE des colonnes plutôt que de les requêter. Prouvé par mutation (migration
> retirée → rouge). ⚠️ Il est honnête sur sa portée : la liste des colonnes est tenue à la main, une
> requête neuve sur une colonne neuve lui échappera. C'est un cliquet, pas une preuve.
>
> **⚠️ UNE QUESTION MÉTIER RESTE OUVERTE, et elle n'a pas été tranchée à la place du produit.**
> `InvoiceStatus` (`draft`, `sent`, `paid`, `overdue`, `cancelled`, `void`) et `PaymentStatus`
> (`pending`, `paid`, `late`, `partially_paid`, `failed`, `refunded`) **ne se recouvrent que sur
> `paid`**. Que devient une facture après un paiement Wave *échoué* — elle reste `sent` ? elle passe
> `overdue` ? Après un *remboursement* — `void` ? Le code n'écrit RIEN quand il n'existe pas
> d'équivalent, et trace l'événement dans `metadata` : un statut inventé serait pire qu'aucun, parce
> qu'il aurait l'autorité d'une donnée. À trancher avant qu'une facture ne soit réglée en ligne.

*Le constat d'origine, conservé — il reste juste, il était seulement trop étroit :*

Les routes acceptent explicitement `invoices` (`routes/api/payments.php:20,24`), mais **une facture
ne peut être ni payée ni vérifiée**, pour deux raisons indépendantes :

1. **`invoices` n'a aucune colonne `transaction_id`** (colonnes réelles vérifiées par
   `Schema::getColumnListing`). Or `recordInitiation` (ligne 333) la remplit et `verify` (ligne 103)
   la lit : la lecture rend toujours vide, donc `verify` sort en `null` **avant même** d'interroger
   le fournisseur. Le webhook ne peut pas davantage rapprocher un événement d'une facture.
2. **`initiate` calcule `(float) $payment->amount`** (ligne 81), là où une `Invoice` porte son
   montant dans **`total_amount`**. Le montant vaut donc 0 et la route rend
   **422 « Cannot initiate a checkout for a non-positive amount »** — mesuré.

Le correctif demande une migration **et** une décision sur `amount` vs `total_amount` : hors
périmètre d'un ticket de tests. Le test correspondant est suspendu par une sonde sur la colonne
(`tests/Feature/Api/PaymentGatewayVerifyTest.php`) et se rallume à la migration.

**Preuve** : `php artisan tinker --execute="echo implode(', ', Schema::getColumnListing('invoices'));"`
→ pas de `transaction_id` · `POST /api/invoices/{id}/initiate` → 422.

---

### D-52 — `GET /api/share/{token}/download` rendait 404 en toutes circonstances ✅ *mesuré le 2026-08-15, soldé le 2026-08-16*

`DocumentShareLinkController` lit la collection média **`'files'`** (pluriel, lignes 77 et 91). Tout
le reste du dépôt écrit et lit **`'file'`** (singulier) — `DocumentController::store()` ligne 92,
`DocumentPdfService` ligne 108, `DocumentResource` ligne 15, `PropertyResource` ligne 263. **Rien
n'alimente jamais `'files'`** : le téléchargement d'un document partagé est cassé depuis toujours.

C'est la cause exacte du `DocumentShareLinkService::recordDownload` à **0/2 lignes** relevé par la
mesure de couverture : la ligne n'est pas peu exécutée, elle est **inatteignable**. Le plafond
`max_downloads` n'a donc jamais été franchi une seule fois en production.

Le même typo frappe `show()` ligne 77, où `'size'` est par conséquent toujours `null` dans la
réponse de `GET /api/share/{token}` — un symptôme silencieux, jamais remonté.

**Correctif d'un caractère** : il fait passer une route de « 404 systématique » à « sert un
fichier », ce qui est un changement de comportement en production et non une correction de test.
Mesuré avant application : la sonde `'files'` → `'file'` fait passer
`DocumentShareLinkDownloadTest` de 6/11 à **11/11** sans toucher aux tests. Les 5 cas de succès
étaient suspendus par une sonde sur le nom de collection et se rallumaient au correctif.

**Preuve** : `app/Http/Controllers/Api/DocumentShareLinkController.php:77,91` contre
`grep -rn "'file'" app/Http/Controllers/Api/DocumentController.php` ·
`php artisan test --filter=DocumentShareLinkDownloadTest`.

> **Appliqué le 2026-08-16.** `getFirstMedia('files')` → `getFirstMedia('file')` aux deux points
> d'appel. Mesuré après application : `php artisan test --filter=DocumentShareLinkDownloadTest` →
> **11 passés, 28 assertions**, plus aucun test suspendu. `recordDownload()` est atteignable pour
> la première fois, donc le plafond `max_downloads` est réellement exercé.
>
> **La sonde de suspension a été retirée dans le même geste, et ce n'est pas du ménage.** Tant que
> le défaut vivait, `markTestSkipped` était juste : il refusait de figer le 404 dans une assertion.
> Le correctif appliqué, la même sonde s'inverse — quelqu'un qui réécrirait `'files'` ne ferait plus
> rougir ces 5 tests, il les ferait **passer en SKIP**, et la CI resterait verte sur une route
> redevenue morte. *Une garde anti-régression qui se désarme sur la régression qu'elle garde est
> pire que son absence : elle occupe la place.*

---

## 🟠 Environnement, CI et gardes

### D-00 — 26 avis de sécurité sur 5 paquets, dont 8 de sévérité haute ✅ *découvert et soldé le 2026-08-12*

Trouvé **par accident**, en rafraîchissant l'empreinte du `composer.lock` après la correction de
D-01 : `composer` a signalé *« Found 26 security vulnerability advisories affecting 5 packages »*.
Personne ne l'avait vu, parce que **`composer audit` n'était lancé nulle part** — ni en CI, ni au
déploiement.

| Paquet | Avis | Le plus grave |
|---|---|---|
| `guzzlehttp/guzzle` | 9 (1 haute) | *Noncanonical host can bypass host-based checks* (CVE-2026-69246) |
| `league/commonmark` | 6 (4 hautes) | déni de service par XML profondément imbriqué |
| `dompdf/dompdf` | 6 | fuite d'existence de fichiers via SVG embarqué |
| `phpoffice/phpspreadsheet` | 3 (3 hautes) | épuisement mémoire sur XLS/OLE forgé |
| `guzzlehttp/psr7` | 2 | *Host Confusion via Weak URI Host Validation* |

**Soldé** : les cinq paquets mis à jour dans leurs plages de compatibilité — aucune montée de
version majeure, aucun changement de code applicatif. `guzzle` a demandé un second passage
(`7.15.2` exige `promises ^2.5.1`, épinglé en `2.5.0`), ce qui explique qu'une première mise à jour
l'ait laissé vulnérable.

**Vérifié** : `composer audit` → *« No security vulnerability advisories found »*, et **2052 tests
verts** après la mise à jour.

> **Ce qui reste ouvert, et qui compte plus que les cinq correctifs** : rien ne relancera cet audit.
> Ces avis se sont accumulés parce qu'aucune étape ne les regardait — trois des cinq paquets sont
> exposés à des données non fiables (`guzzle` sur les webhooks entrants, `commonmark` sur du texte
> utilisateur, `phpspreadsheet` sur des fichiers téléversés). Une étape `composer audit` en CI est
> la garde manquante ; elle n'a pas été ajoutée dans ce chantier parce qu'un avis publié un matin
> rendrait la CI rouge sur une PR qui n'y est pour rien. **C'est un arbitrage à poser** : audit
> bloquant sur les sévérités hautes, ou tâche planifiée qui ouvre un ticket.

### D-06 — Le frontend n'avait aucune CI ✅ *soldé le 2026-08-12*

`.github/workflows/` ne contenait qu'`api-ci.yml`, filtré sur `paths: takussan-api/**`. **Une PR ne
touchant que le frontend ne déclenchait rigoureusement rien** — ni les 802 tests vitest, ni ESLint,
ni `tsc`, ni le build.

Conséquence mesurée sur la pointe de `dev` : **trois régressions y vivaient depuis 53 à 94 jours** —
un test en échec (`FeatureFlagProvider`), une erreur ESLint bloquante
(`react-hooks/set-state-in-effect` dans `UserLocationProvider`), une erreur TypeScript
(`afterEach` non importé dans `FloatingDock.test.tsx`).

**Soldé** : les trois sont corrigées, et `.github/workflows/web-ci.yml` exécute désormais lint,
`tsc --noEmit`, tests et build. Le test réparé couvre en plus la porte `enabled: Boolean(user)` que
son commit d'origine avait introduite sans test — et la couverture est **prouvée par mutation**.

### D-07 — La CI était rouge depuis six semaines, sur une ligne vide ✅ *soldé le 2026-08-12*

`./vendor/bin/pint --test` échouait sur **un seul fichier** (`InventoryStoreRequest.php`, fixer
`class_attributes_separation` — une ligne blanche en trop). Comme Pint s'exécute **avant** `Run
tests`, **les 2052 tests de la suite n'avaient plus tourné en CI depuis le 2026-06-29**.

Le coût n'est pas le style : c'est que la garde qui compte a été éteinte par la garde qui ne compte
pas, et que personne ne l'a vu parce que le pipeline était rouge « pour du lint ».

**Soldé** : Pint appliqué, CI verte, 2052 tests verts.

**Reste ouvert** : la règle « Pint avant chaque commit » n'est imposée par **aucun mécanisme** — pas
de hook, pas de `lint-staged`. Elle repose sur la discipline, et la discipline a échoué six semaines.

### D-08 — Les tests écrivaient dans l'index Meilisearch réel du développeur ✅ *soldé le 2026-08-12*

> **Soldé** : `phpunit.xml` pose `SCOUT_PREFIX=testing_`. La suite n'écrit plus dans les index de
> travail. Le prérequis d'une instance Meilisearch reste entier — c'est ADR-0008, pas une dette —
> et `docker-compose.yml` la fournit.


`phpunit.xml` force `SCOUT_DRIVER=meilisearch` **sans repli**, et ne définit ni `MEILISEARCH_HOST`,
ni `MEILISEARCH_KEY`, ni **`SCOUT_PREFIX`**. Conséquence : `php artisan test` indexe et supprime dans
l'instance locale du développeur, sur les mêmes index que son environnement de travail. Aucune
isolation.

Corollaire : un développeur sans Meilisearch **ne peut pas lancer la suite du tout**.

**Preuve** : `takussan-api/phpunit.xml` bloc `<php>` · 10 fichiers de test en dépendent.

**Correctif** : poser `SCOUT_PREFIX=testing_` dans `phpunit.xml`.

### D-09 — Aucune version d'infrastructure n'est figée 🟠 → [TCK-298](backlog/tickets/TCK-298-versions-infra-production-non-epinglees.md)

> **Périmètre réduit à la production, re-mesuré le 2026-08-16.** Le développement et la CI sont
> désormais épinglés des deux côtés (`mysql:8.0`, `getmeili/meilisearch:v1.16`, `redis:8-alpine`,
> `mailpit:v1.30.3` ; php `8.4` en CI). Il reste la colonne « production », et la raison en est plus
> nette qu'écrit plus bas : `scripts/server-setup.sh` **n'installe rien** — il vérifie la présence de
> PHP-FPM et de nginx et imprime la commande à lancer à la main. Le provisionnement de production est
> entièrement manuel, et aucune version n'y est écrite.

| Service | Dev (brew) | CI | Production |
|---|---|---|---|
| Meilisearch | 1.36.0 | v1.16 | `apt install meilisearch` (latest) |
| Base | MySQL 9.3.0 | SQLite `:memory:` | **MySQL 8.0.46** *(mesuré le 2026-08-13)* |
| Redis | 8.0.2 | *(absent)* | *(absent)* |
| PHP | 8.4.6 | 8.4 | 8.3 *(cf. D-01)* |
| Node | 24.18 | *(aucune CI web avant D-06)* | Vercel (non déclaré) |

Trois environnements, trois piles différentes, aucune épinglée. `docker-compose.yml` fige désormais
la moitié dev (MySQL 8.0 aligné sur la production **mesurée**, Meilisearch v1.16 alignée sur la CI,
Redis 8) — la production, elle, reste posée par `apt` sans version épinglée dans le dépôt.

### D-10 — Le déploiement du frontend est entièrement hors dépôt 🟠 → [TCK-299](backlog/tickets/TCK-299-deploiement-frontend-hors-depot.md)

> **Confirmé le 2026-08-16, et resserré :** `deploy.yml` et `deploy-preview.yml` citent **zéro**
> fichier de `takussan-web/` — les deux ne déploient que l'API. `web-ci.yml` existe depuis D-06 mais
> **teste**, il ne déploie pas.

L'application Next.js — 875 fichiers, 111 pages — n'est déployée par **aucun** workflow ni script du
dépôt. Pas de `vercel.json`, pas de mapping branche→environnement documenté. La seule trace de
Vercel dans le dépôt est une regex d'origine CORS côté Laravel.

Il est donc **impossible de savoir, depuis le code, quelle branche déploie quel environnement front**.

### D-11 — Le guide de déploiement contredit les `.env` réellement livrés 🟠 → [TCK-300](backlog/tickets/TCK-300-guides-deploiement-contredisent-env-livres.md)

> ⚠️ **Les écarts ci-dessous datent du 2026-08-12 et n'ont PAS été re-mesurés ligne par ligne.**
> `docs/configuration.md` a été corrigé depuis (le 2026-08-16) sur sa contradiction Meilisearch : la
> reprise du ticket part de l'état courant des fichiers, pas de la citation qui suit.

`docs/infra/deploy-preview.html` prescrit `CACHE_STORE=database`, `SESSION_DRIVER=database`,
`MAIL_MAILER=log` — les `.env.preview` / `.env.prod` livrés utilisent `redis`, `redis`, `resend`.
`docs/configuration.md` §5.7 prescrit `QUEUE_CONNECTION=redis` alors que les deux `.env` utilisent
`database`, et exige `SESSION_SECURE_COOKIE=true` / `SESSION_SAME_SITE=lax`, **absents des deux**.

La checklist de production n'a jamais été confrontée aux fichiers qu'elle prétend décrire.

### D-12 — `.env.example` ne reproduit aucun environnement existant ✅ *atténué le 2026-08-12*

Il livrait `DB_CONNECTION=sqlite` (prod : MySQL 8), `SCOUT_DRIVER=collection` (CI et prod :
Meilisearch), et `CACHE_STORE=redis` **sans que rien ne provisionne Redis** — ni la CI, ni
`server-setup.sh`, et le guide dit explicitement « pas de Redis ». Un développeur qui suivait la
documentation obtenait une application qui ne démarre pas.

**Atténué** : `takussan-api/.env.docker` aligne chaque driver sur la production et est servi par
`docker-compose.yml` ; `scripts/check-env-parity.mjs` garde la parité des clés entre les deux
fichiers (83 clés de chaque côté), et la garde est **prouvée par mutation**.

**Reste ouvert** : `.env.example` lui-même n'a pas été corrigé — il reste le contrat des *clés*, mais
ses *valeurs* décrivent toujours un environnement fictif. Le corriger casserait la CI, qui fait
`cp .env.example .env` ; c'est un arbitrage à poser, pas un oubli.

### D-13 — Deux pièges du seeding, muets tous les deux 🟡 → [TCK-301](backlog/tickets/TCK-301-pieges-muets-environnement-developpement.md)

> **Confirmé le 2026-08-16** — et **aggravé par D-54** : `.env.example` est l'environnement de TEST
> de la CI. `SEED_DOWNLOAD_MEDIA=true` n'y est donc pas seulement un piège d'onboarding, c'est de la
> configuration de suite. Le ticket traite ces deux pièges avec D-48, qui est de la même famille.

`SEED_DOWNLOAD_MEDIA=true` dans `.env.example` alors que le défaut du code est `false` : le premier
`migrate:fresh --seed` d'un nouveau développeur déclenche **1000 à 2700 téléchargements HTTP** vers
picsum.photos (timeout 15 s chacun), **avec tous les échecs avalés en silence**.

Et `LARAVEL_PDF_DRIVER=cloudflare` avec les deux identifiants vides : la génération de PDF est cassée
par défaut en développement. Le seul driver disponible en local est `dompdf`, et il n'est déclaré que
dans `phpunit.xml`. *(Corrigé dans `.env.docker`.)*

### D-47 — TCK-289 a corrigé le dépôt, pas la machine : le conteneur de base tournait MariaDB 11.4 ✅ *soldé le 2026-08-16 — mesuré sur le démon*

> **État au 2026-08-16 — le conteneur a été recréé, et c'est mesuré sur la machine, pas déduit
> du compose.** L'orphelin `takussan-mariadb-1` a disparu ; `docker ps` ne rend plus qu'un
> `takussan-mysql-1` sur `mysql:8.0`, et le démon interrogé directement répond
> `mysql Ver 8.0.46 for Linux on aarch64 (MySQL Community Server - GPL)`. C'est le moteur exact
> de la production, mesuré des deux côtés. `scripts/check-db-engine.mjs` reste vert.
>
> Le **résidu** de TCK-289 signalé plus bas est corrigé lui aussi : `takussan-api/.env.docker`
> ne dit plus « la production tourne sur MariaDB » (ligne 8), et son en-tête de section base
> nomme le service `mysql` du compose et non un service `mariadb` qui n'existe plus (ligne 65).
> *C'était la dernière phrase du dépôt qui affirmait encore le mauvais moteur — et elle vivait
> dans le fichier dont tout le propos est de refléter la production mesurée.*
>
> **Preuve** : `docker ps --format '{{.Names}}\t{{.Image}}'` → `takussan-mysql-1  mysql:8.0` ·
> `docker exec … mysql --version` → `8.0.46` · `node scripts/check-db-engine.mjs` → vert.
>
> Ce qui suit est conservé tel quel : c'est le constat du 2026-08-15, et l'effacer ferait perdre
> la leçon — *un correctif de configuration n'est pas déployé tant qu'aucune machine ne
> l'exécute.*

Le commit `8bba28bc` (TCK-289, 2026-08-13) a basculé `docker-compose.yml` de `mariadb:11.4` vers
`mysql:8.0` — c'est le correctif de D-43. **Le conteneur, lui, n'a jamais été recréé.** Deux jours
plus tard :

```
$ docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'
takussan-mariadb-1   mariadb:11.4   127.0.0.1:3307->3306/tcp
$ docker exec takussan-mariadb-1 mariadb --version
mariadb from 11.4.12-MariaDB, client 15.2
$ docker inspect takussan-mariadb-1 --format '{{.Created}}'
2026-08-12T16:52:02Z
```

**Et c'est pire qu'un conteneur périmé : c'est un orphelin qui squatte le port de son remplaçant.**
Le service a été *renommé* en même temps que l'image — le conteneur qui tourne porte le label
`com.docker.compose.service=mariadb`, et `docker compose config --services` rend aujourd'hui
`mailpit, meilisearch, mysql, redis`. Le service `mariadb` **n'existe plus**. Docker Compose ne
reconnaît donc pas ce conteneur comme la version périmée du service `mysql` : il le voit comme un
orphelin sans rapport, qu'il ne remplacera pas — pendant qu'il tient `127.0.0.1:3307`, le port exact
que le nouveau service `mysql` réclame.

Sans effet sur la suite de tests, qui tourne sur SQLite. Mais `./dev.sh`, `php artisan migrate` et
toute inspection manuelle de la base de développement parlent au **mauvais moteur** — celui-là même
dont D-43 a démontré qu'il accepte des DDL que la production refuse. La garde
`scripts/check-db-engine.mjs` n'attrape rien : elle compare des **fichiers du dépôt** entre eux, et
ils sont tous d'accord. *C'est la leçon de D-04 et D-43 servie une troisième fois, cette fois-ci à
un cran encore plus près : ne jamais déduire l'état d'un environnement de la configuration qui le
vise — pas même quand cette configuration vient d'être corrigée, et pas même quand une garde CI la
surveille.*

**Résidu de TCK-289 trouvé au passage** *(corrigé le 2026-08-16, cf. l'encadré en tête d'entrée)* :
`takussan-api/.env.docker:8` justifiait encore son existence par *« il pose `DB_CONNECTION=sqlite`
quand la production tourne sur MariaDB »* — dans le fichier dont tout le propos est d'aligner les
drivers sur la production **mesurée**, qui est MySQL 8.0. La ligne 65 du même fichier nommait par
ailleurs un *« service `mariadb` du compose »* qui n'existe plus depuis TCK-289.

**Preuve** : `docker ps` · `docker inspect takussan-mariadb-1` (label `com.docker.compose.service=mariadb`,
créé le 2026-08-12, soit la veille du correctif) · `docker compose config --services` → pas de
`mariadb` · `docker-compose.yml:77-81` (`mysql:` / `image: mysql:8.0`) · `takussan-api/.env.docker:8`.

**Correctif** : `docker compose down --remove-orphans && docker compose up -d` — et comme le volume
`mysql-data` a été initialisé par MariaDB, il faut **le supprimer** pour que
`docker/mysql-init.sql` rejoue et que la collation `utf8mb4_0900_ai_ci` soit réellement posée
(l'en-tête du script le dit : il n'est joué qu'à la première création du volume). Une note dans
`./dev.sh doctor`, qui compare déjà le déclaré au vivant, éviterait la prochaine occurrence : *un
correctif de configuration n'est pas déployé tant qu'aucune machine ne l'exécute.*

### D-54 — La CI utilise `.env.example` comme environnement de TEST : toute valeur qu'on y ajoute devient de la configuration de suite ✅ *mesuré et soldé le 2026-08-16*

**Le symptôme, mesuré :** la suite backend verte en local — **2311 passés, 0 échec** — et
**14 échecs en CI** sur le même commit, sur `SmsChannelTest`, `SmsRouterDriverTest`,
`OrangeOAuthLockTest` et `WhatsappChannelTest`. Tous avec le même message,
« *An expected request was not recorded* », qui accuse le code applicatif.

**La cause n'est dans aucun de ces quatre fichiers** — la branche n'en touchait aucun. Elle est
dans `api-ci.yml:58` : `cp .env.example .env`. **La CI n'a pas d'environnement de test à elle : elle
prend le fichier d'exemple.** Toute clé ajoutée à `.env.example` devient donc, sans que personne
ne le décide, de la configuration de la suite.

La branche y avait ajouté quatre clés à VIDE :

```
SMS_ORANGE_OAUTH_URL=
SMS_ORANGE_SEND_URL=
SMS_MTARGET_SEND_URL=
SMS_LAM_SEND_URL=
```

Or `config/sms.php` leur donne un défaut réel — `env('SMS_ORANGE_SEND_URL', 'https://api.orange…')`.
**Une clé déclarée à vide n'est pas une clé absente** : `env()` rend `''`, et le défaut ne
s'applique jamais. Les drivers se retrouvent sans URL, n'émettent aucune requête HTTP, et
`Http::assertSent()` échoue.

**Le poste de travail ne pouvait pas le voir**, et c'est le cœur du problème : le `.env` local ne
porte pas ces clés, donc les défauts de `config/sms.php` s'appliquent et la suite est verte. *Deux
environnements qui lisent deux fichiers différents ne mesurent pas la même chose — et c'est celui
qu'on ne regarde pas qui décide du rouge.* C'est le pendant exact de D-44 (« vert au repos »),
retourné : ici, vert en local et rouge en CI.

**Correctif** : les quatre URLs sont épinglées dans `phpunit.xml`, aux valeurs exactes des défauts
de `config/sms.php`, avec la même justification que `DB_CONNECTION`, `CACHE_STORE` ou
`SCOUT_DRIVER` — *une suite qui dépend du `.env` ne mesure pas le code, elle mesure la machine*.
Les entrées `<env>` de PHPUnit sont posées avant l'amorçage de Laravel, et Dotenv ne les écrase
pas : elles priment donc sur le fichier `.env`, quel qu'il soit.

**Vérifié dans les deux conditions**, et pas seulement dans celle qui arrangeait : `.env` local
inchangé → 36 passés ; `.env` local AUGMENTÉ des quatre clés à vide, c'est-à-dire la condition CI
exacte → **36 passés** aussi. Avant le correctif, cette seconde condition rendait 14 échecs, le
même ensemble et aux mêmes lignes qu'en CI.

> **Ce qui RESTE ouvert** : la cause racine n'est pas corrigée. `.env.example` reste l'environnement
> de test de la CI, donc le prochain qui y ajoutera une clé à vide dont la config a un défaut réel
> rouvrira la même panne, sur d'autres tests. Deux sorties possibles — un `.env.ci` dédié, ou une
> garde qui refuse dans `.env.example` toute clé vide dont `config/` porte un défaut non vide. Ni
> l'une ni l'autre n'est tranchée ici.

**Preuve** : `.github/workflows/api-ci.yml:58` · `config/sms.php:143,144,151,156` ·
`gh run list --branch dev --workflow "API CI"` → succès au 2026-08-15 (le rouge vient bien de la
branche) · exécution de la suite avec et sans les quatre clés dans `.env`.

### D-48 — Le `.env` de développement vise les services natifs, jamais les conteneurs du dépôt 🟠 *dette d'ONBOARDING, pas de dépôt — mesurée le 2026-08-15* → [TCK-301](backlog/tickets/TCK-301-pieges-muets-environnement-developpement.md)

`takussan-api/.env` est **ignoré par git**. Cette entrée ne décrit donc pas un fichier du dépôt à
corriger, mais **l'écart entre ce que le dépôt provisionne et ce que la machine de développement
utilise réellement** — un écart qu'aucune garde ne peut voir, par construction.

| Ce que le dépôt sert | Ce que le `.env` local vise |
|---|---|
| Meilisearch v1.16 en conteneur, `127.0.0.1:7701` | `MEILISEARCH_HOST=http://localhost:7700` — l'instance **brew native** |
| MySQL 8.0 en conteneur, `127.0.0.1:3307` | `DB_PORT=3306` — le **MySQL natif** |

**Conséquence mesurée sur Meilisearch, et elle est nette :**

```
$ curl -s 127.0.0.1:7701/indexes        # le conteneur du dépôt
{"results":[],"offset":0,"limit":20,"total":0}
$ curl -s 127.0.0.1:7700/health         # l'instance brew native
{"status":"available"}
```

**Zéro index dans le conteneur.** Ni la suite de tests, ni l'application de développement n'ont
jamais touché le service que `docker-compose.yml` prétend fournir. Le conteneur tourne depuis le
2026-08-12 et n'a rien fait d'autre que tourner.

Ce que cela coûte : tout ce que l'environnement conteneurisé était censé garantir
([ADR-0011](adr/0011-environnement-de-dev-conteneurise.md), D-09, D-43) — versions épinglées,
moteur aligné sur la production mesurée, isolation du poste — **ne s'applique à personne**. Les
ports décalés (3307, 7701, 6380) avaient été choisis pour rendre les deux mondes simultanés plutôt
que d'exiger qu'on démonte l'existant ; le résultat est qu'ils sont bien simultanés, et que c'est
**l'ancien** qui sert. Et la mesure de D-44 — 3308 tâches d'indexation, barrière à 10 s — a été
prise sur l'instance brew, pas sur la v1.16 épinglée : les deux ne se comportent pas nécessairement
pareil sous charge.

**Preuve** : `grep -n MEILISEARCH takussan-api/.env` → `http://localhost:7700` ·
`grep -n DB_PORT takussan-api/.env` → `3306` · `GET 127.0.0.1:7701/indexes` → `"total":0` ·
`GET 127.0.0.1:7700/health` → `available` · `.gitignore` — `.env` non suivi.

**Correctif** : `cp takussan-api/.env.docker takussan-api/.env && php artisan key:generate`, qui est
exactement ce que l'en-tête de `.env.docker` prescrit. **Et une garde qui le rende visible** :
`./dev.sh doctor` sonde déjà ce que le `.env` déclare, mais il ne dit pas que ce que le `.env`
déclare **n'est pas ce que le dépôt sert**. C'est la seule famille de dettes de ce document
qu'aucune CI ne pourra jamais attraper — elle vit dans un fichier ignoré — donc la seule réponse
possible est de l'afficher au démarrage.

---

## 🟠 Documentation qui ment

C'est la famille la plus dense, et la plus coûteuse à la reprise : **lire un document faux coûte plus
cher que de ne rien lire**, parce qu'on ne s'en méfie pas.

### D-14 — `CLAUDE.md` et `AGENTS.md` décrivaient deux squelettes vides ✅ *soldé le 2026-08-12*

Le premier fichier que lit tout agent affirmait *« takussan-api : skeleton vierge. Seuls
`Controller.php` (abstract) et `User.php` existent »* et *« takussan-web : scaffold vierge
(create-next-app) »*. Faux depuis **118 jours** (écrit le 2026-04-15, reformulé le 2026-04-16,
jamais corrigé malgré deux éditions ultérieures) et **308 commits**, pour un dépôt de ~166 000 lignes
applicatives.

`AGENTS.md` en portait une **copie encore plus ancienne** (sans la section sur les pièges MySQL) et
pointait vers un dossier `.Codex/commands/` inexistant.

**Soldé** : `CLAUDE.md` réécrit sur des chiffres mesurés ; `AGENTS.md` ne duplique plus rien et y
renvoie ; `takussan-api/CLAUDE.md` et `takussan-web/CLAUDE.md` créés.

### D-15 — `docs/backlog/INDEX.md` était faux à 80 % ✅ *soldé le 2026-08-12*

**213 de ses 266 entrées** rangeaient un ticket dans une section que son frontmatter contredit. Il
affichait **40 tickets à faire et 177 en review** là où les frontmatters comptaient **3 et 2**.

Le document se condamnait lui-même : il déclarait en tête *« Vue kanban projetée depuis les
frontmatters »* puis *« le maintenir à la main »*. La colonne « Review » (177 entrées) ne
correspondait à **aucune PR ouverte** — `gh pr list --state open` rend `[]`, et les 39 numéros de PR
qu'elle citait sont **tous mergés**. Le premier ticket de la colonne « Todo » — la convention
documentée pour « implémente la tâche suivante » — était `done` depuis trois mois.

Trois encodages de statut se contredisaient dans un seul document : la section, un marqueur inline
`**[review]**`, et le frontmatter.

**Soldé** : `INDEX.md` est désormais **généré** par `docs/backlog/gen-index.mjs` depuis les
frontmatters, et `docs/backlog/check-backlog.mjs` garde sa fraîcheur. Les deux tournent en CI.

### D-16 — `docs/backend-gap-report.md` est un piège ✅ *banni le 2026-08-12*

> **Traité** : bandeau de péremption en tête du document, qui nomme trois de ses affirmations
> fausses avec le chemin qui les contredit. Conservé pour son historique et sa méthode — un audit
> périmé reste un modèle d'audit.


Il se présente comme un audit systématique code-vs-spec (338 lignes, daté du 18/04/2026) et déclare
**25 fonctionnalités « ❌ non implémenté »**. **20 d'entre elles sont implémentées aujourd'hui** —
« Aucun endpoint `unpublish` n'existe » alors que `routes/api/properties.php:42` le définit,
« Dupliquer un bien ❌ » alors que la route et `PropertyPolicy::duplicate()` existent, « Aucun job de
rappel de visite » alors que `SendPropertyVisitReminders` est planifié toutes les 5 minutes.

Un agent qui le lit pour prioriser rouvre des chantiers finis.

**Action** : archiver avec un bandeau de péremption, ou re-mesurer.

### D-17 — `docs/plans/routing-layouts-roles.md` prescrit une stack révoquée ✅ *banni le 2026-08-12*

> **Traité** : bandeau de révocation, avec le tableau « il prescrit / le projet est en ».


589 lignes qui imposent **Next.js 14**, **Tailwind v3** et la palette « Takussan Heritage »
(`#022448`, `#7d5630`, `#fff8f5`) avec des « Règles absolues » (« JAMAIS de `border-b` »,
« uniquement `shadow-[0_0_40px_…]` »). Le projet est en **Next 16, Tailwind v4, palette « Lin »**
depuis TCK-129.

Le ton impératif est ce qui rend ce document dangereux : il ne se présente pas comme une piste.

### D-18 — `docs/models-spec.md` ignore 16 modèles existants 🟠 → [TCK-310](backlog/tickets/TCK-310-models-spec-16-modeles-absents.md)

> **Re-mesuré le 2026-08-16 : le COMPTE tient à l'unité (16 sur 62 modèles de premier niveau), la
> LISTE a vieilli.** `BankStatement`, `BankStatementLine` et `PropertyPriceHistory` figurent dans la
> liste ci-dessous et sont désormais documentés ; `RoleDelegation`, `WizardDraft`, `ThresholdAlert`,
> `WelcomeView`, `PropertyContactLead` et `PropertyReport` manquent et n'y figuraient pas. Deux
> inventaires peuvent donner le même total sans décrire le même trou — *un inventaire de dettes se
> re-mesure avant d'être utilisé, jamais lu.* Liste courante : voir le ticket.

Désigné source de vérité data, il ne mentionne **aucune** fois : `AccountDeletionRequest`,
`AlertRule`, `DataExport`, `FeatureFlag`, `IntegrationWebhookLog`, `KpiConfig`, `MaintenanceWindow`,
`NotificationDeliveryAttempt`, `PropertyPriceHistory`, `ReportExport`, `ScheduledTaskRun`,
`BankStatement`, `BankStatementLine`… et documente toujours `spatie/laravel-permission` comme
« package transversal » alors qu'il est **désinstallé** et qu'une garde CI casse sur ses imports.

`docs/sync-passes/INDEX.md` affiche par ailleurs un statut de convergence faux (« R1–R7 toujours non
appliquées » alors que R1 et R2 l'ont été), et la rupture qu'il signale date de **plus de trois
mois**.

### D-19 — Cinq documents cités n'existent pas 🟡 → [TCK-311](backlog/tickets/TCK-311-documents-perimes-et-pointeur-mort.md)

> **Re-mesuré le 2026-08-16 : il n'en reste qu'UN.** Un balayage de tous les chemins `docs/*.md`
> cités par `features.md` et `models-spec.md` ne trouve plus qu'un seul pointeur mort —
> `docs/claude-code-prompt-notifications.md`. `docs/takussan-whatsapp-implementation.md` est
> toujours absent du disque mais n'est **plus cité** par les deux specs. La dette a fondu de 5 à 1
> sans que personne ne l'écrive : c'est le pendant exact de D-31, qui a grossi sans que personne ne
> l'écrive non plus.

Dont un cité par **les deux specs sources** : `docs/takussan-whatsapp-implementation.md`
(`features.md:382`, `models-spec.md`, TCK-282), `docs/claude-code-prompt-notifications.md`
(`models-spec.md`), et trois autres.

Un pointeur mort dans une source de vérité est une dette que M8 de pharma-rebuild a payée en vrai —
un chemin cité pendant des semaines qui n'existait pas.

### D-20 — Deux backlogs concurrents, sans arbitrage ✅ *arbitré le 2026-08-12*

> **Arbitré** : `docs/backlog-mvp/index.md` porte un bandeau qui dit que la stratégie n'a pas été
> suivie, et ses 12 tickets passent `obsolete`. L'agrégat des `todo` sur `docs/` rend désormais 3,
> et non 15. Le raisonnement produit — WhatsApp d'abord, entrée sans authentification — est
> explicitement conservé : ce sont des arbitrages de marché, ils n'ont pas vieilli comme les
> tickets.


`docs/backlog/` (265 tickets) et `docs/backlog-mvp/` (12 tickets, stratégie « vertical slice / zero
auth / WhatsApp first / 5 weekends »). **Les 12 tickets du second sont tous `status: todo` alors
qu'ils décrivent des fonctionnalités livrées depuis avril.** Un outil qui agrège les frontmatters
`todo` sur `docs/` compte **15 tickets ouverts au lieu de 3**.

### D-21 — Des docblocks décrivaient un package désinstallé ✅ *soldé le 2026-08-15*

> **Déclaré soldé le 2026-08-12 sur cinq corrections. Il en restait au moins quatorze.**
>
> C'est la partie instructive de cette dette : *une dette de documentation ne se solde pas en
> corrigeant les occurrences qu'on a sous les yeux.* Les cinq premières avaient été trouvées en
> lisant le code du cutover ; les quatorze suivantes vivaient dans des fichiers que le cutover ne
> touchait pas — services d'invitation, onboarding, notifications, bootstrap super-admin. Aucune
> n'était visible depuis le diff de TCK-278, et c'est précisément pour ça qu'elles ont survécu.
>
> **Solde réel (2026-08-15, TCK-278)** — corrigés : `HostOnboardingController`,
> `Api/Agency/TeamController`, `Api/AgencyController`, `Api/LeaseDepositRefundController`,
> `Public/InvitationAcceptController`, `Notifications/SuperAdminAcceptedBroadcast`,
> `Models/Concerns/HasProfiles` (3ᵉ occurrence), `Services/Agency/AgencyUpgradeRequestService`,
> `Services/Auth/SuperAdminBootstrapService`, `Services/Auth/SuperAdminCooptationService`,
> `Services/Invitation/{Agent,Owner,ServiceProvider}InvitationService`,
> `Services/Invitation/InvitationService`, `Services/Lease/RentReviewService`,
> `Services/Onboarding/HostIndividualOnboardingService` (2 occurrences),
> `Api/UserAdminController` (formulation ambiguë : c'était le query-builder).
>
> **Le pire était `HostOnboardingController.php:61`** : « the spatie role attachment **is still the
> source of truth** for permission checks ». Pas une tournure au passé mal relue — une affirmation
> au présent, sur le mécanisme d'autorisation, dans un contrôleur d'onboarding. Un agent qui la lit
> avant d'écrire du code raisonne sur un package désinstallé.
>
> **Un cas de forme à connaître** : `AgencyUpgradeRequestService` portait deux docblocks EMPILÉS —
> le mensonge spatie détaillé, puis le correctif TCK-278 en une ligne juste dessous. PHP n'associe
> que le dernier à la méthode ; un humain lit les deux et croit le plus détaillé. Corriger en
> ajoutant un bloc, sans retirer l'ancien, ne corrige rien.
>
> Les mentions de `laravel-query-builder`, `laravel-medialibrary`, `laravel-activitylog`,
> `Spatie\Image` et `laravel-pdf` sont restées : ces paquets-là sont bien installés. Le tri s'est
> fait à la lecture, occurrence par occurrence — le seul mot « spatie » ne distingue pas un paquet
> vivant d'un paquet mort.


`spatie/laravel-permission` a été retiré par TCK-278, mais le code continue de le décrire :
`HasProfiles` se présente comme « Sister trait of HasRoles (spatie) », `LeasePolicy` parle d'« une
permission `leases.renew` (Spatie) », et `bootstrap/app.php` présente `ResolveActiveProfile` comme
« sole owner of the spatie team context » qui « locks `setPermissionsTeamId()` ».

*Le commentaire survit au code qu'il décrit — et il survit avec la même autorité qu'un commentaire
juste.*

### D-22 — La règle du montant ×100 ne vivait que dans un commentaire ✅ *écrite ET gardée le 2026-08-12*

> **Soldé, en deux temps.**
>
> **Écrite** : [ADR-0009](adr/0009-montant-decimal-entier-a-la-frontiere.md), et principe non
> négociable n°3 de `CLAUDE.md`.
>
> **Gardée** : `tests/Feature/Api/PaymentAmountScaleTest.php` éprouve la chaîne complète — ce que
> `PaymentGatewayService` multiplie, chaque driver XOF le redivise, et le fournisseur reçoit
> exactement le montant de la base. **Prouvé par mutation** : retirer `/ 100` des deux drivers fait
> rougir les deux cas.
>
> **Le troisième cas est celui qui compte le plus.** Un correctif naïf — « on divise partout » —
> passerait les deux premiers au vert **et casserait la facturation SaaS**, qui est en USD, une
> devise à deux décimales dont le fournisseur attend de vrais centimes. Sans ce cas, on ne saurait
> pas distinguer une règle juste d'une règle appliquée partout. Vérifié aussi par mutation : il
> reste vert quand les deux autres rougissent, ce qui est le comportement attendu.
>
> **Ce que la mesure a trouvé au passage** : `PaymentDriverTest::test_orange_money_driver_initiate_calls_api`
> n'assertait que le `transactionId`. Le montant transmis à Orange Money n'était vérifié **par
> rien** — seul Wave l'était, et par accident.


**XOF n'a pas de sous-unité.** Le montant est décimal en base et devient un entier ×100 à la
frontière du driver de paiement — chaque driver local doit donc **re-diviser par 100**. Cette règle
n'est écrite dans **aucune spec** : sa seule trace est un commentaire de code.

C'est un piège actif : un nouveau driver de paiement écrit sans elle facture **cent fois trop**, ou
cent fois trop peu. Classé P0 malgré son apparence documentaire.

### D-23 — La duplication d'autorisation PHP↔TS n'était gardée par rien ✅ *gardée le 2026-08-12 — et la garde a trouvé un trou*

> **Gardée** : `scripts/check-pro-routes.mjs` vérifie que toute route de `PRO_ROUTES` est gardée
> côté serveur, et tourne dans `repo-ci.yml`. Prouvée par mutation, dans les deux sens — écart
> retiré de l'allowlist → rouge, allowlist devenue périmée → rouge aussi.
>
> **⛔ CORRECTION du 2026-08-15 — deux affirmations de cette entrée étaient fausses, et la seconde
> l'était depuis trois mois.**
>
> 1. « `DashboardController` ne porte aucun `AgencyKindGuard` » — **faux depuis le 2026-05-12**.
>    Le contrôleur qui sert `/api/dashboard/agency` s'appelle `DashboardAgencyController`
>    (`routes/api/dashboard.php`), et il abort en 403 sur `kind !== Standard`, avec un test qui le
>    prouve (`DashboardAgencyTest::test_individual_agency_admin_receives_403`). L'affirmation
>    venait d'un grep sur la chaîne `AgencyKindGuard` — **le faux négatif par recherche de jeton
>    que cette même entrée passe dix lignes à documenter, commis un étage plus bas.** Une garde
>    écrite en ligne ne porte pas le nom du helper.
> 2. « Les quatre écarts sont nommés dans `ECARTS_ASSUMES` » — la map est **vide**, et c'est
>    l'état sain revendiqué par le script lui-même.
>
> **Refermé par TCK-284, le 2026-08-15** : la décision produit a été prise (le carnet de
> propriétaires est réservé aux agences `standard` — TCK-256 confirmé, et la règle est désormais
> écrite dans `docs/features.md` §1.12, ce qu'elle n'avait jamais été) ; `GET /api/owners` porte
> `AgencyKindGuard`, prouvé par `OwnerProfileListingTest` ; les KPI et les alertes de seuil, que
> **aucune** spec ni aucun ticket ne réserve, sont sortis de `PRO_ROUTES` et de leurs pages. Il
> reste 7 routes, gardées 7/7. Le message vert du script n'énumère plus un état de l'API qu'il ne
> mesure pas : il annonce sa portée.
>
> **Ce qu'elle a trouvé à sa première exécution.** `pro-features.ts` affirmait, dans un
> commentaire, que *« the pages themselves redirect to `/app` server-side, which is the ultimate
> gate »*. Mesuré : **vrai pour 5 routes sur 9**. Les quatre routes `/app/*` —
> `/app/overview/kpis`, `/app/overview/alerts`, `/app/overview/agency`, `/app/owners` — affichaient
> un cadenas dans la barre latérale **sans aucune garde serveur**. Le cadenas n'empêchait que le
> clic ; une URL tapée à la main passait.
>
> **⛔ CORRECTION du 2026-08-12 (soir) — la mesure ci-dessous était FAUSSE.** Une revue de code a
> établi que les quatre routes `/app/*` **sont** gardées côté serveur : elles écrivent le test
> **en ligne** (`if (agency.kind !== 'standard') redirect('/app')`) au lieu d'appeler le helper.
> La garde ne cherchait que la chaîne `ensureStandardAgencyOrRedirect` : elle a rendu un faux
> négatif avec l'autorité d'une mesure, et le cadenas a été retiré devant des pages qui gardent.
> **Rétabli** — les 9 routes sont dans `PRO_ROUTES`, la garde reconnaît les deux formes et refuse
> de conclure au doute. *Une garde qui cherche un JETON ne mesure pas la PROPRIÉTÉ* : c'est
> l'anti-patron que cette ardoise documente partout, commis par l'ardoise elle-même.
>
> *Ce qui suit était le raisonnement d'origine. Conservé : il montre comment un faux négatif se
> propage en décision.*
>
> ~~**RÉSOLU le 2026-08-12 — et pas dans le sens attendu.**~~ La mesure du backend a tranché la
> question : les endpoints des quatre routes (`KpiConfigController`, `ThresholdAlertController`,
> `owners`, `DashboardController`) **ne portent aucun `AgencyKindGuard` non plus**. La restriction
> n'existait donc **nulle part** — ni page, ni API : elle n'avait jamais été un comportement,
> seulement une promesse d'interface. Arbitré (TCK-284) : **le cadenas était l'erreur**. Les quatre
> entrées sont sorties de `PRO_ROUTES`, `ECARTS_ASSUMES` est vide, la garde est stricte à 5/5.
> Aucun accès n'a été retiré à personne.
>
> *Ce qui suit est le raisonnement qui avait fait suspendre le correctif — conservé parce qu'il
> reste juste, et qu'il explique pourquoi la réponse n'était pas mécanique :*
>
> **Le correctif n'a PAS été appliqué d'emblée, et c'était délibéré.** `ensureStandardAgencyOrRedirect` vise
> *tout* porteur d'`agency_id` dans une agence `individual`, alors que `isProRouteLocked` ne
> cadenasse que les `agency_admin` : **les deux règles n'ont pas le même périmètre**. Poser la
> garde telle quelle redirigerait aussi les agents et les propriétaires, à qui rien n'a jamais été
> refusé — une régression fonctionnelle déguisée en correctif de sécurité. L'arbitrage est un
> **choix produit**, et il est écrit dans **TCK-284**.
>
> ~~Les quatre écarts sont nommés dans `ECARTS_ASSUMES`.~~ — **faux, cf. la correction du
> 2026-08-15 en tête d'entrée : la map est vide.** Une allowlist est une **dette datée**, pas
> une exemption : la garde échoue aussi le jour où une entrée y devient périmée.


`src/lib/access/server-guards.ts` porte un jumeau PHP, assumé dans un commentaire (« Backend twin of
`lib/access/server-guards.ts` »). **Aucun test, aucune garde CI ne vérifie que les deux
implémentations restent d'accord.** Une règle d'autorisation rendue à deux endroits et tenue à un
seul est le motif le plus tenace de ce genre de duplication.

### D-24 — La règle « le front possède le texte affiché » est une intention 🟠 → [TCK-286](backlog/tickets/TCK-286-i18n-textes-en-dur.md) · [TCK-292](backlog/tickets/TCK-292-i18n-reste-du-parc.md)

**Mesuré par AST le 2026-08-15 : 431 fichiers portaient 3 735 occurrences de texte affiché en dur.**

> Les chiffres qu'affichait cette dette — « 1376 clés `fr`/`en`, 1265 `wo` », « 82 fichiers sur
> 875 » — étaient **faux, et recopiés de TCK-286 sans être vérifiés**. Le premier comptait les
> NŒUDS de l'arbre JSON (feuilles + objets intermédiaires) et non les clés traduisibles : il y en
> avait 1 072 en `fr`/`en` et 976 en `wo`. Le second mêlait les fichiers de test. Surtout,
> « les trois dictionnaires sont complets » était faux : **`wo` accusait 96 clés de retard**,
> masquées par le deep-merge de `src/i18n/request.ts:95-101`, et personne ne l'avait jamais vu.

**Ce qui est fait (TCK-286).** Une garde mesure désormais l'écart : `takussan-web/scripts/check-i18n.mjs`,
branchée dans `web-ci.yml` — parité EXACTE des clés entre les trois locales (`en` tenu à 0 clé
manquante, `wo` sous cliquet décroissant) et cliquet PAR FICHIER sur le texte en dur. Un premier lot
a vidé les 22 fichiers les plus vus : coquille de navigation, états d'erreur, tunnel
d'authentification — 193 occurrences déplacées, en `fr`, `en` ET `wo`.

**Ce qui reste (TCK-292).** 409 fichiers, 3 542 occurrences, découpées en douze lots chiffrés, plus
88 clés wolof manquantes. Le compte se prend à la source, jamais ici :
`cd takussan-web && node scripts/check-i18n.mjs --report`.

**Ce que la garde ne voit pas**, et qu'elle écrit dans sa propre sortie : les gabarits interpolés
(`` `Bonjour ${nom}` ``) et les props de composants maison hors whitelist. Son total est un
**plancher**, jamais un inventaire.

### D-25 — Divers documents périmés 🟡 → [TCK-311](backlog/tickets/TCK-311-documents-perimes-et-pointeur-mort.md)

> **Re-mesuré le 2026-08-16 : 7 → 5.** `docs/configuration.md` a été **corrigé** sur sa
> contradiction Meilisearch (§1 dit désormais « driver `meilisearch` sur TOUS les environnements,
> CI comprise ») — le retirer de la liste. Les autres tiennent : `admin-qa.md` fait toujours tester
> `/admin/roles` (2 occurrences), `takussan-web/README.md` est toujours le template
> `create-next-app`, et les deux images pèsent toujours **4,0 Mo**.
>
> ⚠️ **Attention à `features-by-actor.md` et `seeding-plan.md` : ils portent désormais un bandeau
> d'avertissement, et ce n'est PAS une correction.** Le bandeau a rendu le mensonge honnête, il ne
> l'a pas retiré — un lecteur pressé qui voit « ⚠️ MIROIR DÉSYNCHRONISÉ » en tête de fichier peut
> tout aussi bien lire la suite et l'appliquer.

- `docs/features-by-actor.md` se déclare « vue miroir de `features.md` » mais est gelé au
  2026-04-14, alors que `features.md` a évolué six fois depuis.
- `docs/seeding-plan.md` décrit l'état **antérieur** à l'implémentation (« le seeding actuel est
  minimal… 3 seeders ») alors que 38 seeders sont en place.
- `docs/configuration.md` **se contredit lui-même** sur Meilisearch : §1 « driver `collection` par
  défaut », §3.6 « Meilisearch sur TOUS les environnements », §5.1 « (Optionnel) ».
- `docs/qa/admin-qa.md` fait tester une page `/admin/roles` qui n'existe pas.
- `docs/superpowers/specs/2026-05-10-onboarding-discovery-design.md` porte `status: draft` alors que
  les 10 tickets qu'il pilote sont tous `done`.
- `takussan-web/README.md` est resté le **template create-next-app par défaut**.
- `docs/image.png` (2,99 Mo) et `docs/image copy.png` (1,19 Mo) sont versionnés — **53 % du poids de
  `docs/`** — pour des captures commitées accidentellement.

### D-45 — La compétence d'implémentation décrivait **un autre projet** ✅ *soldé le 2026-08-15*

`.agent/skills/implementing-specs/SKILL.md` est le fichier que tout agent lit **avant d'écrire la
première ligne de code d'un ticket** — c'est lui qu'invoquent `/implement-spec` côté `.claude/commands/`
comme côté `.windsurf/workflows/`. Sa Phase 4, « Respect the architecture », prescrivait ceci
(version `HEAD` avant correctif, lignes 112-114) :

```
- **Backend**: … Permissions use `spatie/laravel-permission`. …
- **Frontend**: Standalone components (no NgModules). Services in `core/services/http/`.
  PrimeNG 21 + Tailwind 4. Template control flow uses `@if` / `@for` / `@switch`.
  Auth token in `AuthService.authToken` (static).
- **API base URL (dev)**: `http://127.0.0.1:8002`. Frontend runs on port 4201.
```

**Ce n'est pas une documentation périmée, c'est la documentation d'un projet différent.** Composants
standalone, `NgModules`, contrôle de flux `@if`/`@for`/`@switch`, PrimeNG, un service HTTP dans
`core/services/http/`, un `AuthService.authToken` statique, le port 4201 : c'est **Angular**. Le
frontend de ce dépôt est **Next.js 16 / React 19**, App Router, primitives shadcn `base-nova` sur
`@base-ui/react`, sur le port 3000. Il n'existe dans ce dépôt ni Angular, ni PrimeNG, ni Radix. Et
`spatie/laravel-permission` est **désinstallé** depuis TCK-278, avec une garde CI qui casse sur ses
imports — le fichier prescrivait donc d'écrire du code que la CI refuse.

**Et il portait la deuxième faute par-dessus la première** : ses étapes 7 et 19 (lignes 92 et 165)
disaient *« Move the ticket bullet from the `📋 Todo` section to `🚧 Doing` »* et *« Move the ticket
from `🚧 Doing` to `👀 Review` »* — **le déplacement à la main de puces dans `INDEX.md`, qui est
généré**. C'est mot pour mot la pratique qui a rendu l'index faux sur 213 de ses 266 entrées (D-15),
prescrite par le document qu'on lit pour bien faire.

*Une documentation périmée fait perdre du temps. Une documentation d'un autre projet fait écrire du
code faux avec confiance* — et celle-ci se lisait au moment exact où l'agent cherche quoi respecter.
On ne peut pas la dater comme D-14 : elle n'a jamais été juste pour ce dépôt.

**Preuve** : `git show HEAD:.agent/skills/implementing-specs/SKILL.md` lignes 92, 112-114, 165 ·
`.claude/commands/implement-spec.md:5` et `.windsurf/workflows/implement-spec.md:5` désignent tous
deux ce fichier · absence de toute dépendance Angular/PrimeNG dans `takussan-web/package.json`.

**Soldé** : la Phase 4 est réécrite sur le backend et le frontend **réels** (profils polymorphes et
`MembershipCapabilityResolver`, App Router, `base-nova`, le piège du préfixe `/api`, ports 8002/3000),
les étapes 7 et 19 prescrivent `node docs/backlog/gen-index.mjs`, et le fichier porte désormais un
encadré qui **date sa propre erreur** et tranche le conflit à l'avance : *« si cette section
contredit le code, le code gagne et ce fichier est le bug ».*

### D-46 — Deux répertoires de compétences concurrents, `.agent/` et `.agents/` ✅ *soldé le 2026-08-16* → [TCK-303](backlog/tickets/TCK-303-arbitrer-agent-vs-agents.md)

> **Cette entrée a été RE-MESURÉE le 2026-08-16 avant d'être soldée, et elle se contredisait
> elle-même.** Son tableau ci-dessous décrivait une divergence « en croix » — chacun juste là où
> l'autre est faux — pendant que son propre dernier paragraphe écrivait *« la ligne RBAC l'est
> depuis le 2026-08-15 (cf. D-45) »*. Les deux ne pouvaient pas être vrais ensemble. Le tableau
> avait cessé d'être exact **la veille**, et personne ne l'avait remonté jusqu'à lui.
>
> Le coût ne s'est pas arrêté là : TCK-303 a été rédigé le 2026-08-16 en recopiant le tableau, et
> **en laissant tomber la phrase qui le corrigeait**. Le ticket a donc prescrit de « corriger
> l'affirmation `spatie/laravel-permission` dans la compétence qui fait foi » — une correction déjà
> faite — et surtout d'aller **récupérer dans `.agents/` une ligne qui n'y était plus la meilleure**.
> *Une entrée d'ardoise qui se contredit ne se lit pas en entier : on en recopie la moitié la plus
> frappante, et la moitié qui rectifie meurt là.* Le tableau d'origine est conservé plus bas, daté,
> parce que c'est lui l'objet de la leçon.

Les deux étaient suivis par git — **646 fichiers** dans `.agent/`, **602** dans `.agents/` — et
personne n'avait jamais arbitré lequel fait foi.

**Ce que la re-mesure du 2026-08-16 a établi** (`diff -rq .agent/skills .agents/skills`) : **deux
fichiers seulement différaient, et `.agent/` gagnait sur les deux, sur tous les points.**

| Fichier | `.agent/` (chargé) | `.agents/` (mort) |
|---|---|---|
| `skills/implementing-specs/SKILL.md` | ✅ RBAC juste (`MembershipCapabilityResolver`, garde CI, dette D-21) · ✅ INDEX généré · ✅ pile front juste (Next 16, `base-nova`) | ✅ RBAC juste · ❌ INDEX *« Move the ticket bullet »* · ❌ **front d'un autre projet** : *« Standalone components (no NgModules) »*, *« PrimeNG 21 »*, port 4201 |
| `skills/writing-specs/SKILL.md` | ✅ *« `INDEX.md` is **GENERATED** »* + champ `wave` requis | ❌ *« Add a new bullet line to the correct section »* |

**La divergence en croix a bien existé — elle a duré trois mois, et elle était soldée depuis la
veille.** L'histoire se lit dans `git log` :

```
33ce4f69  2026-05-18  la correction RBAC est écrite dans .agents/  ← la copie que personne ne charge
a9524604  2026-08-15  .agent/ est réécrit : RBAC, INDEX et pile front  ← la croix disparaît (D-45)
e53ce847  2026-08-16  TCK-303 est rédigé en décrivant l'état d'avant a9524604
```

C'est le cœur de la dette, et il reste entier : **quelqu'un a su, a écrit juste, et l'a écrit dans
le répertoire mort.** Pendant trois mois, tout agent qui implémentait un ticket a lu qu'il fallait
employer `spatie/laravel-permission` — un paquet désinstallé sur lequel `api-ci` casse à l'import.
Aucune erreur, aucun lint, aucune CI ne l'a signalé. *Un répertoire mort n'est pas inerte : il
absorbe les corrections.*

<details>
<summary>Le tableau d'origine, écrit le 2026-08-15 et faux à partir du même jour</summary>

| Fichier | `.agent/` (celui que le dépôt utilise) | `.agents/` (celui que personne ne lit) |
|---|---|---|
| `skills/implementing-specs/SKILL.md` | ❌ *« Permissions use `spatie/laravel-permission` »* | ✅ *« Permissions sont résolues par `MembershipCapabilityResolver` à partir des profils polymorphes (TCK-278, Règle 5) »* |
| `skills/writing-specs/SKILL.md` | ✅ *« `INDEX.md` is **GENERATED** — never edit it by hand »* + champ `wave` requis | ❌ *« Add a new bullet line to the correct section »*, *« `INDEX.md` is part of the deliverable »* |

La chaîne *« Permissions use `spatie/laravel-permission` »* a réellement existé, à
`.agent/skills/implementing-specs/SKILL.md:112`, jusqu'à `a9524604` inclus —
`git show a9524604^:.agent/skills/implementing-specs/SKILL.md | grep -n permission` la rend encore.
Elle n'existe plus nulle part dans le dépôt depuis le 2026-08-15.

</details>

**Et rien ne désigne `.agents/`.** Les quatre points d'entrée pointent tous vers `.agent/` :

```
.claude/commands/implement-spec.md   → .agent/skills/implementing-specs
.claude/commands/write-spec.md       → .agent/skills/writing-specs
.windsurf/workflows/implement-spec.md → .agent/skills/implementing-specs
.windsurf/workflows/write-spec.md    → .agent/skills/writing-specs
```

Un `grep -rn '\.agents/'` sur tout le dépôt, `.agents/` exclu, ne rend que **deux** occurrences, et
ce sont des **faux positifs** : une phrase générique sur la découverte de compétences, dans un
document de référence livré par le greffon `bmad-distillator`, présente à l'identique sous
`.claude/skills/` et `.windsurf/skills/`. **Aucun fichier de ce dépôt ne référence `.agents/`.**

**L'inventaire des présences, recompté le 2026-08-16** — l'entrée annonçait « 15 compétences », le
ticket « sept » ; le compte est **13**. `.agent/skills/` en porte 27, `.agents/skills/` 15, dont 14
communes :

| Lot | Compte | Sort |
|---|---|---|
| Uniquement dans `.agent/` | **13** (`test-driven-development`, `systematic-debugging`, `verification-before-completion`, `using-git-worktrees`, `brainstorming`, `writing-plans`…) | conservées |
| Communes, `wds-*` | 12 | identiques ; posées par l'installateur du greffon |
| Communes, écrites ici | 2 (`implementing-specs`, `writing-specs`) | version `.agent/`, strictement meilleure |
| Uniquement dans `.agents/` | **1** (`source-command-sync-specs`) | **rien à sauver** — voir ci-dessous |

`source-command-sync-specs` avait l'air d'être le seul contenu propre au répertoire mort. C'est une
**copie mécanique de `.claude/commands/sync-specs.md`**, corps identique à deux détails près : un
préambule de conversion (*« Use this skill when the user asks to run the migrated source command »*)
et un `Co-Authored-By: Codex` là où la source vivante écrit `Claude`. La source est chargée, et hors
périmètre du ticket. *Le seul fichier qu'une suppression en bloc aurait pu faire perdre était lui
aussi une copie périmée d'un fichier vivant.*

`.agent/` porte en outre `AGENTS.md`, `INSTALL.md`, `agents/`, `tests/` et `workflows/`, absents de
`.agents/`.

**Le coût n'est pas les 602 fichiers dupliqués, c'est le doute.** Un contributeur qui corrige une
compétence a une chance sur deux de la corriger dans le répertoire que personne ne charge — et
aucune erreur, aucun lint, aucune CI ne le lui dira. C'est déjà arrivé, une fois au moins, sur la
ligne d'autorisation : la meilleure preuve qu'un répertoire mort n'est pas inerte.

**Preuve** : `git ls-files .agent | wc -l` → 646 · `git ls-files .agents | wc -l` → 602 ·
`diff -rq .agent/skills .agents/skills` → 2 fichiers différant, le reste en écarts de présence ·
`git grep '\.agents/' -- . ':!.agents'` → 2 hits, tous deux dans
`skills/bmad-distillator/resources/distillate-format-reference.md:188`.

**Soldé le 2026-08-16 (TCK-303)**, en trois temps délibérément séparés dans l'historique :

1. **La garde d'abord, rouge.** `scripts/check-skills-dir.mjs`, branché dans `repo-ci.yml`, a été
   commité *pendant que `.agents/` existait encore* — il sortait en 1 sur ses trois compétences.
   L'historique montre donc le rouge, puis le vert, et non une garde née verte dont personne ne
   sait ce qu'elle attrape.
2. **La suppression ensuite**, en un commit lisible : 602 fichiers, aucun contenu à fusionner —
   établi fichier par fichier avant d'y toucher, pas déduit du fait que `.agents/` était mort.
3. **`CLAUDE.md` dit désormais lequel fait foi.** Aucun document d'entrée ne le disait : les quatre
   points d'entrée le montraient par leurs liens, ce qui n'est lisible qu'après enquête.

La garde ne cherche pas « est-ce que `.agents/` est revenu » — ce serait mesurer une ressemblance
avec le dernier bug, et le prochain arbre s'appellera `.codex/` ou `.cursor/`. Elle vérifie deux
propriétés : **unicité** (aucune compétence écrite ici hors de `.agent/skills/`) et **non-vacuité**
(le canonique porte bien les deux compétences que les points d'entrée citent nommément) — parce
qu'« aucune copie parasite » n'est pas « la bonne copie ». « Écrite ici » se mesure par l'absence de
préfixe de fournisseur (`bmad-`, `wds-`), et non par une liste de noms qui serait fausse au prochain
ajout. **Prouvée par mutation**, quatre fois : réintroduction de `.agents/` → rouge ; création d'un
`.codex/skills/` que la garde n'avait jamais vu → rouge ; amputation du canonique → rouge ; ajout
d'un arbre de fournisseur hors canonique → **vert**, le contrôle négatif qui montre qu'elle ne
rougit pas sur du légitime. Le déclencheur de `repo-ci.yml` n'énumère aucun nom non plus
(`**/skills/**`, `**/SKILL.md`) : une PR qui n'ajouterait qu'un répertoire inédit ne déclenchait
aucune des lignes existantes, et la garde serait restée muette sur le seul défaut qu'elle existe
pour voir.

Deux répertoires de compétences à la racine, c'était le même défaut que deux fichiers d'instructions
divergents (D-14) : *un mensonge qui attend son lecteur.*

---

## 🟡 Couverture de tests

> **Les quatre entrées de cette section sont couvertes par [TCK-285](backlog/tickets/TCK-285-couverture-tests-services-policies.md)**, qui les ordonne par coût d'un défaut plutôt que par volume : policies d'abord (isolation multi-agence), puis webhooks (surfaces non authentifiées), puis commandes destructrices, puis services.

> ### ⚠ D-26 à D-29 étaient FAUX — mesurés le 2026-08-15, corrigés ci-dessous
>
> Les quatre entrées annonçaient des trous comptés par **grep de nom de classe dans `tests/`**. Ce
> n'est pas une mesure de couverture, et ce n'en est même pas une approximation : *une policy
> s'exerce par `$this->authorize()` dans un test HTTP, jamais par son nom ; un contrôleur s'exerce
> par son URI.* La métrique choisie ne pouvait pas voir ce qu'elle prétendait compter.
>
> **La mesure réelle**, suite entière relancée sous xdebug le 2026-08-15 :
>
> ```bash
> XDEBUG_MODE=coverage php -d xdebug.mode=coverage vendor/bin/phpunit --coverage-text
> ```
>
> **2056 tests, 6497 assertions, OK en 9 min 09 s — et 83,16 % des lignes de `app/` sont
> exécutées** (20384/24512 ; méthodes 64,45 %, classes 41,05 %).
>
> L'erreur allait **dans les deux sens**, ce qui est le pire cas : elle annonçait absents des tests
> dédiés qui existaient depuis avril, et comptait pour couverts des chemins jamais exécutés. Le
> détail par entrée est dans chacune ci-dessous.
>
> **Ce que la couverture de lignes ne dit toujours pas** : qu'une assertion existe. Une méthode à
> 100 % de lignes peut n'être exercée que comme effet de bord d'un autre test. Les conclusions du
> type « X est couvert » signifient « X est **exécuté** ». C'est pourquoi TCK-285 exige que chaque
> test livré soit **prouvé par ablation** — casser le code sous test et vérifier que le test rougit.
> Cette exigence a trouvé, le jour même, deux gardes redondantes dont aucune ablation simple ne
> faisait rougir quoi que ce soit : *un test vert ne prouve rien tant qu'on n'a pas vu ce qui le
> rend rouge.*

2052 tests backend et 802 frontend, tous verts **au repos** (cf. D-44 et D-30bis : les deux suites
rougissent sous charge, et « au repos » n'était écrit nulle part) — mais la couverture est très
inégale, et les trous sont concentrés là où ça compte.

### D-26 — La couche services est le trou principal ✅ ❌ *chiffre faux, corrigé le 2026-08-15 — le trou réel livré par [TCK-285](backlog/tickets/TCK-285-couverture-tests-services-policies.md), le code mort par [TCK-307](backlog/tickets/TCK-307-supprimer-dsl-scopefilter-mort.md)*

> **Le trou annoncé n'existe pas là où il était annoncé.** La couche services est à **~83 % de
> lignes exécutées**. Le « 81 des 148 services jamais nommés » venait d'un grep de nom de classe :
> un service s'exécute par injection dans un contrôleur, pas en étant cité.
>
> **`PropertyService`, cité ici comme cœur métier à tester, est du CODE MORT** : zéro appelant dans
> `app/`, 0/19 lignes. Il fallait le supprimer, pas le tester.
>
> **Et il ne l'a pas été.** Re-vérifié le 2026-08-16 : `app/Services/Model/PropertyService.php`
> existe toujours, toujours sans appelant. Le constat était juste, la conclusion aussi, et rien ne
> s'est produit — *une dette nommée dans un document n'est pas une dette prise en charge.* Rattrapé
> par [TCK-307](backlog/tickets/TCK-307-supprimer-dsl-scopefilter-mort.md), qui supprime le code
> mort de cette famille.
>
> **Ce qui était réellement muet, et que TCK-285 a livré** : le pipeline de rapprochement bancaire
> (`ParseBankStatementJob::handle` 0/52, `MatchBankStatementJob::handle` 0/18,
> `ReconciliationMatcher` 0/85 — **155 lignes de logique d'argent** neutralisées par un
> `Queue::fake()`), `PaymentSearchService` (0/62), `ReconciliationManager::unmatch` (0/26),
> `ExportDataService::scopeToActor` (14/31) et `RoleDelegationService::activate`/`::expire` (0/12
> chacun).

**81 des 148 services ne sont jamais nommés dans `tests/`** ; seuls 28 ont un test dédié. Cela inclut
le cœur métier : `BookingService`, `PropertyService`, `LeasePaymentService`, `InvoiceService`,
`PayoutService`, `InventoryService`.

### D-27 — L'autorisation est très peu testée directement ✅ ❌ *chiffre faux, corrigé le 2026-08-15 — chemins de refus livrés par [TCK-285](backlog/tickets/TCK-285-couverture-tests-services-policies.md), `WizardDraftPolicy` morte traitée par [TCK-307](backlog/tickets/TCK-307-supprimer-dsl-scopefilter-mort.md)*

> **Les 16 policies sont exécutées, sauf une.** Mesuré : seule `WizardDraftPolicy` est à 0 — et
> parce que `WizardDraftController` ne l'appelle **jamais** (il filtre par
> `where('user_id', …)`). C'est une policy morte enregistrée par auto-discovery, pas une policy non
> testée : lui écrire un test serait écrire un test qui ne garde rien.
>
> **Ce qui manquait vraiment, ce sont les CHEMINS DE REFUS**, et ils sont invisibles à un grep de
> nom : une douzaine de méthodes — `InvitationPolicy::viewAny`/`::view`,
> `OwnerProfilePolicy::viewAny`/`::view`, `ServiceProviderProfilePolicy::view`,
> `RoleDelegationPolicy::view`, `AgencyUpgradeRequestPolicy::view`/`::approve`/`::reject`,
> `ConversationPolicy::toggleMute`/`::modifyMessage`, `BankStatementLinePolicy::unmatch` — n'étaient
> jamais atteintes. Livré par TCK-285 avec, pour chacune, un cas passant **et** un cas refusé.

**12 des 16 policies ne sont jamais nommées dans `tests/`** — dont `LeasePolicy`,
`ConversationPolicy`, `InvitationPolicy`, `BankStatementPolicy`, `RoleDelegationPolicy`,
`PropertyModerationPolicy`. Sur un produit multi-tenant où l'agence est la frontière d'isolation,
c'est la couche dont un défaut est le plus coûteux et le moins visible.

### D-28 — Les effets asynchrones et planifiés sont quasi non testés ✅ ❌ *chiffre faux, corrigé le 2026-08-15 — le vrai trou (`ProcessRoleDelegationsJob`) livré par [TCK-285](backlog/tickets/TCK-285-couverture-tests-services-policies.md)*

> **Les 12 observers sur 12 sont exécutés**, et les **trois commandes citées comme irréversibles
> non testées le sont toutes les trois** : `MediaCleanupTest` existe depuis le 2026-04-21,
> `PurgeOldWizardDraftsTest` depuis le 2026-05-10 (avec `--dry-run` et `--days` invalide), et
> `account:execute-deletions` est invoquée dans 4 cas pour **100 % de ses lignes**. L'entrée
> déclarait absent ce qui existait depuis quatre mois.
>
> **Le vrai trou asynchrone était ailleurs** : `ProcessRoleDelegationsJob` — qui **accorde et retire
> des privilèges toutes les 5 minutes** (`routes/console.php:62`) — était à 0 %, avec ses deux
> services. Livré par TCK-285.

**10/12 observers, 9/30 jobs et 13/14 commandes artisan** ne sont jamais nommés dans `tests/`. Parmi
les commandes non testées : des opérations **destructrices ou irréversibles**
(`ExecuteScheduledAccountDeletions`, `PurgeOldWizardDrafts`, `MediaCleanup`).

### D-29 — 78 routes sur 517 n'ont aucun littéral d'URI dans les tests ✅ ❌ *chiffre faux (~20, pas 78), corrigé le 2026-08-15 — routes coûteuses livrées par [TCK-285](backlog/tickets/TCK-285-couverture-tests-services-policies.md)*

> **Le trou est de ~20 routes applicatives, pas de 78.** Recompté en croisant
> `php artisan route:list --json` avec l'ensemble des sources de `tests/` : sur 517 routes, 36
> n'ont ni littéral d'URI ni nom de route, dont 15 sont des routes de framework et au moins une est
> un faux négatif (URI construite par concaténation). Ce chiffre reste un **plafond**, pas un compte.
>
> **Et la phrase sur les webhooks est fausse : les 5 webhooks entrants ont chacun un test HTTP**,
> depuis le 2026-04-26 (Orange/Mtarget/LAM) et le 2026-06-17 (WhatsApp, paiements) — donc **avant**
> l'audit qui les a déclarés absents. `AC2` du ticket était déjà tenu à son écriture.
>
> Les routes réellement dépourvues de test et coûteuses ont été livrées par TCK-285 :
> `GET /api/kyc/documents/{media}` (pièces d'identité), `GET /api/share/{token}/download`,
> `GET /api/agencies/{agency}/bank-statements/payment-search`,
> `DELETE /api/bank-statement-lines/{line}/match`, `GET /api/{paymentType}/{paymentId}/verify`.

Concentrées sur la console super-admin (20 routes `/api/admin`) et **les webhooks entrants**
(5 routes `/api/webhooks` : paiements, statuts SMS Orange/Mtarget/LAfricaMobile, statut WhatsApp).
Un webhook est une surface d'entrée non authentifiée pilotée par un tiers : c'est le pire endroit où
ne pas avoir de test.

### D-30bis — Quatre tests front rougissent sous charge 🟡 *découvert le 2026-08-12* → [TCK-312](backlog/tickets/TCK-312-tests-front-rougissent-sous-charge.md)

Mesuré en lançant les suites back et front **simultanément** : quatre tests de la console
super-admin (`InviteSuperAdminModal`, `AgencyOnboardingDialog`, `FeatureFlags`, `TemplateEditor`)
sortent en `Test timed out in 5000ms`. Au repos, les **802 tests passent**.

Ces tests ne mesurent donc pas seulement ce qu'ils visent : ils mesurent aussi la machine. Sur un
runner GitHub partagé, ils rougiront un jour sur une PR qui n'y est pour rien — et *une garde qui
rougit sous charge accuse le code*. Le correctif n'est pas d'augmenter le délai en aveugle mais de
mesurer leur marge réelle : un test à 12 % de son plafond n'a pas le même problème qu'un test
à 90 %.

### D-44 — La suite backend est instable sous charge, et rouge sur un ensemble différent à chaque fois ✅ *mesuré le 2026-08-15, soldé le 2026-08-16*

C'est le jumeau backend de D-30bis, en beaucoup plus grave — et il invalide le mot « verts » partout
où il est écrit dans ce dépôt sans le qualificatif « au repos ».

**Trois exécutions, aucun fichier changé entre elles :**

| Exécution | Conditions | Résultat |
|---|---|---|
| 1 | suite **seule**, machine au repos | **2056 passés, 0 échec**, sortie 0, **313 s** |
| 2 | pendant qu'une autre exécution tournait | **12 échecs** |
| 3 | idem, juste après | **4 échecs — sur un ensemble DIFFÉRENT** |

Union des exécutions 2 et 3 : **14 tests distincts**, **tous** des tests de recherche Meilisearch.
Relancés seuls, ces mêmes tests passent **22/22**.

**Ce profil de panne est le pire qui soit.** Un test qui rougit toujours est un défaut ; un test qui
rougit une fois sur deux **sur une cible qui change** n'accuse personne en particulier, donc il
accuse tout le monde. Il n'existe aucun moyen, depuis le rapport d'échec, de distinguer « ma PR a
cassé la recherche » de « le runner était chargé ». La réponse humaine à ce signal est connue et
elle est toujours la même : on relance jusqu'au vert, et à partir de ce moment la suite ne garde
plus rien.

**Deux causes, et la première est de loin la plus coûteuse :**

1. **`waitForMeilisearch()` abandonnait EN SILENCE.**
   `takussan-api/tests/Concerns/InteractsWithMeilisearch.php:68-84` — une boucle qui sonde la file de
   tâches Meilisearch pendant 10 s, puis **sort par le bas et `return`** : pas d'exception, pas
   d'assertion, pas une ligne de log. Le test enchaînait donc sur un index **à moitié construit** et
   rougissait deux lignes plus loin, sur une assertion métier parfaitement juste, en désignant le
   code applicatif. *Une barrière de synchronisation qui renonce sans le dire ne retarde pas
   l'échec : elle le déguise en un autre échec, à un autre endroit.*

2. **La suite s'infligeait elle-même le backlog qui faisait expirer cette barrière.** `phpunit.xml`
   force `SCOUT_DRIVER=meilisearch` avec `SCOUT_QUEUE=false` : **chaque `save()`** d'un modèle
   indexable, dans **n'importe** quel test — y compris les ~2030 qui n'ont rien à voir avec la
   recherche — poussait un document synchrone dans Meilisearch. Mesuré sur une exécution :
   **3308 tâches d'indexation**, dont 2628 sur le seul index des biens, pour **une vingtaine** de
   tests qui en avaient réellement besoin. Et le préfixe d'index était le littéral `testing_`
   (posé par D-08) : il isolait la suite **du développeur**, mais pas **d'elle-même** — deux
   exécutions simultanées écrivaient dans les mêmes index et se détruisaient mutuellement.

**La CI est verte par chance de tempo.** Elle lance la même commande, avec le même plafond de 10 s,
sur un runner simplement assez rapide pour rester sous la barre. Ce n'est pas une garantie, c'est une
**marge que personne n'a jamais mesurée** — exactement la situation que D-30bis décrit côté front,
et exactement le raisonnement que D-43 condamne : *une hypothèse signalée reste une hypothèse
exécutée.* Le jour où la marge bascule — un runner plus lent, dix tests de recherche de plus — la CI
deviendra rouge par intermittence sur des PR qui n'y sont pour rien.

**Preuve** : trois exécutions horodatées le 2026-08-15 (2056/0/313 s au repos ; 12 puis 4 échecs sous
charge, intersection non vide mais ensembles distincts) · `tests/Concerns/InteractsWithMeilisearch.php:68-84`
(boucle sans levée) · `phpunit.xml` bloc `<php>` (`SCOUT_DRIVER=meilisearch`, `SCOUT_QUEUE=false`,
`SCOUT_PREFIX=testing_`) · comptage de la file Meilisearch en fin d'exécution → 3308 tâches.

> **État au 2026-08-15, 20 h — un correctif est dans l'ARBRE DE TRAVAIL et n'est PAS mergé.**
> Il pose un préfixe d'index **par processus** (`tests/bootstrap.php` + `Tests\Support\TestSearchIndex`,
> avec suppression des index en fin d'exécution), une barrière qui **lève** au lieu de renoncer
> (`Tests\Support\MeilisearchBarrier` / `MeilisearchNotIdleException`), filtrée sur les index du
> processus, et coupe la synchronisation Scout **par défaut pour toute la suite**
> (`Tests\TestCase::setUp()`), le concern la rallumant pour les seuls tests de recherche. La liste
> des modèles indexables devient **dérivée** (`Tests\Support\SearchableModels`) au lieu d'être
> recopiée — la version manuelle avait oublié `Message`.
>
> **Mesuré à cet instant**, et c'est tout ce qui est mesuré : `php artisan test --filter='Testing'`
> → **25 passés, 80 assertions, 2,48 s**. Le harnais a des tests ; la propriété qu'il vise —
> « deux exécutions simultanées ne se détruisent plus » — n'a **pas** été re-mesurée en conditions
> réelles au moment où ces lignes s'écrivent.
>
> **Cette entrée reste donc OUVERTE.** Règle maison : *le statut vaut pour ce qui est mergé sur
> `dev`*. Un correctif dans un arbre de travail n'a jamais tenu personne au chaud, et c'est
> précisément le genre de promesse que ce document existe pour ne pas prendre pour un fait.

> **✅ SOLDÉ — le correctif est mergé sur `dev` depuis `a9524604`** *(« fix: rendre la suite de tests
> déterministe, et solder trois régressions d'autorisation silencieuses »)*, vérifié le 2026-08-16 :
> `waitForMeilisearch()` **lève** désormais quand le plafond est atteint, et son docblock nomme la
> ligne qui a coûté les 14 rouges ; l'attente est filtrée sur les index du processus, chaque
> processus ayant son préfixe.
>
> **Et l'entrée avait vieilli d'un commit.** Elle a continué d'affirmer « le correctif n'est PAS
> mergé » **après** son merge — sur la seule foi du paragraphe ci-dessus, que personne n'avait
> re-mesuré. C'est le défaut que ce document existe pour ne plus commettre, appliqué à lui-même :
> *un inventaire de dettes se re-mesure avant d'être utilisé, jamais lu.* La règle « le statut vaut
> pour ce qui est mergé sur `dev` » est juste ; elle n'a de valeur que si l'on va **regarder** ce
> qui est mergé sur `dev`.

### D-30 — Aucune mesure de couverture, aucune parallélisation 🟡 → [TCK-302](backlog/tickets/TCK-302-couverture-non-mesuree-suite-non-parallelisee.md)

> **Confirmé le 2026-08-16** : `coverage: none` apparaît **deux fois** dans `api-ci.yml` (lignes 42
> et 192), et `--parallel` n'est configuré nulle part. Le temps de référence à retenir est
> **313 s machine au repos** (2026-08-15) — les 616 s ci-dessous ont été mesurées sous contention,
> c'est-à-dire dans les conditions qui produisaient D-44.

La CI passe explicitement `coverage: none` et le bloc `<source>` de `phpunit.xml` n'alimente aucun
rapport : ni seuil, ni tendance, ni garde-fou contre l'érosion. Et la suite n'est pas parallélisée
(`--parallel` n'est configuré nulle part) — 616 s en local sous contention.

---

## 🟡 Dette de code — conventions concurrentes

Aucune n'est un bug. Toutes coûtent une décision à chaque fois qu'on écrit du code neuf, et cette
décision est reprise à zéro par chaque contributeur. **`takussan-api/CLAUDE.md` tranche désormais
pour le code neuf** ; l'existant reste à converger.

> **Colonne « Mesure » RE-MESURÉE le 2026-08-16**, et deux entrées sur neuf n'ont pas survécu à la
> vérification. Les chiffres du 2026-08-12 sont conservés entre parenthèses quand ils diffèrent :
> ce tableau doit rester lisible comme un historique de mesures, pas comme une vérité intemporelle.
> **D-34 et D-35 sont requalifiées** — ce n'était pas ce qu'on croyait, et dans les deux cas la
> nouvelle formulation change ce qu'il faut faire.

| # | Dette | Mesure — **2026-08-16** | Tranché pour le neuf | Ticket |
|---|---|---|---|---|
| **D-31** | Enveloppe de pagination dupliquée à la main | **58 fichiers** *(44 le 12/08 — +14 en quatre jours)*, clés incohérentes : `total` 78×, `current_page` 66×, `last_page` 50×, `per_page` 45×, `links`/`from`/`to` sporadiques | les 4 clés canoniques | [TCK-304](backlog/tickets/TCK-304-enveloppe-pagination-dupliquee.md) |
| **D-32** | Validation inline vs FormRequest | 120 `$request->validate()` vs **65** FormRequest *(69 le 12/08 — méthode de comptage différente)* | `BaseFormRequest` | [TCK-305](backlog/tickets/TCK-305-validation-inline-vers-formrequest.md) |
| **D-33** | Policy vs helpers de contrôleur | 16 policies, mais **25 contrôleurs** *(38 le 12/08 — **surestimé d'un tiers**)* redéfinissent `authorizeAccess()`/`authorizeManage()`, **88 appels** *(124 le 12/08)* | policy | [TCK-306](backlog/tickets/TCK-306-autorisation-controleurs-vers-policies.md) |
| **D-34** | ~~Deux mécanismes de filtrage concurrents~~ → **code mort toujours branché** | `scopeFilter` vit dans `BaseModelTrait`, monté sur tous les modèles via `AbstractModel` — mais **0 appelant** contre **46 `buildQuery()`**. Le choix est fait ; reste à supprimer le perdant | `buildQuery()` pour toute API | [TCK-307](backlog/tickets/TCK-307-supprimer-dsl-scopefilter-mort.md) |
| **D-35** | ~~`BasePolicy` morte par construction~~ → **piège latent, et le mélange est pire** | `properties.create`/`.delete` **existent**, `.view` non ; `leases.view`/`.update`/`.delete` non ; `media.` n'est pas même un préfixe de `Capability`. Les 15 sites d'appel ont été inventoriés : **aucun n'atteint une ability cassée aujourd'hui** — mais le premier `authorize('view', $lease)` refusera tout le monde sauf super-admin, en silence | — *(à corriger + garde)* | [TCK-297](backlog/tickets/TCK-297-basepolicy-capacites-inexistantes.md) |
| **D-36** | `BaseResource` peu adoptée | **7 ressources sur 44** l'étendent — inchangé depuis le 12/08 | `BaseResource` | [TCK-308](backlog/tickets/TCK-308-baseresource-adoptee-par-7-sur-44.md) |
| **D-37** | Trois classes de base de test | `TestCase`, `BaseTestCase`, `ApiTestCase`, sans règle écrite — confirmé | `ApiTestCase` pour l'API | [TCK-309](backlog/tickets/TCK-309-conventions-mineures-dedoublees.md) |
| **D-38** | Deux préfixes de commandes plateforme | `platform:grant-super-admin` et `takussan:create-super-admin` (posée par TCK-263) font le même travail — confirmé | `platform:` | [TCK-309](backlog/tickets/TCK-309-conventions-mineures-dedoublees.md) |
| **D-39** | ~~`NotificationPreference` n'étend pas `AbstractModel`~~ | ✅ **soldé le 2026-08-12** — il l'étend désormais ; 106 tests notifications verts | ✅ | — |
| **D-40** | Namespaces de contrôleurs dédoublés | `Controllers/Auth/` (**8**) et `Controllers/Api/Auth/` (**5**) — confirmé | — | [TCK-309](backlog/tickets/TCK-309-conventions-mineures-dedoublees.md) |

### D-41 — Filament v4 : scaffold oublié ou décision non assumée ✅ *soldé le 2026-08-15 — supprimé* → [TCK-287](backlog/tickets/TCK-287-filament-supprimer-ou-securiser.md)

> **Soldé le 2026-08-15 : le panel a été SUPPRIMÉ**, sur décision explicite, après que le diagnostic
> corrigé ci-dessous eut établi qu'il ne s'agissait pas d'un trou de sécurité mais d'un coût porté
> sans contrepartie. Ce qui est parti : les 7 fichiers de code (`app/Filament/` + le
> `AdminPanelProvider`), les 2 racines composer et leurs **29 paquets exclusifs**, les **37 fichiers
> d'assets** (4,12 Mo) suivis par git, l'entrée de `bootstrap/providers.php`, et
> `@php artisan filament:upgrade` du `post-autoload-dump` de `composer.json`.
>
> **Cette dernière ligne était le vrai piège de la suppression** : elle s'exécute à *chaque*
> `composer install`, donc en CI et pendant le déploiement. Retirer le paquet sans la retirer aurait
> fait échouer toute installation ultérieure sur une commande introuvable — une panne qui ne se
> serait pas vue en local, où `vendor/` était déjà peuplé.
>
> Vérifié avant de supprimer, parce que trois des 29 paquets transitifs *ressemblaient* à des
> dépendances de fonctionnalités vivantes : le **2FA** passe par `pragmarx/google2fa` et
> `bacon/bacon-qr-code`, tous deux déclarés *directement* en `require` — le paquet emporté est
> `pragmarx/google2fa-qrcode`, un homonyme jamais importé ; les **exports** passent par
> `maatwebsite/excel`, et `openspout` avait 0 usage. Les 28 autres : 0 import dans `app/`, `config/`,
> `database/`, `tests/`, `routes/`. La chaîne npm/Vite de l'API ne servait pas Filament — elle
> construit `resources/css/app.css` pour `welcome.blade.php` — et reste en place.

> **⛔ DIAGNOSTIC CORRIGÉ le 2026-08-15 — l'entrée d'origine se trompait de dette, et dans le sens
> le plus coûteux : elle annonçait un trou de sécurité qui n'existe pas.** Elle concluait « surface
> d'administration exposée » **à partir de l'absence** d'un middleware et de l'absence de
> l'interface `FilamentUser`. Les deux absences sont réelles ; la conclusion tirée d'elles est
> fausse, parce qu'elle n'était pas mesurée — personne n'avait lu ce que Filament fait quand
> `FilamentUser` manque.
>
> **Ce que Filament fait quand `FilamentUser` n'est pas implémenté : il refuse l'accès partout sauf
> en local.** `vendor/filament/filament/src/Http/Middleware/Authenticate.php:32-39` :
>
> ```php
> // Security: If the user model does not implement `FilamentUser`,
> // access is only allowed in local environments.
> abort_if(
>     $user instanceof FilamentUser
>         ? (! $user->canAccessPanel($panel))
>         : (config('app.env') !== 'local'),
>     403,
> );
> ```
>
> `App\Models\User` n'implémente **pas** `FilamentUser` (`class User extends Authenticatable
> implements HasLocalePreference, HasMedia, MustVerifyEmail` — `app/Models/User.php:36`, et
> `grep -rn 'FilamentUser' app/` ne rend rien). Le panel est donc **fail-closed** : 403 pour tout
> utilisateur authentifié dès que `APP_ENV` vaut autre chose que `local`, `staging` et `production`
> comprises. Le middleware manquant n'ouvrait rien — c'est l'interface manquante qui ferme.
>
> **La leçon est celle que cette ardoise documente déjà en D-23 : une garde qui cherche un JETON ne
> mesure pas la PROPRIÉTÉ.** Ici le jeton cherché était `->middleware(...)` dans le provider du
> panel, et la propriété voulue « un inconnu peut-il administrer ». La dépendance répondait déjà
> non. *Une dette dont le diagnostic est faux est pire qu'une dette non écrite : elle fait
> travailler quelqu'un sur un danger imaginaire, et elle use la crédibilité de toutes les autres
> entrées du document.*
>
> **Gravité ramenée de 🟠 à 🟡** : ce n'est plus une question de sécurité, c'est une question de
> coût porté sans contrepartie. ⚠️ **[TCK-287](backlog/tickets/TCK-287-filament-supprimer-ou-securiser.md)
> porte encore la prémisse fausse dans son intitulé même (« supprimer ou sécuriser ») ; il reste à
> recadrer — l'arbitrage réel est « supprimer ou assumer », pas « supprimer ou sécuriser ».**

Deux dépendances composer (`filament/filament`, `filament/spatie-laravel-media-library-plugin`), un
panel monté sur `/admin` avec `->login()`, pour **une seule Resource** (Property, 6 fichiers) — alors
que le back-office réel est en Next.js.

**Le coût, lui, est réel, et il n'avait jamais été chiffré** — mesuré le 2026-08-15 :

- **29 paquets exclusifs** en `require`, c'est-à-dire atteignables depuis `filament/*` et depuis
  **aucune** autre racine du `composer.json` : tout `livewire/livewire`, `blade-ui-kit/blade-icons`,
  `nette/php-generator`, `openspout/openspout`, `ueberdosis/tiptap-php`, `scrivo/highlight.php`,
  `chillerlan/php-qrcode`, `kirschbaum-development/eloquent-power-joins`… Le sous-arbre complet en
  compte 66, mais 37 seraient là de toute façon ; ce sont les 29 qui partiraient avec Filament.
- **4,12 Mo d'assets compilés suivis par git**, sur 37 fichiers (`public/js/filament/`,
  `public/css/filament/`, et les 8 fontes Inter en `.woff2`) — pour un panel que personne n'ouvre.

Chacun de ces 29 paquets est une surface de mise à jour, une ligne dans `composer audit` (cf. D-00,
où cinq paquets ont accumulé 26 avis sans que personne ne regarde), et une contrainte de version sur
les montées de PHP.

**Preuve** : `vendor/filament/filament/src/Http/Middleware/Authenticate.php:32-39` ·
`app/Models/User.php:36` · résolution du graphe de `composer.lock` depuis les racines `filament/*`
moins les autres racines → 29 · `git ls-files 'takussan-api/public/*filament*'` → 37 fichiers,
4 319 468 octets.

**Trancher** : soit on supprime (une Resource de 6 fichiers, 29 paquets, 4,12 Mo), soit on assume en
ADR — et « assumer » veut alors dire implémenter `FilamentUser::canAccessPanel()`, **ce qui ouvrirait
le panel hors local**, aujourd'hui fermé. C'est le seul chemin par lequel ce panel peut devenir une
surface exposée : le sécuriser à moitié serait strictement pire que de ne rien faire.

### D-42 — Code mort et stubs menteurs côté frontend ✅ *soldé le 2026-08-12*

> **Soldé** : six fichiers supprimés — `NotificationContext.tsx` (provider monté nulle part), les
> quatre hooks stubs (tous **vides** : `export {}` sous un TODO qui promettait une API « pas encore
> prête », alors que les modules correspondants existent depuis des mois dans `lib/queries/`), et
> `useNotifications.ts` qui réexportait le contexte mort. **Zéro import exact** vérifié avant
> suppression ; `tsc` propre après.
>
> `mockData.ts` a été **scindé** plutôt que supprimé : il portait deux choses très différentes. Ses
> ~300 lignes d'annonces factices n'avaient aucun usage et sont parties ; ses constantes de
> navigation, elles, sont consommées **en production** par `Navbar` et `Footer` — elles vivent
> désormais dans `src/data/navigation.ts`. *Des données de navigation servies depuis un fichier
> nommé « mock » finissent par être supprimées par quelqu'un qui fait le ménage — ou pire, jamais
> relues parce que le nom promet qu'elles ne comptent pas.*
>
> **Reste ouvert** : `src/lib/api.ts` n'exporte toujours ni `API_URL` ni `API_BASE`, et 23 fichiers
> redéclarent chacun `.replace(/\/api$/, '')`.

- `src/context/NotificationContext.tsx` : provider monté nulle part, `useNotifications()` lève hors
  provider, **0 site d'appel** dans tout le dépôt.
- 4 hooks annoncent « TODO: implement when X API is ready » alors que les modules correspondants sont
  implémentés : `useLeases.ts`, `useMessages.ts`, `usePayments.ts`, `useMaintenance.ts`.
- `src/data/mockData.ts` (nom explicite) est importé par **deux composants de production** :
  `Navbar` (navLinks, categories) et `Footer` (footerLinks).
- `src/lib/api.ts` n'exporte ni `API_URL` ni `API_BASE` : **23 fichiers** relisent
  `process.env.NEXT_PUBLIC_API_URL` et redéclarent chacun `.replace(/\/api$/, '')`.

### D-43 — Le banc d'essai des migrations tournait sur le mauvais moteur ✅ *soldé le 2026-08-13*

Le job `migrations-mysql` (posé par D-05) et `docker-compose.yml` tournaient tous deux sur
`mariadb:11.4`, avec `utf8mb4_unicode_ci`. Le commentaire du job justifiait ce choix ainsi : *« il
tourne sur MariaDB parce que c'est ce que `apt install mariadb-server` pose sur le serveur »*.

**Personne n'avait exécuté cette commande.** Mesuré sur le serveur le 2026-08-13, en préparant le
premier déploiement :

```
$ dpkg -l | grep -Ei 'mysql-server|mariadb-server'
ii  mysql-server  8.0.46-0ubuntu0.24.04.3
$ sudo mysql -e "SELECT VERSION(), @@collation_server, @@character_set_server;"
8.0.46-0ubuntu0.24.04.3 | utf8mb4_0900_ai_ci | utf8mb4
```

Ce n'était donc pas un écart de version : **c'était le mauvais moteur**. MariaDB 11 et MySQL 8 ont
divergé pour de bon — collation par défaut, contraintes `CHECK`, colonnes `JSON` (natives chez
MySQL, alias de `LONGTEXT` chez MariaDB), noms d'index générés. Un DDL accepté par MariaDB 11.4 et
refusé par MySQL 8 passait le job et aurait cassé `migrate --force` au déploiement : **l'échec exact
que ce job existe pour empêcher**. Et `utf8mb4_unicode_ci` ne compare pas les chaînes comme
`utf8mb4_0900_ai_ci` — unicité des e-mails, `LIKE` de recherche.

La production n'ayant jamais été déployée, rien n'a cassé. Mais pendant six semaines le job a
affirmé une garantie qu'il ne tenait pas, à chaque exécution.

> C'est la sœur exacte de la leçon de D-04 : *ne jamais déduire l'état d'un environnement de la
> configuration qui le vise* — ici, d'une **commande d'installation supposée**. Le fichier
> `api-ci.yml` portait pourtant déjà un avertissement disant que 11.4 était « une hypothèse, pas
> une mesure » (TCK-289). L'avertissement était juste et il n'a rien empêché : *une hypothèse
> signalée reste une hypothèse exécutée.*

**Soldé** : `docker-compose.yml`, le job `migrations-mysql` et `docker/mysql-init.sql` portent
`mysql:8.0` et `utf8mb4_0900_ai_ci`. `scripts/check-db-engine.mjs` (Repo CI) garde leur accord :
toute image de base et toute collation écrites dans le dépôt doivent valoir celles de la production
mesurée, **et les déclarations exigées doivent être présentes** — la première version restait verte
quand on supprimait purement et simplement la ligne `--collation-server`. Le job de CI mesure en
outre `@@collation_server` du conteneur de service, qui n'accepte pas d'arguments de commande.
Fermé par TCK-289.

---

---

## Ce que cet inventaire ne couvre pas

Il est dérivé de ce qu'on peut **mesurer depuis le dépôt** : fichiers, historique git, exécution des
suites, configuration. Il ne dit rien de :

- **la production réelle** — à une exception près (le moteur de base, mesuré le 2026-08-13, cf.
  D-43), aucune de ses métriques n'a été consultée. D-01 à D-04 sont déduits de scripts et de
  guides, pas d'un serveur observé — et D-43 montre ce que cette déduction coûte ;
- **ce que le produit devrait faire** — la question fonctionnelle appartient à `docs/features.md` ;
- **l'ergonomie et l'accessibilité** — aucune campagne navigateur n'a été menée dans ce chantier ;
- **une fiche codée sans le dire** — un ticket implémenté dont le frontmatter n'a jamais bougé reste
  invisible ici comme dans le backlog. `check-backlog.mjs` attrape le pointeur pourri, la dépendance
  incohérente et le statut contredit par git ; il ne peut pas deviner qu'on a codé sans le dire.

---

### D-53 — Le tableau de bord de sécurité montrait 3 vulnérabilités sur 23 ✅ *mesuré et soldé le 2026-08-16*

**D-00 avait solidement traité le côté PHP** — `composer audit` rend toujours *« No security
vulnerability advisories found »*. Le côté **npm n'avait jamais été audité du tout**, et il portait
23 vulnérabilités.

| Source | Ce qu'elle annonçait |
|---|---|
| Tableau de bord GitHub / Dependabot | **3** (1 haute, 2 modérées), toutes sur `vite` |
| `npm audit` dans `takussan-api` | **5** — dont **2 CRITIQUES** : `shell-quote`, `concurrently` |
| `npm audit` dans `takussan-web` | **18** — dont **11 hautes**, `next` lui-même en tête |

**Un écart de 3 contre 23 n'est pas un retard d'indexation, c'est un angle mort — et il a une
cause précise.** Les trois alertes visibles portaient `manifest_path: "package.json"`, un chemin
**nu**. Or aucun `package.json` n'a jamais existé à la racine (`git log --all -- package.json` ne
rend rien) : les manifestes réels sont `takussan-api/package.json` et `takussan-web/package.json`.
Les alertes étaient donc ancrées sur un fichier **inexistant** — Dependabot ne pouvait ni les
réévaluer, ni les fermer, ni surtout en produire d'autres pour les deux vrais manifestes. Créées les
2026-04-07 et 2026-06-20, elles n'avaient jamais bougé depuis.

> **⚠️ Le piège de lecture, et il a failli fonctionner.** L'avis Dependabot affichait une plage
> `vite <= 6.4.2` alors que le dépôt tourne sur vite 8 : la conclusion évidente était « faux positif,
> rien à faire », et elle a été écrite avant d'être vérifiée. `npm audit` a montré qu'il existe une
> plage **parallèle**, `8.0.0 - 8.0.15`, et que la version installée y tombait — la vulnérabilité
> était bien réelle. *Lire l'avis ne remplace pas mesurer l'arbre de dépendances.* C'est la règle
> maison « ne jamais déduire l'état d'une chose de la documentation qui la décrit », appliquée cette
> fois aux avis de sécurité eux-mêmes.

**Ce qui a été corrigé** — `npm audit fix` des deux côtés, plus une montée explicite de `next`
(épinglé à l'exact `16.2.3`, ce qui empêchait `audit fix` de le toucher) vers **16.3.1**, non-majeure.

| | avant | après |
|---|---|---|
| `takussan-api` | 5 (2 critiques, 3 hautes) | **0** |
| `takussan-web` | 18 (11 hautes, 4 modérées, 3 basses) | **0** |

Vérifié après montée : `npm run build` **exit 0** des deux côtés (le build Next complet, pas
seulement le typage), `npx tsc --noEmit` propre, **885 tests front**, 0 erreur ESLint.

**La cause structurelle est fermée** : `.github/dependabot.yml` déclare désormais les quatre
écosystèmes réels à leur emplacement — composer et npm dans `takussan-api`, npm dans `takussan-web`,
et les actions GitHub. `next`, `eslint-config-next` et `@next/*` y sont groupés, parce que les monter
séparément produit un état intermédiaire qui ne compile pas.

**Ce que ce fichier ne fait PAS**, et qu'il faut savoir : il ancre les alertes futures sur des
manifestes qui existent, mais il ne remplace pas une vérification périodique. `npm audit` reste la
mesure de référence — c'est lui qui a vu les 20 que le tableau de bord n'avait pas vues, et rien ne
le lance aujourd'hui ni en CI ni au déploiement. **C'est exactement le défaut que D-00 avait relevé
pour `composer audit`, resté entier du côté npm.**

**Preuve** : `gh api repos/thiambara/takussan/dependabot/alerts` → 3 ouvertes, `manifest_path`
`package.json` · `git log --all -- package.json` → vide · `npm audit --json` dans les deux projets
avant/après · `npm run build` exit 0.
