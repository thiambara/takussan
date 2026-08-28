# Backlog — Takussan

> ⚠️ **FICHIER GÉNÉRÉ — ne pas éditer à la main.**
> Source : les frontmatters de `tickets/*.md` et `waves.json`.
> Régénérer : `node docs/backlog/gen-index.mjs` · Vérifier : `node docs/backlog/check-backlog.mjs`
>
> Pour changer ce que montre cet index, éditer le **frontmatter du ticket**, puis régénérer.

**409 tickets** — 34 ouverts, 374 livrés.

| Statut | Nombre |
|---|---:|
| 📋 Todo | 33 |
| 🚧 Doing | 1 |
| 👀 Review | 0 |
| ⛔ Blocked | 0 |
| ✅ Done | 374 |
| 🗑️ Obsolete | 1 |

## Légende

| Champ | Valeurs |
|---|---|
| `status` | `todo` · `doing` · `review` · `blocked` · `done` · `obsolete` |
| `phase` | `P0` · `P1` · `P2` · `P3` · `EF` (EF = évolution future) |
| `family` | `back` · `front` · `applicatif` · `technique` · `bug` · `full` · `evolution` |
| `estimate` | `S` ≤2j · `M` 3–5j · `L` 6–10j · `XL` >10j |
| `wave` | vague de livraison — catalogue dans [`waves.json`](waves.json) |

**Template** : [`_template.md`](_template.md) · **Archive** : [`_archive/`](_archive/)

---

## 📋 Todo

- [TCK-288](tickets/TCK-288-chaine-de-deploiement-master-fige.md) — Premiere mise en production — la chaine n'a jamais tourne `M · P0 · technique`
- [TCK-293](tickets/TCK-293-webhook-paiement-scope-agence.md) — Webhook de paiement — le secret de n'importe quelle agence valide celui des autres `M · P0 · bug`
- [TCK-332](tickets/TCK-332-front-public-appelle-une-api-absente.md) — Le front de production est public et appelle une API qui n'existe pas `S · P0 · technique`
- [TCK-333](tickets/TCK-333-vercel-sans-filtre-de-chemins.md) — L'intégration Vercel n'a aucun filtre de chemins : chaque commit reconstruit le front `S · P3 · technique`
- [TCK-342](tickets/TCK-342-libelles-wolof-divergents-back-front.md) — Le même bien porte deux mots wolof différents selon l'écran `M · P3 · applicatif`
- [TCK-344](tickets/TCK-344-pgvector-et-chatbot.md) — Chatbot sur Laravel AI SDK, avec pgvector pour la recherche sémantique `XL · P3 · applicatif`
- [TCK-345](tickets/TCK-345-recherche-postgresql-contre-meilisearch.md) — Recherche PostgreSQL (pg_trgm / FTS) : faut-il retirer Meilisearch ? `XL · P3 · technique`
- [TCK-347](tickets/TCK-347-formatage-nombres-et-dates-suit-la-locale.md) — Le formatage des nombres et des dates est figé en français, quelle que soit la langue `L · P3 · front`
- [TCK-349](tickets/TCK-349-index-des-cles-etrangeres-nues.md) — Indexer les clés étrangères nues que la mesure justifie (85 restantes) `M · P3 · technique`
- [TCK-350](tickets/TCK-350-alertes-de-recherche-sauvegardee-renotifient.md) — Les alertes de recherche sauvegardée renotifient les mêmes biens tous les jours `M · P1 · technique`
- [TCK-351](tickets/TCK-351-deux-sources-de-libelles-de-bien.md) — Deux sources de libellés de bien s'affichent dans le même parcours — 44 divergences mesurées `M · P2 · technique`
- [TCK-352](tickets/TCK-352-mailer-resend-declare-sans-dependance.md) — Le mailer `resend` est déclaré mais son paquet n'est pas une dépendance — aucun courriel n'est jamais parti `S · P1 · bug`
- [TCK-355](tickets/TCK-355-blocages-noyau-sur-le-vps.md) — Le VPS se bloque au niveau du noyau : l'API devient injoignable pendant plusieurs minutes, cause non établie `M · P1 · technique`
- [TCK-442](tickets/TCK-442-notfound-des-pages-de-detail-sous-les-replis.md) — Les 9 `notFound()` des pages de détail de `/app` rendent 200 : remonter la REQUÊTE, pas seulement la décision `M · P3 · front`
- [TCK-443](tickets/TCK-443-ecouteurs-enregistres-deux-fois.md) — 21 écouteurs sont enregistrés DEUX fois — la découverte automatique et `AppServiceProvider` font le même travail, et l'utilisateur reçoit tout en double `M · P1 · bug`
- [TCK-444](tickets/TCK-444-profilebadge-aplat-a-20-pour-cent.md) — `ProfileBadge` — 12 couples sur 20 sous le seuil de contraste : c'est le motif `bg-chart-N/20 text-chart-N` qui est en cause, pas une ligne de la table `S · P2 · front`
- [TCK-445](tickets/TCK-445-prestataire-se-reassigne-sa-demande.md) — Un prestataire assigné peut se réassigner sa propre demande et en changer la priorité — `PATCH /api/maintenance-requests/{id}` ne restreint aucun champ `S · P1 · bug`
- [TCK-446](tickets/TCK-446-spec-muette-sur-le-prestataire.md) — La spec ne décrit pas ce que le produit sert déjà au prestataire — sa vue de travail principale n'a aucune ligne `S · P2 · technique`
- [TCK-447](tickets/TCK-447-angles-morts-du-generateur-par-acteur.md) — Les deux angles morts de `gen-features-by-actor` : un acteur déclaré et inemployé passe, une ligne hors section n'est pas même lue `S · P3 · technique`
- [TCK-448](tickets/TCK-448-dialogues-invitation-avalent-lerreur.md) — Les dialogues d'invitation avalent l'erreur de saisie : la soumission est bloquée et rien ne s'affiche — cause non identifiée `M · P2 · bug`
- [TCK-449](tickets/TCK-449-ajout-de-membre-ignore-le-type-dagence.md) — `POST /api/agencies/{id}/members` ignore le type d'agence : une agence `individual` se constitue une équipe en contournant l'écran `S · P1 · bug`
- [TCK-450](tickets/TCK-450-ton-success-de-statusbadge-emprunte-accent.md) — Le ton `success` de `StatusBadge` emprunte `--accent` — décider la charte, et le vérifier à l'écran `S · P2 · front`
- [TCK-451](tickets/TCK-451-assertion-negative-contre-horloge-reelle.md) — Deux mécanismes rendent `DebouncedSearchInput.test.tsx` sensible aux décrochages d'ordonnancement `S · P2 · technique`
- [TCK-452](tickets/TCK-452-theme-sombre-inatteignable.md) — Aucune BASCULE de thème sombre n'existe : le bloc `.dark` sert de surface locale à deux composants et n'est atteignable par aucun utilisateur `M · P2 · technique`
- [TCK-453](tickets/TCK-453-classes-non-emises.md) — Une classe dont le jeton n'existe pas ne fait AUCUNE erreur : la couleur disparaît, et rien dans le dépôt ne peut le voir `M · P2 · technique`
- [TCK-454](tickets/TCK-454-roles-personnalises-sur-agence-individuelle.md) — Deux endpoints acceptent des rôles personnalisés sur une agence `individual`, que la spec leur refuse `S · P1 · back`
- [TCK-455](tickets/TCK-455-invitation-generique-fabrique-un-compte-sans-acces.md) — `POST /api/invitations` fabrique un compte accepté qui n'est membre de rien `M · P1 · back`
- [TCK-456](tickets/TCK-456-trois-definitions-de-la-fenetre-d-activite.md) — Trois définitions divergentes de la fenêtre d'activité d'une délégation, qu'aucune garde ne lie `S · P2 · back`
- [TCK-457](tickets/TCK-457-resolution-des-delegations-en-n-plus-un.md) — La résolution des délégations fait N requêtes là où une seule suffirait — et la sortie n'est PAS un cache `M · P3 · back`
- [TCK-458](tickets/TCK-458-contraste-de-la-pastille-de-contrat.md) — La pastille de type de contrat est sous le seuil AA sur toutes les cartes de bien — et la mesure de contraste ne couvrait que deux composants `M · P2 · front`
- [TCK-459](tickets/TCK-459-un-raisonnement-faux-dans-un-ticket-clos.md) — Un raisonnement faux vit dans un ticket `done`, et il y sert à justifier de laisser un contraste à 1,05:1 `S · P2 · technique`
- [TCK-460](tickets/TCK-460-une-ombre-a-besoin-d-un-jeton-qui-ne-s-inverse-pas.md) — Deux ombres recopient `--foreground` en décimal, et le remède évident les casserait sous `.dark` `S · P2 · front`
- [TCK-461](tickets/TCK-461-trois-proprietes-prouvees-par-lecture-gardees-par-rien.md) — Trois propriétés livrées sont prouvées par LECTURE et gardées par rien — leur régression resterait verte `S · P2 · front`

## 🚧 Doing

- [TCK-339](tickets/TCK-339-vocabulaire-wolof-de-recherche.md) — Vocabulaire wolof de recherche — revue lexicale requise `M · P3 · applicatif`

## 👀 Review

_(aucun)_

## ⛔ Blocked

_(aucun)_

---

## ✅ Done — 374

<details>
<summary><strong>Vague 49 — Site public — audit design & fonctionnel (2026-08-27)</strong> — 11 tickets</summary>

- [TCK-431](tickets/TCK-431-sitemap-et-robots-absents.md) — Le catalogue public n'est déclaré à aucun crawler : ni sitemap, ni robots, et un POC de design indexable `M · P1 · front`
- [TCK-432](tickets/TCK-432-accueil-et-liste-sans-rendu-serveur.md) — La page d'accueil et /properties ne rendent aucun bien côté serveur, et ni l'une ni l'autre n'a de `<h1>` `L · P1 · front`
- [TCK-433](tickets/TCK-433-canonical-et-metadatabase-absents.md) — Aucune URL canonique nulle part : `/properties` se démultiplie en autant de doublons qu'il y a de combinaisons de filtres `S · P2 · front`
- [TCK-434](tickets/TCK-434-trois-langues-une-seule-url.md) — Trois langues servies sur une seule URL : aucune indexation par langue n'est possible, et le choix n'est pas partageable `L · P2 · front`
- [TCK-435](tickets/TCK-435-donnees-structurees-incompletes.md) — Une seule page du site public porte des données structurées — le fil d'Ariane, l'organisation et les profils n'en ont aucune `S · P2 · front`
- [TCK-436](tickets/TCK-436-index-agences-et-agents.md) — `/agencies` et `/agents` n'existent pas : deux surfaces publiques soignées n'ont qu'un seul chemin entrant `M · P2 · full`
- [TCK-437](tickets/TCK-437-pied-de-page-public.md) — Le pied de page public : un formulaire d'inscription qui ne mène nulle part, deux liens, et deux rechargements complets `S · P2 · front`
- [TCK-438](tickets/TCK-438-attente-et-introuvable-du-site-public.md) — L'attente et l'introuvable de la section publique : quatre écrans sans état de chargement, et un 404 racine qui n'existe pas `M · P1 · front`
- [TCK-439](tickets/TCK-439-champ-de-recherche-a-deux-filtres.md) — Le même champ de recherche écrit `q` ou `city` selon le bouton cliqué — et deux entrées du menu mobile mènent à `#` `S · P1 · bug`
- [TCK-440](tickets/TCK-440-chrome-publique-en-palette-brute.md) — La chrome publique en palette brute : 121 classes hors tokens, dont la navbar et un pied de page entièrement hors palette `M · P2 · front`
- [TCK-441](tickets/TCK-441-contact-personnel-agent-sans-authentification.md) — L'adresse de CONNEXION d'un agent est publiée sur un endpoint public énumérable — là où l'API voisine la retire pour les mêmes personnes `S · P1 · back`

</details>

<details>
<summary><strong>Vague 48 — Tableau de bord /app — audit design & fonctionnel (2026-08-26)</strong> — 14 tickets</summary>

- [TCK-377](tickets/TCK-377-app-barre-laterale-la-moins-mure.md) — Tableau de bord /app — la barre latérale est la moins mûre des trois, et c'est celle que tout le monde utilise `M · P1 · bug`
- [TCK-378](tickets/TCK-378-forbidden-trois-pages-et-la-garde-manquante.md) — `forbidden()` — trois pages que TCK-167 n'a pas pu voir, et le cliquet qui manquait pour qu'il le voie `S · P1 · bug`
- [TCK-379](tickets/TCK-379-app-menu-et-inventaire-des-ecrans-ont-diverge.md) — Tableau de bord /app — le menu et l'inventaire des écrans ont divergé : deux écrans sans chemin, un geste mort, un menu qui n'est pas le sien `S · P2 · bug`
- [TCK-380](tickets/TCK-380-app-adopter-les-primitives-partagees.md) — Tableau de bord /app — adopter les primitives partagées que les deux consoles ont déjà `M · P2 · front`
- [TCK-381](tickets/TCK-381-app-palette-brute-et-cliquet.md) — Tableau de bord /app — éteindre la palette Tailwind brute, et étendre le cliquet à ce qu'il ne couvre pas `M · P2 · front`
- [TCK-382](tickets/TCK-382-app-attente-introuvable-et-titre-onglet.md) — Tableau de bord /app — l'attente, l'introuvable et le titre d'onglet : trois états que quarante écrans ne rendent pas `S · P2 · front`
- [TCK-392](tickets/TCK-392-inviter-depuis-admin-team-nenvoie-aucune-invitation.md) — « Inviter » depuis /admin/team n'envoie aucune invitation — l'endpoint qui le fait n'a aucun appelant `M · P1 · bug`
- [TCK-395](tickets/TCK-395-delegation-role-delegue-sans-rapport-avec-les-capacites.md) — Une délégation accorde `agency_admin` en entier, ou rien du tout — les deux se mesurent `M · P2 · back`
- [TCK-404](tickets/TCK-404-chart-3-sous-le-seuil-de-contraste-en-clair.md) — `--chart-3` rend 2,57:1 sur `--card` en thème clair — décider de la valeur ou du rôle `S · P2 · front`
- [TCK-405](tickets/TCK-405-barchart-avale-les-valeurs-negatives.md) — `BarChart` rend une valeur négative à hauteur zéro — la barre disparaît sans bruit `S · P2 · front`
- [TCK-419](tickets/TCK-419-quatre-liens-vers-des-routes-inexistantes.md) — Quatre liens de `/app` mènent à des routes qui n'existent pas — la divergence menu/écrans dans l'autre sens `S · P2 · bug`
- [TCK-420](tickets/TCK-420-acteur-prestataire-absent-de-features.md) — L'acteur 🔧 (prestataire) n'est pas dans la légende de features.md, et un générateur du dépôt le dit depuis longtemps `S · P2 · technique`
- [TCK-426](tickets/TCK-426-statuts-http-perdus-sous-les-replis-de-app.md) — Les replis de /app effacent 404, 307 et 308 : un refus d'autorisation rend désormais 200 et le squelette de la page interdite `M · P3 · front`
- [TCK-430](tickets/TCK-430-admin-settings-tags-sans-chemin-entrant.md) — `/admin/settings/tags` n'a aucun chemin entrant — le bandeau réparé n'est vu que sur une URL tapée à la main `S · P3 · front`

</details>

<details>
<summary><strong>Vague 47 — Console agence /admin — audit design & fonctionnel (2026-08-26)</strong> — 9 tickets</summary>

- [TCK-368](tickets/TCK-368-equipe-cycle-de-vie-des-invitations.md) — Équipe agence — cycle de vie des invitations (en attente, relance, révocation) `S · P1 · front`
- [TCK-369](tickets/TCK-369-delegation-temporaire-ecran-manquant.md) — Délégation temporaire de rôles — l'écran que TCK-108 n'a pas livré `M · P2 · front`
- [TCK-370](tickets/TCK-370-console-agence-chemins-et-gestes-morts.md) — Console agence — quatre chemins et gestes morts `S · P2 · bug`
- [TCK-371](tickets/TCK-371-console-agence-accessibilite-et-mobile.md) — Console agence — contraste des entrées verrouillées, tables tronquées sur mobile, focus clavier `S · P1 · front`
- [TCK-372](tickets/TCK-372-eteindre-le-vocabulaire-app-et-poser-le-cliquet.md) — Éteindre le vocabulaire `app-*` et poser le cliquet — la correction de TCK-244 `L · P2 · front`
- [TCK-373](tickets/TCK-373-console-agence-adopter-les-primitives-partagees.md) — Console agence — adopter les primitives partagées (en-tête, badge, états, pagination, table) `M · P2 · front`
- [TCK-374](tickets/TCK-374-graphique-agence-tokens-chart-et-locale.md) — Graphique agence — palette `--chart-*` et locale active au lieu de `'fr'` `S · P2 · front`
- [TCK-375](tickets/TCK-375-tableau-de-bord-agence-files-attente.md) — Tableau de bord agence — les files d'attente d'abord `M · P2 · front`
- [TCK-376](tickets/TCK-376-moderation-et-audit-etat-partageable.md) — Modération et journal d'audit — état partageable, pagination, recherche temporisée `M · P2 · front`

</details>

<details>
<summary><strong>Vague 46 — Console super-admin — audit design & fonctionnel (2026-08-26)</strong> — 16 tickets</summary>

- [TCK-357](tickets/TCK-357-console-super-admin-primitives-partagees.md) — Console super-admin — primitives partagées (table, en-tête, tuile, badge, filtres, états) `L · P2 · front`
- [TCK-358](tickets/TCK-358-console-super-admin-tokens-et-cliquet.md) — Console super-admin — éteindre la palette Tailwind brute, et poser le cliquet qui l'empêche de revenir `M · P2 · front`
- [TCK-359](tickets/TCK-359-console-super-admin-accessibilite-du-shell.md) — Console super-admin — accessibilité du shell : contraste, focus clavier, lien d'évitement `S · P2 · front`
- [TCK-360](tickets/TCK-360-console-super-admin-accueil-files-attente.md) — Console super-admin — refondre l'accueil autour des files d'attente, et supprimer le doublon /system `M · P2 · front`
- [TCK-361](tickets/TCK-361-rapports-plateforme-vraies-series-temporelles.md) — Rapports plateforme — de vraies séries temporelles (axes, graduations, infobulles, comparaison) `M · P2 · front`
- [TCK-362](tickets/TCK-362-file-kyc-decider-depuis-la-file.md) — File KYC super-admin — décider depuis la file, et nommer les agences `M · P1 · front`
- [TCK-363](tickets/TCK-363-console-super-admin-filtres-et-recherche.md) — Console super-admin — sélecteur d'agence partagé, recherche temporisée, filtres réinitialisables `M · P2 · front`
- [TCK-364](tickets/TCK-364-console-super-admin-i18n-dates-et-libelles.md) — Console super-admin — dates et libellés techniques localisés (fr / en / wo) `S · P2 · front`
- [TCK-365](tickets/TCK-365-supervision-jobs-et-scheduler.md) — Supervision des jobs et du scheduler — sortir la boucle d'exploitation de son enterrement `S · P2 · front`
- [TCK-366](tickets/TCK-366-annonces-cross-tenant-edition.md) — Annonces cross-tenant — éditer une annonce existante `S · P2 · front`
- [TCK-367](tickets/TCK-367-invitations-super-admin-cycle-de-vie.md) — Invitations super-admin — relance, annulation et expiration visibles `M · P2 · full`
- [TCK-383](tickets/TCK-383-statut-reel-des-executions-du-scheduler.md) — Scheduler — enregistrer le statut RÉEL et la durée d'une exécution, au lieu d'une constante `S · P2 · full`
- [TCK-384](tickets/TCK-384-primitives-partagees-couleur-brute.md) — Primitives partagées — la couleur brute que la console rend sans pouvoir la garder `M · P2 · front`
- [TCK-385](tickets/TCK-385-kyc-uploader-palette-brute-onboarding.md) — Assistants d'onboarding — la pastille KYC en palette brute, dans le seul répertoire que deux gardes se renvoient `S · P2 · front`
- [TCK-388](tickets/TCK-388-comparaison-de-durees-inegales-sur-plage-partielle.md) — Rapports — la comparaison oppose des durées inégales dès que la plage ne couvre pas des mois entiers `M · P2 · back`
- [TCK-389](tickets/TCK-389-plafond-de-60-buckets-tronque-en-silence.md) — Rapports — le plafond de 60 buckets tronque une plage choisie sans le dire `S · P2 · back`

</details>

<details>
<summary><strong>Vague 45 — Solde des tickets ouverts : barrière Meilisearch, dates par valeur, i18n résiduel, géo par distances (2026-08-22)</strong> — 1 ticket</summary>

- [TCK-348](tickets/TCK-348-compression-et-deploiement-preprod.md) — Préproduction : la compression n'est pas active, et la branche est 34 commits derrière `dev` `S · P2 · technique`

</details>

<details>
<summary><strong>Vague 44 — PostgreSQL : ce que la migration a rendu DISCUTABLE — recherche PG contre Meilisearch, géo (2026-08-21)</strong> — 1 ticket</summary>

- [TCK-346](tickets/TCK-346-geo-postgis.md) — Recherche géographique : rayon, distance, carte — unifier trois implémentations `L · P3 · applicatif`

</details>

<details>
<summary><strong>Vague 43 — PostgreSQL : ce que la migration a rendu POSSIBLE — jsonb exploité, pgvector et le chatbot (2026-08-21)</strong> — 1 ticket</summary>

- [TCK-343](tickets/TCK-343-index-gin-et-requetes-jsonb.md) — Exploiter JSONB : index GIN et requêtes sur les colonnes de propriétés `M · P3 · technique`

</details>

<details>
<summary><strong>Vague 42 — Recherche & navigation publiques — audit du 2026-08-21</strong> — 6 tickets</summary>

- [TCK-335](tickets/TCK-335-recherche-navigation-defauts-mesures.md) — Recherche & navigation publiques — défauts mesurés de bout en bout `XL · P0 · full`
- [TCK-336](tickets/TCK-336-sparse-fieldsets-au-niveau-ressource.md) — `PropertyResource` fabrique des valeurs pour les colonnes que `fields[]` n'a pas fait lire `M · P2 · technique`
- [TCK-337](tickets/TCK-337-decoupage-du-dictionnaire-next-intl.md) — Le dictionnaire next-intl est inliné en entier dans chaque page `L · P3 · technique`
- [TCK-338](tickets/TCK-338-recherche-conjonctive-tous-les-termes.md) — Une recherche à plusieurs mots doit les exiger tous `M · P1 · applicatif`
- [TCK-340](tickets/TCK-340-listes-de-cles-de-filtre-front.md) — Douze listes de clés de filtre côté front, une seule table `L · P3 · technique`
- [TCK-341](tickets/TCK-341-cache-http-du-catalogue-public.md) — Le catalogue public se recalcule pour chaque visiteur `S · P2 · technique`

</details>

<details>
<summary><strong>Vague 41 — Temps d'exécution de la suite de tests : sélection par impact, puis parallélisation (2026-08-17)</strong> — 7 tickets</summary>

- [TCK-320](tickets/TCK-320-selection-des-tests-par-impact.md) — Sélection des tests par impact — 42 % de la suite est du plancher de harnais, et rien à optimiser dans les tests `M · P2 · technique`
- [TCK-321](tickets/TCK-321-parallel-en-ci.md) — Rouvrir `--parallel` — un de ses deux verrous était levé depuis six semaines, et l'autre était mal posé `M · P2 · technique`
- [TCK-322](tickets/TCK-322-paratest-deux-executions-simultanees.md) — Deux exécutions `--parallel` simultanées se cassent l'une l'autre au démarrage — une quatrième ressource partagée par machine `S · P2 · technique`
- [TCK-324](tickets/TCK-324-mesurer-parallel-sur-le-runner-ci.md) — Mesurer `--parallel` sur le runner CI, puis trancher — la décision actuelle est un défaut, pas un résultat `S · P2 · technique`
- [TCK-325](tickets/TCK-325-garde-des-declencheurs-durs-du-selecteur.md) — Garder la liste des déclencheurs durs du sélecteur d'impact — elle est recopiée à la main et avait dérivé le jour de son écriture `S · P2 · technique`
- [TCK-331](tickets/TCK-331-coverage-php-en-double-casse-le-cliquet.md) — `--coverage-php` est passé DEUX FOIS — le cliquet sort en 1 sans un mot, et la carte d'impact n'a jamais été régénérée `M · P2 · technique`
- [TCK-334](tickets/TCK-334-meilisearch-file-partagee-par-machine.md) — Deux `--parallel` simultanés saturent la file de tâches Meilisearch — la CINQUIÈME ressource partagée par machine `M · P2 · technique`

</details>

<details>
<summary><strong>Vague 40 — Évacuation dette — documentation : specs et documents périmés (2026-08-16)</strong> — 3 tickets</summary>

- [TCK-310](tickets/TCK-310-models-spec-16-modeles-absents.md) — `docs/models-spec.md` ignore 16 modèles et documente encore un package désinstallé `M · P1 · technique`
- [TCK-311](tickets/TCK-311-documents-perimes-et-pointeur-mort.md) — Cinq documents périmés, un pointeur mort dans les deux specs, et 4 Mo d'images commitées `S · P3 · technique`
- [TCK-313](tickets/TCK-313-delai-waitfor-rtl-tendu-sous-charge.md) — Le délai propre de waitFor/findBy est un défaut de framework, pas une mesure `S · P2 · front`

</details>

<details>
<summary><strong>Vague 39 — Évacuation dette — convergence des conventions backend (2026-08-16)</strong> — 12 tickets</summary>

- [TCK-304](tickets/TCK-304-enveloppe-pagination-dupliquee.md) — Enveloppe de pagination dupliquée à la main sur 58 fichiers, avec des clés incohérentes `L · P2 · technique`
- [TCK-305](tickets/TCK-305-validation-inline-vers-formrequest.md) — 120 validations inline contre 65 FormRequest — deux conventions sur le même geste `L · P2 · technique`
- [TCK-306](tickets/TCK-306-autorisation-controleurs-vers-policies.md) — 25 contrôleurs redéfinissent l'autorisation que 16 policies portent déjà `L · P2 · technique`
- [TCK-307](tickets/TCK-307-supprimer-dsl-scopefilter-mort.md) — Supprimer le DSL `scopeFilter` — mort mais toujours branché sur tous les modèles `S · P2 · technique`
- [TCK-308](tickets/TCK-308-baseresource-adoptee-par-7-sur-44.md) — `BaseResource` adoptée par 7 ressources sur 44 — 37 refont les conversions à la main `M · P2 · technique`
- [TCK-309](tickets/TCK-309-conventions-mineures-dedoublees.md) — Trois conventions dédoublées : classes de base de test, préfixes de commandes, namespaces d'auth `M · P3 · technique`
- [TCK-316](tickets/TCK-316-regles-react-compiler-inertes-sous-eslint-9.md) — Cinq familles de règles React Compiler sont déclarées bloquantes et ne s'exécutent pas — 23 violations que le bump ESLint 10 révèle `M · P2 · front`
- [TCK-317](tickets/TCK-317-roles-systeme-derivent-par-date-de-creation.md) — Les rôles système dérivent par date de création d'agence — une capacité ajoutée à l'enum n'atteint jamais les agences existantes `M · P2 · back`
- [TCK-318](tickets/TCK-318-activer-le-react-compiler.md) — Activer le React Compiler — ou décider de ne pas l'activer, mais le décider `M · P3 · front`
- [TCK-319](tickets/TCK-319-porter-watermarkservice-sur-intervention-image-4.md) — Porter `WatermarkService` sur intervention/image 4 — `place()` devient `insert()`, et l'opacité change d'unité `S · P3 · back`
- [TCK-326](tickets/TCK-326-supprimer-scopewithsearch-doublon-inferieur.md) — Supprimer `scopeWithSearch` — le jumeau de `scopeFilter`, et un doublon INFÉRIEUR `S · P2 · technique`
- [TCK-327](tickets/TCK-327-trois-formats-de-date-sur-la-meme-api.md) — Trois formats de date sur la même API — 55 `toISOString`, 37 `toIso8601String`, 18 `toDateString` `M · P2 · technique`

</details>

<details>
<summary><strong>Vague 38 — Évacuation dette — infra du dépôt : versions, déploiement front, environnement (2026-08-16)</strong> — 8 tickets</summary>

- [TCK-298](tickets/TCK-298-versions-infra-production-non-epinglees.md) — Les versions d'infrastructure de production ne sont épinglées nulle part dans le dépôt `S · P2 · technique`
- [TCK-299](tickets/TCK-299-deploiement-frontend-hors-depot.md) — Le déploiement du frontend n'existe dans aucun workflow ni script du dépôt `M · P1 · technique`
- [TCK-300](tickets/TCK-300-guides-deploiement-contredisent-env-livres.md) — Les guides de déploiement prescrivent des drivers que les `.env` livrés contredisent `S · P2 · technique`
- [TCK-301](tickets/TCK-301-pieges-muets-environnement-developpement.md) — Les pièges muets de l'environnement de développement : seeding, PDF, et un `.env` qui vise le natif `S · P2 · technique`
- [TCK-302](tickets/TCK-302-couverture-non-mesuree-suite-non-parallelisee.md) — Aucune mesure de couverture, aucune parallélisation — ~2050 tests en 313 s et pas de garde-fou `M · P2 · technique`
- [TCK-303](tickets/TCK-303-arbitrer-agent-vs-agents.md) — Deux répertoires de compétences concurrents, `.agent/` et `.agents/` — arbitrer, supprimer le mort, et garder contre son retour `S · P1 · technique`
- [TCK-312](tickets/TCK-312-tests-front-rougissent-sous-charge.md) — Quatre tests front rougissent sous charge — le pendant frontend de D-44 `S · P2 · front`
- [TCK-314](tickets/TCK-314-test-recherche-dependant-de-l-ordre.md) — Un test de recherche publique ne passe que grâce à l'ORDRE de la suite — et il rougit 3 fois sur 5 en parallèle `S · P2 · technique`

</details>

<details>
<summary><strong>Vague 37 — Évacuation dette — back sécurité : gardes webhook et policies (2026-08-16)</strong> — 2 tickets</summary>

- [TCK-296](tickets/TCK-296-cles-env-gardes-webhook.md) — Les 7 clés d'environnement des gardes webhook ne sont pas toutes déclarées `S · P1 · technique`
- [TCK-297](tickets/TCK-297-basepolicy-capacites-inexistantes.md) — BasePolicy résout des capacités qui n'existent pas — refus silencieux pour tous sauf super-admin `S · P1 · bug`

</details>

<details>
<summary><strong>Vague 36 — Notifications WhatsApp sortant (2026-06-17)</strong> — 2 tickets</summary>

- [TCK-282](tickets/TCK-282-whatsapp-outbound-channel.md) — Canal de notification WhatsApp sortant `L · P3 · applicatif`
- [TCK-283](tickets/TCK-283-whatsapp-template-registry-webhook.md) — Registre templates Meta + webhook statut WhatsApp (DLR) + opt-out `M · P3 · applicatif`

</details>

<details>
<summary><strong>Vague 35 — Recherche Meilisearch (2026-05-20)</strong> — 2 tickets</summary>

- [TCK-280](tickets/TCK-280-search-properties-meilisearch.md) — Recherche de biens sur Meilisearch (public + dashboard) `L · P2 · back`
- [TCK-281](tickets/TCK-281-search-internal-entities-meilisearch.md) — Recherche interne sur Meilisearch (clients, maintenance, agences, utilisateurs) `L · P3 · back`

</details>

<details>
<summary><strong>Vague 34 — Refonte RBAC : profil = rôle (2026-05-17)</strong> — 3 tickets</summary>

- [TCK-278](tickets/TCK-278-rbac-profile-based-phase-1.md) — RBAC refondu — phase 1 : suppression de spatie sur User + PlatformProfile + Capability resolver `XL · P1 · technique`
- [TCK-279](tickets/TCK-279-rbac-custom-roles-phase-2.md) — RBAC refondu — phase 2 : rôles personnalisés par agence (AgencyRole + pivot de capacités) `L · P1 · full`
- [TCK-315](tickets/TCK-315-role-agence-du-prestataire.md) — Où vit le rôle d'agence d'un prestataire — le profil n'a pas d'agence, la collaboration si `M · P1 · technique`

</details>

<details>
<summary><strong>Vague 33 — Fusion console admin Équipe & Utilisateurs (2026-05-17)</strong> — 1 ticket</summary>

- [TCK-277](tickets/TCK-277-fusion-admin-team-users.md) — Fusion pages admin Équipe & Utilisateurs `M · P2 · front`

</details>

<details>
<summary><strong>Vague 32 — Itération design pages publiques agence/agent (2026-05-17)</strong> — 1 ticket</summary>

- [TCK-276](tickets/TCK-276-public-agency-agent-portrait-redesign.md) — Pages publiques agence & agent — itération "Portrait/confiance `L · P2 · applicatif`

</details>

<details>
<summary><strong>Vague 31 — Orchestration UI flottante bas d'écran (2026-05-15)</strong> — 1 ticket</summary>

- [TCK-275](tickets/TCK-275-floating-dock-orchestrator.md) — Floating Dock — orchestrateur des éléments UI flottants en bas d'écran `S · P2 · front`

</details>

<details>
<summary><strong>Vague 30 — Messagerie UX flottante (2026-05-13)</strong> — 1 ticket</summary>

- [TCK-274](tickets/TCK-274-messaging-floating-widget.md) — Messagerie — widget flottant accessible site-wide `M · P2 · front`

</details>

<details>
<summary><strong>Vague 29 — Onboarding parcours acteurs (2026-05-10)</strong> — 24 tickets</summary>

- [TCK-248](tickets/TCK-248-agency-kind-individual.md) — Agency.kind — distinction standard vs individual + migration + seed `S · P0 · back`
- [TCK-249](tickets/TCK-249-invitation-pattern-unifie.md) — Pattern d'invitation unifié — modèle Invitation + service + emails `M · P0 · back`
- [TCK-250](tickets/TCK-250-wizard-reprenable-component.md) — Wizard reprenable — composant frontend + persistance draft `S · P0 · front`
- [TCK-251](tickets/TCK-251-welcome-modale-generique.md) — Welcome modale générique — composant 3 slides skippable `S · P1 · front`
- [TCK-252](tickets/TCK-252-agency-upgrade-request-model.md) — AgencyUpgradeRequest — modèle + migration + enums `S · P1 · back`
- [TCK-253](tickets/TCK-253-onboarding-wizard-customer.md) — Onboarding wizard Customer — welcome modale + profil minimal différé `S · P0 · front`
- [TCK-254](tickets/TCK-254-cta-publier-universelle.md) — CTA \"Publier\" universelle — routing selon état du user `S · P0 · front`
- [TCK-255](tickets/TCK-255-wizard-host-individual.md) — Wizard host individual — création Agency.kind=individual + profils + 1er bien draft `M · P0 · applicatif`
- [TCK-256](tickets/TCK-256-form-invitation-owner.md) — Form invitation Owner depuis espace agence `S · P0 · applicatif`
- [TCK-257](tickets/TCK-257-wizard-onboarding-owner.md) — Wizard onboarding Owner post-acceptation — KYC + tour + biens pré-rattachés `M · P1 · applicatif`
- [TCK-258](tickets/TCK-258-form-invitation-agent.md) — Écran \"Équipe\" + form invitation Agent (avec choix de rôle) `S · P0 · applicatif`
- [TCK-259](tickets/TCK-259-wizard-onboarding-agent.md) — Wizard onboarding Agent post-acceptation — KYC + zones + tour `M · P1 · applicatif`
- [TCK-260](tickets/TCK-260-carnet-prestataires-invitation-sp.md) — Carnet de prestataires + invitation Service Provider `S · P1 · applicatif`
- [TCK-261](tickets/TCK-261-wizard-onboarding-service-provider.md) — Wizard onboarding Service Provider — KYC + disponibilités + 1ère intervention `M · P1 · applicatif`
- [TCK-262](tickets/TCK-262-service-provider-multi-rattachement.md) — Multi-rattachement Service Provider à plusieurs agences `S · P2 · back`
- [TCK-263](tickets/TCK-263-artisan-create-super-admin.md) — Commande artisan create-super-admin (bootstrap) `S · P0 · back`
- [TCK-264](tickets/TCK-264-cooptation-super-admin.md) — Cooptation super-admin — invitation peer-to-peer + 2FA forcé `M · P1 · applicatif`
- [TCK-265](tickets/TCK-265-welcome-modale-espace-resident.md) — Welcome modale \"Espace résident\" sur transition Lease.signed `S · P1 · applicatif`
- [TCK-266](tickets/TCK-266-tenant-onboarding-checklist.md) — TenantOnboardingChecklist + suivi complétion EDL `M · P2 · applicatif`
- [TCK-267](tickets/TCK-267-form-upgrade-individual-to-standard.md) — Form upgrade individual → standard (soumission user) `M · P1 · applicatif`
- [TCK-268](tickets/TCK-268-super-admin-upgrade-review-console.md) — Console super-admin — revue des demandes d'upgrade agence `M · P1 · applicatif`
- [TCK-269](tickets/TCK-269-flip-agency-kind-and-unlock-features.md) — Flip Agency.kind à l'approbation + débloquage features + welcome agence `S · P1 · applicatif`
- [TCK-270](tickets/TCK-270-tck-209-followup-2fa-currency-branding.md) — TCK-209 follow-up — 2FA recommandé + choix devise + branding dès activation `S · P1 · applicatif`
- [TCK-271](tickets/TCK-271-materialize-agency-admin-profile.md) — Matérialiser le modèle AgencyAdminProfile (résolution divergence TCK-255 / TCK-258) `S · P1 · applicatif`

</details>

<details>
<summary><strong>Vague 28 — Discovery / homepage (2026-05-10)</strong> — 1 ticket</summary>

- [TCK-247](tickets/TCK-247-public-homepage-discovery-endpoint.md) — Endpoint unique homepage discovery (4 rangées dédupliquées côté serveur) `M · P2 · back`

</details>

<details>
<summary><strong>Vague 27 — Audit design front (2026-05-09)</strong> — 6 tickets</summary>

- [TCK-242](tickets/TCK-242-public-agency-agent-pages-design-refresh.md) — Refonte design fiches publiques agence & agent `M · P1 · front`
- [TCK-243](tickets/TCK-243-super-admin-native-controls-pagination.md) — Super-admin — éliminer les contrôles HTML natifs et factoriser la pagination `M · P2 · front`
- [TCK-244](tickets/TCK-244-dashboard-admin-legacy-tokens-migration.md) — Dashboard /app + /admin — migration tokens legacy → tokens DS Lin `L · P2 · front`
- [TCK-245](tickets/TCK-245-super-admin-stone-palette-to-ds-tokens.md) — Super-admin — passer la palette stone Tailwind sur les tokens DS Lin `M · P2 · front`
- [TCK-246](tickets/TCK-246-empty-error-states-and-cta-buttons-harmonization.md) — Empty / error states + CTA shadcn — harmonisation transverse `M · P2 · front`
- [TCK-291](tickets/TCK-291-etats-vides-erreurs-reste-du-parc.md) — États vides / erreurs — le reste du parc (super-admin, admin, tables) `M · P2 · front`

</details>

<details>
<summary><strong>Vague 26 — Bugs smoke test super-admin (2026-05-08)</strong> — 5 tickets</summary>

- [TCK-237](tickets/TCK-237-super-admin-report-export-csv.md) — Super-admin reporting - corriger l'export CSV `S · P2 · bug`
- [TCK-238](tickets/TCK-238-super-admin-agencies-list-completeness.md) — Super-admin agences - compléter la liste plateforme `M · P1 · bug`
- [TCK-239](tickets/TCK-239-super-admin-users-roles-filters.md) — Super-admin utilisateurs - afficher rôles et filtres `M · P1 · bug`
- [TCK-240](tickets/TCK-240-admin-properties-route-scope.md) — Admin biens - restaurer la liste /admin/properties `S · P1 · bug`
- [TCK-241](tickets/TCK-241-api-agencies-agency-admin-scope.md) — API agences - corriger le scope agency_admin `S · P0 · bug`

</details>

<details>
<summary><strong>Vague 25 — Bugs smoke test utilisateurs authentifiés (2026-05-08)</strong> — 10 tickets</summary>

- [TCK-228](tickets/TCK-228-notification-preferences-crash.md) — Préférences notifications — corriger le crash au toggle `S · P1 · bug`
- [TCK-229](tickets/TCK-229-notification-bell-feed.md) — Notifications — restaurer la cloche et le feed `M · P0 · bug`
- [TCK-230](tickets/TCK-230-auth-email-links.md) — Auth — corriger les liens email transactionnels `M · P0 · bug`
- [TCK-231](tickets/TCK-231-profile-edit-avatar.md) — Profil — synchroniser édition et avatar `M · P0 · bug`
- [TCK-232](tickets/TCK-232-auth-form-ux.md) — Auth — aligner les formulaires publics `S · P0 · bug`
- [TCK-233](tickets/TCK-233-auth-oauth-provider-smoke.md) — Auth — fiabiliser OAuth en smoke local `M · P1 · bug`
- [TCK-234](tickets/TCK-234-i18n-auth-account-errors.md) — i18n — corriger auth et compte `M · P0 · bug`
- [TCK-235](tickets/TCK-235-search-relevance-appartement.md) — Recherche — améliorer la pertinence plein texte `M · P0 · bug`
- [TCK-236](tickets/TCK-236-profile-posted-reviews.md) — Profil — afficher les avis postés `M · P2 · bug`
- [TCK-272](tickets/TCK-272-oauth-only-account-deletion-step-up.md) — Suppression de compte — step-up alternatif pour les comptes sans mot de passe utilisable `M · P2 · applicatif`

</details>

<details>
<summary><strong>Vague 24 — Console super-admin · gouvernance SaaS (2026-05-07)</strong> — 7 tickets</summary>

- [TCK-221](tickets/TCK-221-super-admin-agency-kyc.md) — Super-admin — KYC documentaire des agences (workflow vérification) `L · P1 · applicatif`
- [TCK-222](tickets/TCK-222-super-admin-plans-subscriptions.md) — Super-admin — Plans & abonnements plateforme (catalogue + assignation par agence) `L · P2 · applicatif`
- [TCK-223](tickets/TCK-223-super-admin-platform-payouts.md) — Super-admin — Reversement plateforme → agences (payout périodique) `L · P2 · applicatif`
- [TCK-224](tickets/TCK-224-super-admin-broadcast-announcements.md) — Super-admin — Annonces in-app cross-tenant (broadcast par segment) `M · P2 · applicatif`
- [TCK-225](tickets/TCK-225-super-admin-rgpd-user-data-export.md) — Super-admin — Export RGPD des données utilisateur (portabilité) `M · P2 · applicatif`
- [TCK-226](tickets/TCK-226-super-admin-healthcheck-jobs.md) — Super-admin — Healthcheck plateforme & supervision des jobs `M · P2 · applicatif`
- [TCK-227](tickets/TCK-227-super-admin-platform-reporting.md) — Super-admin — Reporting plateforme cross-tenant (croissance, MRR, cohortes) `L · P2 · applicatif`

</details>

<details>
<summary><strong>Vague 23 — Console super-admin</strong> — 30 tickets</summary>

- [TCK-013](tickets/TCK-013-auth-accounts.md) — Authentification & gestion de comptes `L · P0 · applicatif`
- [TCK-018](tickets/TCK-018-audit-trail.md) — Audit & traçabilité `S · P0 · applicatif`
- [TCK-020](tickets/TCK-020-crm-customers.md) — CRM & relation client `L · P0 · applicatif`
- [TCK-021](tickets/TCK-021-documents-contracts.md) — Documents & contrats `M · P0 · applicatif`
- [TCK-023](tickets/TCK-023-admin-configuration.md) — Administration & configuration `M · P0 · applicatif`
- [TCK-024](tickets/TCK-024-search-filters.md) — Recherche & filtres `M · P0 · applicatif`
- [TCK-034](tickets/TCK-034-property-crud-base.md) — Property — Modèle & CRUD base `M · P0 · back`
- [TCK-040](tickets/TCK-040-property-detail.md) — Fiche bien immersive `M · P0 · front`
- [TCK-042](tickets/TCK-042-dashboard-agent-crm.md) — Dashboard Agent — CRM `M · P0 · front`
- [TCK-048](tickets/TCK-048-base-model-api-response.md) — API Response Infrastructure (base resource + error handler) `M · P0 · back`
- [TCK-049](tickets/TCK-049-spatie-permission-activitylog.md) — Spatie Permission + ActivityLog Setup `M · P0 · back`
- [TCK-050](tickets/TCK-050-spatie-medialibrary-upload.md) — Spatie MediaLibrary + Upload Infrastructure `S · P0 · back`
- [TCK-051](tickets/TCK-051-formrequest-validation.md) — FormRequest Base + Validation Patterns `S · P0 · back`
- [TCK-052](tickets/TCK-052-scout-search-infrastructure.md) — Laravel Scout + Search Infrastructure `S · P0 · back`
- [TCK-053](tickets/TCK-053-test-infrastructure.md) — Test Infrastructure + Base Test Classes `M · P0 · back`
- [TCK-054](tickets/TCK-054-design-system-components.md) — Design System + Component Library `M · P0 · front`
- [TCK-060](tickets/TCK-060-auth-pages-oauth.md) — Cycle auth front + OAuth multi-provider `M · P0 · applicatif`
- [TCK-208](tickets/TCK-208-super-admin-agency-detail.md) — Super-admin — Détail agence cross-tenant `/super-admin/agencies/[id]` `M · P1 · front`
- [TCK-209](tickets/TCK-209-super-admin-agency-onboarding.md) — Super-admin — Onboarding agence (création + admin initial) `M · P1 · applicatif`
- [TCK-210](tickets/TCK-210-super-admin-user-detail.md) — Super-admin — Détail utilisateur cross-tenant `/super-admin/users/[id]` `M · P1 · front`
- [TCK-211](tickets/TCK-211-super-admin-user-support-actions.md) — Super-admin — Actions support utilisateur (reset password, unlock, 2FA, sessions) `M · P1 · applicatif`
- [TCK-212](tickets/TCK-212-super-admin-moderation-queue.md) — Super-admin — File de modération unifiée (signalements cross-tenant) `L · P2 · applicatif`
- [TCK-213](tickets/TCK-213-super-admin-tags-amenities-global.md) — Super-admin — Tags & amenités globaux (référentiel plateforme) `S · P1 · front`
- [TCK-214](tickets/TCK-214-super-admin-business-enums.md) — Super-admin — Enums métier éditables (catégories, libellés, traductions) `M · P1 · applicatif`
- [TCK-215](tickets/TCK-215-super-admin-notification-templates.md) — Super-admin — Templates de notification (email / SMS / push) `M · P1 · applicatif`
- [TCK-216](tickets/TCK-216-super-admin-platform-settings.md) — Super-admin — Paramètres globaux plateforme & devises `M · P2 · applicatif`
- [TCK-217](tickets/TCK-217-super-admin-third-party-integrations.md) — Super-admin — Intégrations tierces (API keys, webhooks) `M · P2 · applicatif`
- [TCK-218](tickets/TCK-218-super-admin-maintenance-mode.md) — Super-admin — Mode maintenance programmé `S · P3 · applicatif`
- [TCK-219](tickets/TCK-219-super-admin-feature-flags.md) — Super-admin — Feature flags applicatifs `M · P3 · applicatif`
- [TCK-220](tickets/TCK-220-super-admin-sensitive-action-alerts.md) — Super-admin — Alertes sur actions sensibles `S · P3 · applicatif`

</details>

<details>
<summary><strong>Vague 22 — Bugs smoke test agent immobilier (2026-05-06)</strong> — 9 tickets</summary>

- [TCK-196](tickets/TCK-196-agent-crm-detail-404.md) — CRM agent — restaurer les fiches client détail `S · P0 · bug`
- [TCK-197](tickets/TCK-197-agent-property-lifecycle-actions.md) — Biens agent — fiabiliser publication, statuts et actions `M · P0 · bug`
- [TCK-198](tickets/TCK-198-agent-property-portfolio-controls.md) — Mes biens agent — compléter filtres, colonnes et actions en lot `M · P1 · front`
- [TCK-199](tickets/TCK-199-property-media-validation-advanced.md) — Médias biens — validation robuste et supports avancés `M · P1 · applicatif`
- [TCK-200](tickets/TCK-200-agent-dashboard-operational-widgets.md) — Dashboard agent — widgets opérationnels manquants `M · P1 · front`
- [TCK-201](tickets/TCK-201-crm-pipeline-agent-data-i18n.md) — Pipeline CRM agent — données vides et libellés anglais `M · P1 · bug`
- [TCK-202](tickets/TCK-202-property-create-redirect-detail.md) — Création bien — rediriger vers la fiche créée `S · P1 · front`
- [TCK-203](tickets/TCK-203-agent-visit-requester-context.md) — Visites agent — afficher le demandeur exploitable `S · P1 · front`
- [TCK-204](tickets/TCK-204-agent-dashboard-i18n-format-regressions.md) — Dashboard agent — corriger régressions i18n et formats `M · P1 · bug`

</details>

<details>
<summary><strong>Vague 21 — Dette technique checks frontend (2026-05-06)</strong> — 3 tickets</summary>

- [TCK-193](tickets/TCK-193-frontend-eslint-blockers.md) — Frontend — corriger les erreurs ESLint bloquantes `S · P1 · technique`
- [TCK-194](tickets/TCK-194-frontend-test-type-errors.md) — Frontend — fiabiliser les types des tests `M · P1 · technique`
- [TCK-195](tickets/TCK-195-frontend-runtime-type-errors.md) — Frontend — corriger les erreurs TypeScript runtime `S · P1 · technique`

</details>

<details>
<summary><strong>Vague 20 — Bugs smoke test bailleur / propriétaire (2026-05-06)</strong> — 10 tickets</summary>

- [TCK-183](tickets/TCK-183-owner-booking-actions.md) — Réservations owner — actions accepter/refuser/annuler `M · P1 · front`
- [TCK-184](tickets/TCK-184-owner-visit-actions.md) — Visites owner — confirmation et suivi `M · P2 · front`
- [TCK-185](tickets/TCK-185-owner-lease-create-ux.md) — Baux owner — création avec sélecteurs métier `M · P1 · front`
- [TCK-186](tickets/TCK-186-owner-lease-lifecycle-ui.md) — Baux owner — actions cycle de vie `M · P1 · front`
- [TCK-187](tickets/TCK-187-owner-reviews-inbox.md) — Avis owner — boîte des avis reçus `M · P2 · front`
- [TCK-188](tickets/TCK-188-owner-dashboard-shell.md) — Dashboard owner — widgets et navigation `M · P1 · front`
- [TCK-189](tickets/TCK-189-owner-property-portfolio-ui.md) — Biens owner — gestion portefeuille complète `L · P1 · front`
- [TCK-190](tickets/TCK-190-owner-calendar-usability.md) — Calendrier owner — lisibilité gros portefeuille `S · P2 · front`
- [TCK-191](tickets/TCK-191-owner-maintenance-detail-ux.md) — Maintenance owner — détail lisible `S · P2 · front`
- [TCK-192](tickets/TCK-192-owner-documents-empty-state.md) — Documents owner — état vide actionnable `S · P2 · front`

</details>

<details>
<summary><strong>Vague 19 — Bugs smoke test locataire / acheteur (2026-05-05)</strong> — 16 tickets</summary>

- [TCK-167](tickets/TCK-167-fix-forbidden-server-pages-customer.md) — Fix forbidden() — 6 pages dashboard plantent en 500 pour les rôles non autorisés `S · P0 · bug`
- [TCK-168](tickets/TCK-168-fix-base-ui-label-field-root-context.md) — Fix Base UI Label hors `<Field.Root>` — crash sur /app/payments et SaveSearchButton `S · P0 · bug`
- [TCK-169](tickets/TCK-169-login-email-case-insensitive.md) — Login — match email insensible à la casse (cohérence frontend ↔ backend) `S · P1 · bug`
- [TCK-170](tickets/TCK-170-visit-request-hydrate-authenticated-user.md) — Demande de visite — hydrater visitor_name/email/phone depuis l'utilisateur connecté `S · P1 · bug`
- [TCK-171](tickets/TCK-171-visits-bookings-customer-scope-and-tabs.md) — Visites & réservations customer — filtre par customer_id, onglets, annulation, timeline `M · P1 · applicatif`
- [TCK-172](tickets/TCK-172-payment-gateway-customer-side.md) — Paiement passerelle (Wave / Orange Money / Stripe) — flow customer côté acompte, solde, loyer `L · P2 · applicatif`
- [TCK-173](tickets/TCK-173-customer-rbac-ui-leak-and-sidebar.md) — RBAC UI customer — masquer surfaces agent + compléter la sidebar customer `M · P1 · front`
- [TCK-174](tickets/TCK-174-maintenance-new-property-selector.md) — Maintenance — sélecteur de bien sur /app/maintenance/new `S · P1 · front`
- [TCK-175](tickets/TCK-175-i18n-authenticated-shell-and-shared-components.md) — i18n — layout authentifié et composants partagés (footer, recently viewed, modaux, profil) `M · P1 · front`
- [TCK-176](tickets/TCK-176-offer-vs-booking-modal-by-contract-type.md) — Fiche bien — modale différenciée Réserver (location) vs Faire une offre (vente) `M · P1 · front`
- [TCK-177](tickets/TCK-177-public-agent-and-agency-pages.md) — Pages publiques agents & agences + lien depuis la fiche bien `L · P2 · front`
- [TCK-178](tickets/TCK-178-dashboard-page-titles-metadata.md) — Dashboard — `<title>` figé sur "Tableau de bord" sur ~6 pages /app/* `S · P2 · front`
- [TCK-179](tickets/TCK-179-customer-status-and-enum-localization.md) — Statuts & enums côté customer — localiser les valeurs brutes (pending, in_person, residential_rent, Urgent/High/Normal/Low) `S · P2 · front`
- [TCK-180](tickets/TCK-180-property-review-form-eligibility-gating.md) — Avis fiche bien — gating du formulaire selon l'historique de l'utilisateur `S · P2 · front`
- [TCK-181](tickets/TCK-181-recently-viewed-on-home-and-format.md) — « Récemment consultés » — affichage sur la home + i18n + format unifié `S · P2 · front`
- [TCK-182](tickets/TCK-182-inventories-customer-access-and-labels.md) — États des lieux — accès customer, libellés humains et téléchargement PDF `S · P2 · front`

</details>

<details>
<summary><strong>Vague 18 — Bugs smoke test visiteur anonyme (2026-05-05)</strong> — 8 tickets</summary>

- [TCK-159](tickets/TCK-159-i18n-public-language-switcher-wired.md) — Sélecteur de langue public — câblage i18n FR/EN/WO `M · P1 · front`
- [TCK-160](tickets/TCK-160-i18n-public-residual-english-strings.md) — i18n public — chaînes anglaises résiduelles côté visiteur anonyme `M · P1 · front`
- [TCK-161](tickets/TCK-161-fiche-bien-formulaire-contact-public-anonyme.md) — Fiche bien — formulaire de contact public anonyme `M · P1 · front`
- [TCK-162](tickets/TCK-162-vue-carte-marqueurs-prix.md) — Vue carte — marqueurs avec prix `S · P2 · front`
- [TCK-163](tickets/TCK-163-seed-test-data-exclude-from-public.md) — Données seed — exclure les biens de test du flux public `S · P2 · technique`
- [TCK-164](tickets/TCK-164-home-coherence-sections-cards-adresse.md) — Home publique — cohérence sections, cards et format adresse `M · P2 · front`
- [TCK-165](tickets/TCK-165-fiche-bien-cta-adapte-type-contrat.md) — Fiche bien — CTA adapté au type de contrat (location longue / courte / vente) `S · P2 · front`
- [TCK-166](tickets/TCK-166-public-polish-title-redirect-preload-tri.md) — Polish public — title dupliqué, redirect /super-admin, preload, libellés tri `S · P3 · front`

</details>

<details>
<summary><strong>Vague 17 — Bugs smoke test agent (2026-05-04)</strong> — 11 tickets</summary>

- [TCK-148](tickets/TCK-148-publish-bien-enum-localisation-et-erreur-500.md) — Publication de bien — enums envoyés en EN, 500 sur création, alerte parasite à l'édition `M · P1 · applicatif`
- [TCK-149](tickets/TCK-149-customer-detail-include-fields-spatie-400.md) — Fiche client dashboard — 400 sur include/fields Spatie `S · P1 · back`
- [TCK-150](tickets/TCK-150-favorites-401-race-after-login.md) — Favoris — 401 immédiat après login (race condition token) `S · P1 · front`
- [TCK-151](tickets/TCK-151-pagination-controls-listings-totaux.md) — Pagination listings — total tronqué (clients) et boutons absents (états des lieux) `S · P1 · front`
- [TCK-152](tickets/TCK-152-dashboard-page-titles-localisation-dedup.md) — Dashboard — titres de page non localisés et suffixe Takussan dupliqué `S · P1 · front`
- [TCK-153](tickets/TCK-153-formats-devise-date-harmonises.md) — Formats devise & date — harmonisation FR site-wide `M · P1 · front`
- [TCK-154](tickets/TCK-154-i18n-dashboard-labels-anglais-restants.md) — Dashboard — chaînes anglaises résiduelles & libellés bruts `M · P1 · front`
- [TCK-155](tickets/TCK-155-documents-base-ui-button-warning.md) — Documents — warning a11y Base UI Button (nativeButton) `S · P2 · front`
- [TCK-156](tickets/TCK-156-bookings-detail-rbac-display-cree-le.md) — Fiche réservation — masquer le CTA review pour l'agent et afficher la date de création `S · P1 · front`
- [TCK-157](tickets/TCK-157-property-edit-photos-section-doublon.md) — Fiche bien (édition) — section Photos dupliquée `S · P2 · front`
- [TCK-158](tickets/TCK-158-dashboard-detail-headings-semantiques.md) — Pages détail dashboard — hiérarchie de headings (h1/h2 dupliqués ou manquants) `S · P2 · front`

</details>

<details>
<summary><strong>Vague 16 — Profils polymorphes (User → Profiles)</strong> — 9 tickets</summary>

- [TCK-138](tickets/TCK-138-spec-polymorphic-profiles.md) — Spec — Modèle de profils polymorphes (User → Profiles) `M · EF · evolution`
- [TCK-139](tickets/TCK-139-profiles-schema-migrations.md) — Profils polymorphes — Schéma & migrations `M · EF · back`
- [TCK-140](tickets/TCK-140-profiles-models-backfill.md) — Profils polymorphes — Modèles, relations, backfill `L · EF · back`
- [TCK-141](tickets/TCK-141-profiles-active-context-api.md) — Profils polymorphes — Contexte de profil actif & API `M · EF · back`
- [TCK-142](tickets/TCK-142-profiles-refactor-drop-legacy.md) — Profils polymorphes — Refactor consumers & drop legacy UserType `L · EF · back`
- [TCK-143](tickets/TCK-143-frontend-multi-profile-switcher.md) — Frontend — Sélecteur de profil actif & contexte multi-profil `M · P0 · front`
- [TCK-144](tickets/TCK-144-backend-super-admin-namespace.md) — Backend — Namespace super_admin dédié `/api/admin/...` `L · P1 · technique`
- [TCK-145](tickets/TCK-145-frontend-super-admin-area.md) — Frontend — Espace super-admin dédié hors layout agence `M · P1 · front`
- [TCK-146](tickets/TCK-146-policies-active-profile-migration.md) — Policies & domaines résiduels — migration vers profils actifs (post-TCK-142) `M · P2 · back`

</details>

<details>
<summary><strong>Vague 15 — Câblage des zones UI stub (StubPlaceholder / "Bientôt disponible")</strong> — 8 tickets</summary>

- [TCK-130](tickets/TCK-130-dashboard-app-wiring.md) — Dashboard /app — câblage tuiles & contenu personnalisé `M · P1 · front`
- [TCK-131](tickets/TCK-131-dashboard-admin-agency.md) — Dashboard /admin agence — câblage indicateurs & vue d'ensemble `M · P1 · front`
- [TCK-132](tickets/TCK-132-admin-properties-global.md) — /super-admin/properties — Gestion globale des biens (super_admin) `M · P1 · front`
- [TCK-133](tickets/TCK-133-admin-users-management.md) — /admin/users — Gestion des utilisateurs de l'agence (agency_admin) `M · P1 · front`
- [TCK-134](tickets/TCK-134-admin-finances-overview.md) — /admin/finances — Vue comptable de l'agence (revenus, payouts, factures) `L · P1 · front`
- [TCK-136](tickets/TCK-136-profile-customer-search-preferences.md) — Profil locataire — Préférences de recherche & alertes `M · P1 · front`
- [TCK-137](tickets/TCK-137-profile-contact-phone-edit.md) — Profil contact — Édition téléphone (champ aujourd'hui désactivé) `S · P1 · front`
- [TCK-147](tickets/TCK-147-users-index-agency-scope-status-actions.md) — Backend — `/api/users` agency-scoped + block/activate ouverts à `agency_admin` `S · P1 · back`

</details>

<details>
<summary><strong>Vague 14 — Refonte design system</strong> — 1 ticket</summary>

- [TCK-129](tickets/TCK-129-design-system-public-refresh.md) — Refonte design system — fondation site + homepage publique (Ancrage Local) `L · P1 · front`

</details>

<details>
<summary><strong>Vague 13 — Bugs QA</strong> — 18 tickets</summary>

- [TCK-111](tickets/TCK-111-fix-properties-page-server-client-boundary.md) — Fix runtime error — fetchDashboardProperties appelée côté serveur `S · P0 · bug`
- [TCK-112](tickets/TCK-112-fix-documents-field-root-context.md) — Fix runtime error — FieldRootContext manquant dans DocumentsFilters `S · P0 · bug`
- [TCK-113](tickets/TCK-113-fix-audit-toast-provider.md) — Fix runtime error — useToastManager hors Toast.Provider dans AuditTrail `S · P1 · bug`
- [TCK-114](tickets/TCK-114-fix-leaflet-map-property-detail.md) — Fix carte Leaflet vide sur la fiche bien `S · P0 · bug`
- [TCK-115](tickets/TCK-115-super-admin-no-agency-empty-states.md) — Super_admin sans agence — états vides sur overview, bookings, leases, visits `M · P1 · bug`
- [TCK-116](tickets/TCK-116-admin-sidebar-routes-404-doublon.md) — Admin sidebar — corriger routes 404 et doublon "Équipe `S · P1 · bug`
- [TCK-117](tickets/TCK-117-i18n-chaines-anglaises-backoffice.md) — i18n — traduire les chaînes anglaises restantes du back-office `S · P1 · bug`
- [TCK-118](tickets/TCK-118-search-text-filter-location.md) — Recherche homepage — texte de localisation ignoré et non préservé `S · P1 · bug`
- [TCK-119](tickets/TCK-119-homepage-latest-properties-sort.md) — Homepage — "Derniers ajouts" affiche les mêmes biens que "En vedette `S · P2 · bug`
- [TCK-120](tickets/TCK-120-property-form-missing-sections.md) — Formulaire "Publier un bien" — sections manquantes (adresse, médias, description, caractéristiques) `L · P2 · bug`
- [TCK-121](tickets/TCK-121-ux-footer-crm-lcp.md) — UX — footer liens cassés, filtres CRM __all__, LCP eager loading `S · P2 · bug`
- [TCK-122](tickets/TCK-122-similar-properties-frontend-wiring.md) — Biens similaires — câblage frontend sur la fiche bien `S · P2 · bug`
- [TCK-123](tickets/TCK-123-seed-data-property-coherence.md) — Seeders — corriger incohérences type/surface des propriétés de démo `S · P3 · bug`
- [TCK-124](tickets/TCK-124-auth-bypass-visite-signalement.md) — Fiche bien — auth bypass sur "Demander une visite" et "Signaler `S · P1 · bug`
- [TCK-125](tickets/TCK-125-select-affiche-cles-internes.md) — UI Select — dropdowns affichent les clés internes au lieu des labels `S · P2 · bug`
- [TCK-126](tickets/TCK-126-contact-modal-vs-redirect-login.md) — Fiche bien — "Envoyer un message" devrait rediriger vers /auth/login `S · P2 · bug`
- [TCK-127](tickets/TCK-127-cta-faire-offre-libelle-reserver.md) — Fiche bien — CTA "Faire une offre" devrait être libellé "Réserver `S · P2 · bug`
- [TCK-128](tickets/TCK-128-filtres-avances-disponibilite-etage.md) — Filtres avancés — Disponibilité et Étage absents sur /properties `M · P1 · bug`

</details>

<details>
<summary><strong>Vague 12 — P2 perf / médias / permissions / compta</strong> — 5 tickets</summary>

- [TCK-105](tickets/TCK-105-cdn-modern-image-formats.md) — CDN + webp/avif `S · P2 · technique`
- [TCK-106](tickets/TCK-106-property-photo-watermark.md) — Watermark auto photos biens `S · P2 · applicatif`
- [TCK-107](tickets/TCK-107-search-autocomplete.md) — Autocomplétion recherche `S · P2 · front`
- [TCK-108](tickets/TCK-108-permission-temporary-delegation.md) — Délégation temporaire permissions `M · P2 · applicatif`
- [TCK-109](tickets/TCK-109-bank-reconciliation-assist.md) — Rapprochement bancaire semi-automatique `L · P2 · applicatif`

</details>

<details>
<summary><strong>Vague 11 — P2 modération / discovery / transverses</strong> — 28 tickets</summary>

- [TCK-078](tickets/TCK-078-cleanup-dette-vagues-1-6.md) — Cleanup & dette post-Vagues 1-2-3-4-5-6 `M · P2 · technique`
- [TCK-079](tickets/TCK-079-payment-gateway-wave-orange.md) — Passerelle de paiement Wave / Orange Money / Lemon Squeezy `XL · P2 · applicatif`
- [TCK-080](tickets/TCK-080-account-deletion-rgpd.md) — Suppression de compte avec anonymisation (RGPD) `M · P2 · applicatif`
- [TCK-081](tickets/TCK-081-oauth-facebook-apple.md) — OAuth Facebook & Apple (Socialite) `S · P2 · applicatif`
- [TCK-082](tickets/TCK-082-property-comparator.md) — Comparateur de biens côte à côte `M · P2 · front`
- [TCK-083](tickets/TCK-083-crm-prospect-pipeline.md) — Pipeline de prospects CRM (kanban + stages + conversion) `M · P2 · applicatif`
- [TCK-084](tickets/TCK-084-multi-currency.md) — Devise configurable par agence (XOF / EUR / USD) `M · P2 · applicatif`
- [TCK-085](tickets/TCK-085-group-conversations.md) — Conversations de groupe (multi-participants) `M · P2 · applicatif`
- [TCK-086](tickets/TCK-086-property-hierarchy.md) — Hiérarchie de biens (immeuble → étages → lots) `M · P1 · back`
- [TCK-087](tickets/TCK-087-lease-late-fees.md) — Pénalités de retard automatiques sur loyers `S · P1 · applicatif`
- [TCK-088](tickets/TCK-088-lease-deposit-refund.md) — Remboursement de la caution en fin de bail `S · P1 · applicatif`
- [TCK-089](tickets/TCK-089-lease-renewal-amendment.md) — Renouvellement bail / avenant `M · P2 · applicatif`
- [TCK-090](tickets/TCK-090-lease-early-termination.md) — Résiliation anticipée + pénalités `M · P2 · applicatif`
- [TCK-091](tickets/TCK-091-lease-rent-review.md) — Révision annuelle du loyer `S · P2 · applicatif`
- [TCK-092](tickets/TCK-092-invoice-overdue-reminders.md) — Relance automatique factures en retard `S · P2 · applicatif`
- [TCK-093](tickets/TCK-093-customer-segmentation-tags.md) — Segmentation & tags clients `S · P2 · applicatif`
- [TCK-094](tickets/TCK-094-fulltext-messages-documents.md) — Recherche full-text messages & documents `M · P2 · back`
- [TCK-095](tickets/TCK-095-maintenance-quote-validation.md) — Demande de devis maintenance + validation `M · P2 · applicatif`
- [TCK-096](tickets/TCK-096-maintenance-priority.md) — Priorisation demandes maintenance `S · P2 · applicatif`
- [TCK-097](tickets/TCK-097-document-version-history.md) — Historique versions documents `S · P2 · applicatif`
- [TCK-098](tickets/TCK-098-property-moderation-approval.md) — Modération & validation avant publication bien `M · P2 · applicatif`
- [TCK-099](tickets/TCK-099-property-similar-suggestions.md) — Biens similaires / suggestions personnalisées `M · P2 · back`
- [TCK-100](tickets/TCK-100-property-recently-viewed.md) — Historique local biens consultés `S · P2 · front`
- [TCK-101](tickets/TCK-101-booking-request-auto-expire.md) — Expiration automatique demandes de réservation `S · P2 · applicatif`
- [TCK-102](tickets/TCK-102-sms-notifications-driver.md) — SMS notifications critiques (driver prod, multi-provider) `M · P2 · applicatif`
- [TCK-103](tickets/TCK-103-notifications-digest.md) — Digest quotidien / hebdomadaire `M · P2 · applicatif`
- [TCK-104](tickets/TCK-104-audit-trail-export.md) — Export audit trail `S · P2 · applicatif`
- [TCK-110](tickets/TCK-110-sms-driver-hardening-followups.md) — Durcissement SMS driver — race conditions OAuth, SSRF métadonnées, table delivery_attempts normalisée `M · P2 · technique`

</details>

<details>
<summary><strong>Vague 5 — Avis front</strong> — 6 tickets</summary>

- [TCK-061](tickets/TCK-061-cleanup-dette-vague3.md) — Cleanup & dette technique post-Vague 3 `S · P2 · technique`
- [TCK-072](tickets/TCK-072-calendar-agenda.md) — Calendrier agrégé agent / owner (visites + réservations) `M · P1 · front`
- [TCK-073](tickets/TCK-073-reviews-frontend.md) — Avis — Laisser & répondre publiquement (frontend) `M · P2 · front`
- [TCK-075](tickets/TCK-075-visits-full-workflow.md) — Visites — Planification complète (types, feedback, rappels) `L · P2 · applicatif`
- [TCK-076](tickets/TCK-076-inventory-signature-pdf.md) — Inventaires — Signature deux parties + export PDF `M · P2 · applicatif`
- [TCK-077](tickets/TCK-077-pdf-templates-generation.md) — Documents — Génération PDF depuis templates `M · P2 · back`

</details>

<details>
<summary><strong>Vague 4 — Admin dashboards</strong> — 39 tickets</summary>

- [TCK-014](tickets/TCK-014-roles-permissions.md) — Rôles & permissions `M · P0 · applicatif`
- [TCK-015](tickets/TCK-015-agency-team.md) — Agence & équipe `M · P0 · applicatif`
- [TCK-016](tickets/TCK-016-media-files.md) — Médias & fichiers `M · P0 · applicatif`
- [TCK-017](tickets/TCK-017-i18n-preferences.md) — Internationalisation & préférences `S · P0 · applicatif`
- [TCK-022](tickets/TCK-022-notifications.md) — Notifications `M · P0 · applicatif`
- [TCK-026](tickets/TCK-026-short-term-bookings.md) — Réservations courte durée & visites `M · P1 · back`
- [TCK-027](tickets/TCK-027-long-term-leases.md) — Location longue durée (baux) `L · P1 · back`
- [TCK-028](tickets/TCK-028-transactions-payments.md) — Transactions & paiements `L · P1 · applicatif`
- [TCK-029](tickets/TCK-029-messaging.md) — Communication & messagerie `M · P1 · back`
- [TCK-030](tickets/TCK-030-maintenance-requests.md) — Maintenance & interventions `M · P1 · applicatif`
- [TCK-031](tickets/TCK-031-inventory-inspections.md) — État des lieux & inventaires `M · P1 · applicatif`
- [TCK-032](tickets/TCK-032-reporting-dashboards.md) — Reporting & tableaux de bord `L · P1 · applicatif`
- [TCK-033](tickets/TCK-033-reviews-reputation.md) — Avis & réputation `M · P2 · applicatif`
- [TCK-035](tickets/TCK-035-property-address-media.md) — Property — Adresse & médias `S · P0 · back`
- [TCK-036](tickets/TCK-036-property-tags-collabs-price.md) — Property — Tags, collaborateurs & historique prix `M · P0 · back`
- [TCK-038](tickets/TCK-038-homepage-discovery.md) — Page d'accueil & découverte `S · P0 · front`
- [TCK-039](tickets/TCK-039-search-results.md) — Liste résultats de recherche `M · P0 · front`
- [TCK-041](tickets/TCK-041-dashboard-agent-properties.md) — Dashboard Agent — Layout & biens `M · P0 · front`
- [TCK-043](tickets/TCK-043-bookings-frontend.md) — Réservations — Frontend tunnel `M · P1 · front`
- [TCK-044](tickets/TCK-044-leases-frontend.md) — Baux — Frontend gestion `M · P1 · front`
- [TCK-045](tickets/TCK-045-messaging-frontend.md) — Messagerie — Frontend `M · P1 · front`
- [TCK-046](tickets/TCK-046-favorites-map.md) — Favoris & carte interactive `M · P1 · back`
- [TCK-047](tickets/TCK-047-share-saved-searches-front.md) — Favoris, carte & partage — Frontend `M · P1 · front`
- [TCK-055](tickets/TCK-055-layout-navigation.md) — Layout System + Navigation `M · P0 · front`
- [TCK-056](tickets/TCK-056-auth-middleware-protection.md) — Auth Middleware + Route Protection `S · P0 · front`
- [TCK-057](tickets/TCK-057-api-client-react-query.md) — API Client + Data Fetching (React Query) `S · P0 · front`
- [TCK-058](tickets/TCK-058-i18n-setup.md) — i18n Setup (FR/EN/WO) `S · P0 · front`
- [TCK-059](tickets/TCK-059-form-patterns-validation.md) — Form Patterns + Validation (Zod + RHF) `S · P0 · front`
- [TCK-062](tickets/TCK-062-documents-frontend.md) — Documents — Frontend bibliothèque & partage `M · P1 · front`
- [TCK-063](tickets/TCK-063-payments-frontend.md) — Paiements — Frontend historique, factures, payouts `M · P1 · front`
- [TCK-064](tickets/TCK-064-admin-agency-config.md) — Admin — Configuration agence UI `S · P1 · front`
- [TCK-065](tickets/TCK-065-admin-team-management.md) — Admin — Gestion équipe (ajout / retrait agents) `M · P1 · front`
- [TCK-066](tickets/TCK-066-admin-tags-amenities.md) — Admin — Tags & amenités UI `S · P1 · front`
- [TCK-067](tickets/TCK-067-admin-moderation-ui.md) — Admin — Modération avis & signalements UI `M · P2 · front`
- [TCK-068](tickets/TCK-068-admin-settings-integrations.md) — Admin — Paramètres globaux & intégrations `M · P2 · front`
- [TCK-069](tickets/TCK-069-profile-security-2fa.md) — Profile Security — 2FA, sessions actives, OTP téléphone `L · P1 · applicatif`
- [TCK-070](tickets/TCK-070-notification-preferences.md) — Préférences notifications (canaux + fréquence) `M · P1 · applicatif`
- [TCK-071](tickets/TCK-071-media-multi-upload-reorder.md) — Médias — Upload multiple + reorder drag-drop `S · P1 · front`
- [TCK-074](tickets/TCK-074-property-duplicate-bulk-archive.md) — Property — Dupliquer + archivage en lot `S · P2 · back`

</details>

<details>
<summary><strong>Sans vague</strong> — 18 tickets</summary>

- [TCK-273](tickets/TCK-273-cleanup-redundant-admin-role.md) — Suppression du rôle Spatie redondant `admin` `M · P2 · technique`
- [TCK-284](tickets/TCK-284-pro-routes-sans-garde-serveur.md) — Quatre routes « pro » cadenassées sans garde serveur `S · P1 · bug`
- [TCK-285](tickets/TCK-285-couverture-tests-services-policies.md) — Couverture de tests — services metier, policies, observers, webhooks `L · P1 · technique`
- [TCK-286](tickets/TCK-286-i18n-textes-en-dur.md) — i18n — les libelles produits encore codes en dur `L · P2 · front`
- [TCK-287](tickets/TCK-287-filament-supprimer-ou-securiser.md) — Filament — supprimer le panel ou le securiser `S · P1 · technique`
- [TCK-289](tickets/TCK-289-moteur-de-base-production-non-epingle.md) — Moteur de base de production non épinglé — la CI éprouvait une hypothèse, et elle était fausse `S · P1 · technique`
- [TCK-290](tickets/TCK-290-upload-logo-agence-403.md) — Upload du logo d'agence — 403 systématique, aucune policy pour Agency `S · P1 · bug`
- [TCK-292](tickets/TCK-292-i18n-reste-du-parc.md) — i18n — le reste du parc, en 12 lots `XL · P2 · front`
- [TCK-294](tickets/TCK-294-mtarget-api-pulling-dlr.md) — Mtarget — basculer les accusés de livraison sur l'API Pulling plutôt qu'un webhook non signé `M · P2 · technique`
- [TCK-295](tickets/TCK-295-kpi-alertes-restriction-agence-individual.md) — §1.12 — rendre EXPLICITE que les KPI et alertes de seuil ne sont pas réservés aux agences `standard` `S · P3 · technique`
- [TCK-323](tickets/TCK-323-typescript-7-casse-le-cliquet-i18n.md) — TypeScript 7 n'exporte plus l'API compilateur côté Node — le cliquet i18n en dépend, et le bump PR #182 le casse `M · P2 · technique`
- [TCK-328](tickets/TCK-328-front-servi-sur-127-0-0-1-ne-s-hydrate-pas.md) — Le front servi sur `127.0.0.1` ne s'hydrate pas — Next 16 bloque ses ressources de dev, en silence `S · P2 · technique`
- [TCK-329](tickets/TCK-329-profiletype-front-ignore-agency-admin.md) — Le type `ProfileType` du front ignore `agency_admin` — la barre supérieure affiche « undefined · <agence> » `S · P2 · front`
- [TCK-330](tickets/TCK-330-saved-search-frequence-nulle-500.md) — Créer une recherche sauvegardée avec une fréquence d'alerte vide rend 500 `S · P1 · bug`
- [TCK-353](tickets/TCK-353-aucun-environnement-deploye-ne-peut-etre-seede.md) — Aucun environnement déployé ne peut être seedé : `deploy.sh` installe `--no-dev`, les seeders exigent Faker `S · P2 · technique`
- [TCK-354](tickets/TCK-354-dompdf-dependance-de-dev-utilisee-en-production.md) — Le reçu de paiement PDF ne peut pas se générer sur un environnement déployé : `dompdf/dompdf` est une dépendance de dév `S · P1 · bug`
- [TCK-356](tickets/TCK-356-conversion-preview-sous-resolue.md) — La plus grande image qu'un visiteur puisse recevoir fait 800 × 600, pour des emplacements qui en demandent jusqu'à 2 432 `M · P2 · back`
- [TCK-390](tickets/TCK-390-agences-filtre-is-verified.md) — Agences — ouvrir le filtre `is_verified`, sans quoi la tuile « Vérifiées » de l'accueil ne mène nulle part `S · P2 · full`

</details>

## 🗑️ Obsolete — 1

<details>
<summary><strong>Vague 15 — Câblage des zones UI stub (StubPlaceholder / "Bientôt disponible")</strong> — 1 ticket</summary>

- [TCK-135](tickets/TCK-135-admin-roles-editor.md) — /admin/roles — Éditeur de rôles & permissions personnalisés (agency_admin) [SUPERSEDED] `M · P1 · full`

</details>

---

## Règles

1. Un ticket décrit un **delta**, jamais la spec — il pointe vers elle via `spec_refs`.
2. `depends_on` ne référence que des tickets. Un ticket ne démarre pas tant que ses
   dépendances ne sont pas `done`.
3. **Le statut vaut pour ce qui est mergé sur `dev`.** Une branche non mergée, c'est `doing`.
4. Après merge d'un ticket qui modifie une spec : `/sync-specs`.
