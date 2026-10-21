---
id: TCK-1183
title: "Le désabonnement du résumé suit ADR-0050 : page à un bouton, POST signé à échéance, `List-Unsubscribe`"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-97--liens-daction-des-courriels--page-visée-authentification-hôte"
tags: [api, front, notifications, email, pistes]
---

## Contexte

Réf : **P97.06** du fichier de pistes, `validé`.

`GET notifications/unsubscribe/{user}`, signé sans échéance, passait `email_frequency` à `off` dès
l'ouverture du lien : un analyseur de liens qui ouvre l'URL avant le destinataire coupait le
résumé. Le courriel n'annonçait ni `List-Unsubscribe` ni `List-Unsubscribe-Post`, et la
redirection finale (`/app/profile/notifications?unsubscribed=1`) portait un paramètre qu'aucun
fichier du front ne lit. Les alertes de recherche suivent déjà le modèle d'ADR-0050.

### Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur**, là où la piste laisse des voies :

- **Durée du lien : 60 jours**, celle qu'ADR-0050 retient pour l'alerte d'un compte
  (`config('search_alerts.account_unsubscribe_days')`), seule durée écrite pour ce modèle.
- **Liens déjà envoyés** (signés sans échéance) : ils restent servis par la route web, signature
  exigée, **n'écrivent plus rien** et mènent à la page de confirmation munis d'un lien neuf — la
  voie que recommande la ligne `Mesure` du délégué. Un lien envoyé reste donc utilisable, d'un clic
  humain.
- **Page** : `/[locale]/notifications/unsubscribe`, publique, sur le modèle de
  `/[locale]/search-alerts/unsubscribe` (le lien s'ouvre souvent hors session), dans la langue du
  compte (`preferred_language`, `fr` à défaut).
- **Limiteur** : `public-search-alert` (10 / 10 min par visiteur), celui du désabonnement d'une
  alerte, plutôt qu'un limiteur neuf.

## Objectif utilisateur

Ouvrir le lien du résumé ne désinscrit personne ; un clic sur la page, ou le bouton
« Se désabonner » du client de messagerie, le fait, et la page le confirme.

## Contrat de données

- `POST /api/notifications/digest/unsubscribe/{user}?expires=…&signature=…` (signé relatif) → 200
  `{ data: { email_frequency: "off" } }` ; 403 sans signature valide ou après échéance ; 405 en GET.
- `GET /notifications/unsubscribe/{user}?signature=…` (anciens liens) → 302 vers la page du front,
  sans écriture.

## Contraintes strictes (métier)

- Un GET n'écrit jamais.
- La signature reste relative (TCK-1059).
- Le wolof est en pause : les clés `wo` portent le texte français.

## Delta à produire

- [x] API : `NotificationUnsubscribeController` — `links()`, `confirm()` (POST), GET sans écriture.
- [x] API : route `notifications.digest.unsubscribe` ; commentaire de la route web.
- [x] API : `NotificationDigestMail` — liens bâtis à l'envoi, en-têtes `List-Unsubscribe` et
      `List-Unsubscribe-Post` ; `BuildUserDigestJob` ne les passe plus.
- [x] Front : page publique, `DigestUnsubscribeAction`, `lib/queries/digest-unsubscribe.ts`, clés
      `digestUnsubscribe` (fr, en, wo = fr), table des dictionnaires.
- [x] Tests : `DigestUnsubscribeTest` (neuf), `NotificationDigestMailTest` et `SignatureRelativeTest`
      (le GET n'écrit plus), test du composant, métadonnées de la page, compte des pages publiques.

## Critères d'acceptation

- [x] AC1 — un GET de l'ancien lien n'écrit rien et mène à `/<langue>/notifications/unsubscribe?user=…&expires=…&signature=…`.
- [x] AC2 — le POST signé coupe le résumé ; sans signature ou après 60 jours, 403 ; un GET, 405.
- [x] AC3 — le résumé porte `List-Unsubscribe: <…/api/notifications/digest/unsubscribe/…>` et
      `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, et son lien visible vise la page du front.
- [x] AC4 — la page n'appelle rien au rendu, un POST au clic ; un lien hors forme ou refusé rend
      « lien invalide ».

## Hors périmètre

- La base `config('app.frontend_url', config('app.url'))` du bouton « voir tout » de la vue du
  résumé : P97.05.

## Notes d'implémentation

- Ablation API : GET qui réécrit `off` → `test_un_get_du_lien_deja_envoye…` rouge ; `headers()`
  renommée → `test_le_resume_annonce…` rouge ; remis → 7/7.
- Ablation front : contrôle de forme de la signature retiré → 1 rouge sur 9 ; remis → 9/9.
- `check-i18n-namespaces.mjs --update` resserre aussi deux plafonds (`onboarding`,
  `super-admin` 46 → 45) : remis à la main, un seuil n'est pas à changer ici.
- Les liens sont bâtis dans le Mailable, à l'envoi : un résumé mis en file avant ce ticket (avec
  l'ancien constructeur) part avec les liens neufs, la propriété mémo ayant une valeur par défaut.
