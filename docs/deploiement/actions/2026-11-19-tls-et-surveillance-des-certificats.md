---
titre: "Passer la zone en TLS 1.2 minimum et surveiller le certificat de chaque nom servi, preview.ws compris"
type: externe
tickets: [TCK-517, TCK-2956]
cles: []
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

1. TLS minimum 1.2 sur la zone `takussan.com`, partagée par les deux environnements
   ([plan, F1, étape 8](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md)).
2. Ajouter `preview.ws.takussan.com` à `NOMS` de `deploy/server/certificats.sh` : servi depuis le 2026-11-19, son
   certificat Let's Encrypt (jusqu'au 2027-02-17) n'est surveillé par rien.
3. Décider « Always Use HTTPS » sur la zone (relevé `off`) : la redirection HTTP → HTTPS ne tient aujourd'hui qu'à
   Traefik, pour les noms proxifiés comme pour les autres.

## Comment vérifier

`min_tls_version` rend `1.2` sur l'API Cloudflare ; `certificats.sh` relit `preview.ws.takussan.com`.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : `min_tls_version` = `1.0`, `always_use_https` = `off`, `ssl` = `strict` (API Cloudflare) ; `NOMS` de `certificats.sh` = `deploy`, `preview`, `preview.api` seulement
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · même zone : le même réglage la couvre
- 2026-11-22 · preview · a-faire · Claude (session, pour le porteur) · 1 fait : `PATCH /zones/<id>/settings/min_tls_version` → `1.2`, relu `1.2` sur l'API Cloudflare ; poignée de main sur `deploy.takussan.com` : `--tls-max 1.1` → échec, `1.2` → `200`. 2 fait : `preview.ws.takussan.com` ajouté à `NOMS` de `deploy/server/certificats.sh`, le script lancé rend 86 jours (2027-02-17, Let's Encrypt YR1). Reste 3 : décider « Always Use HTTPS » (relu `off`)
- 2026-11-22 · production · a-faire · Claude (session, pour le porteur) · 1 fait par la même zone (`min_tls_version` = `1.2`) ; restent `api` et `www` dans `NOMS` en F3, étape 3, et la décision 3
