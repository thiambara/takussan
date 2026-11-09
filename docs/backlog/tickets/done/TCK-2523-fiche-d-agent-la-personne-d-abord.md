---
id: TCK-2523
title: Fiche d'agent « La personne d'abord, ses biens cherchables »
status: done
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2517, TCK-2518, TCK-2519, TCK-2522]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, directory, mobile, audit-ux]
---

## Objectif utilisateur

Mettre un visage sur l'annonce : savoir avant d'écrire si l'agent parle sa langue, connaît son quartier, répond vite — et chercher dans ses biens quand il en a beaucoup.

## Contrat de données

`GET /api/public/agents/{slug}` (langues, quartiers, délai — TCK-2518 ; `canonical_slug` — TCK-2519) ; biens : liste publique avec `filter[agent]` et `facets` (TCK-2517).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=agent&a=d` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans Agent, Biens filtrés, Aucun bien, Propriétaire.
- Premier écran : photo ou initiales, nom, agence cliquable, langues, quartiers, délai de réponse ; WhatsApp, Appeler, Message (le formulaire anonyme reste la voie Message).
- Recherche dans ses biens **au-delà de six biens seulement** ; mêmes composants que la fiche d'agence (TCK-2522).
- État « Aucun bien » : renvoie vers les biens de son agence (« Chez Dakar Immo, son agence »).
- Propriétaire sur option (1b) : nom abrégé, aucun numéro personnel, contact renvoyé à l'agence qui gère ses biens.

## Contraintes strictes (métier)

- Rien de l'existant ne se perd : initiales en repli, badge vérifié, rattachement à l'agence, bio, compte de biens, portefeuille Tous / À louer / À vendre avec « Voir plus », avis, état vide propre au propriétaire, vrai 404, état « indisponible ».
- Redirection 301 sur `canonical_slug` (TCK-2519).
- Filtres dans l'URL ; rendu serveur.

## Delta à produire

- [x] Premier écran « personne » (langues, quartiers, délai).
- [x] Recherche au-delà de six biens, état vide vers l'agence.
- [x] Variante propriétaire sur option.
- [x] Clés i18n `fr`/`en`/`wo`.
- [x] Tests (seuil de six, renvoi vers l'agence, propriétaire sans numéro, redirection).

## Critères d'acceptation

- [x] AC1 — Un agent à six biens n'a pas de recherche ; à sept, il l'a.
- [x] AC2 — Une recherche sans résultat propose les biens de son agence avec leur compte.
- [ ] AC3 — La fiche d'un propriétaire sur option ne contient aucun numéro (balayage du HTML) et son bouton de contact vise l'agence.
  _Transféré par la session le 2026-11-09 : l'API sert `agency: null` pour un propriétaire → [TCK-2574](../todo/TCK-2574-fiche-d-un-proprietaire-agence-qui-gere-et-nom-abrege-servis.md). Livré ici : aucun numéro (balayage du HTML, prouvé) ; le contact du propriétaire reste son formulaire._
- [x] AC4 — Langues et délai absents : aucune ligne vide ni « — ».

## Hors périmètre

- La saisie des langues et quartiers (TCK-2524).

## Notes d'implémentation

Relevés du 2026-11-09 (agent « fiches », vague 3), pile `./dev.sh`, base de dev :

- **« Redirection 301 » se lit 308** : `permanentRedirect()` de Next, seul moyen de rediriger
  définitivement depuis une page (TCK-2519, commentaire de `page.tsx`). Test existant gardé.
- **Base de dev** : tous les agents de Dakar Immo, Saint-Louis et Thiès ont 0 bien public (seeders de
  TCK-2532 non rejoués) ; seuls des propriétaires en ont (`sokhna-g`, `ibrahima-m` : 8). La recherche
  au navigateur s'est donc vue sur un propriétaire ; le renvoi « chez son agence » n'est prouvé que
  par les tests (`RechercheDuPortefeuille.test.tsx`).
- **AC3 décoché et transféré à TCK-2574 par la session (revue du 2026-11-09).** Comportement livré :
  la fiche d'un propriétaire ne publie aucun numéro et garde **son formulaire anonyme** comme seul
  canal (« Contacter Sokhna G. · Message ») ; le renvoi à l'agence existe dans le front, mais l'API
  ne lui donne jamais d'agence pour un propriétaire. Il s'allumera avec TCK-2574.
- **Propriétaire — l'API ne sert pas l'agence qui gère ses biens** (`agency: null` pour `sokhna-g`,
  `PublicAgentController` sert le rattachement de la personne) et sert son nom complet
  (`full_name` « Sokhna Gueye », `last_name`). Le front abrège partout (titre, `<h1>`, contact,
  données structurées : « Sokhna G. ») et retombe sur le formulaire anonyme du propriétaire quand
  l'agence est inconnue : → TCK-2574.
- **Pas de WhatsApp** : `users.phone_whatsapp` existe (TCK-633), mais `GET /api/public/agents/{slug}`
  ne le sert pas ; aucun bouton → [TCK-2576](../todo/TCK-2576-whatsapp-au-premier-rang-des-fiches-d-agence-et-d-agent.md).
- **Contexte des avis (« Visiteur · visite », « Locataire · bail »)** — livré avec TCK-2522
  (`ReviewResource::context_kind`, `ReviewsSection`) et tenu ici par le chemin de production
  (2026-11-09) : `storeForAgent` écrit la preuve au dépôt. `tests/Feature/Public/ReviewContextKindParLaRouteTest.php`
  dépose l'avis par `POST /api/agents/{user}/reviews`, l'approuve par la route et lit
  `GET /api/public/agents/{slug}` : `visit` après une visite terminée, `lease` après un bail ; retirer
  l'écriture de `context_*` dans `storeForAgent` fait rougir les deux. L'avis d'agence ne l'écrit pas
  encore → [TCK-2577](../todo/TCK-2577-un-avis-d-agence-ecrit-son-contexte.md).
- Numéro : seulement pour un agent, et seulement vérifié (`phone_verified`) ; jamais pour un
  propriétaire, même vérifié (balayage du HTML dans le test).
- Langues : `Intl.DisplayNames` dans la langue de la page (« Français », « Wolof »), capitalisées.
- **Haut au téléphone** : `agents` remis dans `PREMIERS_SEGMENTS_A_EN_TETE_DE_PAGE` (avec `agencies`,
  cf. TCK-2522) ; la page pose aussi `auTelephone="en-tete-de-page"` (Navbar et cale), « marque » pour
  la panne et le 404.
  `EnTeteDeFiche` variante `barre` : rangée collante 56 px « ← · [partager] », vide de titre ; le
  rappel « Biens de Sokhna G. » paraît quand l'identité est passée sous la rangée (marge de
  l'observateur : −56 px). Relevé 390 × 844 : rangée à 0, haute de 56, `scrollWidth` 390.
- **Persona « l'agent sur sa propre fiche »** (`agent2@dakarimmo.sn`, `/fr/agents/moustapha-fall`,
  390 et 1440) : état vide « Cet agent prépare ses prochaines annonces — revenez bientôt. », aucun
  `tel:` (numéro non vérifié), et la carte « Contacter Moustapha Fall · Message » s'offre à lui-même,
  comme avant ce ticket : → TCK-2575.
- **Recherche collante (revue du 2026-11-09)** : au téléphone, champ + pastilles + puces collent
  sous la rangée « ← Biens de Sokhna G. · partager » (`top-14`), comme `TeteFiltreeAgent`. Relevé
  390 × 844, sokhna-g défilé de 700 : rangée 0 → 56, recherche 56 → 172. Langues et quartiers : le
  test refuse désormais tout conteneur vide (ablation `{true ? (` → rouge).
- Ablations (copie → mutation → rouge → restauration, md5 identique) : seuil à 5 au lieu de 6 ; numéro
  d'un propriétaire vérifié rendu ; nom complet d'un propriétaire ; nom complet dans le JSON-LD ;
  renvoi « chez son agence » pour un propriétaire ; contact du propriétaire non renvoyé à l'agence ;
  délai inventé ; marge de la rangée à 0 ; rappel ignoré au profit du nom. Chacune a rougi.
