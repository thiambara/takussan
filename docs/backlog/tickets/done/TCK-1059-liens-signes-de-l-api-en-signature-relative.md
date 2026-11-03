---
id: TCK-1059
title: "Les liens signés qui restent sur le domaine de l'API sont signés en relatif : leur validité ne dépend plus de Traefik dans `TRUSTED_PROXIES`"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: [TCK-1058]
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#toute-url-signée-absolue-nest-valide-que-si-ladresse-de-traefik-figure-dans-trusted_proxies-et-aucune-sonde-ne-relie-les-deux"
tags: [back, media, proxies, notifications, sms, pistes]
---

## Objectif utilisateur

Un fichier privé, un lien de désabonnement du résumé, un accusé LAfricaMobile, une pièce KYC ou
l'export d'un rapport s'ouvrent même si la valeur de `TRUSTED_PROXIES` d'un environnement oublie
l'adresse de Traefik : un oubli de configuration ne rend plus 403 sur tous ces liens.

## Contexte

Réf : **P73.02** du fichier de pistes, `validé` par le porteur (critères V5 et V6 accordés).

Traefik termine TLS et parle `http` à l'API. Une signature absolue porte le schéma : elle n'est
valide que si l'API croit le `X-Forwarded-Proto: https` de Traefik, donc si son adresse est dans
`TRUSTED_PROXIES`. Mesuré avant correctif (garde ci-dessous) : une URL émise sous
`https://api-publique.example`, présentée en `http` depuis `198.51.100.7` avec
`X-Forwarded-Proto: https`, rend **403** sur les cinq routes du lot.

## Décision du porteur

> (a) signer en relatif (`absolute: false` à l'émission, `signed:relative` ou `hasValidSignature(false)` à la vérification) les liens qui restent sur le domaine de l'API ; test : une URL signée hors requête, présentée depuis une adresse hors de `TRUSTED_PROXIES`, reste valide (porteur, 2026-10-20)

## Hypothèses (mode sans humain)

- L'URL émise reste **absolue** pour son lecteur (courriel, navigateur, LAfricaMobile) : la
  signature porte sur le chemin relatif, puis `URL::to()` y met la racine d'`APP_URL` (TCK-1058).
  `App\Support\RelativeSignedUrl` le fait en un seul endroit.
- Les liens déjà émis en absolu avant ce changement ne passent plus la vérification relative :
  liens de désabonnement des résumés déjà envoyés (sans échéance), accusés LAfricaMobile en vol
  (7 jours), pièces jointes signées. Aucune production n'a encore servi (CLAUDE.md racine) ; seule
  la préproduction est concernée.
- Le lien de l'export du journal d'audit (`activity-logs.export.download`) n'est pas traité : la
  PR #804 (P63.01) réécrit ses trois fichiers (`ActivityLogExportController`,
  `CrossTenantAuditController`, `ExportActivityLogJob`), et les toucher ici ferait un conflit.

## Delta à produire

- [x] `App\Support\RelativeSignedUrl::temporary()` / `forever()`.
- [x] Émission relative : `PrivateMediaAccess::signedUrl()`, `NotificationUnsubscribeController::signedUrl()`
  (extrait de `BuildUserDigestJob`), `LAfricaMobileSmsDriver::buildReturnUrl()`,
  `KycDossierResource` (`signed_url`), `ReportExportDownloadController::signedUrl()`.
- [x] Vérification relative : `signed:relative` sur `media.private.show`,
  `notifications.unsubscribe`, `report-exports.download` et le rappel LAfricaMobile ;
  `hasValidSignature(false)` dans `KycDocumentController`, `hasValidSignatureWhileIgnoring(…, false)`
  dans `LAfricaMobileSmsStatusController`.
- [x] Tests qui fabriquaient des URL absolues pour ces routes : reportés sur `RelativeSignedUrl`.
- [x] Garde : `Tests\Support\UrlSigneeDerriereTraefik` et un test par route.

## Critères d'acceptation

- [x] AC1 — pour chacune des cinq routes, une URL émise par son vrai émetteur sous une racine
  `https`, présentée en `http` depuis une adresse hors de `TRUSTED_PROXIES`, est servie.
- [x] AC2 — les refus existants (signature absente, retouchée, expirée ; autre média ; autre
  demandeur) restent des refus.

## Reste à faire

- La signature relative du lien d'export du journal d'audit (`activity-logs.export.download`), une
  fois #804 fusionnée.

## Hors périmètre

- La sonde `proxies` qui rougirait sur une requête de Traefik vue en `http` (l'autre voie de la
  piste, non retenue par la décision).
- Les liens signés déjà relatifs (`verification.verify`, `saved-searches.unsubscribe`).

## Notes d'implémentation

- Ablation : émission et vérification remises en absolu (`RelativeSignedUrl` en `absolute: true`,
  routes en `signed`, contrôleurs en `hasValidSignature()`) → les 5 gardes rougissent en 403, les
  25 autres tests des quatre classes restent verts ; remises en relatif → 30 verts.
- Une URL signée en relatif échoue à une vérification absolue, et l'inverse aussi : émission et
  vérification changent ensemble, et `PrivateMediaAccessTest` comme `DepositRefundAttachmentLinksTest` vérifient désormais en
  relatif.
