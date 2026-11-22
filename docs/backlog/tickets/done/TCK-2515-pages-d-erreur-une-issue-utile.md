---
id: TCK-2515
title: Pages d'erreur « Une issue utile » : 404 avec recherche, bien retiré avec alerte, erreur publique avec navigation
status: done
phase: P1
family: front
estimate: S
wave: 85
created: 2026-11-08
updated: 2026-11-09
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, erreurs, mobile, audit-ux]
---

## Objectif utilisateur

Le visiteur venu d'un lien WhatsApp vers un bien déjà loué repart avec des biens du même quartier ou une alerte, au lieu de quitter le site ; une erreur passagère ne l'enferme pas.

## Contrat de données

**Aucun endpoint neuf.** La page « plus disponible » existe (TCK-598, `bien-retire.tsx`) et `GET /api/public/properties/{slug}/status` rend déjà `state`, `contract_type`, `type`, ville, quartier et `similar` — *la note de la maquette qui demandait une route API est fausse, relevé le 2026-11-08*. « M'alerter » crée l'alerte sans compte existante (`public/search-alerts`, TCK-599) préremplie de ces critères, ou une recherche sauvegardée pour un connecté.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=erreurs&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- 404 de la racine : titre qui dit tout (plus de sur-titre « ERREUR 404 »), une recherche (simple formulaire GET, sans autocomplétion) et des raccourcis Louer, Acheter, Agences.
- Bien retiré : la raison, trois biens proches, « M'alerter » sur ce quartier, « Voir tout le quartier ».
- Erreur d'une page publique : « Réessayer » et « Retour à l'accueil », la référence technique (digest) en petit — que l'équipe retrouve dans ses journaux si on la lui donne. **Pas de « Signaler le problème »** (décision du porteur, 2026-11-08).
- Vouvoiement sur l'erreur serveur.

## Contraintes strictes (métier)

- Les statuts ne bougent pas : 404 reste 404, la page retirée reste 200 + `noindex` (TCK-598) ; aucune frontière qui rendrait 200 à un introuvable.
- Le 404 de la racine garde sa chrome légère (logo seul) : charger la navigation y doublerait le dictionnaire de tout le produit (TCK-438).
- **Un `error.tsx` sous `[locale]/(public)`** pour que la navigation reste autour d'une erreur de page (aujourd'hui seule la racine en a une).
- Corriger les liens croisés du « Bien introuvable » (« Voir les annonces » mène à `/`, « Lancer une recherche » à `/properties` : à inverser) — un défaut, pas un choix.

## Delta à produire

- [x] 404 racine : recherche GET + raccourcis, sans sur-titre.
- [x] Bien retiré : « M'alerter » préremplie, mise en page de la maquette.
- [x] `error.tsx` public avec Réessayer, Retour à l'accueil, référence.
- [x] Liens croisés corrigés.
- [x] Clés i18n `fr`/`en`/`wo`.
- [x] Tests (statuts conservés, liens corrigés, alerte préremplie avec le quartier, type et contrat du bien).

## Critères d'acceptation

- [x] AC1 — `/fr/nexiste-pas` répond 404 et propose une recherche qui mène à `/fr/properties?…`.
- [x] AC2 — Sur un bien loué à Mermoz, « M'alerter » ouvre l'alerte préremplie Mermoz + son type + son contrat.
- [x] AC3 — Une erreur levée dans une page publique laisse la barre de navigation rendue, avec « Réessayer » et « Retour à l'accueil ».
- [x] AC4 — « Voir les annonces » mène à la liste et « Lancer une recherche » à la recherche.

## Hors périmètre

- Un formulaire de signalement d'erreur.
- La règle de voix (tutoiement du 404 de découverte), non tranchée dans la charte.

## Notes d'implémentation

**Relevé avant code (2026-11-09, `next dev` de la pile, API 127.0.0.1:8002).**

- Statuts de référence : `/fr/nexiste-pas` **404** ; `/fr/properties/zzz-inconnu-000` **404** ;
  `/fr/agencies/zzz-inconnu` **404** ; bien loué `/fr/properties/studio-economique-a-liberte-6-KDHz37`
  **200** (+ `noindex`, TCK-598).
- `GET /api/public/properties/{slug}/status` rend bien `state`, `contract_type`, `type`,
  `location.{city,quarter}` et `similar` — **six** biens, pas trois, et pas tous du quartier
  (Mermoz, Liberté 6 ×2, Fann, Sicap Baobab, Yoff pour un studio de Liberté 6). La page en garde
  trois et écrit « biens semblables », pas « du quartier ».
- « M'alerter » : `SaveSearchDialog` (TCK-599/TCK-2475) fait déjà les deux voies — anonyme →
  `PublicSearchAlertForm` (`POST /api/public/search-alerts`), connecté → recherche sauvegardée
  avec la case d'alerte cochée (`alerteCochee`). Réutilisé tel quel, sans édition.

**Après code (2026-11-09).**

- Statuts re-mesurés, même serveur : `/fr/nexiste-pas` **404**, `/en/nexiste-pas` **404**,
  `/fr/properties/zzz-inconnu-000` **404**, `/fr/agencies/zzz-inconnu` **404**,
  `/fr/agents/zzz-inconnu` **404**, bien loué **200** + `noindex, follow`. Le nouvel
  `[locale]/(public)/error.tsx` n'ouvre aucune frontière de suspension et n'attrape pas
  `notFound()`.
- 404 racine : `<form role="search" method="get" action="/<langue>/properties">`, champ `q`
  (`SEARCH_FILTER_KEYS.q`) ; l'action lit la langue par `useLocale()` (un formulaire n'est pas un
  `LienLocalise`). Raccourcis sans ville supposée : `?contract_type=rent`, `?contract_type=sale`,
  `/agencies`. Aucun espace de noms ajouté au socle (`errors` et `common` y étaient).
- `error.tsx` public : la `Navbar` et le `Footer` sont montés par CHAQUE page publique, pas par
  `(public)/layout.tsx` — la frontière les remplace donc avec la page et les remonte elle-même ; la
  barre d'onglets du téléphone, elle, vient du layout et reste. Coût dictionnaire nul (`nav`,
  `footer` déjà dans la coque de `(public)`). Ce que lève `(public)/layout.tsx` reste à
  `src/app/error.tsx`.
- « Lancer une recherche » du bien introuvable → `/` : il n'existe pas de route publique de
  recherche ; la barre de recherche de l'accueil en tient lieu.
- Bien retiré : `criteresDAlerte` = contrat (`rent`/`sale` seulement), ville, quartier (seulement
  avec sa ville, comme `rechercheDuQuartier`), `type: [type]`. Le libellé du bouton est résolu par
  le serveur et passé en prop : le composant client ne lit aucun dictionnaire ; le dialogue, chargé
  au clic, apporte ses espaces `search.*`.
- TCK-1188 : la quatrième carte « qui garde son apparition » n'existe plus (trois cartes au plus,
  toutes `priority`) ; `bien-retire.rendu-serveur.test.tsx` adapté en conséquence.
- AC3 relevé sur une page-sonde temporaire qui lève (`(public)/sonde-erreur-tck2515`, supprimée
  après la mesure) : **HTTP 500** (pas un 200 maquillé), `Navigation du site` et l'écran
  « Cette page n’a pas pu s’afficher » dans le HTML servi ; au navigateur, barre d'onglets du
  téléphone conservée, référence `Réf. <digest>` copiable.
- Écart à la maquette : au téléphone, les trois biens proches restent des `PropertyCard` pleines
  (pas les rangées compactes de la maquette — `PropertyCardCompact` est une carte de carrousel de
  210 px, aucune rangée de liste n'existe). **Pour cette raison, les deux suites passent AU-DESSUS
  des biens proches** (revue adverse) : sous trois cartes pleines, elles tombaient deux écrans plus
  bas. Mesuré à 390 × 844 : « Voir les biens à Liberté 6, Dakar » 235-283 px, « M'alerter… »
  293-356 px, « Des biens similaires » à 388 px ; à 1440 × 900, les deux à 240 px.
- Revue adverse (corrigé) : les deux suites sont rendues aussi SANS bien proche (elles sont alors
  la seule issue) ; un quartier sans ville ne promet pas le quartier dans le bouton (les critères
  l'écartent) ; l'alerte reçoit un nom qui porte le quartier — `nomDeLAlerte` (« Location ·
  Appartement · Mermoz, Dakar »), passé au dialogue par la prop optionnelle `nomParDefaut` ajoutée
  à `SaveSearchDialog` (absente ailleurs : rien ne change pour ses autres appelants) ;
  `suggestName` omettait le quartier. Le message d'une erreur n'est jamais rendu, seule la
  référence (`digest`) — désormais gardé par un test.
- Hors périmètre : montrer les critères de l'alerte dans le dialogue (le chemin anonyme n'a pas de
  champ de nom ; le nom ne se voit que dans la liste des recherches sauvegardées).

