---
id: TCK-2514
title: Pages par lien « La carte au centre » : document, confirmation et désinscription dans la coque de lien
status: done
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-08
updated: 2026-11-09
depends_on: [TCK-2513, TCK-2505]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, liens, mobile, audit-ux]
---

## Objectif utilisateur

Ouvrir un lien reçu par SMS ou courriel et faire l'unique chose qu'il promet — télécharger, confirmer, se désinscrire — en sachant de quoi il s'agit, sans la marketplace autour.

## Contrat de données

- Document partagé : `share/{token}` et son téléchargement, inchangés.
- Alertes : `GET /api/public/search-alerts/by-token`, `POST …/frequency` (TCK-2513), `confirm` et `unsubscribe` existants ; désinscription d'une alerte de compte (`saved-searches/{id}/unsubscribe`, URL signée) et du résumé : inchangées.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=liens&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- Chaque page est **une carte** : pictogramme, titre qui dit ce qui va se passer, une phrase, une action sous le pouce. Coque de lien nue de TCK-2505.
- Confirmation et désinscription d'alerte montrent les critères (pastilles) et « N biens déjà en ligne ».
- La désinscription propose d'abord « Plutôt une fois par semaine », puis « Me désinscrire » — les deux visibles, aucun des deux caché.
- Chaque cul-de-sac (lien expiré, invalide, déjà utilisé) a deux issues : « Rechercher des biens » et « Besoin d'aide ? ».
- Vouvoiement.

## Contraintes strictes (métier)

- L'action ne part qu'au clic, jamais au chargement.
- Tout ce que les pages font reste : mot de passe d'un document sans le mettre dans l'URL ; nom, taille, date limite et téléchargements restants ; erreurs de mot de passe et de téléchargement ; désinscription « sans compte » (tout s'arrête, contact effacé) et « avec compte » (seule cette alerte) ; désabonnement du résumé ; `noindex` et `no-referrer`.
- Les erreurs passent par `ErrorState` (plus de `<p role="alert">` fait main).
- **Le titre de la désinscription sans compte dit ce qu'elle fait** : elle arrête toutes les alertes de ce contact, et ne s'intitule plus « Ne plus recevoir cette alerte ».
- L'état commun « lien mort » sert aussi la réclamation (TCK-2512).

## Delta à produire

- [ ] Gabarit « carte de lien » commun, posé dans la coque de TCK-2505.
- [ ] Document partagé, confirmation d'alerte, désinscriptions (sans compte, avec compte, résumé) migrés dessus.
- [ ] Critères et compte affichés ; choix hebdomadaire.
- [ ] État commun des liens morts, avec ses deux issues.
- [ ] Clés i18n `fr`/`en`/`wo`.
- [ ] Tests (rien ne part au chargement, choix hebdomadaire, titres corrigés, état mort).

## Critères d'acceptation

- [ ] AC1 — Charger la page de désinscription n'émet aucun `POST` (vérifié sur les requêtes du test).
- [ ] AC2 — « Plutôt une fois par semaine » appelle `frequency` et laisse l'abonné inscrit ; « Me désinscrire » appelle `unsubscribe`.
- [ ] AC3 — Un jeton inconnu affiche l'état « lien mort » avec ses deux issues, sans critères.
- [ ] AC4 — Aucune de ces pages ne porte la recherche, les favoris, le comparateur ni la barre d'onglets.

## Hors périmètre

- L'émetteur nommé d'un document partagé (approche B, non retenue).
- La coque de lien elle-même (TCK-2505).

## Notes d'implémentation

### Relevé du 2026-11-09 (agent « liens », vague 2)

- **Prémisses re-mesurées.** `GET /api/public/search-alerts/by-token?token=` rend
  `{ kind, name, criteria, frequency, matches }` (`matches` peut être `null`), 404 identique pour tout jeton qui ne
  sert pas ; `POST …/frequency` n'accepte que `weekly` et rend toujours la même réponse. La barre d'onglets était
  déjà effacée sur `/share`, `/search-alerts`, `/notifications` (`porteLaBarrePublique`) ; le dock du comparateur
  en bureau ne l'était pas — corrigé par TCK-2505 (`estPageDeLien`). Les quatre pages portaient `Navbar` + `Footer`.
- **Prémisse contredite — throttle partagé.** `by-token` est dans le même groupe `throttle:public-search-alert`
  (10 requêtes / 10 min par visiteur) que `confirm`, `unsubscribe` et `frequency`. Mesuré : 429 après une dizaine
  d'ouvertures. La page le tient (une lecture en échec autre que 404 laisse l'action, sans critères ni compte),
  mais un visiteur qui recharge souvent la page pouvait voir son clic refusé ensuite. **Tranché par la session
  (2026-11-09)** : `GET by-token` prend son propre seau, `throttle:30,1,public_search_alert_read`, sur le modèle de
  `radar.claims.show` ; les actions gardent `public-search-alert`. Preuve :
  `AlerteLueParSonJetonTest::test_la_lecture_a_son_propre_seau_et_n_entame_pas_celui_des_actions` (deux actions,
  onze lectures, une action passe, 31ᵉ lecture en 429, l'action suivante passe encore) ; ablation « seau remis en
  commun » → 429 dès la 9ᵉ lecture, restauré par `cp`, `md5` identique.
- **Ce qui est fait.** Gabarit commun `CarteDeLien` + `LienMort` (deux issues : « Rechercher des biens »,
  « Besoin d'aide ? » = `mailto:` du contact éditeur, faute de page d'aide) dans la `CoqueDeLien` de TCK-2505 ;
  document partagé, confirmation d'alerte, désinscriptions (sans compte, avec compte) et désabonnement du résumé
  migrés. La carte porte le seul `<h1>` (la page n'en pose plus).
- **Alertes.** Critères en pastilles par `puceDeChaqueFiltreActif` (la fabrique des puces de la recherche ; une
  clé sans libellé sûr n'a pas de pastille), compte « N biens déjà en ligne » seulement si `matches` est un nombre
  (`0` → « Aucun bien en ligne pour l'instant », `null` → rien). Après confirmation : « Voir les N biens déjà en
  ligne » vers `/properties?<critères>`. Un jeton de désinscription ouvert sur la page de confirmation (ou
  l'inverse) est dit mort : le `POST` répondrait sans agir.
- **Désinscription sans compte** : titre « Ne plus recevoir d'alertes », texte « cette alerte, et toutes celles
  envoyées au même contact, s'arrêtent ; votre contact est effacé ». « Plutôt une fois par semaine » (contour)
  PUIS « Me désinscrire » (encre), les deux visibles ; la semaine n'est pas proposée si l'alerte l'est déjà. La
  désinscription d'un compte garde « Ne plus recevoir cette alerte » (elle n'arrête que celle-là) et ne propose pas
  la semaine (`frequency` n'accepte que le jeton de l'abonné sans compte).
- **Document.** Format lu au nom du fichier (« .pdf » → « PDF » : `document.type` est la catégorie, pas le format),
  taille seulement si l'API la rend ; « Ce lien est personnel… » seulement quand les téléchargements sont comptés.
  Mot de passe faux et téléchargement en panne passent par `ErrorState` (le champ pointe l'erreur par
  `aria-describedby`).
- **Écart à la maquette.** En bureau, l'en-tête de carte sans émetteur ne répète plus le logo du bandeau de marque
  (seule la mention reste) — `EnTeteDeLien`.
- **Frontières i18n.** `search-alerts/layout.tsx` et `notifications/layout.tsx` ajoutés (règle E) ; table
  régénérée.
- Preuves : `SearchAlertLinkAction.test.tsx` (21), `ShareReception.test.tsx` (13), `DigestUnsubscribeAction.test.tsx`,
  `search-alerts/__tests__/coque.test.tsx` ; 8 ablations rouges puis restaurées par `cp`, `md5` identique.
  Navigateur 390 × 844 et 1440 × 900 : désinscription (deux GET de lecture en dev — double effet du mode strict —,
  aucun POST au chargement, un seul `POST frequency` au clic, l'abonné relu en `weekly`), confirmation, document,
  lien mort du résumé ; aucune `nav`, `scrollWidth` = largeur.
