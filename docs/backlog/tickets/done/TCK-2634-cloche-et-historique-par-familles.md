---
id: TCK-2634
title: "Cloche et historique : une feuille pleine hauteur au téléphone, « À traiter · Tout », une icône par famille, le verbe de l'action, les répétitions repliées, les jours"
status: done
phase: P1
family: front
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-12
depends_on: [TCK-2633, TCK-2704, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
tags: [front, notifications, mobile, audit-ux, app]
---

## Objectif utilisateur

En touchant la cloche, on voit d'abord ce qui attend un geste (« Visite demandée · Confirmer »), puis l'information, rangée par jour et par famille. Neuf « Mise en avant terminée » tiennent sur une ligne.

## Contrat de données

- `GET /api/notifications` : `filter[unread]`, `filter[a_traiter]`, `filter[famille]`, `meta.counts {a_traiter_non_lues, par_famille}`, et `famille` et `a_traiter` par ligne (TCK-2633).
- **Relevé après TCK-2633** :
  - `filter[famille]` est une liste (`visite,demande`) ; `filter[a_traiter]` et `filter[unread]` valent `1`, `0`, `true` ou `false` — toute autre valeur rend 422 ;
  - une requête qui passe `fields[app_notifications]` doit y nommer `famille` et `a_traiter`, sinon elles ne sont pas rendues ;
  - `meta.counts` ignore les filtres de la requête (il porte sur toutes les non-lues de l'appelant) : les puces se lisent sur n'importe quelle page ;
  - une famille sans non-lue est ABSENTE de `par_famille` (objet `{}` si aucune) : lire `par_famille[f] ?? 0` ;
  - « Mise en avant terminée » porte le code `boost.ended` depuis TCK-2704 (`bien`, pas à traiter) ; les lignes stockées AVANT n'ont pas de code (rangées `bien` par leur cible) : un repli « par code » ne les regroupe pas avec les nouvelles. Ont aussi reçu un code par TCK-2704 : `property.proposed` (`bien`, à traiter), `maintenance.urgent_created` et `maintenance.urgent_escalated` (`demande`, à traiter), `agency.upgrade_requested` (`systeme`, à traiter).
- Gestes existants :
  - `POST notifications/{id}/read` et `/unread` ;
  - `POST notifications/read-all`.
- Rendu du texte : `texteNotification` (code et paramètres, TCK-588), inchangé.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-notifications&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Cloche (téléphone) / panneau (bureau) », « Historique », « Tout lu », « Chargement et erreur ».
- **Téléphone** : la cloche ouvre une **feuille pleine hauteur**, et non plus le popover de 340 px.
  - **En-tête** : « Notifications », « Tout lire » et ✕.
  - **Puces** : « À traiter 3 · Tout ».
  - **Groupes par jour** : « Aujourd'hui », « Hier », « Cette semaine », « Plus ancien ».
  - **Ligne** : icône de la famille dans un disque à son ton, titre sur deux lignes au plus, détail, date relative (« il y a 2 h »), chevron. Une ligne « à traiter » porte le **verbe** de son action en bouton (« Confirmer », « Valider ») ; toucher la ligne ouvre l'objet.
  - **Pied** : « Tout l'historique ».
- **Bureau (≥ 1280)** : un panneau de 400 px à droite de la colonne (pas sous la cloche, où il recouvrait « Aujourd'hui »), avec le même contenu. L'historique a des puces de familles avec leurs comptes (« Demandes 3 · Visites 5 · … »).
- **Répétitions repliées** : sur les lignes chargées, les notifications consécutives de même code se replient en une ligne (« Mise en avant terminée · 9 biens › »). Elle se déplie au toucher, et chaque ligne dépliée garde ses gestes.
- **« Marquer lu »** quitte la ligne visible pour un geste secondaire : balayage au téléphone, menu « ⋯ » au survol au bureau. Une ligne ouverte est marquée lue.
- **« Tout lu »** : un état positif, sans grand vide. **« Chargement et erreur »** : squelette de la feuille, bandeau « Impossible de charger les notifications · Réessayer ».
- **Mobile (360–390)** et **bureau** comme ci-dessus ; entre `md` et `lg`, le panneau du bureau.

## Contraintes strictes (métier)

**Pas de régression.** Ce qui existe et doit rester :

- **Pastille** plafonnée à « 9+ », rafraîchie toutes les 30 s (sans sondage plus serré).
- **Cloche** : « N non lues » et « Tout lire ».
- **Historique** :
  - filtre « Toutes · Non lues (n) » ;
  - « Tout marquer comme lu » ;
  - « Marquer lu » et « Marquer non lu » par ligne ;
  - pagination de 20 (« Page 1 sur n ») ;
  - chargement, erreur avec « Réessayer » ;
  - vides « toutes » et « non lues ».
- **Chaque notification ouvre son objet**, en changeant d'espace si l'objet relève d'une autre agence (`LienDansLAgence`).
- **Préférences** atteignables depuis l'historique.

**Autres règles :**

- **Le verbe d'une ligne** est un libellé du front par code, jamais un texte de l'API (principe 5). Une ligne sans code n'a pas de verbe, et s'ouvre seulement.
- **Le repli** ne change ni le compte de non-lus ni la pagination de l'API. « Tout lire » d'un groupe replié marque chacune de ses lignes.
- **La feuille au téléphone** rend le focus à la cloche à la fermeture, se ferme par « Échap » et par le geste retour, et bloque le défilement de la page derrière elle (piège connu du verrou de défilement sur mobile, TCK-551).
- **Familles et « à traiter »** : le front n'en garde aucune liste. Il lit `famille` et `a_traiter` de l'API, et ne porte que l'icône et le ton de chaque famille.
- Libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel) ; vouvoiement.

## Delta à produire

- [ ] Feuille pleine hauteur au téléphone, panneau de 400 px au bureau.
- [ ] Puces « À traiter · Tout », groupes par jour, dates relatives.
- [ ] Ligne : icône et ton de la famille, verbe de l'action par code, chevron, gestes secondaires.
- [ ] Repli des répétitions sur les lignes chargées.
- [ ] Historique : puces de familles avec comptes (bureau), le reste gardé.
- [ ] États « Tout lu », chargement, erreur.
- [ ] Tests :
  - puce « À traiter » qui envoie `filter[a_traiter]=1` ;
  - icône lue depuis `famille` ;
  - 9 lignes consécutives de même code repliées en une ;
  - « Tout lire » d'un groupe marque les 9 ;
  - feuille qui rend le focus à la cloche ;
  - `LienDansLAgence` gardé sur une notification d'une autre agence.

## Critères d'acceptation

- [ ] AC1 — À 390 × 844, toucher la cloche ouvre une feuille (pas un popover) de 92 dvh, la hauteur de la maquette : 0,92 × `innerHeight` relevé, à un pixel près. La page derrière ne défile pas sous le doigt (glissé tactile réel : 0 px feuille ouverte). _Réécrit le 2026-11-12 après vérification : la version d'origine demandait la hauteur entière du viewport, que la maquette ne fait pas._
- [ ] AC2 — Admin à 16 « Mise en avant terminée » non lues et 1 « Visite demandée » : la puce « À traiter » dit 1 et, active, ne montre que la visite, avec le bouton « Confirmer ». La puce « Tout » montre la visite et **une** ligne « Mise en avant terminée · 16 biens ».
- [ ] AC3 — Déplier la ligne repliée montre 16 lignes, chacune ouvrant son bien.
- [ ] AC4 — À 1280, le panneau ouvert ne recouvre pas le bloc « Aujourd'hui » de la colonne, jugé sur la géométrie : la boîte du panneau (`getBoundingClientRect`) et celle du bloc ne se chevauchent pas. Le voile transparent du popover reste (exigé par TCK-572, `NotificationBell.fermeture` : un clic hors du panneau le ferme sans agir dessous) ; `elementFromPoint` au centre du bloc y rend donc le voile, par construction. _Réécrit le 2026-11-12 après vérification : la version d'origine, jugée par `elementFromPoint`, échouait sur ce voile voulu._
- [ ] AC5 — Une notification d'une autre agence ouvre son objet après bascule d'espace, comme avant le ticket (même requête de bascule vue au réseau).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2634.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Le résumé quotidien par WhatsApp ; l'entrée des « à traiter » dans « Aujourd'hui » (ambition de l'audit).
- Les préférences de notification (TCK-2636).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

**Décisions de lecture (2026-11-12, tranchées par la session déléguante) :**

- **AC1 se lit « feuille, pas popover »** : la feuille fait 92 dvh (la maquette), pas 100 % de `innerHeight`. Relevé à 390 × 844 : 776,5 px = 0,92 × `innerHeight`. Le défilement est bloqué : un vrai glissé tactile (CDP `synthesizeScrollGesture`) sur `/app/properties` défile la page de 301 px cloche fermée, de 0 px cloche ouverte.
- **AC4 se juge sur la géométrie** : le voile du panneau est gardé. À 1280, le panneau (x 280, y 11, 400 × 640) ne chevauche pas le bloc de la colonne, mais `elementFromPoint` y rend `popover-voile` : le voile couvre tout l'écran par construction.
- **« À traiter » = à traiter ET non lue** : `filter[a_traiter]=1&filter[unread]=1`. Le compte vient de `meta` de l'API. Une ligne à traiter non lue ne se replie jamais.
- **AC2 et AC3 sont prouvés par les tests, sans insertion en base.** La base de démo n'a pas la scène de l'administratrice. L'écart est noté « donnée » dans la fiche de fidélité.
- **Le repli commence à 3 lignes.** Un texte neuf prend une clé neuve, avec wo = fr.
- **« Tout lire » d'un repli : l'API n'a pas de route en lot** (`routes/api/notifications.php` : `{id}/read`, `read-all`). L'action `markNotificationsReadAction` fait l'éventail elle-même. Elle le **borne à la liste affichée** (20 lignes au plus), par vagues de 5. Elle **compte l'échec partiel** : les lignes lues restent lues, et l'écran dit « N notifications n'ont pas pu être marquées lues ». Si tout échoue, l'action rend le refus traduit `markReadFailed`. Un appel plus large (injoignable depuis l'écran) n'en lit que les 20 premières et compte les autres dans `echecs` : elles ne passent pas pour lues en silence (vérification du 2026-11-12). La borne de 20 est une garde, pas un comportement : la cloche (`LIGNES_DE_LA_CLOCHE`) et l'historique (`PER_PAGE`) chargent 20 lignes par page, sans « charger plus », donc un repli n'en tient jamais plus. Chaque refus d'un échec partiel est journalisé (TCK-775).
- **Piège Vitest** : `beforeEach(() => mock.mockReset())` rend le mock, et Vitest joue une fonction rendue par `beforeEach` comme nettoyage après le test. Il faut des accolades.
