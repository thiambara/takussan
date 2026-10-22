---
id: TCK-1243
title: "Le désabonnement du résumé par courriel passe par une page qui confirme et un `POST` signé, annoncé par `List-Unsubscribe`"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-97--liens-daction-des-courriels--page-visée-authentification-hôte"
tags: [back, front, notifications, digest, pistes]
---

## Contexte

Réf : **P97.06** du fichier de pistes, `validé` (V7 accordé : page et parcours neufs).

`GET notifications/unsubscribe/{user}` passait `email_frequency` à `off` dès l'ouverture du lien,
signé sans échéance ; le résumé n'annonçait pas `List-Unsubscribe`, et la redirection finale
(`/app/profile/notifications?unsubscribed=1`) n'était lue par rien. Les alertes de recherche
suivent déjà le modèle d'ADR-0050 (page à un bouton, `POST` signé de 60 jours, en-têtes RFC 8058).

## Décision du porteur

« validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

**Choix retenus**, là où la piste laisse des voies :

- **l'échéance** : 60 jours, celle des alertes de compte d'ADR-0050 (la piste dit « aligner le
  résumé sur le modèle des alertes ») ;
- **les liens déjà envoyés** (signés sans échéance, sur la route `GET`) : ils restent valides et
  mènent à la page de confirmation, avec un lien neuf de 60 jours, **sans rien écrire** — la voie la
  plus étroite, recommandée par la ligne du délégué ; les refuser couperait le seul moyen de se
  désabonner qu'ont les courriels déjà reçus ;
- **la page** : `/[locale]/notifications/unsubscribe`, sœur de `/[locale]/search-alerts/unsubscribe`,
  sous la langue préférée du destinataire (`fr` à défaut) ; ses libellés vivent sous
  `search.alertPages.digest`, espace déjà servi à la frontière `(public)`, et reprennent les libellés
  communs (lien invalide, échec, retour) ;
- **le plafond** du `POST` : `throttle:public-search-alert`, celui du désabonnement des alertes,
  sans limiteur neuf.

## Objectif utilisateur

Ouvrir le lien du résumé ne désabonne plus : la personne confirme d'un bouton, et l'écran le lui
dit. Son client de messagerie peut aussi la désabonner en un clic.

## Contrat de données

- `POST /api/notifications/digest/unsubscribe/{user}?expires=…&signature=…` (signé relatif,
  60 jours) → 200 `{ data: { email_frequency: "off" } }`, idempotent ; 403 sur signature fausse,
  expirée ou pour un autre compte ; un `GET` rend 405.
- `GET /notifications/unsubscribe/{user}?signature=…` (inchangé dans sa forme) → 302 vers la page
  du front, sans écrire.

## Contraintes strictes (métier)

- Aucun `GET` n'écrit.
- La page n'appelle l'API que sur un clic.

## Delta à produire

- [x] `NotificationUnsubscribeController` : `liens()` (page + en un clic), `__invoke` sans écriture,
  `unsubscribe()` en `POST` ; route `notifications.digest.unsubscribe`.
- [x] `BuildUserDigestJob`, `NotificationDigestMail` : lien visible vers la page,
  `List-Unsubscribe` et `List-Unsubscribe-Post`.
- [x] Front : page, `DigestUnsubscribeAction`, `lib/queries/digest-unsubscribe.ts`, clés `fr`/`en`
  (`wo` = texte français, wolof en pause).
- [x] Tests : `NotificationDigestMailTest` (10 cas neufs ou réécrits), `SignatureRelativeTest`
  (le `POST` derrière Traefik), `DigestUnsubscribeAction.test.tsx`.

## Critères d'acceptation

- [x] AC1 — un `GET` du lien déjà envoyé laisse `email_frequency` inchangé et mène à la page.
- [x] AC2 — le `POST` signé coupe le résumé ; expiré à 61 jours, sans signature ou pour un autre
  compte → 403.
- [x] AC3 — le courriel porte `List-Unsubscribe: <POST signé>` et
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- [x] AC4 — la page n'appelle rien au rendu, `POST` au clic ; lien hors forme ou 403 → « lien
  invalide ».

## Hors périmètre

- L'effet réel des analyseurs de liens (non mesuré, comme dans la piste).
- `takussan-web/src/components/home/Footer.tsx` cite encore la route `GET` dans un commentaire
  historique.

## Notes d'implémentation

- Ablation API : l'écriture remise dans le `GET` et l'en-tête `List-Unsubscribe-Post` retiré → 2
  rouges (`le_get_du_lien_deja_envoye…`, `le_resume_annonce…`), remis → 18/18.
- Ablation front : le chemin d'API de `unsubscribeDigest` changé → 1 rouge, remis → 9/9.
- `SaisieDansLesEmailsTest` construisait le Mailable avec trois arguments : il reçoit le lien en un
  clic.
