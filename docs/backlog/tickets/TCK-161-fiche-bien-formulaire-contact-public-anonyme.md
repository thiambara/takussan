---
id: TCK-161
title: "Fiche bien — formulaire de contact public anonyme"
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#17-communication--messagerie
tags: [front, bug, p1, smoke-test-2026-05-05, contact, conversion, visiteur-anonyme]
---

## Objectif utilisateur

Un visiteur anonyme peut envoyer un message à l'agent ou au propriétaire d'un bien publié **sans avoir à créer de compte**, en remplissant un formulaire public minimal (Nom, Email, Téléphone, Message) directement depuis la fiche bien. Le but est de capter les leads anonymes qui ne franchiront jamais la barrière de l'inscription.

## Contrat de données

- Endpoint backend public à créer (ou exposer si déjà existant) : `POST /api/public/properties/{slug-or-id}/contact` avec le payload `{ name, email, phone?, message }`. Réponse 201 + 204.
- Le message est routé vers l'agent / propriétaire du bien (réutiliser le canal Messagerie ou un email simple — au choix de l'implémentation, à motiver dans les notes).
- Anti-spam minimum : honeypot ou rate-limit IP-based ; reCAPTCHA recommandé mais optionnel.

## Direction UX / Artistique

- Le bouton **Envoyer un message** dans le panneau latéral de la fiche bien doit ouvrir le formulaire **inline** (drawer / modale), pas une page séparée.
- Champs minimaux : Nom, Email, Téléphone (optionnel), Message. Validation visible.
- Toast de succès clair après envoi (`Message envoyé. L'agent vous recontactera sous peu.`).
- Si l'utilisateur **est** connecté, on garde le flow actuel (pas de formulaire public, message via la messagerie connectée).

## Contraintes strictes (métier)

- Le formulaire est strictement public (pas de prérequis d'auth).
- L'email est validé côté front et back ; téléphone optionnel mais validé si fourni (E.164 ou format local SN).
- Le message est tronqué/limité (1 à 2000 caractères).
- Le contact lead est tracé (IP, user-agent, timestamp, property_id) pour modération anti-spam.
- Conflit avec **TCK-126** (qui avait fait rediriger "Envoyer un message" vers `/auth/login`) : ce ticket **annule** ce comportement pour les visiteurs anonymes — la spec QA visiteur (`docs/qa/visiteur-anonyme-qa.md` TC-VA-16) et `features.md#12` exigent un formulaire public. À mentionner dans la PR.

## Delta à produire

- [ ] Endpoint `POST /api/public/properties/{property}/contact` (FormRequest + Controller + test feature).
- [ ] Acheminement du message (notification email à l'agent / propriétaire OU création d'un message dans la conversation à motiver).
- [ ] Frontend : formulaire inline (drawer / modale) déclenché par "Envoyer un message" pour les visiteurs anonymes.
- [ ] Validation côté front (email, longueur message, téléphone si fourni).
- [ ] Toast de succès / erreur localisé (FR/EN/WO).
- [ ] Anti-spam minimum (honeypot ou rate-limit IP).
- [ ] Mettre à jour la documentation interne / le README pour signaler l'inversion par rapport à TCK-126.

## Critères d'acceptation

- [ ] Sur `/properties/[slug]`, un visiteur **non connecté** qui clique "Envoyer un message" voit un formulaire public (pas une modale "Connexion requise").
- [ ] Soumettre avec nom + email + message valides aboutit à un toast de succès et un email reçu côté agent du bien.
- [ ] Soumettre avec un email invalide affiche une erreur de validation visible.
- [ ] Un utilisateur **connecté** continue de passer par le flow messagerie existant (pas de formulaire public).
- [ ] Le rate-limit empêche plus de N envois par IP / 10 min (à calibrer dans l'impl).

## Hors périmètre

- Réservation et "Demander une visite" — restent derrière le mur d'authentification (TC-VA-17 et TC-VA-18 valident le flow modale `Connexion requise`).
- Création automatique d'un compte / Customer à partir du contact anonyme (peut être un suivi).
- reCAPTCHA si jugé non nécessaire pour le MVP.

## Notes d'implémentation

_(à remplir par implementing-specs)_
