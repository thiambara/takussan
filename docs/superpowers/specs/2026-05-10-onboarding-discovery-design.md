---
title: Onboarding — Discovery (tous les acteurs)
date: 2026-05-10
status: implemented
status_verified: 2026-08-16
type: discovery
spec_refs:
  - docs/features.md §2.1 (Authentification & comptes)
  - docs/features.md §2.1 sub-section "Profils & contexte actif" (TCK-138 → TCK-142)
  - docs/features.md §2.2 (Rôles & permissions)
  - docs/features.md §1.12 (Agence & équipe)
  - docs/features-by-actor.md
related_tickets:
  - TCK-013 (Authentification & gestion de comptes)
  - TCK-060 (OAuth Google)
  - TCK-081 (OAuth Facebook + Apple)
  - TCK-138 → TCK-142 (Profils & contexte actif)
  - TCK-209 (Super-admin — Onboarding agence)
  - TCK-234 (i18n auth & compte)
---

# Onboarding — Discovery (tous les acteurs)

> ## ✅ LIVRÉ — document de découverte daté, pas une description du système
>
> Ce document a porté `status: draft` jusqu'au 2026-08-16 alors que **les dix tickets qu'il pilote
> étaient tous `done`** — vérifié un par un : TCK-013, TCK-060, TCK-081, TCK-138 → TCK-142,
> TCK-209, TCK-234. Statut corrigé en `implemented` (TCK-311).
>
> ⚠️ **Son corps décrit mai 2026 et n'est pas mis à jour.** En particulier, le §2.1 écrit que « les
> permissions spatie sont scopées par `team_id` » : `spatie/laravel-permission` a été **désinstallé**
> depuis (TCK-278). Les droits sont l'enum `Capability` résolue par `MembershipCapabilityResolver`
> pour un couple *(utilisateur, agence)*. Le raisonnement de cadrage — les neuf parcours, la machine
> à états des profils, la matrice acteur × capacité — reste valable ; les détails de mécanisme, non.
> La source de vérité est `docs/features.md` et le code.

## 1. Contexte & objectif

Cartographie de l'**entrée dans le système** pour tous les acteurs Takussan, et des étapes nécessaires à un onboarding qualitatif. Sortie : 9 parcours normalisés, un backlog dérivé, une matrice acteur × capacité.

**Hors-périmètre** : design détaillé des UI (wireframes haute-fidélité), copywriting des emails, choix techniques d'implémentation. Ces éléments seront produits dans les tickets dérivés.

---

## 2. Principes transverses

### 2.1 Modèle multi-profils
Une **identité humaine = un `User`** (email, password, 2FA, OAuth uniques). Un user porte un ou plusieurs **profils métier** (`OwnerProfile`, `AgentProfile`, `BrokerProfile`, `ServiceProviderProfile`, `AgencyAdminProfile`, `CustomerProfile`) chacun rattaché à une `Agency`. Les permissions spatie sont scopées par `team_id = profile.agency_id`. Un même humain peut être propriétaire chez l'agence A, locataire chez l'agence B et agent chez son propre `individual` agency C — sans dupliquer son compte.

**Implication onboarding** : un user peut traverser plusieurs parcours d'onboarding au cours du temps, **un par profil ajouté**. Le parcours #1 (Visiteur → Customer) crée toujours le user et le `CustomerProfile` ; les autres parcours ajoutent des profils.

### 2.2 États normalisés des profils
Tout profil traverse une machine à états identique :

```
draft  ─────► pending  ─────► active  ─────► suspended
                │                              │
                └────────► expired             └────► archived
```

- `draft` — récupération en cours (wizard interrompu, invitation non envoyée)
- `pending` — invitation envoyée OU compte créé sans email vérifié
- `active` — email vérifié + minimum requis complété
- `expired` — token d'invitation expiré (7j par défaut)
- `suspended` — désactivé par admin (réactivable)
- `archived` — anonymisé (RGPD, TCK-080)

### 2.3 Vérifications minimales
- **Email** : obligatoire avant `active` pour tous les parcours (TCK-013).
- **Téléphone (OTP)** : obligatoire pour Owner, Agent, ServiceProvider (KYC) — optionnel pour Customer en MVP.
- **2FA TOTP** : recommandé pour AgencyAdmin, **obligatoire pour SuperAdmin**.

### 2.4 I18n & accessibilité
Tous les écrans, emails et messages d'erreur en **FR / EN / WO** (TCK-234). Sélection initiale via `Accept-Language`, modifiable au signup.

### 2.5 Anti-frustration
- **Reprise** — chaque wizard sauvegarde son état (`draft`) ; le user peut quitter et reprendre via lien dans le compte.
- **Token d'invitation** — expiry 7j, rappel automatique J+2 (notification + email), regeneration self-service via "Je n'ai pas reçu mon invitation".
- **Sortie sans engagement** — pas de wizard plus de 5 étapes ; chaque étape doit produire de la valeur visible.
- **Validation différée** — KYC documentaire (RIB, license) peut être complété après `active` (état `active_kyc_pending`).

### 2.6 Framework KPIs
Pour chaque parcours on suit :
- **Taux de complétion** — `active` / (initiated)
- **Drop-off par étape** — % qui abandonnent à chaque step
- **Time-to-first-value (TTFV)** — délai entre `active` et 1ère action métier (1er bien publié, 1ère réservation, 1er message…)
- **Rétention J+7** — % qui reviennent au moins une fois dans les 7 jours

Les valeurs cibles indicatives par parcours sont des hypothèses à valider après 1 mois de prod.

---

## 3. Pattern commun : invitation d'un nouveau membre

Utilisé par les parcours #3 (Owner), #4 (Agent), #5 (Agency Admin), #6 (Service Provider), #7 (Super Admin cooptation). Réutilisable.

### 3.1 Flow

```
[Inviteur]                          [Invité]
    │                                  │
    ▼                                  │
┌─────────────────┐                    │
│ Form invitation │                    │
│ (email, role,   │                    │
│  prénom/nom)    │                    │
└────────┬────────┘                    │
         │                             │
         ▼                             │
┌─────────────────┐                    │
│ Crée Invitation │   email + token    │
│ (token signé,   ├──────────────────► │
│  exp 7j, profil │                    │
│  draft)         │                    │
└─────────────────┘                    ▼
                              ┌─────────────────┐
                              │ Landing accept  │
                              │ (résumé : qui   │
                              │  invite, rôle,  │
                              │  agence)        │
                              └────────┬────────┘
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
                  Compte existe              Pas de compte
                          │                         │
                          ▼                         ▼
                  Login + accept           Signup pré-rempli
                          │                         │
                          └────────────┬────────────┘
                                       ▼
                              ┌─────────────────┐
                              │ Profil → active │
                              │ Bascule profil  │
                              │ actif vers lui  │
                              └────────┬────────┘
                                       ▼
                              ┌─────────────────┐
                              │ Onboarding spé. │
                              │ (KYC, tour,     │
                              │  1ère action)   │
                              └─────────────────┘
```

### 3.2 États & transitions
- À l'envoi : `Invitation { status: sent, token, expires_at: now+7d }`, `Profile { status: draft }`
- Acceptation : `Invitation.status = accepted`, `Profile.status = active`
- Expiration : `Invitation.status = expired` (cron quotidien) → l'inviteur reçoit une notification et peut renvoyer
- Révocation : l'inviteur peut révoquer avant acceptation → `Invitation.status = revoked`

### 3.3 Anti-frustration spécifique au pattern
- **Rappel J+2** : notification in-app + email à l'invité
- **Renvoi** : bouton "Renvoyer l'invitation" côté inviteur (régénère token, reset expiry)
- **Lien de récupération** : "Je n'ai pas reçu mon invitation" sur la page login → l'inviteur reçoit une demande
- **Conflit email** : si l'email correspond à un user existant, on ne propose **pas** signup mais directement login + acceptation

### 3.4 KPIs cibles
- Taux d'acceptation : ≥ **75%** sous 7 jours
- TTFV (passage à 1ère action métier après `active`) : ≤ **48h**

### 3.5 Tickets liés
- À créer : **TCK-XXX — Pattern d'invitation unifié** (modèle `Invitation` + service + emails de base)

---

## 4. Parcours

### 4.1 Visiteur anonyme → Customer (auto-signup) 👤 → 🏠

#### Trigger d'entrée
- CTA "S'inscrire" / "Connexion" du header
- Bouton OAuth ("Continuer avec Google / Facebook / Apple")
- Action déclenchée nécessitant un compte (favoris, demande de réservation, contacter un agent…)

#### Pré-requis
Aucun.

#### États & transitions
```
visiteur ──signup──► pending (email non vérifié) ──verify──► active
                              │
                              └──30j sans verify──► expired (purge)
```

#### Étapes
1. **Form signup** — email, mot de passe (12+ car., 1 maj/min/chiffre), prénom + nom, langue auto-détectée. Ou OAuth (Google/Facebook/Apple → skip steps 1-2).
2. **Vérification email** — lien magique 24h. Page d'attente avec "Renvoyer l'email" (1 par minute, 5 max).
3. **Bienvenue** — modale de découverte (3 slides max : recherche, favoris, messagerie). Skippable.
4. **Profil minimal** *(optionnel, déclenché à la 1ère action sensible)* — téléphone, ville, type de recherche (location/achat).

#### Données collectées
- **Compte** : email, password (hashed), first_name, last_name, locale, oauth_provider/oauth_id si OAuth
- **CustomerProfile** *(créé automatiquement à `active`)* : agency_id = NULL, preferences (city, transaction_type) ajoutés en step 4

#### Anti-frustration
- Email pas reçu → bouton "Renvoyer" + check spam dans le copy
- Erreur "email déjà utilisé" → propose "Connectez-vous" (lien direct + récupération mot de passe)
- OAuth permet de skipper la vérif email (provider l'a déjà fait)

#### Wireframe ASCII
```
┌────────────────────────────────────┐
│  Inscrivez-vous sur Takussan       │
├────────────────────────────────────┤
│  [G] Continuer avec Google         │
│  [f] Continuer avec Facebook       │
│  [] Continuer avec Apple           │
│  ──────────── ou ────────────      │
│  Email        [_______________]    │
│  Mot de passe [_______________]    │
│  Prénom       [______]  Nom [____] │
│  Langue       [FR ▼]               │
│                                    │
│  [ S'inscrire ]                    │
│                                    │
│  Déjà un compte ? Connectez-vous   │
└────────────────────────────────────┘
```

#### KPIs cibles
- Complétion form → email vérifié : ≥ **65%**
- TTFV (1er favori, 1er contact, 1ère recherche sauvegardée) : ≤ **24h** sur 50% des comptes
- Drop-off entre signup et vérif email : ≤ **30%**

#### Permissions activées au passage `active`
- Rôle spatie `customer` (sans team_id, profil global)
- Capacités : favoris, recherches sauvegardées, demandes de réservation, messagerie initiée vers les listings publics

#### Tickets liés
- Existants : TCK-013 (auth core), TCK-060 (Google), TCK-081 (Facebook/Apple), TCK-234 (i18n)
- À créer : **TCK-XXX — Onboarding wizard Customer (welcome modale + profil minimal différé)**

---

### 4.2 Customer → Host (individual agency) 🏠 → 🛡️ self

#### Trigger d'entrée
CTA **"Publier"** du header (à la Airbnb). Visible pour tous (visiteur compris).

#### Pré-requis
- Si visiteur : déclenche d'abord parcours #1, puis enchaîne
- Si Customer connecté sans agence : démarre le wizard
- Si user a déjà une agence (individual ou standard) : route directement vers création de bien dans son agence active

#### États & transitions
```
Customer ──"Publier"──► wizard host ──complete──► individual_agency_admin (active)
                              │
                              └──quit──► draft (resumable depuis profil)
```

#### Étapes (5 max)
1. **Intent confirmation** — "Vous voulez publier en tant que…" : Particulier (agence individuelle) / Professionnel (créer une vraie agence — route vers contact ou TCK-209). Sélection particulier → suite.
2. **Identité légale (light)** — nom de l'agence (par défaut "Espace de [Prénom Nom]"), téléphone (OTP), ville d'opération, type de bien principal (résidentiel/commercial).
3. **Premier bien (esquisse)** — titre, type, ville, transaction (location/vente), prix indicatif. Suffit pour créer un brouillon, détails et photos en step 5 ou plus tard.
4. **Mode de paiement** — méthode préférée pour recevoir : Wave / OM / virement / espèces. (Configuration complète passerelle = optionnelle, déclenchée à la 1ère réservation.)
5. **Validation & première publication** — récap, CGU host, bouton "Publier mon bien" → bien créé en `draft`, redirection vers fiche bien pour finaliser photos/description.

#### Données collectées
- **Agency** : `kind = individual`, name, primary_city, currency = XOF (par défaut), owner_user_id
- **AgencyAdminProfile** + **OwnerProfile** créés simultanément pour le user, `agency_id` = nouvelle agence
- **Property** : 1 brouillon créé en step 3
- **PaymentSetting** : provider préféré stocké, credentials différés

#### Anti-frustration
- Wizard sauvegarde à chaque step (`Agency.status = draft`)
- Si user quitte : bandeau persistant "Reprenez votre publication" sur dashboard
- OTP téléphone : skippable mais bloquant pour publier (état `published`)
- Dans step 1, si user clique "Professionnel" → propose contact super-admin (lien vers TCK-209) **ou** "continuer en individual et upgrader plus tard"

#### Wireframe ASCII (step 2)
```
┌──────────────────────────────────────────┐
│  Étape 2/5 — Votre espace                │
├──────────────────────────────────────────┤
│  Nom de votre espace                     │
│  [Espace de Amine T._______________]     │
│                                          │
│  Téléphone (vérifié par SMS)             │
│  [+221 ___ __ __ __]   [ Vérifier ]      │
│                                          │
│  Ville principale d'activité             │
│  [Dakar ▼]                               │
│                                          │
│  Type de bien principal                  │
│  ( ) Résidentiel  ( ) Commercial         │
│                                          │
│  ◄ Précédent                  Suivant ►  │
└──────────────────────────────────────────┘
```

#### KPIs cibles
- Complétion wizard (step 1 → step 5) : ≥ **55%**
- TTFV (1ère publication réelle d'un bien `published`) : ≤ **72h** chez 60% des hosts
- Conversion "publier brouillon" → "publier vraiment" : ≥ **70%**

#### Permissions activées
- Sur la nouvelle agence (`team_id`) : `agency_admin` + `owner`
- Capacités débloquées : voir matrice §6 (toutes capacités sauf invitation, multi-admins, custom roles, assignation, reporting cross-équipe, customisation tags)

#### Tickets liés
- À créer :
  - **TCK-XXX — Modèle `Agency.kind` + migration + seed**
  - **TCK-XXX — CTA "Publier" universelle (router selon état du user)**
  - **TCK-XXX — Wizard host individual (5 steps + reprise)**
  - **TCK-XXX — Pre-création de Property en draft depuis le wizard**

---

### 4.3 Owner invité par agence existante 🏢

#### Trigger d'entrée
Email d'invitation déclenché par un `agency_admin` ou `agent` depuis l'espace agence (form "Ajouter un propriétaire").

#### Pré-requis
- Inviteur a permission `invite_owner` dans son profil actif
- Agence est `kind = standard` (les `individual` ne peuvent pas inviter — c'est par définition)

#### Suit le pattern §3 (invitation), avec spécialisations :

#### Étapes spécifiques après acceptation
1. **Vérification téléphone (OTP)** — obligatoire pour les owners
2. **Form KYC owner** — pièce d'identité (CNI/passeport, upload), RIB, tax_id (NINEA), statut (particulier/société). KYC peut être en `pending_review` sans bloquer `active`.
3. **Tour produit (3 slides)** — "Vos biens", "Vos paiements à recevoir", "Vos messages". Skippable.
4. **Liste des biens déjà associés** — si l'agent a pré-rattaché des biens à ce profil owner, l'owner les voit en welcome screen.

#### Données collectées
- **OwnerProfile** : agency_id, kyc_status, id_document_path, rib, tax_id, owner_type (individual/company), company_name si applicable

#### Anti-frustration
- KYC peut être complété en plusieurs sessions (chaque doc upload est indépendant)
- Si refus KYC par l'agence : feedback explicite + nouvelle tentative

#### KPIs cibles
- Acceptation invitation : ≥ **80%** (l'owner est en relation directe avec l'agence, taux attendu élevé)
- KYC complet (`active_kyc_done`) sous 7j de l'acceptation : ≥ **65%**

#### Permissions activées
- Rôle `owner` scopé `team_id = agency_id`
- Capacités : voir biens dont il est propriétaire, encaissements, signer mandats, messagerie avec son agent

#### Tickets liés
- À créer :
  - **TCK-XXX — Form invitation Owner depuis espace agence (RBAC)**
  - **TCK-XXX — Wizard onboarding Owner post-acceptation (KYC + tour)**

---

### 4.4 Agent invité par agency_admin 🧑‍💼

#### Trigger d'entrée
Email d'invitation déclenché par un `agency_admin` depuis l'écran "Équipe".

#### Pré-requis
- Inviteur a `agency_admin` actif
- Agence est `kind = standard`

#### Suit pattern §3, avec spécialisations :

#### Étapes spécifiques après acceptation
1. **Vérification téléphone (OTP)** — obligatoire
2. **Form KYC agent** — license_number (carte professionnelle), pièce d'identité, photo de profil, spécialisation (résidentiel/commercial/luxe), zones d'intervention
3. **Choix des permissions par défaut** *(côté admin, pas l'agent)* — l'admin a déjà choisi le rôle (junior/senior/manager) au moment de l'invitation, mais l'agent voit son périmètre en welcome
4. **Tour produit + lien vers premier lead à traiter** *(si l'admin a déjà assigné des leads avant l'arrivée)*

#### Données collectées
- **AgentProfile** : agency_id, license_number, specialization, intervention_zones (array), kyc_status

#### KPIs cibles
- Acceptation : ≥ **85%** (relation pré-établie)
- 1ère action métier (1er lead contacté, 1er bien créé) : ≤ **48h**

#### Permissions activées
- Rôle `agent` (ou `agent_senior`, `agent_manager` selon choix admin) scopé `team_id = agency_id`

#### Tickets liés
- À créer :
  - **TCK-XXX — Écran "Équipe" + form invitation Agent (avec choix rôle)**
  - **TCK-XXX — Wizard onboarding Agent post-acceptation (KYC + zones + tour)**

---

### 4.5 Agency Admin créé par super-admin 🛡️

**→ Déjà ticketé : [TCK-209](../../backlog/tickets/TCK-209-super-admin-agency-onboarding.md)**

#### Résumé pour cohérence du doc
- Trigger : super-admin remplit form "Créer une agence" depuis console super-admin
- Crée simultanément `Agency` (kind=standard) + `AgencyAdminProfile` + `Invitation`
- Email d'invitation au futur admin → suit pattern §3
- Spécificité : welcome screen "Bienvenue dans votre agence — invitez votre équipe / créez votre 1er bien / paramétrez votre identité"

#### Compléments à intégrer dans TCK-209 (gap identifié par ce doc)
- **2FA TOTP recommandé** (proposé pendant onboarding, pas bloquant)
- **Choix de la devise agence** (XOF/EUR/USD) en step 1 de l'onboarding (cohérent avec TCK-084)
- **Sub-domaine et branding** dispos dès l'activation (cohérent avec décision §2 de ce doc : branding ouvert dès MVP pour standard ET individual)

#### KPIs cibles
- Acceptation : ≥ **95%** (créé sur sollicitation directe du super-admin)
- TTFV (1er bien publié) : ≤ **7j**

---

### 4.6 Service Provider invité par agence 🔧

#### Trigger d'entrée
Email d'invitation déclenché par `agency_admin` ou `agent` depuis "Carnet de prestataires" lors de la création d'une intervention maintenance, ou en pré-référencement.

#### Pré-requis
- Inviteur a permission `invite_service_provider`
- Agence `kind = standard` ou `individual` (un host individual peut référencer ses prestataires)

#### Suit pattern §3, avec spécialisations :

#### Étapes spécifiques après acceptation
1. **Vérification téléphone** — obligatoire
2. **Form KYC prestataire** — pièce d'identité, métier (plomberie / électricité / climatisation / serrurerie / peinture / autre — multi-select), zones d'intervention, tarifs indicatifs (visite, taux horaire), assurance RC pro (upload optionnel mais valorisé)
3. **Disponibilités hebdomadaires** — créneaux de réception d'interventions (jours + plages horaires)
4. **1ère intervention pré-assignée** *(si l'invitation venait d'une demande active)* — accès direct au ticket avec contexte

#### Données collectées
- **ServiceProviderProfile** : agency_id (peut être multi-agences via plusieurs profils), trades (array), zones (array), hourly_rate, visit_fee, insurance_doc_path, available_slots (json)

#### Anti-frustration
- Multi-agences : si déjà ServiceProviderProfile existe sur une autre agence, on propose "Ajouter cette agence à votre périmètre" (pas un nouveau compte)
- Tarifs sont indicatifs, ajustables par devis ensuite

#### KPIs cibles
- Acceptation : ≥ **70%** (relation moins établie que owner/agent)
- 1ère intervention complétée sous 30j : ≥ **50%**

#### Permissions activées
- Rôle `service_provider` scopé `team_id = agency_id`

#### Tickets liés
- À créer :
  - **TCK-XXX — Carnet de prestataires + form invitation Service Provider**
  - **TCK-XXX — Wizard onboarding Service Provider (KYC + disponibilités)**
  - **TCK-XXX — Multi-rattachement d'un Service Provider à plusieurs agences**

---

### 4.7 Super Admin (bootstrap + cooptation) 🛡️🛡️

#### 4.7.1 Bootstrap (1er super-admin)

#### Trigger
Commande artisan exécutée à l'install : `php artisan takussan:create-super-admin`

#### Étapes
1. CLI prompt : email, password (forcé strong), nom
2. Crée `User`, attache rôle spatie `super_admin` (global, sans team_id), génère codes 2FA
3. Affiche les codes de récupération une seule fois (à imprimer)
4. À la première connexion web : **2FA TOTP obligatoire** + lecture des CGU super-admin

#### KPIs
N/A (action ops one-shot par environnement)

#### 4.7.2 Cooptation (super-admin → super-admin)

#### Trigger
Un super-admin existant invite un autre depuis la console super-admin.

#### Suit pattern §3, avec différences :
- **Pas d'agence** (rôle global)
- **2FA TOTP obligatoire** avant `active` (bloquant, pas optionnel)
- **Audit log entry** automatique sur l'action de cooptation (TCK-145)
- **Notification à tous les autres super-admins** (transparence)

#### KPIs cibles
- Activation 2FA réussie sous 24h : ≥ **95%** (cible quasi-100% car bloquant)

#### Tickets liés
- À créer :
  - **TCK-XXX — Commande artisan create-super-admin (bootstrap)**
  - **TCK-XXX — Cooptation super-admin (form + invitation + 2FA forcé + audit + broadcast pairs)**

---

### 4.8 Customer → Tenant (transition d'état après signature de bail) 🏠 → 🏘️

#### Trigger d'entrée
Signature d'un `Lease` par un Customer existant. Pas un signup mais l'**onboarding "résident"** : entrée dans un nouveau périmètre fonctionnel.

#### Pré-requis
- Customer actif
- Lease passé en `signed`

#### États
```
customer (lease pending) ──signature──► tenant active
                                          │
                                          └──fin bail──► former_tenant (lease ended)
```

#### Étapes (déclenchées dans l'app, pas par email seul)
1. **Notification "Bienvenue chez vous"** — in-app + email avec récap des dates clés (entrée, paiements, fin de bail)
2. **Welcome modale "Espace résident"** — 3 slides : "Vos paiements", "Demander une intervention", "Vos documents (bail, état des lieux)"
3. **État des lieux d'entrée à compléter** *(si workflow EDL activé sur l'agence)* — checklist des pièces avec photos, signature électronique de l'EDL une fois rempli
4. **Premier paiement** — pré-rempli (acompte ou 1er loyer), méthode au choix selon agence

#### Données collectées
- Aucune nouvelle, le `Lease` contient tout. On crée optionnellement un `TenantOnboardingChecklist` pour suivre la complétion (3 ou 4 items selon agence).

#### Anti-frustration
- L'EDL peut être interrompu / repris (sauvegarde par pièce)
- Si EDL non fait sous 7j : rappel à locataire + notification à agent
- Documents bail accessibles immédiatement (pas conditionnés par EDL complet)

#### KPIs cibles
- EDL complété sous 7j de l'entrée : ≥ **75%**
- 1er paiement à l'heure : ≥ **90%**

#### Permissions activées
- Pas de nouveau rôle spatie (reste `customer`), mais l'UI active le menu "Mon logement" / "Espace résident" basé sur l'existence d'un `Lease.status = active` lié au user

#### Tickets liés
- À créer :
  - **TCK-XXX — Notification + welcome modale "Espace résident" sur transition Lease.signed**
  - **TCK-XXX — TenantOnboardingChecklist + suivi complétion EDL**

---

### 4.9 Upgrade individual → standard agency 🛡️ self → 🛡️ standard

#### Trigger d'entrée
CTA "Passer en agence professionnelle" depuis paramètres de l'agence individuelle.

#### Pré-requis
- User est `agency_admin` de son agence `kind = individual`
- Aucune demande d'upgrade en cours pour cette agence

#### États
```
individual active ──submit upgrade──► upgrade_pending ──admin review──► standard active
                                              │
                                              └──reject──► individual active (avec feedback)
```

#### Étapes
1. **Form complétion légale** — RC (registre commerce), NINEA, RIB pro, raison sociale, adresse fiscale, scan statuts (PDF/image), nombre estimé d'agents à inviter
2. **Soumission** — création `AgencyUpgradeRequest { status: pending, submitted_at }` + notification super-admins
3. **Review super-admin** — interface dédiée dans la console (à ajouter à l'extension TCK-209) : voir docs, accept/reject avec commentaire
4. **Acceptation** — `Agency.kind = standard`, `upgrade_request.status = approved`, notification user, débloquage des features bloquées (invitation, multi-admin, custom roles, etc.)
5. **Premier onboarding "agence"** — modale "Bienvenue dans votre agence — invitez vos premiers collaborateurs"

#### Données collectées
- **AgencyUpgradeRequest** : agency_id, submitted_by, rc, ninea, rib, address_fiscale, statuts_doc_path, planned_agents_count, status, reviewed_by, reviewed_at, review_comment
- **Agency** : flippé `kind = standard` à l'approbation, ajout des champs `rc`, `ninea` populés depuis la demande

#### Anti-frustration
- Demande peut être révoquée par l'user tant qu'elle est `pending`
- Si rejet : commentaire visible + possibilité de re-soumettre avec ajustements
- Délai SLA affiché ("Réponse sous 5 jours ouvrés") — engagement humain super-admin

#### KPIs cibles
- Délai moyen de review : ≤ **5 jours ouvrés**
- Taux d'approbation : ≥ **80%** (les rejets indiquent une frontière à clarifier dans le form pour réduire les fausses demandes)

#### Tickets liés
- À créer :
  - **TCK-XXX — Modèle `AgencyUpgradeRequest` + form de soumission**
  - **TCK-XXX — Console super-admin : revue des demandes d'upgrade**
  - **TCK-XXX — Flip Agency.kind + débloquage features + welcome screen "agence"**

---

## 5. Pattern récurrents identifiés (à factoriser comme briques)

| Brique | Réutilisée par parcours | Statut |
|--------|-------------------------|--------|
| **Pattern Invitation** (modèle + service + emails) | #3, #4, #5, #6, #7.2 | À créer (TCK-XXX) |
| **OTP téléphone** (envoi + vérif) | #2, #3, #4, #6, #7.2 | Existant partiel (features.md §2.1 P1) |
| **Vérif email magic link** | #1 | Existant TCK-013 |
| **Wizard reprenable** (état `draft` + bandeau resume) | #2, #4.6, #4.9 | À factoriser (TCK-XXX) |
| **Welcome modale 3 slides** | #1, #2, #3, #4, #5, #8 | À créer composant générique (TCK-XXX) |
| **KYC documentaire** (upload + status pending_review) | #3, #4, #6 | À créer (TCK-XXX, déjà mentionné en P1 §2.1) |
| **2FA TOTP** | #5 (recommandé), #7 (obligatoire) | Existant TCK-013 (à enforcer pour super-admin) |

---

## 6. Matrice acteur × capacités onboardées

| Capacité dispo après `active` | Customer | Owner | Agent | AgencyAdmin std | AgencyAdmin individual | Service Provider | Super Admin | Tenant (état) |
|-------------------------------|:--------:|:-----:|:-----:|:---------------:|:----------------------:|:----------------:|:-----------:|:-------------:|
| Recherche publique + favoris  | ✅       | ✅    | ✅    | ✅              | ✅                     | ✅               | ✅          | ✅            |
| Demander réservation          | ✅       | —     | —     | —               | —                      | —                | —           | ✅            |
| Publier biens                 | —        | —     | ✅    | ✅              | ✅                     | —                | —           | —             |
| Encaisser paiements           | —        | ✅    | ✅    | ✅              | ✅                     | —                | —           | —             |
| Inviter collaborateurs internes (agents, admins) | —  | —     | ⚠️*   | ✅              | 🚫                     | —                | —           | —             |
| Inviter prestataires externes (ServiceProvider)  | —  | —     | ✅    | ✅              | ✅                     | —                | —           | —             |
| Configurer agence             | —        | —     | —     | ✅              | ✅ (light)             | —                | —           | —             |
| Maintenance/intervention      | —        | ✅    | ✅    | ✅              | ✅                     | ✅ (assignée)    | —           | ✅ (request)  |
| Gouvernance plateforme        | —        | —     | —     | —               | —                      | —                | ✅          | —             |
| Espace résident (EDL, doc bail) | —      | —     | —     | —               | —                      | —                | —           | ✅            |

\* L'agent peut inviter Owner/ServiceProvider si `agency_admin` lui en a délégué la permission ; jamais inviter d'autres agents.

---

## 7. Backlog dérivé (à créer via `/write-spec`)

### Briques transverses (priorité haute, débloquent les parcours)
1. **Modèle `Agency.kind` + migration + seed** (S · P0 · backend)
2. **Pattern Invitation unifié** (M · P0 · backend) — modèle, service, emails
3. **Wizard reprenable** (S · P0 · frontend) — composant + persistence draft
4. **Welcome modale générique** (S · P1 · frontend)
5. **Modèle `AgencyUpgradeRequest`** (S · P1 · backend)

### Parcours utilisateur
6. **Onboarding wizard Customer** — welcome modale + profil minimal différé (S · P0 · frontend)
7. **CTA "Publier" universelle** — routing selon état du user (S · P0 · frontend)
8. **Wizard host individual** (M · P0 · fullstack) — 5 steps, création Agency+profils+1er Property draft
9. **Form invitation Owner depuis espace agence** (S · P0 · fullstack)
10. **Wizard onboarding Owner post-acceptation** (M · P1 · fullstack) — KYC + tour
11. **Écran "Équipe" + form invitation Agent** (S · P0 · fullstack)
12. **Wizard onboarding Agent post-acceptation** (M · P1 · fullstack) — KYC + zones
13. **Carnet de prestataires + invitation Service Provider** (S · P1 · fullstack)
14. **Wizard onboarding Service Provider** (M · P1 · fullstack) — KYC + dispos
15. **Multi-rattachement Service Provider à plusieurs agences** (S · P2 · backend)
16. **Commande artisan create-super-admin** (XS · P0 · backend)
17. **Cooptation super-admin** (M · P1 · fullstack) — form + 2FA forcé + audit + broadcast pairs
18. **Welcome modale "Espace résident" sur Lease.signed** (S · P1 · fullstack)
19. **TenantOnboardingChecklist + suivi EDL** (M · P2 · fullstack)
20. **Form upgrade individual → standard** (M · P1 · fullstack) — soumission user
21. **Console super-admin : revue demandes d'upgrade** (M · P1 · fullstack) — revue + approve/reject
22. **Flip Agency.kind + débloquage features + welcome agence** (S · P1 · fullstack)

### Compléments à intégrer dans TCK-209
- 2FA TOTP recommandé (proposé pendant onboarding, pas bloquant)
- Choix devise agence en step 1 (cohérent TCK-084)
- Sub-domaine et branding dispos dès activation pour standard ET individual

---

## 8. Décisions prises (référence rapide)

| # | Décision | Date |
|---|----------|------|
| D1 | `Agency.kind` enum(`standard`, `individual`) — défaut `individual` à la création self-service | 2026-05-10 |
| D2 | Self_agency : tout autorisé sauf invitation **collaborateurs internes** (agents, admins), multi-admins, custom roles, assignation, reporting cross-équipe, customisation tags/enums. Les prestataires externes (ServiceProvider) restent invitables. | 2026-05-10 |
| D3 | CTA "Publier" du header est l'entrée universelle host (pattern Airbnb) | 2026-05-10 |
| D4 | Upgrade individual → standard : form légal + review super-admin (pas self-service direct) | 2026-05-10 |
| D5 | Branding et sous-domaine accessibles dès MVP pour individual (pas paywall) | 2026-05-10 |
| D6 | Pas de quota de biens — monétisation future = pay-per-listing | 2026-05-10 |
| D7 | 2FA TOTP obligatoire pour Super Admin, recommandé pour AgencyAdmin | 2026-05-10 |
| D8 | Token d'invitation expiry 7j, rappel J+2, pattern unifié | 2026-05-10 |
| D9 | Customer → Tenant n'est pas un signup mais une transition d'état avec onboarding "résident" dédié | 2026-05-10 |

---

## 9. Glossaire

- **Identity (User)** — entité humaine unique (email, password, 2FA, OAuth). Une seule par humain.
- **Profil métier** — rôle d'un user dans une agence (`OwnerProfile`, `AgentProfile`, etc.). Plusieurs possibles.
- **Profil actif** — celui sélectionné pour la session, conditionne le scope des permissions spatie (`team_id = profile.agency_id`).
- **Self_agency / individual agency** — `Agency.kind = individual`. Espace de gestion solo, pas de team.
- **Standard agency** — `Agency.kind = standard`. Agence professionnelle multi-membres.
- **Pattern §3** — flow d'invitation unifié (token, expiry, accept, profil → active).
- **TTFV** — Time-to-First-Value : délai entre `profile.active` et 1ère action métier.
