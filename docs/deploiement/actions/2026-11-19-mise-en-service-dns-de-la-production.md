---
titre: "Mettre la production en service : www, api et ws dans le DNS, l'apex redirigé, les certificats surveillés"
type: externe
tickets: [TCK-517]
cles: []
creee: 2026-11-19
preview: sans-objet
production: a-faire
---

## Quoi faire

[Plan, F3, étapes 3 et 4](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md), sur demande du porteur :

1. `www` en A proxifié ; promotion `preview → master` ; deux lignes ✓ dans `images.yml` ;
2. `api` passe en proxifié ; apex en A `192.0.2.1` avec une Redirect Rule 301 vers `www` ;
3. `ws.takussan.com` en DNS seul : porté par `2026-11-17-poser-le-temps-reel.md`, **absent de F3** ;
4. `api`, `www` et `ws` ajoutés à `NOMS` de `deploy/server/certificats.sh`, **une fois leur certificat émis**.

## Comment vérifier

`dig` rend les trois noms ; `certificats.sh` les relit sans alerte ; `https://takussan.com/` rend 301 vers `www`.

## Historique

- 2026-11-19 · preview · sans-objet · Claude (inventaire, pour le porteur) · les noms de préproduction sont servis depuis le 2026-09-14 (`preview.ws` depuis le 2026-11-19) ; leur surveillance de certificat est dans `2026-11-19-tls-et-surveillance-des-certificats.md`
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : DNS sans `www`, sans apex A, sans `ws` ; `api` en DNS seul
