---
id: TCK-2853
title: "Accueil du client : la visite avec photo, agent, « Déplacer » et « Itinéraire » ; « … vous a répondu · Lire » au bureau ; « Chercher un bien » ; « Vous avez un bien à louer ? Publiez-le » ; les favoris à droite"
status: done
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2851]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#17-communication--messagerie"
  models: []
tags: [front, accueil, client, visites, audit-ux, app]
---

## Objectif utilisateur

Le client qui cherche un logement retrouve sa prochaine visite et s'y rend (ou la déplace), lit la réponse de l'agent, relance une recherche, et découvre qu'il peut aussi publier.

## Contrat de données

- `visits_upcoming[]` : `property.cover_url`, `property.address_line`, `property.coordinates`, `agent.name`, `can_reschedule` — **livrés par TCK-2851**.
- **Déplacer** : `POST /api/property-visits/{visit}/reschedule` (existe, `PropertyVisitPolicy::reschedule`).
- **Réponse de l'agent** : `GET /api/conversations?filter[unread]=1` (TCK-2630) — le fil non lu le plus récent dont le dernier message vient d'un autre que le client.
- « Chercher un bien » : la recherche publique ; « Publiez-le » : l'entrée de publication existante (`app-entree-publier`).

Relevé (audit-f3-coque.md, app-accueil e5) : `accueil/client/VosVisites.tsx:25-31` (docblock : Déplacer/Itinéraire non faits), `:72-77` (« Voir » seul) ; « Chercher un bien » remplacé par `InvitationARechercher` ; aucune entrée de la fiche TCK-2625 ne couvre ces manques.

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-accueil-contenu.tsx` (`CarteVisiteClient` l. 1281, `RechercheClient`, `LigneStatutClient`, `AccueilClientMobile`, `AccueilClientBureau`), écran **e5 « Client »** d'`app-accueil.tsx`, approche a.

- **Les deux formats** — « Vos démarches » : la carte de visite porte la photo du bien (56 px), « Visite jeu. 12 nov. · 10:00 », « Studio meublé à Mermoz · Sokhna Sène », le statut, puis deux boutons de 44 px : **« Déplacer »** (contour) et **« Itinéraire »** (tonal, icône de navigation). Sous « Vos recherches », la ligne **« Vous avez un bien à louer ? Publiez-le en quelques minutes. »** avec chevron.
- **Téléphone** : le bouton pleine largeur **« Chercher un bien »** (loupe) sous les recherches.
- **Bureau (manques propres au bureau)** : « Chercher un bien » dans la tête de page ; sous la visite, la rangée **« Sokhna Sène vous a répondu »** / « « Oui, le studio est libre au 1ᵉʳ décembre. » · il y a 1 h » avec **« Lire »** ; **les favoris « prix en baisse » dans la colonne de droite** (aujourd'hui à gauche).
- « Déplacer » ouvre le choix d'un créneau (feuille au téléphone, dialogue au bureau) ; « Itinéraire » ouvre la carte de l'appareil sur les coordonnées.

## Contraintes strictes (métier)

- « Itinéraire » seulement si `coordinates` est servi (visite confirmée) ; « Déplacer » seulement si `can_reschedule`.
- La rangée « vous a répondu » n'apparaît que s'il y a un message non lu d'un autre ; « Lire » ouvre le fil.
- « Chercher un bien » remplace l'invitation « Voir les annonces » là où la maquette le place, sans perdre l'invitation pour un client sans recherche si la maquette ne la dessine pas ailleurs (à trancher contre la maquette, noter le choix).
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Carte de visite complète (photo, agent, Déplacer, Itinéraire).
- [ ] Rangée « … vous a répondu · Lire » (bureau).
- [ ] « Chercher un bien » (deux places), « Vous avez un bien à louer ? ».
- [ ] Favoris à droite au bureau.
- [ ] Tests : Déplacer appelle `reschedule` et met la carte à jour ; Itinéraire absent sans coordonnées ; rangée de réponse et son absence ; liens de recherche et de publication.

## Critères d'acceptation

- [ ] AC1 — Client avec une visite confirmée : la carte montre une image, « Sokhna Sène », un bouton « Déplacer » et un lien « Itinéraire » dont l'URL contient les coordonnées du bien.
- [ ] AC2 — « Déplacer » → choix d'un créneau → `POST …/reschedule` → la carte affiche la nouvelle date.
- [ ] AC3 — À 1440, avec un message non lu de l'agente : « Sokhna Sène vous a répondu » et « Lire » qui ouvre ce fil ; sans non lu : pas de rangée.
- [ ] AC4 — À 390, « Chercher un bien » est un bouton pleine largeur sous « Vos recherches » ; à 1440, il est dans la tête de page.
- [ ] AC5 — « Vous avez un bien à louer ? » mène à l'entrée de publication.
- [ ] AC6 — À 1440, « Vos favoris · prix en baisse » est dans la colonne de droite.
- [ ] AC7 — Vérifier au navigateur (audit, non vérifiables) : favoris dont le prix a bougé et recherches « N nouveaux » sur des données qui les produisent ; corriger si absents.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2853.json` : app-accueil e5, téléphone et bureau.
- [ ] AC-F2 — Zéro écart non expliqué.
- [ ] AC-F3 — À 1024 et 768 : `scrollWidth − innerWidth = 0`.

## Hors périmètre

- Les champs d'API : TCK-2851.

## Notes d'implémentation

Livré le 2026-11-15 (arbre `feat/audit-manques-2026-11-15`), sur les champs de TCK-2851.

**Re-mesure de la prémisse**
- `VosVisites.tsx` : docblock « Déplacer/Itinéraire non faits » et « Voir » seul — confirmé. `visits_upcoming[]`
  porte bien `cover_url`, `address_line`, `coordinates` (clé absente hors `confirmed`), `agent.name`, `can_reschedule`.
- **`visits_upcoming` ne sert pas le `slug` du bien**, dont la grille des créneaux a besoin
  (`ProposerUnCreneau` → `GET /public/properties/{slug}/visit-slots`). « Déplacer » lit donc la visite au clic
  (`GET /api/property-visits/{id}`, qui charge le bien et n'accepte ni `fields` ni `include`).
- `GET /api/conversations` ne dit pas QUI a écrit le dernier message (`last_message` = id, type, metadata). La
  rangée prend le fil direct non lu le plus récent (`filter[unread]=1&filter[type]=direct&per_page=1`, filtré
  par le serveur) : « non lu » y veut dire « un message d'un autre, postérieur à la lecture, hors avis
  système » ; le nom est celui de l'autre membre ; la citation est `last_message_preview` (jamais pour un avis
  système). Si le client a répondu après sans relire, la citation peut être la sienne — `last_message.sender_id`
  côté API le trancherait (hors zone, front seul).
- « Publiez-le » : l'entrée existante est `/publish` (non localisée, comme la Navbar), qui résout seule la suite.

**Ce qui est livré**
- `VosVisites` : photo 56 px (`Vignette`), « Visite jeu. 12 nov. · 10:00 », « bien · agent », statut, puis
  « Déplacer » (contour, si `can_reschedule`) et « Itinéraire » (tonal, icône de navigation, lien Google Maps
  `dir/?api=1&destination=lat,lng`, seulement si `status === 'confirmed'` ET coordonnées servies). Quand l'un
  manque, « Voir la visite » prend sa place (la carte garde un chemin vers la visite).
- « Déplacer » → `ProposerUnCreneau` (le dialogue de « Mes visites ») → `POST …/reschedule` ; la carte prend
  la visite rendue (nouvelle heure, « En attente de confirmation », plus d'« Itinéraire ») et la page est
  relue (`router.refresh()`). `ProposerUnCreneau` reçoit un `onPropose` facultatif (additif).
- `ReponseRecue` (neuf, bureau `max-md:hidden`) : « {nom} vous a répondu », « « … » · il y a 1 h », « Lire »
  → `/app/messages?conversation={id}`. Clé sous `['conversations','list']` : lire le fil l'efface.
- `ChercherEtPublier.tsx` (neuf) : « Chercher un bien » (au téléphone pleine largeur sous « Vos recherches »,
  au bureau dans la tête de page par une prop `actions` neuve, facultative, de `SocleDeLAccueil`) ; « Vous avez
  un bien à louer ? Publiez-le en quelques minutes. » + chevron → `/publish`, aux deux formats.
- Favoris : `FavorisQuiBougent bureau` (intertitre de colonne, id distinct, ligne sur deux lignes) rendu dans la
  colonne de droite au bureau, la forme du téléphone dans les blocs (`md:hidden`) ; une seule requête.
- **Invitation à chercher (choix noté)** : la maquette ne la dessine pas. Elle reste au client SANS recherche
  sauvegardée (`SiAucuneRecherche`, même requête que « Vos recherches »), sans son bouton « Voir les annonces » :
  « Chercher un bien » porte le même lien (`lienDeLaRecherche`, intention et ville du profil). Sans bien à
  montrer (pas de ville au profil, ou aucun résultat), elle n'est pas rendue : elle n'aurait qu'un titre.
- `filter[type]=direct` vérifié : les fils nés d'un bien sont `direct` (`PropertyConversationResolver`), et
  `ListConversationsRequest` accepte `direct` / `group`.

**Écarts**
- « Déplacer » ouvre le dialogue centré de « Mes visites » aux deux largeurs, pas une feuille au téléphone (la
  grille des créneaux n'est pas dupliquée ; la maquette e5 ne dessine pas ce choix).
- Sans visite, la rangée « vous a répondu » s'affiche sans l'intertitre « Vos démarches ».
- « Les 6 favoris » reste « Tous vos favoris » (TCK-2625).
- La colonne du client est désormais toujours rendue : entre `md` et `xl` (une colonne), les favoris du bureau
  viennent après tous les blocs de gauche ; un client sans favori qui bouge ni fiche y laisse une cellule vide
  (un écart de grille de 28 px).

**Mesures**
- `accueil-client.tck-2853.test.tsx` (10), `AccueilDuClient.tck-2625`, `FavorisQuiBougent.tck-2625`,
  `socle.tck-2622` (+1 test TCK-2853), `mise-en-service`, `MaSituation.tck-595`, tests locataire, `VisitDetail.tck-590`,
  `VisitDetail.proposer-fenetre.p230-01`, `mes-visites.tck-2587`, `routes-atteignables`, `fleche-de-retour-unique`,
  `property-fields.coverage`, `i18n-namespaces-scan` : verts.
- Ablations (une à une, `cp` + md5) : Itinéraire sans condition de statut → rouge ; report sans mise à jour de la
  carte → AC2 rouge ; lecture sans `filter[unread]` → AC3 rouge ; avis système cité → rouge ; invitation sans
  condition → rouge ; favoris du bureau retirés de la colonne, « Chercher » retiré de la tête, rangée de réponse
  retirée, bouton de l'invitation rendu, invitation sans condition de biens → test de page rouge (chacun) ;
  `aria-labelledby` commun aux deux favoris → rouge.
- eslint, `tsc --noEmit`, `npm run check:*` verts ; gardes racine vertes sauf `check-models-spec` (hors ticket).
  `show-sans-fields.garde` rouge sur `src/lib/taches/rattachement-de-la-fiche.ts` (TCK-2857, hors ticket).
- **Non mesuré** : AC7 et AC-F1 à AC-F3 (pas de relevé au navigateur dans ce lot).
