---
id: TCK-1348
title: "Gabarits WhatsApp des codes : corps avec lien, et paramètres envoyés selon meta_variables"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#55-notificationtemplate--extension-whatsapp-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-132--liens-portés-par-les-sms-et-whatsapp--hôte-validité-page-ouverte"
tags: [api, whatsapp, gabarits, migration, pistes]
---

## Contexte

Réf : **P132.03** du fichier de pistes, `validé`.

La migration `2026_10_07_100100_…` tire le corps des gabarits WhatsApp de la variante `sms` (sans
lien) et numérote les variables selon `params()` ; `whatsappTemplateParams` envoie `params()` plus
`optionalParams()`. `lease_payment.due_soon` reçoit 4 paramètres pour 3 variables,
`lease_payment.overdue` saute `{{3}}`, et aucun gabarit ne porte le lien de paiement.
`meta_variables` n'est lu par personne.

## Décision du porteur

« validé — porteur (2026-10-22) : une migration neuve avec son `down()` réécrit les neuf lignes `whatsapp` (corps, `meta_variables` égal aux paramètres envoyés), `whatsappTemplateParams` lit `meta_variables`, avec la garde de la Piste »

Critère accordé : V4 (réécriture de lignes semées), et V7 (corps avec lien).

## Objectif

Chaque gabarit WhatsApp d'un code nomme exactement les paramètres que la notification envoie, et
porte le lien de paiement quand le code en a un.

## Delta à produire

- [x] Migration neuve `2026_10_22_150100_rewrite_whatsapp_templates_from_link_variant` : corps
      tiré de `sms_link` quand elle existe, sinon `sms` ; variables numérotées dans leur ordre
      d'apparition ; `meta_variables` les nomme dans cet ordre. `down()` rend la forme d'origine.
      `meta_status` intact.
- [x] `TemplateResolver::approved()` : la ligne que `resolve()` retient (repli compris).
- [x] `CodedNotification::whatsappTemplateParams` envoie les paramètres que nomme
      `meta_variables` de cette ligne, dans cet ordre.
- [x] Garde `WhatsappTemplateRegistryTest`.

## Critères d'acceptation

- [x] AC1 — Pour chaque ligne `whatsapp` d'un code : `{{n}}` contigus depuis 1, autant de noms
      dans `meta_variables`, tous connus du code.
- [x] AC2 — Un code qui porte un lien (`payment_url`) l'a dans son gabarit.
- [x] AC3 — La notification envoie autant de paramètres que le gabarit a de variables.

## Hors périmètre

- La soumission à Meta et le passage à `approved` : acte d'exploitation.
- Un rappel envoyé sans lien (aucun fournisseur de paiement en ligne) remplit la variable du lien
  par `—`, comme le rendu le fait de tout paramètre absent ; le choix d'un autre gabarit dans ce
  cas n'est pas tranché.
- La règle de Meta sur les variables non contiguës reste non vérifiée : la garde rend la question
  sans objet pour ces gabarits.

## Notes d'implémentation

- Les corps `wo` sont tirés des chaînes `wo` existantes de `lang/wo/notifications.php`
  (`sms_link`) : aucun texte wolof n'est écrit.
- Sans `meta_variables` (gabarit hors codes, ou ligne vide), l'ordre d'avant est gardé.
- Ablation : migration retirée → rouge (« le lien payment_url manque au gabarit ») ;
  `CodedNotification.php` remis à `HEAD` → rouge (« paramètres envoyés », 4 pour 3) ; les deux
  remis → vert. `ContactSansCompteTest`, `WhatsappChannelTest`, `LateWhatsappFailureSmsFallbackTest`,
  `NotificationTemplateOverrideTest` verts.
