---
id: TCK-2682
title: "Impayés : relancer une sélection, une conversation WhatsApp après l'autre, dans une file guidée"
status: todo
phase: P2
family: front
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2660]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#125-leasepaymentreminder-"
    - "docs/models-spec.md#84-leasepaymentlink-"
tags: [front, finances, relance, whatsapp, mobile, audit-ux, app]
---

## Objectif utilisateur

Le 5 du mois, l'admin a douze loyers en retard. Il les coche, appuie sur « Relancer la sélection », et
enchaîne les douze relances WhatsApp sans revenir à la liste entre deux : chaque message est prêt, il
l'envoie, Takussan passe au suivant et garde la trace.

## Contrat de données

Rien de neuf côté API : la file réutilise, échéance par échéance, les routes de la relance unitaire
(TCK-2660) :

- `POST /api/lease-payments/{payment}/payment-link` → `{url, expires_at}` ; 409 si l'échéance n'est plus payable en ligne ;
- `POST /api/lease-payments/{payment}/reminders {channel: whatsapp}` et `GET …/reminders` (TCK-2658) ;
- la liste des impayés et ses filtres serveur (TCK-2657, TCK-2660).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-argent&a=a` — **référence de fidélité, non
  versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes)
  — écran « Impayés et relance », action « Relancer la sélection ». La maquette ne dessine pas la file :
  elle reprend la feuille de relance unitaire de TCK-2660, avec un en-tête « 3 sur 12 ».
- **Sélection** : une case par impayé (cible ≥ 44 px au téléphone), « Tout sélectionner » sur la page
  filtrée, et une barre d'action collante « Relancer la sélection (12) ».
- **La file** : la feuille de relance de TCK-2660 (montant, période, retard, message prérempli
  modifiable, lien de paiement), plus l'en-tête « 3 sur 12 », « Ouvrir WhatsApp » (primaire),
  « Passer », et « Arrêter ». Au retour de WhatsApp, la feuille montre l'échéance suivante.
- **Fin** : un récapitulatif — relancés, passés, sautés avec leur raison — puis retour à la liste,
  où chaque carte relancée porte « relancé aujourd'hui ».
- **Téléphone (360-390 px)** : la file est une feuille plein écran ; « Ouvrir WhatsApp » reste visible
  sans défiler. **Bureau (≥ 1280 px)** : la file vit dans le panneau latéral de TCK-2660 ; la liste
  reste visible à gauche, l'échéance en cours y est surlignée. Panneau et colonnes dès `lg`.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md) (amendement du 2026-11-10 — la relance en lot est une file guidée).

- **Takussan n'envoie rien** : chaque message part du WhatsApp de l'admin, ouvert par `wa.me`, et
  c'est lui qui l'envoie. Aucune route d'envoi, aucun envoi en arrière-plan.
- **Une relance notée par ouverture** : « Ouvrir WhatsApp » note la relance de **cette** échéance
  (`channel: whatsapp`) ; « Passer » ne note rien.
- **Le lien de paiement se demande au moment où l'échéance s'affiche**, jamais en lot à l'ouverture
  de la file (un lien n'est créé que pour une échéance réellement présentée).
- **Rien n'est retiré en silence** : une échéance sans téléphone, ou dont le lien rend 409, est
  sautée avec sa raison affichée dans la file et comptée au récapitulatif.
- Le message prérempli est celui de TCK-2660 (vouvoiement, dans la langue du locataire), et **la même
  aide** construit le lien `wa.me` (ADR-0105 § 1 : une seule aide).
- « Arrêter » garde les relances déjà notées et rend la liste, sélection intacte pour reprendre.
- Aucun « Lu le … », aucun « envoyé » : « relancé » veut dire « WhatsApp a été ouvert » (ADR-0105).
- i18n : libellés neufs en `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement.

## Delta à produire

- [ ] Sélection multiple des impayés et barre « Relancer la sélection (n) ».
- [ ] File guidée : en-tête de position, feuille réutilisée, « Ouvrir WhatsApp », « Passer », « Arrêter ».
- [ ] Sauts motivés (pas de téléphone, 409) et récapitulatif de fin.
- [ ] Tests : file de 3 échéances (dont une sans téléphone et une à 409) → 1 `wa.me` ouvert, 1 `POST …/reminders`, 2 sauts motivés ; les liens de paiement ne sont demandés qu'aux échéances affichées ; « Passer » ne poste rien ; « Arrêter » garde la sélection.

## Critères d'acceptation

- [ ] AC1 — Sélectionner 3 impayés puis « Relancer la sélection » : le réseau montre **un seul** `POST …/payment-link` avant la première « Ouvrir WhatsApp », et pas les trois.
- [ ] AC2 — Sur la file de 3 (une normale, une sans téléphone, une à 409), le récapitulatif dit « 1 relancé · 0 passé · 2 sautés » et nomme les deux raisons ; un seul `POST …/reminders` est parti.
- [ ] AC3 — Aucune requête vers une route d'envoi de message (SMS, WhatsApp de la plateforme) n'apparaît au réseau pendant la file.
- [ ] AC4 — À 390 px, « Ouvrir WhatsApp » est visible sans défiler sur chaque échéance de la file ; à 1280 px, la liste reste visible à côté de la file.
- [ ] AC5 — Après la file, les cartes des échéances relancées portent « relancé aujourd'hui » sans rechargement, et les autres non.

## Hors périmètre

- Un envoi par Takussan (SMS, API WhatsApp) : un autre ADR, ADR-0105.
- Le lot depuis la liste des baux (TCK-2644) : un autre ticket s'il le faut.

L'onglet Impayés de Rapports (TCK-2629) monte **le même composant** Impayés (décision du porteur du 2026-11-10, point 14 a) : la sélection et la file y sont donc présentes sans travail de plus.

## Notes d'implémentation

_(à remplir par implementing-specs)_
