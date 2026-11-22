---
titre: "Décider puis faire approuver le gabarit WhatsApp de l'alerte de seuil"
type: decision
tickets: [TCK-2866]
cles: []
creee: 2026-11-16
preview: a-faire
production: a-faire
---

## Quoi faire

Une alerte de seuil part sur WhatsApp seulement dans la fenêtre de service de 24 h : hors fenêtre,
Meta exige un gabarit approuvé, et `ThresholdAlertTriggered::whatsappTemplate()` rend `null`. L'alerte
ne part alors pas sur ce canal.

1. Le porteur décide si l'alerte doit partir hors fenêtre. Si non : `sans-objet` sur les deux
   environnements, avec ce motif.
2. Si oui : faire approuver un gabarit `threshold_alert` par Meta, sur le compte WhatsApp Business de
   chaque environnement ; puis une PR qui le référence dans `whatsappTemplate()`.

## Comment vérifier

Une alerte déclenchée pour un utilisateur sans conversation depuis plus de 24 h arrive sur WhatsApp.

## Historique
