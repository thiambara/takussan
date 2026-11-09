---
id: TCK-2501
title: Fiche d'un bien « Le prix d'abord » : prix, coût d'entrée et interlocuteur au premier écran, barre WhatsApp + Visiter
status: todo
phase: P1
family: front
estimate: L
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: [TCK-2503]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, fiche, mobile, whatsapp, audit-ux]
---

## Objectif utilisateur

Au téléphone, le chercheur sait au premier écran combien, combien pour entrer et à qui il parle, et joint l'agent sur WhatsApp ou demande une visite d'un pouce.

## Contrat de données

Endpoints existants de la fiche publique ; clic WhatsApp / Appeler compté par `POST /api/public/properties/{slug}/contact-click` (existe). Aucun neuf.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=fiche&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes), téléphone et bureau.
- Premier écran : photo (un tiers de l'écran), puis prix, coût d'entrée et interlocuteur.
- Barre basse : WhatsApp et Visiter, deux boutons de même largeur, **sans montant** (le prix ne peut plus y être tronqué).
- En bureau : carte de réservation à droite avec les mêmes actions ; la rangée de catégories quitte l'en-tête (TCK-2494).

## Contraintes strictes (métier)

- Action primaire d'une location : **Visiter** ; le dossier (« Postuler ») vient après la visite (décision 3a). Pour une vente, l'action primaire reste celle d'aujourd'hui.
- WhatsApp au premier rang **seulement** quand le contact a un numéro déclaré WhatsApp ; sinon Appeler s'il a un numéro, sinon Écrire. Chaque clic WhatsApp / Appeler passe par `contact-click` (décision 4a).
- Une seule porte « message » sur la page.
- Le contact affiché reste celui de TCK-590 (personne joignable, jamais un compte bloqué).
- Tout ce que la fiche affiche aujourd'hui reste (galerie, caractéristiques, équipements, carte, avis, visite virtuelle, signaux de confiance, signalement, partage, vues).

## Delta à produire

- [ ] Ordre mobile : prix, coût d'entrée et interlocuteur avant la description.
- [ ] Barre d'actions basse WhatsApp + Visiter (ou leur repli), sans montant.
- [ ] Une seule porte « message » ; WhatsApp sorti de la carte de l'agent.
- [ ] Tests : actions par cas de contact (WhatsApp, téléphone seul, aucun numéro) ; location vs vente ; `contact-click` appelé.

## Critères d'acceptation

- [ ] AC1 — À 360 et 390 px, prix, coût d'entrée et nom de l'interlocuteur sont visibles sans défiler, et aucun texte de la barre basse n'est tronqué.
- [ ] AC2 — Sur une location dont le contact a WhatsApp, la barre montre WhatsApp et Visiter ; sans numéro, Écrire et Visiter.
- [ ] AC3 — Un clic WhatsApp produit un `contact-click` (vérifié au réseau) puis ouvre `wa.me` avec le message prérempli.
- [ ] AC4 — Aucune section de la fiche actuelle n'a disparu (liste vérifiée au navigateur).

## Hors périmètre

- Le parcours de demande de visite (TCK-2503).
- La galerie plein écran.

## Notes d'implémentation

_(à remplir par implementing-specs)_
