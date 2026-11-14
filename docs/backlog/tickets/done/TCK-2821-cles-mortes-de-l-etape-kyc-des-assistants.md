---
id: TCK-2821
title: "Les clés mortes `owners.onboarding.steps.kyc` et `agents.onboarding.steps.kyc` quittent le dictionnaire"
status: done
phase: P3
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models: []
tags: [front, dette, code-mort, i18n, kyc, onboarding, audit-ux, app]
---

## Objectif utilisateur

Aucun effet visible. Le dictionnaire ne porte plus le texte d'une étape « Vos pièces justificatives » que plus aucun
assistant ne montre, et un test ne garde plus un texte que personne ne lit.

## Origine

Relevé de l'implémentation de TCK-2799 (accueil-2799), 2026-11-14. L'étape KYC a quitté les assistants du bailleur et
de l'agent (les pièces se déposent dans « Vos pièces »). Ses textes sont restés sous `owners.onboarding.steps.kyc` et
`agents.onboarding.steps.kyc`, en `fr`, `en` et `wo`.

TCK-2796 retire `KycUploader` et les sous-arbres `<rôle>.onboarding.kyc` qu'il lisait seul. Il écarte explicitement
`…onboarding.steps.kyc`, que `KycUploader` ne lisait pas : ce ticket les prend.

## Contrat de données

Aucun endpoint touché.

**Lecteurs relevés au 2026-11-14** (`grep` littéral sur `takussan-web/src`) : aucun composant. Trois tests seulement :

| Fichier | Ce qu'il lit | Sort |
|---|---|---|
| `src/components/onboarding/__tests__/kyc-sans-promesse-de-revue.test.ts` | `submittedBadge` et `submittedBody` des deux sous-arbres, dans les trois langues (garde de TCK-685 : aucune promesse « votre agence va le vérifier ») | supprimé avec les clés ; la règle de TCK-685 se garde sur le texte vivant de « Vos pièces » si aucune garde ne la tient déjà (à vérifier) |
| `src/components/onboarding/__tests__/AgentOnboardingWizard.test.tsx:128-129` | `steps.kyc.submitCta` et `licenseNumberLabel`, pour affirmer leur ABSENCE de l'assistant | l'absence s'affirme par le texte littéral, ou par l'absence de tout champ fichier |
| `src/components/onboarding/__tests__/OwnerOnboardingWizard.test.tsx:133` | `steps.kyc.submitCta`, pour affirmer son absence | idem |

## Contraintes strictes

- **Avant toute suppression, re-vérifier les lecteurs dynamiques** : un `t(\`steps.${…}\`)` sous `owners.onboarding` ou
  `agents.onboarding` (ou un `useTranslations` qui compose le chemin) échappe au `grep` littéral. Lister dans le ticket ce
  qui a été cherché et trouvé, PUIS supprimer.
- Parité `fr` / `en` / `wo` gardée ; `node scripts/check-i18n.mjs` et `check-i18n-namespaces` verts (`--update` si une
  frontière perd des clés).
- Un brouillon d'assistant qui porte encore une étape `kyc` (`OwnerOnboardingWizard.test.tsx:197`, reprise à l'écran 2)
  continue de reprendre : ce ticket ne touche que le dictionnaire et les tests.

## Delta à produire

- [x] Inventaire des lecteurs (littéraux et dynamiques) écrit dans le ticket (« Notes d'implémentation »).
- [x] Retrait de `owners.onboarding.steps.kyc` et `agents.onboarding.steps.kyc` de `fr.json`, `en.json`, `wo.json` ;
  `src/i18n/namespaces.json` régénéré si besoin.
- [x] Les trois tests réécrits ou retirés comme dit au tableau.

## Critères d'acceptation

- [x] AC1 — `rg "steps\.kyc" takussan-web/src` ne rend plus rien, hors du test de garde ci-dessous.
  *Preuve : `grep -rn "steps\.kyc" takussan-web/src` → une seule ligne, le commentaire d'en-tête de `kyc-sans-promesse-de-revue.test.ts`.*
- [x] AC2 — Les tests des assistants du bailleur et de l'agent affirment toujours l'absence de l'étape de pièces (un
  assistant qui remonterait un champ fichier ou « Envoyer mes pièces » les fait rougir — ablation).
  *Preuve : absence affirmée en clair (`queryByText(/Envoyer mes pièces/i)`, `queryByLabelText(/carte professionnelle/i)`,
  `input[type="file"]`). Ablations dans `invite/AssistantDInvite.tsx` : un `<input type="file">` → 2 rouges (bailleur,
  agent) ; un bouton « Envoyer mes pièces » → 2 rouges ; md5 restauré.*
- [x] AC3 — Aucun `MISSING_MESSAGE` au navigateur sur `/onboarding/owner` et `/onboarding/agent`, à chaque étape.
- [x] AC4 — La règle de TCK-685 (aucune promesse de revue) reste gardée quelque part, ou le ticket écrit pourquoi elle
  n'a plus d'objet.
  *Preuve : elle a toujours un objet (`OwnerProfileController` et `AgentProfileController` : « no queue reads this
  dossier »). `kyc-sans-promesse-de-revue.test.ts` la garde désormais sur le texte vivant — `pieces` (hors `pieces.etats`,
  état rapporté par le serveur), `owners.onboarding`, `agents.onboarding`, en fr/en/wo — par motifs de promesse.
  Ablation : `pieces.enAttendant` → « Votre agence va les vérifier sous 48 h. » → `fr · pieces` rouge ; md5 restauré.*

## Notes d'implémentation

**Inventaire des lecteurs au 2026-11-14 (HEAD de `feat/audit-ux-app-lot-3`), avant suppression :**

- Littéral : `grep -rnE "steps\.kyc" takussan-web/src` → les trois tests du tableau, aucun composant.
- Dynamique : `grep -rnE "steps\.\$\{|\`steps\.|onboarding\.\$\{|\.steps\["` → `PropertyWizard.tsx:960`
  (`property.wizard`) et `MiseEnService.tsx:85,96` (`dashboard.agencySetup`), hors sujet. Aucun `t()` à clé non
  littérale dans `OwnerOnboardingWizard.tsx` ni `AgentOnboardingWizard.tsx`.
- Espaces : `useTranslations('owners.onboarding')` et `('agents.onboarding')` n'existent que dans les deux assistants ;
  `agents.onboarding.steps.{specialization,welcome}` (ZoneMultiSelect, ProspectDeLAgent) ne lisent pas `kyc`. Aucun
  `useTranslations('owners'|'agents')` nu, aucune forme `{ namespace: … }`.
- Accès objet : `frMessages.<rôle>.onboarding.steps.kyc` dans les deux tests d'assistant seulement.

Retrait chirurgical (les trois dictionnaires portent des changements d'autres tickets) : 10 lignes par sous-arbre et
par langue, diff de pure suppression ; `check-i18n-namespaces` vert sans `--update`, parité intacte.

AC3 n'est pas relevé au navigateur : aucun lecteur n'existe (inventaire ci-dessus) et les tests des deux assistants
rendent leurs écrans avec le vrai `fr.json`.

## Hors périmètre

- `KycUploader` et les sous-arbres `<rôle>.onboarding.kyc` (TCK-2796).
- `serviceProviders.onboarding.steps` : il n'a pas de sous-arbre `kyc`.

### Relevé au navigateur (2026-11-14, CDP direct, 1280 px, base de démo en lecture seule)

- Aucun compte de démo n'a de profil `draft` : `/onboarding/owner` et `/onboarding/agent` renvoient vers `/app`. Les pages ont été ouvertes par le lien de reprise `?owner=1` / `?agent=1` avec les personas `proprietaire` et `agent` (profils `active`, lecture seule).
- fr ET en : écran 1 « Vérifiez votre numéro » / « Check your number » rendu pour les deux assistants, zéro `MISSING_MESSAGE` / `IntlError`, aucune clé brute. Seules erreurs console : deux 404 de ressource, sans lien avec l'i18n.
- L'écran 2 ne s'atteint que numéro vérifié (`phone_verified_at`) : « Recevoir le code » envoie un SMS réel et le brouillon s'écrit côté serveur. Non parcouru.
- AC3 laissé non coché : écran 1 seulement. Pour l'écran 2, il faut un compte de démo au téléphone déjà vérifié avec un profil `draft` (une écriture à demander à la session).

### Suite du relevé (2026-11-14, écritures de démo autorisées par la session)

- AC3 tenu : les deux écrans de chaque assistant, fr ET en, zéro `MISSING_MESSAGE`/`IntlError`, aucune clé brute. Bailleur (`/onboarding/owner?owner=39`, compte 202, numéro vérifié) : « Vos biens chez … » / « Your properties with … ». Agent (`/onboarding/agent?agent=24`, compte 202) : « Bienvenue dans l'équipe » / « Welcome to the team ». Écran 1 (numéro) relevé plus haut.
- Constat : `GET /api/me/profiles` ne rend que les profils `active` (`MeProfilesController::isActive`), donc l'assistant ne se monte, par `profilAReprendre`, que sur un profil désigné par `?owner=` / `?agent=` ; le cas `draft` de la page n'est pas atteignable par cette liste. À juger hors de ce ticket.
- Lignes écrites en démo : `users` 201 et 202 et leurs profils (voir TCK-2771) ; `agent_profiles` 24 (compte 202, agence 1, créé en `draft` puis passé `active`) ; `owner_profiles` 38 passé `draft` puis remis `active` ; `personal_access_tokens` 101 et 102.
