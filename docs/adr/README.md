# Décisions d'architecture (ADR)

Un ADR par décision structurelle. Numérotés, jamais réutilisés, jamais supprimés — une décision
révoquée devient `Remplacé par ADR-NNNN`, elle ne disparaît pas. Ce qu'on a cru, et pourquoi on a
changé d'avis, vaut souvent plus que la conclusion.

**Toute nouvelle décision structurelle s'écrit ici AVANT l'implémentation.** Coder d'abord revient à
trancher sans le dire : le code devient l'argument, et l'arbitrage n'a plus lieu.

## Pourquoi ce dossier existe

Il n'existait pas. Un audit du 2026-08-12 a recensé **32 décisions structurelles effectivement
prises et vérifiables dans le code**, dispersées entre quatre documents de spec, 265 tickets (dont
**255 archivés en `done`**, que personne ne relira), des fichiers de CI et des commentaires de code.

La plus lourde d'entre elles — *« le rôle d'un humain est l'existence d'un profil polymorphe, et
`spatie/laravel-permission` est banni »* — ne vivait que dans un ticket, un paragraphe de
`models-spec.md` et **une garde bash de six lignes dans la CI**.

Le mécanisme de traçabilité de fait était le commentaire `TCK-NNN` : **100 identifiants distincts**
cités dans 330 fichiers de `app/`, `config/`, `database/` et `routes/`. Il pointe vers des tickets
clos. *Une décision qui ne vit que dans un ticket fermé est une décision perdue* — et deux d'entre
elles étaient déjà **contredites par la documentation censée les décrire**.

## Index

| # | Décision | Statut |
|---|---|---|
| [0001](0001-monorepo-laravel-nextjs.md) | Monorepo Laravel 13 + Next.js 16, deux applications, un dépôt | Accepté |
| [0002](0002-role-est-un-profil-polymorphe.md) | Le rôle est un profil polymorphe — `spatie/laravel-permission` banni | Accepté |
| [0003](0003-capacites-enum-code-defined.md) | Les capacités sont un enum défini en code, résolu par un service unique | Accepté |
| [0004](0004-profil-actif-resolu-par-middleware.md) | Le profil actif est résolu par middleware, avec cinq niveaux de repli | Accepté |
| [0005](0005-contrat-http-conserve-roles.md) | Le contrat HTTP conserve `roles[]`, désormais dérivé des profils | Accepté |
| [0006](0006-lecture-api-par-query-builder.md) | Toute lecture d'API passe par `spatie/laravel-query-builder`, sparse fieldsets obligatoires | Accepté |
| [0007](0007-pas-d-enum-sql.md) | Pas de type `enum()` SQL — `string()` + enum PHP | Accepté |
| [0008](0008-meilisearch-sur-tous-les-environnements.md) | Meilisearch sur tous les environnements, CI comprise | Accepté |
| [0009](0009-montant-decimal-entier-a-la-frontiere.md) | Montant décimal en base, entier ×100 à la frontière du driver de paiement | Accepté |
| [0010](0010-auth-token-sanctum-en-cookie.md) | Auth par token Sanctum porté par un cookie httpOnly, pas le mode SPA stateful | Accepté |
| [0011](0011-environnement-de-dev-conteneurise.md) | L'environnement de développement est conteneurisé et calqué sur la production | Accepté |
| [0012](0012-index-du-backlog-genere.md) | L'index du backlog est généré, jamais maintenu à la main | Accepté |
| [0013](0013-un-seul-back-office-en-nextjs.md) | Il n'y a qu'un back-office, et il est en Next.js — Filament supprimé | Accepté |
| [0014](0014-catalogue-code-defini-materialise-et-reconcilie.md) | Un catalogue défini en code et matérialisé en base se réconcilie ; il ne se lit pas à deux endroits | Accepté |
| [0015](0015-react-compiler-active.md) | Le React Compiler est activé, et la mémoïsation manuelle devient l'exception | Accepté |
| [0016](0016-role-agence-du-prestataire-porte-par-la-collaboration.md) | Le rôle d'agence d'un prestataire est porté par la collaboration, pas par le profil | Accepté |
| [0017](0017-deploiement-du-front-pilote-par-vercel.md) | Le déploiement du front reste piloté par Vercel ; le dépôt le relève et le garde | Accepté |
| [0018](0018-format-des-dates-sur-le-fil.md) | L'API émet deux types de date : instant `…T12:34:56+00:00`, date calendaire `YYYY-MM-DD` | Accepté |
| [0019](0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md) | L'erreur d'API porte un code, la surface de rendu porte le texte | Accepté |
| [0020](0020-postgresql-sur-tous-les-environnements.md) | PostgreSQL 17 sur tous les environnements, base de test comprise — SQLite et MySQL retirés | Accepté |
| [0021](0021-sparse-fieldsets-au-niveau-ressource.md) | `fields[]` désigne des colonnes ; une ressource n'invente pas ce qu'elle n'a pas lu | Proposé |
| [0022](0022-le-dictionnaire-i18n-est-decoupe-par-groupe-de-routes.md) | Le dictionnaire i18n est découpé par groupe de routes, et une clé manquante lève | Accepté |
| [0023](0023-recherche-geographique-par-distances-sans-postgis.md) | La recherche géographique traite des distances et des rectangles, jamais des géométries — pas de PostGIS | Accepté |
| [0024](0024-recherche-publique-conjonctive-avec-repli-nomme.md) | La recherche publique exige tous les termes, et nomme ce qu'elle a dû relâcher | Accepté |

## Décisions recensées, pas encore rédigées

Elles sont **prises et appliquées** — elles n'ont simplement pas encore leur ADR. Listées ici pour
qu'elles ne se reperdent pas, avec l'endroit où elles vivent aujourd'hui. Les écrire est un chantier
ouvert.

| Décision | Où elle vit aujourd'hui |
|---|---|
| `users.agency_id` et `users.type` supprimées — le User est une identité pure (TCK-142) | le nom d'un fichier de migration |
| 67 modèles sur 70 héritent d'`AbstractModel` | le code seul |
| Deux mécanismes de filtrage concurrents (`scopeFilter` maison vs spatie) | nulle part — cf. ardoise D-34 |
| SMS multi-opérateur avec routage déduit du numéro (Orange / LAfricaMobile / Mtarget) | `docs/integrations/sms.md` + `config/sms.php` |
| WhatsApp prioritaire, repli SMS **mutuellement exclusif**, catégories Meta restreintes | tickets TCK-282/283 seulement |
| `agency.kind` (standard / individual) gate des fonctionnalités — **implémenté deux fois**, PHP et TS | un docblock qui avoue le jumelage — cf. ardoise D-23 |
| Feature flags maison plutôt que Laravel Pennant | le code seul |
| Audit par `spatie/laravel-activitylog` encapsulé dans un trait à configuration figée | docblock + `models-spec.md` §13 |
| Médias par `spatie/medialibrary` derrière un CDN pluggable avec kill switch | `models-spec.md` + `docs/infra/cdn.md` |
| Déploiement zero-downtime par script bash sur VPS — pas de conteneur, pas d'orchestrateur | l'en-tête de `scripts/deploy.sh` |
| Flux de branches `dev` → `preview` → `master` | les seuls déclencheurs de workflows — cf. ardoise D-04 |
| Trilingue fr/en/wo propagé par `Accept-Language` | `docs/configuration.md` §3, partiellement |
| Design system : shadcn style `base-nova` sur `@base-ui/react`, **aucun Radix**, palette « Lin » | `docs/design-guidelines.md` |

## Format

```markdown
# ADR-NNNN — <titre à l'indicatif présent>

- **Statut** : Proposé | Accepté | Remplacé par ADR-NNNN | Abandonné
- **Date** : YYYY-MM-DD
- **Tickets** : TCK-NNN

## Contexte
Ce qui rendait la décision nécessaire. Les faits, mesurés.

## Décision
Une phrase à l'indicatif présent, puis le détail.

## Conséquences
Ce que ça coûte, ce que ça interdit, ce que ça rend possible. Les mauvaises aussi.

## Application
Où c'est dans le code, et ce qui l'empêche de régresser (garde, test, CI).
```
