---
id: TCK-496
title: "L'assistant hôte demande un mode de paiement que rien ne consomme, avant la première annonce"
status: done
phase: P2
family: front
estimate: S
wave: 56
created: 2026-08-30
updated: 2026-08-31
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#2-agency
tags: [front, onboarding, host, paiements, ux]
---

## Objectif utilisateur

Un particulier qui veut mettre son logement en ligne y arrive en trois étapes au lieu de quatre, sans
avoir à choisir un opérateur de paiement avant d'avoir la moindre annonce, ni la moindre réservation.

## Contrat de données

**La donnée collectée n'est lue par rien.** `HostIndividualOnboardingService::createAgency()` écrit
`settings.payment.preferred_provider` sur l'agence. Le docblock du service dit lui-même pourquoi :
*« no dedicated PaymentSetting model exists in V1 — full provider config is deferred to first booking
per ticket scope »*. On demande donc une préférence dont la configuration réelle est reportée au
premier encaissement, à une personne qui n'a pas encore d'annonce.

**Rien à créer côté API.** `settings` est une colonne JSON de `Agency` : le champ peut être écrit
plus tard par le chemin qui en a besoin, sans migration, sans endpoint neuf.

**Ce que l'assistant demande aujourd'hui**, dans l'ordre : le mode (particulier / professionnel) —
l'identité de l'espace et la vérification SMS — **le fournisseur de paiement** — le récapitulatif et
les CGU. Les trois autres étapes se défendent : le mode oriente la suite, l'OTP est une exigence de
sécurité (`features.md#21`, P1), les CGU sont un consentement.

## Direction UX / Artistique

**Ce qui est demandé doit servir à ce qu'on est en train de faire.** La personne est venue publier un
bien ; on lui demande par quel opérateur elle veut être payée. La question est légitime, son moment
ne l'est pas — elle se pose quand un premier encaissement se profile, où elle a un sens immédiat et
où la réponse sera plus juste.

**Trois étapes au lieu de quatre, et rien de perdu.** Le rail d'étapes de la coque (TCK-499) reflète
la longueur du parcours : une étape retirée s'y voit.

**Le défaut existant reste posé sans être demandé.** Une agence sans préférence n'est pas une agence
cassée : le premier encaissement pose la question, ou le réglage se change dans les paramètres.

Référence obligatoire : [`docs/design-guidelines.md`](../../design-guidelines.md).

## Contraintes strictes (métier)

1. **Aucune migration, aucun endpoint neuf.** La préférence vit déjà dans `Agency.settings`.
2. **Le contrat de l'endpoint d'onboarding reste compatible** : `payment_setting.preferred_provider`
   devient facultatif, il ne disparaît pas de la requête. Un brouillon repris qui le porte encore
   doit continuer de passer.
3. **Les brouillons en cours ne se cassent pas.** `WizardReprenable` reprend un brouillon serveur à
   son étape ; un brouillon enregistré à l'étape 3 de l'ancien parcours doit atterrir quelque part
   de valide, jamais sur un index d'étape qui n'existe plus.
4. **Aucune agence existante n'est modifiée.** Ce ticket change ce qui est demandé, pas ce qui a été
   enregistré.
5. **Le front possède le texte affiché** (principe non négociable n° 5) : `fr`, `en`, `wo`.

## Delta à produire

**Frontend — intentionnel**

- [x] L'étape « mode de paiement » quitte l'assistant hôte
- [x] Le récapitulatif ne mentionne plus un fournisseur qui n'a pas été choisi
- [x] Un brouillon enregistré sous l'ancien parcours reprend sans erreur
- [x] Tests : le parcours complet en trois étapes aboutit à un espace créé ; un brouillon à
      l'ancienne étape 3 reprend sans casse

**Backend — prescriptif**

- [x] `App\Http\Requests\Onboarding\HostIndividualOnboardRequest` — `payment_setting.preferred_provider`
      devient `nullable`
- [x] `App\Services\Onboarding\HostIndividualOnboardingService` — n'écrit la clé que si elle est
      fournie ; le docblock cesse de décrire une étape supprimée
- [x] Tests : `HostIndividualOnboardingTest` — une charge utile sans `payment_setting` aboutit ; une
      charge utile qui le porte encore aboutit aussi et l'enregistre

## Critères d'acceptation

- [x] **AC1** — L'assistant hôte compte trois étapes, et le rail les affiche toutes les trois.
- [x] **AC2** — Un parcours complet sans jamais nommer d'opérateur crée l'espace et mène à la
      publication.
- [x] **AC3** — Une charge utile portant encore `payment_setting.preferred_provider` est acceptée et
      la valeur est enregistrée : l'ancien contrat n'est pas cassé.
- [x] **AC4** — Un brouillon serveur enregistré à l'étape 3 de l'ancien parcours reprend sans erreur
      et sans perdre les réponses déjà données.
- [x] **AC5** — Aucune agence existante ne voit ses `settings` modifiés par ce ticket.
- [x] **AC6** — Suites back et front vertes ; Pint propre ; `npm run lint` et `npx tsc --noEmit`
      propres ; aucune chaîne affichée en dur hors dictionnaire.

## Hors périmètre

- Demander l'opérateur au premier encaissement : c'est le pendant de ce ticket et il relève du
  parcours de paiement, pas de l'onboarding. Non instruit ici.
- La création d'un modèle `PaymentSetting` — absente en V1, et ce ticket n'en fait pas émerger le
  besoin.
- L'étape OTP et l'étape CGU : toutes deux justifiées, aucune ne bouge.
- Le chemin « professionnel », qui renvoie vers le support et ne crée rien.

## Notes d'implémentation

**Back** — `payment_setting.preferred_provider` passe de `required` à `sometimes|nullable`, sans
quitter le contrat (AC3). `HostIndividualOnboardingService::createAgency()` n'écrit plus la clé que
si elle est fournie : la version précédente castait en `(string)` et posait donc `''` quand rien
n'était donné — *une préférence VIDE, indiscernable en aval d'un choix délibéré. Une valeur par
défaut fabriquée est un mensonge qui a l'air d'une donnée.*

⚠ **Facultatif ne veut pas dire libre** : un opérateur inconnu rend toujours 422
(`test_un_operateur_inconnu_reste_refuse`). C'est la garde qui sépare « on ne demande plus » de
« on ne valide plus ».

**Front** — l'étape quitte l'assistant, `HostWizardData` perd le champ, le récapitulatif perd sa
ligne, et les clés i18n mortes (`steps.payment.*`, `recap.rows.paymentProvider`) sont retirées des
trois locales.

**AC4 tient par un mécanisme qui existait déjà, et la mesure le confirme.**
`WizardReprenable` restaure l'étape par `setStepIndex(Math.min(draft.step, steps.length - 1))` : un
brouillon enregistré à l'index 3 de l'ancien parcours atterrit sur le récapitulatif, et `mergeDraft`
préserve les réponses déjà données — y compris la clé `payment_setting` de l'ancienne forme, qui est
simplement ignorée. `HostIndividualWizard.test.tsx` monte ce cas exact plutôt que de le raisonner :
*un brouillon qui rouvrirait un `steps[3]` d'un tableau de trois rendrait un écran blanc, à quelqu'un
qui reprend son inscription.*
