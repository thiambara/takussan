# TCK-2613 — Assistants des invités en deux écrans : plan d'implémentation

Ticket : [`TCK-2613`](../backlog/tickets/todo/TCK-2613-assistants-la-raison-de-venir-d-abord.md). Maquette retenue :
`app-entree-assistants`, approche a (références gelées le 2026-11-11, `docs/qa/audit-ux-2026-11/fidelite/references/app-entree-assistants/`).

## Ce qui se relève avant d'écrire (2026-11-13)

- Les trois assistants (`OwnerOnboardingWizard`, `AgentOnboardingWizard`, `ServiceProviderOnboardingWizard`) portent
  chacun leur copie de l'étape du téléphone (même code au caractère près) et passent par `WizardReprenable`
  (rail d'étapes, `h2`, pied Précédent / Suivant) dans `OnboardingShell` → `CoqueDEntree`.
- `WizardReprenable` porte le brouillon serveur et ses gardes (TCK-475 : sort de l'écriture lu ; TCK-483 : pas de
  toast après finalisation ; TCK-566 : pas de brouillon sans saisie, état vierge figé). Le refaire ailleurs
  reperdrait ces gardes : on l'étend (`presentation`, `etapeImposee`) au lieu de le dupliquer.
- Les six cases existent : `components/auth/CasesDuCode.tsx` (TCK-2604), un seul champ réel.
- Un 429 porte `retry_after` (`ApiError.retryAfter`, TCK-622) : le délai écrit sous le champ en vient.
- **Prestataire** : avant `POST /api/service-provider/onboard/complete`, le profil est `draft` et la demande
  d'origine **n'est pas assignée** (`assignDeepLinkedRequest` ne court que dans `complete`) ;
  `MaintenanceRequestPolicy::view` et `respondToAssignment` exigent l'assignation. La carte de l'étape 2 n'a donc
  aucune lecture aujourd'hui → question posée au porteur de session (lot 3).

## Découpage

### Lot 1 — l'étape commune, la coque à deux écrans, le bailleur
1. `WizardReprenable` : `presentation` (la page rend l'étape et ses gestes, sans rail ni pied) et `etapeImposee`
   (le numéro vérifié saute l'étape 1 ; l'état vierge est sérialisé à cette étape — pas de brouillon fantôme).
2. `onboarding/invite/EtapeDuNumero.tsx` : le numéro (+221 figé, « Modifier »), l'envoi, les six cases, le renvoi
   à rebours (`retry_after`), le code d'aperçu hors production, l'échec d'envoi **sous le champ** avec son délai
   (reste dans le DOM), « Continuer » qui s'allume au sixième chiffre.
3. `OwnerOnboardingWizard` en deux étapes : numéro, puis « Vos biens chez {agence} » (liste, « Voir tous mes
   biens », « Proposer un bien » / « Proposer mon premier bien » → l'assistant en mode proposition), « Aller à
   mon espace » → `complete` → `/app`. Plus de pièces ni de visite guidée ; le panneau « À faire pour être payé »
   lit `GET /api/me/pieces` (déjà lu par la page, TCK-2614).
4. `OnboardingShell` : l'intention « Rejoindre {agence} », l'avancement 1/2 – 2/2, sans `h1` de page.

### Lot 2 — l'agent
« Bienvenue dans l'équipe, {prénom} », la carte du prospect (ou « Pas encore de prospect pour vous »), « Vos zones »
et la spécialisation éditables en un seul geste — **sans effacer le numéro de carte** (le `PATCH` envoie
aujourd'hui `license_number: … || null`, que l'API lit comme « effacer ») —, les droits repliés.

### Lot 3 — le prestataire
La carte de l'intervention, « Accepter » (`complete` puis `POST …/accept`), « Proposer un créneau »
(`scheduled_at`, 422 sous le champ), « Complétez votre profil » facultatif, accueil multi-agences inchangé.
Dépend de la réponse sur la lecture de la carte.

## Ce que chaque lot prouve
Tests ciblés (ordre des étapes, numéro vérifié qui saute, 429 encore là après 10 s, reprise d'un brouillon à
l'étape 2 — y compris un brouillon à quatre étapes d'avant), ablations une à une, relevé de fidélité par GET
doublés (aucune écriture en base de démo).
