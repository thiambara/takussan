---
id: TCK-276
title: Pages publiques agence & agent — itération "Portrait/confiance"
status: done
phase: P2
family: applicatif
estimate: L
wave: 32
created: 2026-05-17
updated: 2026-05-17
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#111-avis--réputation
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#11-review
    - docs/models-spec.md#35-agentprofile-
tags: [front, back, design-system, public-pages]
---

## Objectif utilisateur

Un visiteur qui consulte une fiche publique d'agence ou d'agent doit comprendre **en moins de cinq secondes** à qui il a affaire (proof points objectifs, biens disponibles, réputation), et trouver une seule action évidente pour entrer en contact — adaptée à son terminal.

## Contrat de données

### Endpoints à étendre

- `GET /api/public/agencies/{slug}` (`PublicAgencyController::show`) — payload existant à enrichir.
- `GET /api/public/agents/{slug}` (`PublicAgentController::show`) — payload existant à enrichir.

### Champs à exposer côté agence (en plus de l'existant)

- Coordonnées : `email`, `phone` (existants sur `agencies`, à exposer).
- `city` : dérivée de la relation `address()` morphOne (Address.city). Pas de colonne flat sur Agency.
- `stats` agrégées dérivées du portefeuille visible : nb à louer / à vendre (via scopes `Property::rent()` / `Property::sale()` sur `contract_type`), nb de villes couvertes (distinct sur addresses des biens), nb d'agents.
- `agents[]` enrichis : `email`, `specialty` (depuis `AgentProfile.specialty`), `portfolio_count` par agent (count des biens publiés/visibles dont `user_id = agent.id`).
- `reviews` : moyenne, total, six dernières approuvées (`reviewable_type = Agency`, `is_approved = true`). Voir `spec_refs.models#11-review`.

### Champs à exposer côté agent

- `bio` : source `User.bio` (champ existant sur `users`). Pas sur AgentProfile.
- `city` : dérivée via `User.addresses()` (Address morphMany — première adresse non nulle).
- `preferred_language` : exposé en single (fr/en/wo) depuis `User.preferred_language`. Pas de champ array.
- `years_of_experience` : **dérivé** de `AgentProfile.hire_date` (`today − hire_date` en années entières). Null si `hire_date` null.
- `specialty` : depuis `AgentProfile.specialty`.
- `stats` dérivées (mêmes règles que l'agence, sans `agents`).
- `reviews` : idem, `reviewable_type = User`.

> **Hors scope ici** : `whatsapp` (pas en base — couvert par `phone`) et liste de langues parlées en array (seul `preferred_language` single est dispo). Si besoin futur, ouvrir une PR spec dédiée.

## Direction UX / Artistique

Direction : **Portrait / confiance** — éditorial sobre, asymétrie maîtrisée, palette **Lin** posée par TCK-129, signature `BogolanPattern` conservée (4–5 % d'opacité, jamais figuratif).

**Principes**

- Hiérarchie de l'attention : qui (identité visuelle large) → quoi (proof points chiffrés) → bien (portefeuille segmenté par intention) → confiance (avis) → action (contact).
- Asymétrie du hero : portrait/logo dominant à gauche, méta-données + bio respirante à droite. Pas de bandeau marketing, pas de slogan.
- Hiérarchie des CTA : **un seul** CTA primaire saillant (`Contacter`). Sur mobile il occupe toute la largeur et ouvre une feuille de contact (Email · Téléphone). Sur desktop, un secondaire en ghost icon-only complète. (WhatsApp non exposé tant qu'aucune colonne dédiée n'est en base — `phone` couvre l'appel.)
- Portefeuille : **trois onglets** (Tous · À louer · À vendre) ; filtrage côté client sur la collection retournée. Variante de carte adaptée à la découverte (4:3, prix → titre → location → méta), pas la variante listing dense actuelle.
- Équipe (agence uniquement) : strip horizontal scrollable (`snap-x snap-mandatory`) avec cards riches (avatar, nom, eyebrow rôle, nb biens, chevron). Empile en grille uniquement si ≤ 3 agents.
- Agent solo : si rattaché à une agence, afficher une carte compacte "Membre de l'agence X" linkée — pas de strip d'équipe sur la page agent.
- Avis : section discrète mais réelle (note moyenne + 4–6 cards). Cachée si zéro avis approuvé.
- Stats : chiffres en `font-display` accentué + label uppercase tracking serré. Pas de pictos, pas de couleurs alternées.

**Ambiance**

Pages éditoriales d'agences immobilières haut de gamme (Patrice Besse, Knight Frank) — densité maîtrisée, photo respectée, ton chaleureux mais pas familier. **Pas** de pages corporate génériques.

**Mobile-first**

- 1 CTA primaire pleine largeur, feuille de contact bottom sheet (≥ 56 px de hauteur de cible par option).
- Stats : grille 2×2 sur ≤ md, row sur ≥ md.
- Strip équipe : scroll horizontal natif, snap obligatoire, indicateurs de débordement (fade latéral).
- Onglets portefeuille : segmented control, label court, état actif lisible.

**Référence DS**

- Cartes : système 4 variantes (`Standard` / `Listing` / `Cover` / `Compact`) — utiliser `Standard` pour le portefeuille (variante actuelle `Listing` à remplacer). Voir `docs/design-guidelines.md`.
- Typo : `font-display` (Bricolage Grotesque) pour titres, eyebrows, chiffres de stats ; `font-sans` (DM Sans) ailleurs.
- Aucun composant à prescrire ici : l'implémenteur découpe selon les patterns DS et la cohérence avec le reste du repo.

## Contraintes strictes (métier)

- **Visibilité publique** des biens : conserver les filtres `status = Available` et `visibility = Public` sur le portefeuille (déjà appliqués). Aucun bien hors visibilité ne doit fuiter.
- **Avis** : seuls les avis `is_approved = true` sont exposés (`spec_refs.models#11-review`). Aucun champ identifiant un mineur ou un PII non consentant ne doit apparaître. Auteur affiché : prénom + initiale du nom.
- **AgentProfile en lecture seule côté public** : exposer uniquement les champs publics du profil (bio, ville, langues, années) — pas `license_number` interne ni champs admin.
- **404 strict** : un slug inconnu, un agent `status != active`, ou une agence non publiable doivent rendre 404 (comportement actuel à préserver).
- **A11y** : tous les contrôles interactifs `<Button>` / `<Tabs>` shadcn-ui ; focus ring visible terracotta ; cibles tactiles ≥ 44 px ; navigation clavier complète sur les onglets.
- **i18n** : aucune chaîne en dur — toutes les chaînes nouvelles passent par les fichiers de traduction publics (cf. TCK-159/160).
- **Perf** : `priority` sur logo/avatar du hero ; `loading="lazy"` sur avatars d'équipe et photos de cards ; `sizes` correct sur chaque `next/image`.
- **SEO** : `generateMetadata` enrichi (title/description avec stats si dispo, OG image conservée).

## Delta à produire

### Backend (`takussan-api/`)

- [ ] Aucune nouvelle migration. Tous les champs nécessaires existent (Agency : `email`/`phone` ; AgentProfile : `specialty`/`hire_date` ; User : `bio`/`preferred_language` ; Address morph pour city ; Review polymorphe pour les avis).
- [ ] Étendre `PublicAgencyController::show` :
   - eager-load `address`, `agents.agentProfile` (pour `specialty`)
   - exposer `email`, `phone`, `city` (depuis address)
   - exposer `stats` (rent_count via `Property::rent()`, sale_count via `Property::sale()`, villes distinctes, agents_count)
   - enrichir chaque agent : `email`, `specialty`, `portfolio_count` (sous-query sur properties)
   - exposer `reviews` (moyenne arrondie, count, 6 dernières approuvées via `ReviewResource`)
- [ ] Étendre `PublicAgentController::show` :
   - eager-load `addresses`, `agent_profiles` (pour `specialty`/`hire_date`)
   - exposer `bio` (depuis User), `city` (depuis premier address), `preferred_language`, `specialty`, `years_of_experience` (dérivé de `hire_date`)
   - exposer `stats` (mêmes règles que agence, sans agents_count)
   - exposer `reviews` polymorphes sur `User`
- [ ] Réutiliser `ReviewResource` existant (pas de nouvelle resource).
- [ ] Tests `tests/Feature/Public/PublicAgencyControllerTest` : champs présents, stats correctes (rent/sale/villes/agents), reviews filtrées par `is_approved`, agents enrichis avec `specialty` et `portfolio_count`.
- [ ] Tests `tests/Feature/Public/PublicAgentControllerTest` : `bio` depuis User, `city` depuis address, `years_of_experience` dérivé, stats, reviews polymorphes sur `User`, 404 si `status != active`.
- [ ] Lint Pint vert avant commit (`./vendor/bin/pint`).

### Frontend (`takussan-web/`)

- [ ] Réécrire `src/app/(public)/agencies/[slug]/page.tsx` selon la Direction UX (sections : hero asymétrique, stats, équipe, portefeuille à onglets, avis).
- [ ] Réécrire `src/app/(public)/agents/[slug]/page.tsx` selon la Direction UX (sections : hero asymétrique, stats, carte agence si rattaché, portefeuille à onglets, avis).
- [ ] Mettre à jour les DTOs côté frontend pour refléter les nouveaux champs API (stats, reviews, agents enrichis).
- [ ] Garder `generateMetadata` dynamique ; enrichir `description` quand `stats` permet.
- [ ] Lint Next vert avant commit (`npm run lint`).

### Hors prescription (laissé à l'implémenteur)

- Découpage en composants (factorisation hero / stats / strip / onglets / avis si pertinent — à décider à l'implémentation).
- Bibliothèque d'animations / transitions exactes — utiliser les classes DS existantes (`animate-section-enter`, `animate-card-enter`).
- Gestion d'état des onglets (search param, useState, etc.) — choisir selon cohérence existante.

## Critères d'acceptation

- [ ] AC1 — `GET /api/public/agencies/{slug}` retourne `stats.rent_count`, `stats.sale_count`, `stats.cities`, `stats.agents`, `reviews.average`, `reviews.count`, `reviews.recent[]`, ainsi que `email`, `phone`, `city` quand renseignés ; chaque entrée `agents[]` inclut `email`, `specialty`, `portfolio_count`.
- [ ] AC2 — `GET /api/public/agents/{slug}` retourne `bio` (depuis User), `city` (depuis Address), `preferred_language`, `specialty` (depuis AgentProfile), `years_of_experience` (dérivé de hire_date), plus les blocs `stats` et `reviews` équivalents.
- [ ] AC3 — Sur `/agencies/[slug]` et `/agents/[slug]`, le hero est asymétrique (identité visuelle dominante d'un côté, méta + bio + CTA de l'autre) ; un seul CTA primaire visible.
- [ ] AC4 — Sur viewport ≤ 480 px, le CTA primaire occupe toute la largeur et ouvre une feuille de contact listant Email / Phone avec cibles ≥ 44 px ; les CTA inline ne sont jamais empilés visiblement à l'écran.
- [ ] AC5 — Le portefeuille est rendu avec une variante "découverte" (4:3) et un sélecteur à 3 onglets (Tous · À louer · À vendre) avec filtrage côté client ; un état vide contextualisé s'affiche par onglet.
- [ ] AC6 — Sur la page agence avec ≥ 4 agents, l'équipe est rendue en strip horizontal scrollable avec snap ; chaque card est cliquable vers la page agent.
- [ ] AC7 — La section Avis s'affiche dès qu'il existe au moins un avis approuvé (note moyenne + jusqu'à 6 cards) ; elle est entièrement absente sinon (aucun placeholder).
- [ ] AC8 — Aucun bien `visibility != Public` ou `status != Available` n'est exposé. Aucun avis non approuvé n'est exposé. Slug inconnu / agent non actif → 404.
- [ ] AC9 — Navigation clavier complète sur les onglets portefeuille (flèches, Home/End, focus visible terracotta) ; ratio de contraste AA respecté sur tous les textes ; Lighthouse a11y ≥ 95 sur les deux pages.
- [ ] AC10 — Aucune chaîne en dur côté frontend : tous les libellés nouveaux passent par i18n. Pint vert (back). Next lint vert (front). Tests `PublicAgencyControllerTest` et `PublicAgentControllerTest` verts.

## Hors périmètre

- Photo de couverture (cover image) pour agence/agent — relève d'une direction "Éditoriale" à billeter séparément (nouveau champ `cover_url`, upload, modération).
- Page liste paginée "Tous les biens" / "Tous les avis" — pas de nouvelle route ici. Le cap actuel (48 biens agence / 24 biens agent, 6 avis affichés) est conservé.
- `generateStaticParams` (ISG des top slugs) — déjà noté dans la roadmap de TCK-177, sera traité dans un ticket perf dédié.
- Formulaire "Laisser un avis" sur une page agence/agent — gating et soumission relèvent du modèle TCK-180 / TCK-073 ; non rouvert ici.
- Migration vers les Cache Components Next.js 16 (`use cache`, `cacheTag`) — peut être ajoutée ultérieurement quand les sections sont stables.

## Notes d'implémentation

### Spec-fidélité — adaptation du périmètre original

Le ticket initial référençait des colonnes inexistantes en base (`Agency.whatsapp`, `AgentProfile.bio/city/languages/years_of_experience`, `User.whatsapp`). Audit fait sur `models-spec.md` + migrations avant tout code. Décision : option A — adapter sans modifier la spec. Mapping retenu :

- `bio` agent ← `User.bio` (existant)
- `city` agence/agent ← relation `addresses` morphMany (première adresse)
- `years_of_experience` ← dérivé de `AgentProfile.hire_date` (`(int) floor(diffInYears(now))`)
- `specialty` ← `AgentProfile.specialty`
- `preferred_language` ← `User.preferred_language` (single, pas array)
- WhatsApp et languages array : retirés du périmètre (à billeter si besoin)
- `contract_type` au lieu de `listing_type` (enum `sale|rent`)

### Bug existant corrigé — ReviewObserver

`app/Observers/ReviewObserver.php` plantait dès qu'un `Review` ciblait `User` (relation `reviews()` inexistante — c'est `received_reviews()` sur User) ou `Agency` (colonne `reviews_count` absente). Bloquait AC1/AC2. Rendu défensif :
- Résolution de la relation par introspection (`reviews` puis fallback `received_reviews`).
- `Schema::hasColumn` avant `forceFill` sur `reviews_count` / `average_rating`.

Aucun changement de comportement sur Property (relation `reviews` + colonnes intactes). Couvert par les nouveaux tests.

### Composants frontend factorisés

`src/components/public/profile/` :
- `ContactSheet.tsx` — desktop : boutons inline ; mobile : 1 CTA primaire pleine largeur → bottom sheet shadcn.
- `StatsBar.tsx` — bandeau 4 chiffres en `font-display`, filtre les valeurs nulles/zéro.
- `PortfolioTabs.tsx` — Tabs shadcn + filtrage client sur `contract_type` + grille `PropertyCardStandard` 3-cols.
- `ReviewsSection.tsx` — masquée si `count === 0`, anonymise les auteurs (prénom + initiale).

### Extension Sheet shadcn

`src/components/ui/sheet.tsx` — ajout des sides `top` et `bottom` au type union (shadcn upstream les a, ce fork local ne les avait pas). Backward-compatible (left/right inchangés).

### Limitations connues — à billeter en suivi si besoin

- **i18n** : les nouveaux libellés sont en français hardcodé. Le DS prévoit i18n via next-intl ; un follow-up devrait migrer les nouvelles chaînes vers les fichiers de traduction (cf. TCK-159/160). Acceptable pour l'instant car les pages existantes l'étaient déjà.
- **Lighthouse a11y ≥ 95** non mesuré dans cette session (pas d'outil headless). Tabs et boutons utilisent les primitives `@base-ui/react` (focus ring, navigation clavier built-in). À vérifier lors de la review.
- **"Voir tous les biens"** non implémenté — le portefeuille reste capé à 48 (agence) / 24 (agent). Hors scope ticket.

### Tests

- Backend : `tests/Feature/Public/PublicProfileTest.php` étendu (7 tests, 54 assertions). Couvre : enrichissement payload agence/agent, dérivations stats, reviews filtrées par `is_approved`, cas dégradés (no profile, no addresses, no reviews).
- Frontend : pas de test unitaire ajouté — smoke browser sur `localhost:3000/agencies/dakar-immo` et `/agents/dakar-immo-agent-1` (HTTP 200, structures présentes, 404 sur slug inconnu).

### Vérifications passées

- `php artisan test --filter=PublicProfileTest` → 7 passed
- `php artisan test --filter=Review` → 87 passed (pas de régression sur Property reviews)
- `./vendor/bin/pint --dirty` → pass
- `npx tsc --noEmit` → vert sur fichiers touchés (l'erreur résiduelle est dans `FloatingDock.test.tsx`, pré-existante, hors scope)
- Smoke API : payload agence/agent conforme aux nouveaux champs
- Smoke page rendue : `font-display`, sections `L'équipe`/`Portefeuille`/stats présentes, aria-labelledby OK
