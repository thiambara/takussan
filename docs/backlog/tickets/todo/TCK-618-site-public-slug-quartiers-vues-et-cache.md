---
id: TCK-618
title: "Site public, après TCK-598 : un titre sans lettre latine garde un slug lisible, un quartier n'est compté qu'une fois, une vue se compte par visiteur et sur un bien visible, un marquage en masse invalide le cache (suites de verif-598)"
status: todo
phase: P2
family: back
estimate: S
wave: 76
created: 2026-10-08
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
tags: [back, public, slug, seo, quartiers, vues, cache, adr-0052]
---

# TCK-618 — Slug, quartiers, vues et cache du site public

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé.** Le point 3 (vues en IPv6) est **fermé par TCK-851** (P37.01) :
`PropertyViewCounter::cle()` passe par `VisitorFingerprint::network()` (test :
`tests/Feature/RateLimiting/IpRateLimitKeyTest.php`). Les points 1, 2, 4 et 5 restent entiers
(`git log --grep=TCK-618` : rien ; dernier commit sur `PropertiesFlagTestCommand` : `533865e66`, TCK-163).

Reste à faire :
- `Property::booted()` : repli `bien-XXXXXX` à la création seulement (AC1).
- `neighborhoods` : `trim` dans le regroupement et dans le `mode()` ; graphie non capitale à égalité (AC2).
- `recordView` : `authorize('view')` → 404 identique au bien inconnu (AC4).
- `PropertiesFlagTestCommand` : revalidation des slugs touchés (AC5).

Aucune décision du porteur attendue.

## Objectif utilisateur

Un visiteur partage une fiche dont l'adresse se lit, voit chaque quartier une seule fois avec son vrai
compte, et l'agence lit un nombre de vues qu'aucun client ne gonfle.

## Contexte

Suites relevées par **verif-598** et inscrites dans le ticket 598 (« Suites relevées par verif-598
(notées, non corrigées ici) ») et dans `FILE-D-ATTENTE.md` (m3, m8).

**Re-mesure sur `839be671` (2026-10-08)** :

1. **Slug vide (m3).** `Property::booted()` fait `Str::slug($m->title).'-'.Str::random(6)`
   (`takussan-api/app/Models/Property.php:246-247`) ; `Str::slug` rend `''` pour un titre en émojis, en
   CJK ou fait de `---` (mesuré par verif-598) : le slug devient `-XXXXXX`. Le front l'accepte
   désormais (`lib/slug-de-bien.ts`), la source non.
2. **Quartiers fractionnés (m7).** `PublicPropertyController::neighborhoods`
   (`takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:305-329`) groupe sur
   `CaseInsensitive::sql('addresses.neighborhood')` (même expression : `LOWER(… COLLATE "und-x-icu")`) **sans `trim`** —
   le libellé rendu est déjà `trim()`-é en PHP (`:329`), pas le regroupement : ` Mermoz ` (espaces) fait une seconde
   entrée de compte 1 à côté de « Mermoz » (4), ce qui fractionne le compte jugé au seuil. La graphie
   rendue est `mode() WITHIN GROUP (ORDER BY neighborhood)` : en collation C, la capitale gagne une
   égalité (`MÉDINA`). `TrimStrings` nettoie la saisie par l'API ; seuls seeders et imports produisent
   ces lignes.
3. **Vues gonflables en IPv6.** `PropertyViewCounter::cle` (`app/Services/Property/PropertyViewCounter.php:49-52`)
   borne à `MAX_PAR_HEURE = 3` vues par heure et par **IP brute** : `2001:db8::1` et
   `2001:DB8:0:0:0:0:0:1` ont deux compteurs, et un client qui tourne dans son /64 n'a pas de borne. `VisitorFingerprint::network` (`app/Support/VisitorFingerprint.php:38-53`, TCK-597)
   sait déjà réduire une IPv6 à son /64 canonique ; le compteur ne s'en sert pas.
   — **caduc depuis TCK-851** (P37.01) : `PropertyViewCounter::cle()` passe par `VisitorFingerprint::network()`.
4. **Une vue sur un bien privé.** `POST /api/properties/{property}/view`
   (`routes/api/properties.php:59`, `PropertyController::recordView` `:532-537`) : tout utilisateur
   authentifié l'appelle sur n'importe quel bien, privé compris, et lit `views_count` (relevé par 598,
   réponse gardée à dessein par son AC16, renvoyé au cloisonnement de TCK-587).
5. **Marquage en masse sans invalidation (m8, part restante).** `PropertiesFlagTestCommand`
   (`app/Console/Commands/PropertiesFlagTestCommand.php:59`) fait `$query->update(['is_test' => true])`
   hors Eloquent : aucune `RevalidatePublicPropertyPage` ne part, la fiche reste servie jusqu'au
   plancher de 300 s (ADR-0052). La part « suspension d'agence » de m8 est **fermée** par TCK-600 (le
   job de synchronisation envoie la revalidation à chaque lot).

**Re-mesuré le 2026-11-16 sur `9112194ec`** : points 1, 2, 4, 5 inchangés ; point 3 fermé (TCK-851).

## Contraintes strictes (métier)

1. Un slug n'est jamais vide avant son suffixe : repli `bien-XXXXXX` (ou translittération si elle
   rend des lettres). **Aucun slug existant ne change** : le dépôt n'a aucun mécanisme de redirection
   d'un ancien slug (`grep -rln "old_slug\|SlugRedirect\|previous_slug" app database` : rien), et un
   slug `-XXXXXX` déjà partagé fonctionne (le front l'accepte depuis 598). Réécrire l'existant
   demanderait ce mécanisme : hors périmètre.
2. Le regroupement des quartiers écrit **exactement** l'expression d'un index s'il en existe un
   (piège PostgreSQL n°9) ; graphie rendue : la plus fréquente, puis une graphie non capitale.
3. Le compteur de vues borne par `VisitorFingerprint::network()` (IPv4 entière, /64 IPv6). (Tenu par TCK-851, relevé 2026-11-16.)
4. `recordView` n'accepte qu'un bien que l'appelant peut voir (`view`) ; sinon le même 404 qu'un bien
   inconnu.
5. Toute écriture de masse qui change ce que la fiche publique affiche envoie la revalidation des
   slugs touchés.

## Delta à produire

- [ ] `Property::booted()` : contrainte 1 (création seulement).
- [ ] `PublicPropertyController::neighborhoods` : `trim` dans le regroupement et la graphie (contrainte 2).
- [x] `PropertyViewCounter` : contrainte 3 (fiche publique et `POST …/view`). (tenu par TCK-851, relevé 2026-11-16)
- [ ] `PropertyController::recordView` : contrainte 4.
- [ ] `PropertiesFlagTestCommand` : revalidation des slugs touchés (contrainte 5).
- [ ] Tests : `PropertySlugFallbackTest`, `PublicNeighborhoodsTest` (espaces, capitales),
      ~~`PropertyViewCounterTest` (IPv6)~~ (caduc depuis TCK-851 : `IpRateLimitKeyTest`), `RecordViewVisibilityTest`, `PropertiesFlagTestCommandTest`.

## Critères d'acceptation

- [ ] **AC1 (rouge sur `839be671`).** Titre `🏠🌴`, puis `北京公寓`, puis `---` : le slug commence par
      une lettre ; un titre `Villa Mermoz` garde `villa-mermoz-XXXXXX`. Un bien existant au slug
      `-XXXXXX` modifié (titre inchangé) garde son slug.
- [ ] **AC2 (rouge sur `839be671`).** Quatre biens à `Mermoz`, un à ` Mermoz ` : une seule entrée,
      compte 5 ; `Médina` ×2 et `MÉDINA` ×2 : une entrée, graphie `Médina`.
- [x] **AC3 (rouge sur `839be671`).** (tenu par TCK-851, relevé 2026-11-16 — `IpRateLimitKeyTest`) quatre vues alternées entre `2001:db8::1`, `2001:DB8:0:0:0:0:0:1` et
      `2001:db8::2` (même /64) : `views_count` augmente de `MAX_PAR_HEURE`, pas de 4.
- [ ] **AC4.** `POST /api/properties/{id}/view` sur un bien privé d'une autre agence → 404, et
      `views_count` inchangé ; sur un bien public → 200.
- [ ] **AC5.** `properties:flag-test` sur deux biens : deux `RevalidatePublicPropertyPage` en file
      (`Queue::fake`).
- [ ] Ablations consignées.

## Hors périmètre

- La page publique « bien retiré » et le cache de la fiche (TCK-598, fait).
- L'IP du visiteur transmise par le serveur Next (TCK-612).
- La réécriture des slugs `-XXXXXX` existants (exige un mécanisme de redirection, ticket à part si
  le porteur la veut).

## Notes d'implémentation

_(à remplir par implementing-specs)_
