---
id: TCK-004
title: Campagnes email / SMS ciblées
status: blocked
phase: P3
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-16
depends_on: [TCK-020]
blocks: []
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#spatielaravel-activitylog
tags: [back, crm, marketing]
---

## Contexte

Issu du warning `features.md §1.6 P3` (ligne 183), justifié en passe 006 comme
applicatif (jobs Laravel, pas de modèle dédié).
**Bloqué** sur décision produit : providers email + SMS.
Recommandation technique: `MAIL_MAILER` courant + Twilio.
Décision par défaut: pas de nouveau modèle `Campaign` — journalisation seule via `activity_log`.

## Objectif

Permettre à un agent de créer une campagne ciblée (email ou SMS) à partir d'un
segment de `Customer` filtré par `pipeline_stage` et tags, avec envoi différé.

## Delta à produire

- [ ] Écran « Nouvelle campagne » (canal, template, filtre Customer)
- [ ] Bouton « Prévisualiser » : count destinataires + 5 premiers
- [ ] Jobs `SendCampaignEmailJob` / `SendCampaignSmsJob` par batch de 50 avec throttling
- [ ] Journalisation `activity_log` par envoi
- [ ] Lien unsubscribe `GET /unsubscribe/{token}` en pied d'email

## Critères d'acceptation

- [ ] Un filtre sur `pipeline_stage @in [lead, qualified]` retourne le bon count
- [ ] Les envois sont batchés (50) avec throttling provider
- [ ] Chaque envoi produit une entrée `activity_log` avec sujet `Campaign`
- [ ] Le lien unsubscribe invalide les futurs envois pour ce `Customer`

## Hors périmètre

- A/B testing
- Tracking ouverture/clic
- Planification différée

## Notes d'implémentation

_(à remplir par spec-coder)_
