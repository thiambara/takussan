---
id: TCK-531
title: "Trois cases de consentement obligatoires renvoient à des pages légales qui n'existent pas (404)"
status: todo
phase: P1
family: bug
estimate: M
wave: 65
created: 2026-09-16
updated: 2026-09-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#13-réservations-courte-durée--visites
  models: []
tags: [front, public, légal, consentement, décision-produit]
---

## Objectif utilisateur

Qu'une personne à qui l'on demande d'accepter les conditions générales et la politique de
confidentialité puisse les lire avant de cocher.

## Contrat de données

Relevé le 2026-09-16 pendant la revue design (groupes B et C), par `curl -L` sur `next dev` :
`/terms` → `/fr/terms` **404**, `/privacy` → `/fr/privacy` **404**, `/legal/cgu` →
`/fr/legal/cgu` **404**. Aucune route de `takussan-web/src/app` ne porte ces pages (la seule
« privacy » est `/app/account/privacy`, des réglages de compte).

Liens qui y pointent, chacun dans le libellé d'une case **obligatoire** :

- `takussan-web/src/app/(auth)/auth/register/page.tsx` — inscription ;
- `takussan-web/src/components/onboarding/HostIndividualWizard.tsx` — récapitulatif de
  `/onboarding/host` ;
- `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyReservationDialog.tsx`
  — demande de réservation depuis la fiche.

Les trois cibles ne concordent même pas entre elles (`/terms`, `/legal/cgu`, `/privacy`).
TCK-437 avait déjà écarté ces pages faute de spec (« une surface produit à spécifier avant d'être
ticketée ») ; elles ne sont toujours pas décrites dans `docs/features.md`.

## Contraintes strictes (métier)

1. **Aucun texte juridique n'est rédigé par un agent.** Les textes (CGU, politique de
   confidentialité, mentions légales) sont fournis par le porteur du produit, en fr — et en
   décidant si en/wo sont des traductions faisant foi ou de courtoisie.
2. Une seule URL canonique par document, localisée (`/[locale]/…`), citée par les trois cases.
3. Retirer un lien ou décocher l'obligation n'est pas une correction : cela change la nature du
   consentement.

## Delta à produire

- [ ] `docs/features.md` : décrire les pages légales publiques (section et URLs) — `/write-spec`
      ou `/sync-specs` avant le code.
- [ ] Pages publiques sous la coque publique, en mode lecture (charte « Ancrage Local
      Contemporain »), texte fourni.
- [ ] Les trois liens pointent vers les URL canoniques ; le pied de page public les porte.
- [ ] Une garde ou un test qui rougit si un lien de consentement vise une route inexistante.

## Critères d'acceptation

- [ ] AC1 — Chacune des trois cases mène à une page **200** qui rend le texte fourni, dans les
      trois locales.
- [ ] AC2 — Les trois cases citent les **mêmes** URL canoniques.
- [ ] AC3 — Le test ou la garde de fraîcheur rougit si l'on remet `/terms` (ablation notée).

## Hors périmètre

- La conservation de la preuve de consentement (version du texte acceptée, horodatage) — à
  spécifier séparément si elle est exigée.
- Les pages institutionnelles (à propos, contact).

## Notes d'implémentation

_(à remplir par implementing-specs)_
