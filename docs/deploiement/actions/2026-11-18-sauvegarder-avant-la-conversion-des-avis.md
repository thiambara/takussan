---
titre: "Sauvegarder la base AVANT le déploiement qui convertit les avis du fil (TCK-2958), puis retirer les avis de l'index (messages:unindex-coded)"
type: donnee
tickets: [TCK-2958]
cles: []
creee: 2026-11-18
preview: a-faire
production: a-faire
---

## Quoi faire

TCK-2958 (ADR-0128 § 3) livre la migration `2026_11_18_295801_convert_maintenance_notices_to_events`,
que `docker/release.sh` joue (`migrate`) au déploiement. Elle **efface du texte** : le `content` de
chaque avis système (« Alice a ajouté Bob au groupe », « Intervention confiée à … ») devient son
code (`participant_added`, `maintenance.assigned`…), les avis d'intervention deviennent des messages
`event`, et l'aperçu de la liste (`conversations.last_message_preview`) d'un fil dont le dernier
message est un avis devient ce code. Le `down()` rend leur type aux avis d'intervention, **jamais**
leur phrase française. D'où deux gestes, par environnement :

1. **Avant** de fusionner la promotion qui porte la migration : une sauvegarde manuelle de la base
   (Dokploy, `backup.manualBackupPostgres`, comme pour toute migration irréversible), et relire
   qu'elle est arrivée sur le stockage des sauvegardes.
2. **Après** le déploiement : `php artisan messages:unindex-coded` dans le conteneur de l'API. Les
   avis déjà indexés le sont avec leur phrase française ; ils ne sont plus indexables
   (`Message::shouldBeSearchable`), mais une réimportation **filtre** sans retirer. La commande les
   retire (idempotente) et imprime `retired=N`.

## Comment vérifier

- La sauvegarde est datée d'avant le déploiement, et lisible.
- Après le déploiement : `SELECT count(*) FROM messages WHERE type = 'system' AND metadata->>'event' = 'maintenance'`
  rend 0, et une recherche dans la messagerie sur « a ajouté » ne rend plus aucun avis.

## Historique
