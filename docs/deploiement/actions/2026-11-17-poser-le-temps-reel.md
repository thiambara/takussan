---
titre: "Poser les clés du temps réel du front (TEMPS_REEL_URL, TEMPS_REEL_CLE) une fois le service temps-reel levé"
type: cle-env
tickets: [TCK-2953, TCK-2956]
cles: [TEMPS_REEL_URL, TEMPS_REEL_CLE]
creee: 2026-11-17
preview: a-faire
production: a-faire
---

## Quoi faire

Le front se branche au serveur WebSocket du temps réel par deux clés d'exécution
([ADR-0129](../../adr/0129-le-socle-temps-reel-signale-et-l-api-sert.md) § 5, amendé le 2026-11-17) — jamais
des `NEXT_PUBLIC_*`. **Vides, rien ne casse** : le front reste en mode dégradé (relecture périodique). C'est
l'état livré par TCK-2953, et le seul juste tant que le serveur n'existe pas.

⚠ **Ne PAS les poser avant que le service `temps-reel` de TCK-2956 réponde** sur son sous-domaine : une
`TEMPS_REEL_URL` qui vise un serveur absent fait tenter au navigateur une connexion qui échoue à chaque page.

1. Attendre que TCK-2956 soit déployé dans l'environnement : service `temps-reel` sain, sous-domaine servi en
   `wss://`, clés `REVERB_*` posées dans l'onglet Environment de l'API.
2. Dans l'onglet Environment de Dokploy de l'application du front (`takussan-web-preview`, puis
   `takussan-web-production` en phase F) :
   - `TEMPS_REEL_URL` : l'origine WebSocket publique du service, schéma `wss://`, sans chemin ;
   - `TEMPS_REEL_CLE` : la valeur **exacte** de `REVERB_APP_KEY` de l'API du même environnement — la clé
     publique, **jamais** `REVERB_APP_SECRET` (elle part en clair dans chaque page).
3. Redéployer le front (les clés se lisent à l'exécution : un redémarrage suffit, aucune reconstruction).

## Comment vérifier

- Une page de l'espace connecté ouvre une connexion `wss://…/app/<TEMPS_REEL_CLE>` (onglet Réseau, filtre WS)
  qui reçoit `pusher:connection_established`.
- Une notification créée pour l'utilisateur connecté fait bouger la cloche sans rechargement.

## Historique
