---
id: TCK-2519
title: Fiche de personne : URL au nom (`/agents/sokhna-gueye`), l'ancienne adresse redirigée
status: todo
phase: P1
family: full
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: [TCK-2523]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#1-user"
tags: [back, front, directory, seo, audit-ux]
---

## Objectif utilisateur

L'adresse d'une fiche dit qui l'on va voir (`/agents/sokhna-gueye`), pas le rôle ni l'agence (`/agents/dakar-immo-owner-4`) ; un lien déjà partagé continue de marcher.

## Contrat de données

- `users.public_slug` string(120) unique nullable (cf. `spec_refs.models`) : dérivé du nom affiché, translittéré, suffixé en cas de collision ; posé à la première fiche publique, recalculé au changement de nom ; les précédents dans `metadata.previous_public_slugs`.
- `GET /api/public/agents/{slug}` résout `public_slug`, puis un ancien `public_slug`, puis `username` ; pour les deux derniers, la réponse porte `canonical_slug` et le front redirige en **301**.
- Tout ce qui émet `owner.slug` / `agent.slug` (`PropertyResource::buildOwner()`, annuaire, équipe d'une agence, sitemap, données structurées `Person`) émet `public_slug` quand il existe.
- Commande de remplissage pour les fiches existantes (idempotente).

## Direction UX / Artistique

Sans objet. Maquette : `p=agent&a=d` (barre d'adresse des écrans bureau).

## Contraintes strictes (métier)

- Un slug ne révèle rien qu'une fiche ne montre déjà : le propriétaire sur option (1b) a un nom **abrégé** sur sa fiche, son slug l'est aussi (`awa-d`).
- Unicité sous la collation déterministe de la base (pas de doublon par la casse : slug en minuscules ASCII).
- Une ancienne adresse ne redirige jamais vers une fiche qui n'est plus publique : 404.

## Delta à produire

- [x] Migration + calcul du slug (service unique) + remplissage.
- [x] Résolution à trois niveaux et `canonical_slug`.
- [x] Émetteurs de slug alignés ; sitemap.
- [x] Front : redirection 301 sur `canonical_slug` (page `agents/[slug]`).
- [x] Tests (collision, abréviation du propriétaire, redirection, ancien slug d'une fiche devenue privée → 404).

## Critères d'acceptation

- [x] AC1 — `/fr/agents/dakar-immo-owner-4` répond 301 vers `/fr/agents/<slug au nom>`. *(Preuve : **308 (permanentRedirect)** — `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://localhost:3000/fr/agents/dakar-immo-owner-4` → `308 …/fr/agents/sokhna-g`. Écart au texte accepté par la session le 2026-11-09 : voir la note « 301 contre 308 ».)*
- [x] AC2 — Deux « Awa Diop » obtiennent `awa-diop` et `awa-diop-2`.
- [x] AC3 — Après changement de nom, l'ancien slug redirige vers le nouveau.
- [x] AC4 — Aucun émetteur ne sert encore `username` quand `public_slug` existe (balayage des ressources).

## Hors périmètre

- Le slug des agences (déjà au nom).

## Notes d'implémentation

- **Service unique** : `App\Services\Public\PublicSlugService` (base, `appliquer` sans enregistrer, `assigner`, `comptesAvecFiche`). Accesseur `User::slugDeFiche()` = `public_slug ?? username`, que tous les émetteurs appellent (`PublicAgentController` index/fiche, équipe de `PublicAgencyController`, `PropertyResource::buildUserLite()` → `owner`/`primary_contact`, `ReviewResource` cible personne). Le JSON-LD `Person` et le sitemap lisent `slug` côté front : alignés par construction.
- **Un candidat est libre** s'il n'est, pour AUCUN autre compte (supprimés compris), ni `public_slug`, ni ancien slug, ni `username` : la résolution essaie ces trois niveaux dans cet ordre, et un slug neuf égal à l'un d'eux détournerait les liens d'un autre. Suffixes bornés à 500, puis `-<id>` (une boucle non bornée a été mesurée infinie sous ablation).
- **Rôle** : `rolesPublics()`. Agent → `prenom-nom` ; tout le reste → `prenom-<initiale>` (`awa-d`), dès aujourd'hui — la fiche n'abrège pas encore le nom (TCK-2523), le slug n'en dit pas plus qu'elle ne dira.
- **Quand le slug est posé** : la commande `users:public-slugs` (idempotente, planifiée toutes les heures à :25) remplit l'existant, pose celui d'une fiche devenue publique et recalcule après un changement de RÔLE ; le crochet `User::updating` recalcule au changement de NOM (seulement si `public_slug` existe). Aucun crochet sur la publication d'un bien : jusqu'au passage suivant, la fiche se résout par `username` puis redirige en 301 — conforme à la spec (« `null` tant que le compte n'a pas de fiche »).
- **Résolution** (`ficheOu404`, partagée par fiche, portefeuille et contact) : `public_slug` (comparé en minuscules), puis `metadata->previous_public_slugs` (jsonb `@>`), puis `username` exact. La règle de fiche publique de TCK-2506 est jugée APRÈS : une ancienne adresse d'une fiche devenue privée rend 404. `canonical_slug` n'est servi que si l'adresse demandée diffère de la canonique (sinon un front qui redirige toujours bouclerait).
- **301 contre 308 (prémisse contredite)** : depuis une page App Router, Next ne sait rendre qu'un 308 permanent (`permanentRedirect`, doc `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/permanentRedirect.md`) ; un 301 exigerait un appel à l'API dans `src/proxy.ts` pour CHAQUE fiche servie. Mesuré : `curl /fr/agents/dakar-immo-owner-4` → `308 /fr/agents/sokhna-g`. Les moteurs traitent 301 et 308 de la même façon. **Décision de la session (2026-11-09) : le 308 est accepté** — permanent comme le 301, traité pareil par les moteurs, et c'est ce que l'App Router sait rendre. Pas de ticket de proxy. Le « 301 » du contrat et de la case Front ci-dessus se lit « redirection permanente ».
- **Remplissage de la base de dev** : la commande a été jouée par le scheduler de `./dev.sh` (planifiée à :25) avant mon passage manuel — `users:public-slugs` → « 71 fiche(s) vue(s), 0 slug(s) écrit(s) » deux fois de suite : idempotente sur des données réelles. `dakar-immo-owner-4` (Sokhna Gueye, propriétaire) → `sokhna-g`.
- **Revue adverse (2026-11-09), corrigée** :
  - **(bloquant) L'effacement de compte gardait le slug tiré du nom.** `AccountDeletionService::anonymize` vidait le nom, le `username` et `metadata`, mais pas `public_slug` : `sokhna-gueye` survivait à l'effacement, et `pris()` (qui lit aussi les comptes supprimés) le réservait pour toujours. `public_slug` passe à `null`. Test `PublicSlugTest::test_un_compte_efface_perd_son_slug_et_libere_le_nom` : slug et anciens slugs effacés, et une nouvelle Sokhna Gueye reprend `sokhna-gueye`. Ablation : rouge.
  - **(majeur) La réservation des anciens slugs n'était gardée par aucun test.** Test `test_apres_un_renommage_un_homonyme_ne_prend_pas_l_ancien_slug` : rouge si `previous_public_slugs` est retiré de `pris()`.
  - **Ordre de résolution** : `test_un_username_pose_apres_le_slug_d_un_autre_ne_detourne_pas_la_fiche`, rouge si le niveau `username` passe avant `public_slug` (`AgentPublic::parSlug`).
  - **Casse** : `pris()` compare le `username` sans tenir compte de la casse (`CaseInsensitive`), parce que la fiche se résout par le slug replié : sans cela, le `username` `Awa-D` d'un compte ne réservait pas `awa-d`, et `/agents/Awa-D` menait à l'autre. Test `test_un_username_en_casse_mixte_reserve_son_slug_replie` : rouge avec la comparaison exacte. La comparaison n'emprunte pas l'index de `username` ; elle ne tourne qu'au calcul d'un slug (commande horaire, renommage), jamais sur une requête publique.
  - **AC4, un émetteur manqué** : `ReviewEligibility::opportunities` servait `username` pour un agent. Il passe par `slugDeFiche()`. Test `test_l_invitation_a_noter_un_agent_sert_son_slug_au_nom` : rouge avec `username`.
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.2 (fiche de personne : slug au nom, 308) ; `docs/models-spec.md` § 1 (`public_slug`, `username`).
