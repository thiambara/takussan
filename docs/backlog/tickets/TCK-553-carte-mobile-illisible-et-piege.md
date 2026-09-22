---
id: TCK-553
title: "Vue carte sur mobile : 129 étiquettes de prix empilées sans regroupement, dans une carte qui capture le défilement de la page"
status: todo
phase: P1
family: front
estimate: M
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, mobile, carte, recherche, ux]
---

## Objectif utilisateur

Sur téléphone, un visiteur passe en vue carte, repère les zones où se trouvent les biens, zoome,
touche un bien précis, et revient à la liste — sans lutter contre la page.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constats M1 à M3), sur `?contract_type=rent&q=Dakar` à 390 × 844.

- **M1** — 129 marqueurs `.leaflet-marker-icon`, **0** regroupement : les étiquettes de prix se
  recouvrent en un bloc illisible où aucun marqueur n'est touchable isolément. TCK-047 (`done`)
  exigeait des « marqueurs clusterisés » ; TCK-162 (`done`) a différé le regroupement « à un ticket
  dédié si l'usage révèle une dégradation au-delà de ~150 marqueurs » — elle est constatée dès 129.
- **M2** — la carte (356 × 518 px, `touch-action: none`) est insérée dans une page qui défile, sous
  ~400 px de contrôles et au-dessus du pied de page : sur 61 % de l'écran, le doigt déplace la
  carte au lieu de la page. TCK-047 attendait « carte plein écran sur mobile avec bouton basculer
  vers liste ».
- **M3** — la page annonce « 140 biens trouvés » au-dessus d'une carte qui en place 129 : `/map` ne
  reçoit pas `q` (choix documenté dans `PropertiesDiscoveryPage`), et un bien sans coordonnées ne
  peut pas être placé. Le choix est légitime ; l'écran, lui, affirme deux nombres pour une recherche.

## Contrat de données

Endpoint existant `GET /api/public/properties/map` (GeoJSON plafonné, sans pagination). Aucun
changement d'API dans ce ticket : le regroupement se fait sur les points déjà reçus.

## Direction UX / Artistique

- Aux zooms larges, des **grappes** portant leur nombre de biens ; le prix n'apparaît qu'une fois
  les marqueurs assez séparés pour être lus et touchés.
- Sur mobile, la vue carte **occupe l'écran** sous la barre de navigation, sans pied de page ; un
  bouton flottant ramène à la liste.
- Le nombre affiché en vue carte est celui de la carte (« N sur la carte »), pas celui de la liste.

## Contraintes strictes (métier)

- Les filtres transmis à `/map` restent ceux d'aujourd'hui, `lat`/`lng`/`radius_km` compris
  (TCK-346) : ce ticket ne réintroduit pas l'écart liste/carte que TCK-346 a fermé.
- Le prix d'un marqueur reste formaté comme aujourd'hui (TCK-162).
- Pas d'interaction de la carte capturée hors de la vue carte.

## Delta à produire

- [ ] Regroupement des marqueurs avec compte, éclaté au zoom et au tap sur une grappe.
- [ ] Vue carte plein écran sous `lg`, bouton flottant de retour à la liste, sans pied de page
      visible.
- [ ] Compte affiché en vue carte = nombre de biens placés.
- [ ] Tests : regroupement actif au-delà d'un seuil ; compte de la vue carte ; retour à la liste.

## Critères d'acceptation

- [ ] AC1 — sur `?contract_type=rent` à 390 × 844, zoom initial : le nombre d'éléments de carte
      rendus (grappes + marqueurs isolés) est inférieur au nombre de biens, et aucune paire de
      marqueurs **isolés** ne se chevauche (intersection des boîtes nulle).
- [ ] AC2 — un tap sur une grappe zoome jusqu'à la séparer ; un marqueur isolé ouvre l'aperçu du
      bien comme aujourd'hui.
- [ ] AC3 — en vue carte à 390 × 844, la carte occupe toute la hauteur sous la `nav`
      (à 1 px près), et `document.scrollingElement.scrollHeight <= innerHeight`.
- [ ] AC4 — le compte affiché en vue carte est égal au nombre de points reçus de `/map`.
- [ ] AC5 — le bouton de retour à la liste restaure la liste à la position de défilement quittée.

## Hors périmètre

- Transmettre `q` à `/map` (changement d'API, à décider séparément).
- L'agrégation côté serveur.
- La vue carte de bureau (mise en page inchangée ; le regroupement s'y applique aussi).

## Notes d'implémentation

_(à remplir par implementing-specs)_
