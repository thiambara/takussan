---
id: TCK-2796
title: "Le téléverseur des anciens assistants (`KycUploader`) n'a plus de montage : le retirer avec ses gardes, sans perdre ce qu'elles tiennent"
status: done
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-14
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

- [x] Inventaire écrit dans le ticket : fichiers qui citent `KycUploader`, clés i18n que lui seul lit.
- [x] Chaque propriété du tableau reportée sur `VosPieces` (ou constatée déjà tenue, avec le test qui la tient).
- [x] Suppression de `KycUploader.tsx` et de ses deux tests propres ; des clés mortes.
- [x] Commentaires de renvoi réécrits.

## Critères d'acceptation

- [x] AC1 — `grep -rn "KycUploader" src` ne rend plus que le cas d'épreuve de `i18n-namespaces-scan.test.ts`.
  Preuve (2026-11-14, après suppression et réécriture des commentaires) : `rg -n KycUploader takussan-web/src` →
  `src/i18n/__tests__/i18n-namespaces-scan.test.ts:80` et `:81`, rien d'autre.
- [x] AC2 — Ablation : retirer `MAX_BYTES`, l'`accept` ou la réduction de photo de `VosPieces` fait rougir une garde. Une garde
  qui ne citait que le composant supprimé ne suffit pas.
  Preuve (2026-11-14, 12 mutants, tous ROUGES, fichiers restaurés au md5) : `TAILLE_MAX` à 9 Mo ou renommée →
  `seuils-de-saisie.parity` ; refus de taille retiré → `vos-pieces.tck-2614` (8 Mo) ; chacun des trois `accept` en
  `image/*`, un à la fois → `accept-des-televersements.parity.tck-1888` (lu dans la source) et `vos-pieces` (rendu) ;
  erreur d'envoi sans `messageCorpsErreurBff` → 4 cas d'erreur ; « Vérifiée » en ton `info` ou en `bg-emerald-100`
  → `vos-pieces`. ⚠ **Réduction de photo** : `VosPieces` n'en a pas, et la garde (TCK-542) tient l'inverse — une pièce
  part telle quelle. `VosPieces.tsx` et `lib/queries/pieces.ts` entrent dans `PIECES_JUSTIFICATIVES` ; l'ablation est
  donc d'AJOUTER un import de `reduire-photo` (à chacun des deux) → `reduire-photo.branchement` rouge.
- [x] AC3 — Les trois assistants (`OwnerOnboardingWizard`, `AgentOnboardingWizard`, `ServiceProviderOnboardingWizard`) ne
  montent aucun champ fichier. Cette absence reste gardée.
  Preuve : `components/onboarding/__tests__/assistants-sans-champ-fichier.tck-2796.test.ts` lit chaque assistant ET ses
  étapes locales (`./invite/…`, de proche en proche, témoins compris) et refuse `type="file"`, `KYC_MIME_ACCEPT`,
  `envoyerLaPiece`/`kyc/upload` et l'import d'un téléverseur connu. Ablation : `<input type="file" />` posé dans
  `invite/BiensDuBailleur.tsx` → rouge.
- [x] AC4 — Prestataire actif de la démo, `/app/pieces` : la pièce d'identité (requise) et l'assurance (facultative) s'y
  listent et s'y envoient. Relevé au navigateur, réseau compris.
  Relevé (2026-11-14, Chrome sans tête par CDP, 390 px, persona `prestataire`). ⚠ Le script POSE le cookie
  `active_profile_id=service_provider:1` : sans lui, ce compte de démo (`meta.active_profile_id` nul) voit « Aucune pièce
  à fournir pour cet espace », alors que `GET /api/me/pieces` sous `X-Profile-Id: service_provider:1` rend `cni`
  requise et `insurance` facultative. Avec le cookie :
  `GET /api/me/pieces` 200 ; « Pièce d’identité » « À fournir » (ton `neutral`), « Assurance RC pro » « Facultative »,
  deux champs fichier chacune, en-tête « 0 sur 1 ». Un PDF factice préparé sur l'assurance → « rc-factice.pdf · prête à
  envoyer » ; « Envoyer mes pièces » émet `POST /api/me/profiles/1/kyc/upload` en `multipart/form-data`, **bloqué par
  l'inspecteur avant le serveur**. 201 non relevé, décision team-lead : aucune écriture en base pour un retrait de code
  mort. Relevé et capture conservés hors du dépôt (dossier de travail de la session).
- [x] AC5 — `npm run check:i18n`, `check-i18n-namespaces`, `tsc --noEmit`, `npm run lint` : aucun écart neuf.
  Preuve : `check-i18n-namespaces` vert (50 frontières) ; `check:i18n` : 105 écarts, tous sous
  `playground/maquettes/` (maquettes locales, ignorées par git) ; `tsc --noEmit` : aucune erreur dans `src/` (seules
  celles de `.next/types`, périmé) ; ESLint propre sur les fichiers touchés.

## Hors périmètre

- L'écran « Vos pièces » lui-même (TCK-2614).
- Les endpoints d'envoi côté API.

## Notes d'implémentation

### Inventaire (2026-11-14, avant toute suppression)

**Aucun montage.** `rg -n "<KycUploader|from '@/components/kyc/KycUploader'|from '\.\./KycUploader'" takussan-web/src`
hors `__tests__` → rien. Les seuls importeurs sont trois tests : `KycUploader.erreurs`, `KycUploader.pastille-tck-385`
et `accept-des-televersements.parity.tck-1888`. `rg "kyc-uploader-|kyc-remove-"` (ses `data-testid`) → le composant seul.

**Fichiers qui citent le nom** (`rg -n KycUploader` sur le dépôt, `docs/` exclus) :

| Fichier | Nature | Sort |
|---|---|---|
| `takussan-web/src/components/kyc/KycUploader.tsx` | le composant | supprimé |
| `…/kyc/__tests__/KycUploader.erreurs.test.tsx` | 6 cas d'erreur d'envoi | supprimé, porté sur `VosPieces` |
| `…/kyc/__tests__/KycUploader.pastille-tck-385.test.tsx` | absence dans les assistants, ton de la pastille, pas de vert Tailwind | supprimé, porté (garde des assistants + `VosPieces`) |
| `…/console/__tests__/StatusBadge.contraste-tck-450.test.tsx:157` | site de la surface `bg-muted/30` sur `--background` | site réel : `onboarding/HostIndividualWizard.tsx:481` |
| `…/lib/__tests__/reduire-photo.branchement.test.ts:31` | pièce justificative qui ne réduit pas | `pieces/VosPieces.tsx` + `lib/queries/pieces.ts` |
| `…/lib/__tests__/seuils-de-saisie.parity.test.ts:92` | `MAX_BYTES` = `AcceptedUploads::kyc(8192)` | `TAILLE_MAX` de `VosPieces.tsx` |
| `…/lib/queries/__tests__/accept-des-televersements.parity.tck-1888.test.tsx` | `accept` = `KYC_MIMETYPES` | import de `kyc-mime-accept`, et chaque champ fichier de `VosPieces` |
| `…/i18n/__tests__/i18n-namespaces-scan.test.ts:80` | chaîne d'épreuve du dérivateur | **gardé** |
| `scripts/check-super-admin-tokens.mjs:1583,1638` | périmètre `file` ET témoin de l'espace « assistants d'onboarding » | périmètre retiré ; témoin remplacé par `app/onboarding/host/page.tsx` (fichier vivant de l'espace), plancher inchangé (8) |
| commentaires : `VosPieces.tsx:41`, `QuoteSubmitForm.tsx:99`, `lib/queries/pieces.ts:34`, `kyc-mime-accept.ts:6`, `lib/api.ts:588`, `scripts/i18n-namespaces-scan.mjs:250`, `scripts/check-super-admin-tokens.mjs:372,1553,1849`, `takussan-api/…/ServiceProviderProfileController.php:40` | renvois | réécrits |

**Clés que lui seul lit** : les sous-arbres entiers `owners.onboarding.kyc`, `agents.onboarding.kyc`,
`serviceProviders.onboarding.kyc` (`labels`, `hints`, `dropZone`, `uploading`, `uploadedBadge`, `removeAria`,
`errors.*`, `success.*`), en `fr`, `en` et `wo`. Aucun autre lecteur : les assistants lisent `<rôle>.onboarding` sans
jamais demander `kyc.…` (`rg "['\"\`]kyc\." src` → rien sous `onboarding`), et le seul lecteur dynamique est la prop
`i18nNamespace` du composant supprimé. `…onboarding.steps.kyc` n'est PAS lu par `KycUploader` : hors de ce ticket.

**Surfaces de la pastille de `VosPieces`** : `--card` (carte au téléphone, tableau au bureau), déjà mesurée par
`StatusBadge.contraste-tck-450`.
