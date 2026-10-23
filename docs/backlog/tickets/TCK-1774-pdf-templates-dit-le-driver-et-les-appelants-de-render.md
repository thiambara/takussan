---
id: TCK-1774
title: "docs/pdf-templates.md dit le driver déclaré et les appelants réels de render() (P140.04)"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  docs:
    - "docs/pdf-templates.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md"
tags: [docs, pdf, pistes]
---

## Objectif utilisateur

Qui lit `docs/pdf-templates.md` pour écrire un gabarit sait quel driver rend ses PDF et à quoi sert
`render()`, sans croire à un service de production ni à des pièces jointes qui n'existent pas.

## Contexte

Réf : **P140.04** du fichier de pistes (angle 140), `retenu · autonome` (A6).

Relu le 2026-10-23 sur b5e5b0401 :

- `docs/pdf-templates.md:78` : « `config/laravel-pdf.php` selects the driver. Production uses the
  cloudflare browserless service » — le fichier de configuration n'est pas publié (`ls config`),
  le défaut du paquet est `browsershot` (`vendor/spatie/laravel-pdf/config/laravel-pdf.php:12`),
  et `.env.example:261`, `.env.docker:320`, `deploy/takussan/.env.smoke.example:39` et
  `phpunit.xml:106` déclarent `dompdf` ; `docs/infra/hebergement.md:169` nomme la clé sans valeur.
- `docs/pdf-templates.md:10` : `render()` « emails attachments » — ses seuls appelants sont
  `LeaseSignatureService:67` (gel du contrat) et `PaymentReceiptPdf:48` (reçu de réservation), et
  aucun courriel n'attache de PDF (`grep -rln "attachData\|Attachment::fromData" app` → rien).

## Hypothèses (mode sans humain)

- La valeur de `LARAVEL_PDF_DRIVER` en préproduction n'est pas relevable depuis le poste : le
  document dit qu'elle n'est pas écrite dans le dépôt, sans la deviner.

## Delta à produire

- [x] `docs/pdf-templates.md` : la ligne `render()` du tableau et le § « Driver / environment ».

## Critères d'acceptation

- [x] AC1 — le document ne cite plus ni `config/laravel-pdf.php` comme fichier du dépôt, ni un
      service cloudflare en production, ni des pièces jointes de courriel.

## Reste à faire

- Garder ou retirer `store()` selon la décision de P140.02.

## Hors périmètre

- `docs/configuration.md` § 5.5 i) (« PDF (Cloudflare Browser Rendering, défaut) »), relevé par le
  mesureur hors du `Où`.

## Notes d'implémentation

- Correctif documentaire : aucun test automatisé ne le garde ; vérifié par relecture des sources
  citées ci-dessus.
