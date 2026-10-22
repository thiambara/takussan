---
id: TCK-1170
title: "Le registre des intégrations ne sert plus de fournisseur qu'aucun pilote ne lit"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-98--écrans-décriture-de-la-console-super-admin--ce-quils-changent-hors-de-la-console"
tags: [back, integrations, super-admin, pistes]
---

## Contexte

Réf : **P98.07** du fichier de pistes, `validé` (V7 accordé : une entrée visible quitte la
console).

Décision du porteur : « validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

`MailProvider` (`mail`) et `SmsProvider` (`sms`) étaient au registre des intégrations, avec un
« Test » qui pouvait sortir `healthy`, alors qu'aucun envoi ne lit leur ligne : le courriel lit
`MAIL_*`, le SMS les clés `sms_*`. `stripe` est rangé en paiements sans pilote.

## Objectif utilisateur

La console ne propose plus de configurer un fournisseur dont la configuration n'a aucun effet.

## Delta à produire

- [x] `mail` et `sms` retirés du registre ; `MailProvider` et `SmsProvider` supprimés.
- [x] Garde `IntegrationRegistryReadersTest` : chaque clé du registre est lue par un pilote
      (paiements : `PaymentGatewayService::DRIVERS` ; messagerie : les quatre pilotes qui nomment
      leur clé), sauf les exemptions écrites avec leur raison.

## Critères d'acceptation

- [x] AC1 — `mail` et `sms` ne sont plus des clés du registre : une intégration neuve sous ces
      clés est refusée par `StoreIntegrationRequest` (`Rule::in` sur les clés du registre).
- [x] AC2 — une clé ajoutée au registre sans pilote fait rougir la garde.

## Hors périmètre

- `stripe` (reste) : `features.md` § 1.5 garde sa fiche au registre ; le sortir, ou le sortir
  des fournisseurs critiques de la sonde, reste au porteur. Exempté dans la garde, avec cette raison.
- `mailgun` (reste) : aucun pilote ne lit sa ligne non plus, mais l'écran d'intégrations de
  l'agence (`IntegrationsManager`) le propose ; hors du constat de P98.07, exempté avec sa raison.
- Les lignes `integrations` déjà enregistrées sous `mail` ou `sms` : rien n'est supprimé (V4) ;
  elles restent lisibles par le schéma générique de `IntegrationProviderRegistry::get()`.
- Une mention « non branché » à l'écran (texte neuf).

## Notes d'implémentation

- Choix : « retirer du registre ce qu'aucun pilote ne lit », la plus étroite des deux voies (aucun
  texte neuf), appliquée à `mail` et `sms` seuls.
- Ablation : registre, `MailProvider` et `SmsProvider` rendus à `pre-dev` → 1 rouge sur 3
  (« `sms` est au registre, mais aucun pilote ne lit sa ligne ») ; correctif remis → 3/3.
  `IntegrationAdminTest` (dont le test d'une ligne `sms` existante), `IntegrationTest`,
  `IntegrationUniquenessTest`, `IntegrationStoreValidationTest`, `HealthcheckProbesTest`,
  `PaymentDriverCredentialsTest`, `MessagingDriverCredentialsTest` verts.
