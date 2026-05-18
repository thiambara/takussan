---
id: TCK-199
title: "Médias biens — validation robuste et supports avancés"
status: done
phase: P1
family: applicatif
estimate: M
created: 2026-05-06
updated: 2026-05-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#3-property
tags: [front, back, media, properties, bug, agent-immobilier, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un agent ajoute des médias de bien sans créer d'entrées cassées et retrouve les photos, plans, vidéos et visites virtuelles organisés.

## Contrat de données

Les médias de Property sont portés par Spatie Medialibrary et ses collections. Les uploads doivent valider type, taille et conversion avant qu'un média soit considéré disponible.

## Direction UX / Artistique

Uploader clair avec état de progression, erreurs compréhensibles, onglets par type de média et indication explicite de la couverture.

## Contraintes strictes (métier)

- Un fichier invalide ne doit jamais persister comme média exploitable.
- Les conversions image doivent être atomiques du point de vue utilisateur.
- Les limites de taille/type doivent être identiques côté client et serveur.
- Les médias avancés restent séparés des photos de couverture.

## Delta à produire

- [ ] Corriger le cas où un PNG invalide déclenche une erreur conversion puis reste compté dans `Médias`.
- [ ] Ajouter validation client avant upload pour type et taille.
- [ ] Garantir rollback/suppression temporaire serveur si une conversion échoue.
- [ ] Exposer des messages d'erreur utilisateur au lieu des erreurs GD brutes.
- [ ] Vérifier le support organisé des photos, plans PDF, vidéos MP4 et liens 360°.
- [ ] Ajouter tests d'upload valide, upload invalide, conversion échouée et persistance après reload.

## Critères d'acceptation

- [ ] Un fichier image corrompu est rejeté et ne modifie pas le compteur médias.
- [ ] Un JPEG valide génère les conversions attendues et persiste après reload.
- [ ] Les erreurs d'upload sont lisibles et ne dévoilent pas de chemin serveur.
- [ ] Les médias avancés sont rangés par type sans devenir couverture photo par erreur.

## Hors périmètre

- CDN et formats modernes.
- Watermark automatique.
- Streaming vidéo adaptatif.

## Notes d'implémentation

Le scope livré durcit le flux photos existant : rollback sur échec de conversion, messages de validation lisibles et limites client/serveur alignées à 10 Mo. Les collections avancées restent exposées par le modèle/ressource mais sans refonte de l'uploader.
