---
titre: "Vérifier que les emplacements affichés déclarent leur impression, et dater la bascule dans ADR-0061"
type: verification
tickets: [TCK-2569]
cles: []
creee: 2026-11-16
preview: a-faire
production: a-faire
---

## Quoi faire

Depuis TCK-2569, l'API ne compte plus une impression sponsorisée au service d'un emplacement : le
navigateur déclare les emplacements qu'il a affichés par `POST /api/public/properties/sponsored-impressions`.
Les statistiques d'avant comptent des emplacements **servis**, celles d'après des emplacements
**affichés** : la date de bascule doit être écrite, et l'appel réel du navigateur (inter-origines,
corps de formulaire, `keepalive`) n'est exercé par aucun test.

1. Sur l'environnement, ouvrir `/fr/properties` dans un navigateur ordinaire (pas un robot), outils de
   développement ouverts, onglet Réseau, et faire défiler jusqu'à une carte « Sponsorisé ».
2. Constater une requête `POST …/api/public/properties/sponsored-impressions` qui rend **204**, sans
   erreur CORS dans la console ; son corps porte `slugs[]=<slug du bien sponsorisé>`.
3. Même chose sur l'accueil, rangée « Coup de cœur » : seules les cartes amenées à l'écran partent.
4. Après le `boosts:tick` de l'heure suivante, la ligne du jour de ce boost dans
   `property_boost_daily_stats` porte au moins une impression (ou la console super-admin
   `GET /api/admin/boost-stats`).
5. Écrire la date de mise en service de l'environnement dans ADR-0061, section « Amendement du
   2026-11-16 (TCK-2569) », paragraphe « Les statistiques passées sont gardées telles quelles ».

## Comment vérifier

La requête du point 2 est visible et rend 204 ; la date de bascule de l'environnement figure dans
ADR-0061.

## Historique
- 2026-11-16, préproduction — promotion #1691 (`ac2a32f66`, fusionnée 23:27:40 Z, `images.yml` 43979477538 vert à 23:34:49 Z) ; **en partie** : l'appel tel que le navigateur
  le fait (`POST https://preview.api.takussan.com/api/public/properties/sponsored-impressions`, corps de formulaire
  `slugs[]=…`, `Origin: https://preview.takussan.com`) rend **204** avec `access-control-allow-origin:
  https://preview.takussan.com` : pas d'erreur CORS à attendre. Date de bascule écrite dans ADR-0061. **Reste** :
  les points 1 à 4 au navigateur (aucun bien sponsorisé dans la première page de `/fr/properties` ce soir) —
  `preview` reste `a-faire`.
