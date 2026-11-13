---
id: TCK-2796
title: "Le téléverseur des anciens assistants (`KycUploader`) n'a plus de montage : le retirer avec ses gardes, sans perdre ce qu'elles tiennent"
status: todo
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: [TCK-2613]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
tags: [front, dette, code-mort, pieces, kyc, suite-de-tck-2613, audit-ux, app]
---

## Objectif utilisateur

Aucun changement visible : les pièces s'envoient depuis « Vos pièces » (`/app/pieces`, TCK-2614), et c'est le seul
endroit où elles s'envoient. Le dépôt cesse de porter, et de tester, un second téléverseur que personne ne voit.

## Contrat de données

Aucun. Aucun endpoint ne change : `POST /api/me/{profiles|agent-profiles|owner-profiles}/{id}/kyc/upload` reste servi
et appelé par « Vos pièces » (`src/lib/queries/pieces.ts`).

## Direction UX / Artistique

Sans objet : rien ne se voit.

**Le constat, mesuré le 2026-11-13** (arbre de TCK-2613 L3, HEAD `b4f203c0b` + la livraison de TCK-2613) :
`grep -rl "<KycUploader" src` hors des tests ne rend **rien**. Les trois assistants d'onboarding le montaient
(bailleur, agent, prestataire). TCK-2613 les a passés à deux écrans, et les pièces partent dans « Vos pièces ». Le
composant (`src/components/kyc/KycUploader.tsx`, 260 lignes) ne vit plus que par ses tests et par des gardes qui le
citent.

**La pièce d'identité du prestataire n'est PAS perdue avec lui.** `PiecesDuProfil` prend les pièces du prestataire de
`UploadKycServiceProviderProfileRequest::KYC_KIND_TO_TYPE` : `cni` est requise, `insurance` facultative. « Vos pièces »
les montre et les envoie déjà. Ce ticket n'a donc pas à l'ajouter. Il le **vérifie** (AC4).

## Contraintes strictes (métier)

Ce que les gardes citées tiennent doit rester tenu, sur le chemin qui envoie vraiment. Le motif d'une suppression
n'est pas d'alléger une garde :

| Fichier qui cite `KycUploader` | Ce qu'il tient | Où le reporter |
|---|---|---|
| `src/components/kyc/__tests__/KycUploader.pastille-tck-385.test.tsx` | aucun assistant ne remonte un téléverseur ; le ton `success` de la pastille « fourni » | l'absence : une garde sur les trois assistants (ou la retirer si « Vos pièces » en tient une) ; le ton : la pastille de `VosPieces` |
| `src/components/kyc/__tests__/KycUploader.erreurs.test.tsx` | les erreurs de l'envoi dites à la personne | les erreurs de `VosPieces` (vérifier qu'un test les tient déjà) |
| `src/components/console/__tests__/StatusBadge.contraste-tck-450.test.tsx:157` | un site de contraste nommé | le site équivalent de `VosPieces`, ou retrait du site |
| `src/lib/__tests__/reduire-photo.branchement.test.ts:31` | la réduction de photo branchée sur chaque téléverseur | retirer l'entrée ; `VosPieces` doit y figurer |
| `src/lib/__tests__/seuils-de-saisie.parity.test.ts:92` | `MAX_BYTES` du front = la limite de l'API (`AcceptedUploads::kyc(8192)`) | la constante de `VosPieces` |
| `src/lib/queries/__tests__/accept-des-televersements.parity.tck-1888.test.tsx` | `accept` du champ fichier = types acceptés par l'API | `KYC_MIME_ACCEPT` vit dans `kyc-mime-accept.ts` : la parité se garde sur `VosPieces` |
| `src/i18n/__tests__/i18n-namespaces-scan.test.ts:80` | un cas d'épreuve du dérivateur (`useTranslations(i18nNamespace)` à valeur par défaut) | **garder le cas** : c'est une chaîne d'épreuve, pas un import |
| commentaires (`VosPieces.tsx:41`, `QuoteSubmitForm.tsx:99`, `lib/queries/pieces.ts:34`, `kyc-mime-accept.ts:6`) | des renvois | les réécrire sans le nom disparu |

- Les espaces `serviceProviders.onboarding.kyc`, `agents.onboarding.kyc`, `owner…kyc` : retirer les clés que seul
  `KycUploader` lisait. Vérifier chaque clé par `grep` avant de la retirer. Garder la parité `fr`/`en`/`wo` (wo = fr), et
  faire passer `check-i18n-namespaces` (`--update` si une frontière perd un espace).
- Ne rien supprimer avant l'inventaire : lister les fichiers et les clés touchés dans le ticket, PUIS supprimer.

## Delta à produire

- [ ] Inventaire écrit dans le ticket : fichiers qui citent `KycUploader`, clés i18n que lui seul lit.
- [ ] Chaque propriété du tableau reportée sur `VosPieces` (ou constatée déjà tenue, avec le test qui la tient).
- [ ] Suppression de `KycUploader.tsx` et de ses deux tests propres ; des clés mortes.
- [ ] Commentaires de renvoi réécrits.

## Critères d'acceptation

- [ ] AC1 — `grep -rn "KycUploader" src` ne rend plus que le cas d'épreuve de `i18n-namespaces-scan.test.ts`.
- [ ] AC2 — Ablation : retirer `MAX_BYTES`, l'`accept` ou la réduction de photo de `VosPieces` fait rougir une garde. Une garde
  qui ne citait que le composant supprimé ne suffit pas.
- [ ] AC3 — Les trois assistants (`OwnerOnboardingWizard`, `AgentOnboardingWizard`, `ServiceProviderOnboardingWizard`) ne
  montent aucun champ fichier. Cette absence reste gardée.
- [ ] AC4 — Prestataire actif de la démo, `/app/pieces` : la pièce d'identité (requise) et l'assurance (facultative) s'y
  listent et s'y envoient. Relevé au navigateur, réseau compris.
- [ ] AC5 — `npm run check:i18n`, `check-i18n-namespaces`, `tsc --noEmit`, `npm run lint` : aucun écart neuf.

## Hors périmètre

- L'écran « Vos pièces » lui-même (TCK-2614).
- Les endpoints d'envoi côté API.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
