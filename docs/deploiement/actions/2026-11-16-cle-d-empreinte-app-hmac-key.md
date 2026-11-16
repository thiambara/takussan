---
titre: "Poser APP_HMAC_KEY, la clé des empreintes distincte d'APP_KEY, avant la promotion qui la livre"
type: cle-env
tickets: [TCK-614]
cles: [APP_HMAC_KEY]
creee: 2026-11-16
preview: fait
production: a-faire
---

## Quoi faire

Les empreintes HMAC hors du Radar (alertes de recherche, crédit de bienvenue, versements approuvés, plafonds,
signalements, journal de recherche) s'écrivent désormais sous `APP_HMAC_KEY`, distincte d'`APP_KEY`
([ADR-0084, amendement du 2026-11-16](../../adr/0084-les-empreintes-sous-app-key-se-lisent-sous-ses-anciennes-cles.md)).

⚠ **Hors `local`/`testing` — la préproduction est en `staging` — `docker/release.sh` arrête le déploiement si la clé
manque** : `security:rehash-fingerprints --dry-run` sort en 2, les services ne démarrent pas, les anciens conteneurs restent.
La poser **AVANT** la promotion vers `preview` qui livre TCK-614.

1. Tirer une valeur par environnement, jamais la même : `openssl rand -base64 48`. La recopier **à l'identique**.
2. Dans l'onglet Environment de Dokploy (`takussan-api-preview`, puis `takussan-api-production` en F3) :
   `APP_HMAC_KEY=<valeur>`.
3. La ranger hors du VPS, à côté d'`APP_KEY` (même coffre, même relevé) : perdue, chaque empreinte écrite sous elle
   devient méconnaissable — une désinscription d'alerte devient partielle, un numéro déjà crédité peut recevoir une
   seconde bienvenue.
4. Déployer. Ne **pas** faire tourner `APP_KEY` dans le même déploiement.
5. **Une fois les conteneurs neufs démarrés** (jamais avant : l'ancien code ne lit que sous `APP_KEY`), dans le
   conteneur `api` : `php artisan security:rehash-fingerprints --dry-run`, puis `php artisan security:rehash-fingerprints`.
   **Ensuite, plus de retour à une image antérieure à TCK-614** : elle ne retrouverait plus les empreintes réécrites.

Effets attendus de la pose, bornés et sans suite : les codes SMS en cours sont invalidés (à redemander), le plafond
SMS de visite et le compte des visiteurs du jour repartent de zéro, un visiteur anonyme peut signaler une fois de
plus un avis qu'il avait signalé.

## Comment vérifier

- Le journal du service `release` porte une ligne `security:rehash-fingerprints (à blanc) — terminé.`, et pas
  `ERREUR : APP_HMAC_KEY est vide`.
- Après l'étape 5, `php artisan security:rehash-fingerprints --dry-run` rend `reecrites=0` pour les trois
  familles (alertes, bienvenue, versements). Les `sans_source` listés (octrois de comptes anonymisés, contacts
  illisibles) restent lus sous `APP_KEY` : c'est attendu, rien à corriger.

## Historique

- 2026-11-16 · preview · fait · Claude (session, pour le porteur) · rehash à blanc 6 → réel 6 → à blanc courantes=6, empreinte d70339bd3886
- 2026-11-16, préproduction — **étapes 1 à 3 faites** (session, à la demande du porteur) : valeur tirée de 48 octets
  aléatoires, posée par `compose.update` (200) dans le Compose `takussan-api-preview` juste après `APP_KEY` ;
  relue : 316 lignes, les 315 autres intactes. Empreinte **`d70339bd3886`** (12 premiers caractères du `sha256`),
  identique dans le trousseau macOS du porteur (service `takussan-preview-APP_HMAC_KEY`). Environnement d'avant
  sauvegardé : `~/Sauvegardes/env-takussan-api-preview-avant-app-hmac-key-2026-11-16.env` (0600). Aucun
  redéploiement déclenché : **restent les étapes 4 et 5** à la promotion qui livre TCK-614 — `preview` reste
  `a-faire` jusque-là.
- 2026-11-16, préproduction — promotion #1691 (`ac2a32f66`, fusionnée 23:27:40 Z, `images.yml` 43979477538 vert à 23:34:49 Z) ; le `release` a joué `security:rehash-fingerprints (à blanc) — terminé.` (pas d'`ERREUR : APP_HMAC_KEY est vide`) ;
  empreinte de la clé vue par le conteneur `api` : `d70339bd3886`, la même que posée. Étape 5 : à blanc `bienvenue —
  reecrites=6`, puis passage réel `reecrites=6`, puis à blanc `reecrites=0 courantes=6` ; alertes et versements : 0.
  Plus de retour à une image d'avant TCK-614 sur la préproduction.
