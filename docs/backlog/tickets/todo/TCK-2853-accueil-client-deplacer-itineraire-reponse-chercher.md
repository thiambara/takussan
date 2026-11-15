---
id: TCK-2853
title: "Accueil du client : la visite avec photo, agent, « Déplacer » et « Itinéraire » ; « … vous a répondu · Lire » au bureau ; « Chercher un bien » ; « Vous avez un bien à louer ? Publiez-le » ; les favoris à droite"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
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

_(à remplir par implementing-specs)_
