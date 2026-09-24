---
id: TCK-566
title: "Onboarding et passage en pro : l'indicatif du téléphone passe derrière les chiffres, et ouvrir un parcours sans rien saisir crée une démarche « à reprendre »"
status: done
phase: P2
family: full
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#112-agence--équipe
  models: []
tags: [front, api, onboarding, telephone, otp, wizard, brouillon, upgrade-pro, ux]
---

## Objectif utilisateur

Une personne qui publie son premier bien saisit son numéro sans se soucier de l'indicatif, et le
numéro enregistré puis vérifié est bien le sien, dans le bon ordre. Une personne qui ouvre le
parcours « Passer en pro » par curiosité, sans rien y taper, ne se voit pas ensuite proposer de
« reprendre là où elle s'était arrêtée ».

## Contexte

Retour testeur du 2026-09-23 (web + mobile, `preview.takussan.com`, compte propriétaire
« Fa Diop »). Trois points de ce retour relèvent de ce ticket.

### W8 — « L'input du téléphone. » — **confirmé**

Captures : le champ « Numéro de téléphone » de l'étape « Votre espace » affiche `78|+221`, puis le
récapitulatif affiche `780143710+221`.

Mécanisme établi par lecture de code puis reproduit par un test :

- `HostIndividualWizard.tsx` amorçait `phone_otp.phone` avec l'indicatif géo **comme valeur**
  (`phone: user?.phone?.trim() ? user.phone : geoDialing`, où `geoDialing` vaut `+221`). Le champ
  était un `<Input>` libre : un curseur posé en tête (clic à gauche du texte) et les chiffres
  s'inséraient devant l'indicatif. Reproduit avec `userEvent.type(champ, '780143710',
  { initialSelectionStart: 0 })` : valeur obtenue **`780143710+221`**, à l'identique de la capture.
- Le récapitulatif relisait cette valeur telle quelle.
- **Côté API, c'était pire que l'affichage** : `POST /api/auth/phone/send-otp` enregistre `phone`
  sur l'utilisateur avant d'émettre le code, et `ResendPhoneVerificationRequest` ne le contraignait
  qu'en longueur (`max:32`). Test : `phone = 780143710+221` → **200**, numéro enregistré, code en
  cache. Le canal SMS (`SmsChannel` → `PhoneNumber::isValid`) aurait refusé ce numéro en aval ; sur
  preview, le code de debug a permis de marquer « vérifié » un numéro qui n'en est pas un — le
  compte du testeur porte donc aujourd'hui `780143710+221` vérifié.
- Relevé adjacent, même étape, trois autres assistants (`Owner`, `Agent`, `ServiceProvider`) :
  l'envoi du code appelait `phoneSendOtpAction()` **sans argument**. Le numéro tapé n'était jamais
  envoyé ; le code visait le numéro déjà enregistré, et sans numéro enregistré l'API répond
  « No phone number on file. » à quelqu'un qui vient de le taper. Reproduit par un test par
  assistant (`phoneSendOtpAction` appelé avec `[]`).

### W11 — « Réponse de notre équipe sous 5 jours ouvrés. 5, c'est beaucoup ? » — **décision produit**

Rien n'est modifié : c'est un engagement commercial que le porteur tranchera. Source localisée :

- libellé : `agency.upgrade.page.benefits.sla` — `takussan-web/src/messages/fr.json:1977`,
  `en.json:2002` (« within 5 business days »), `wo.json:628` (« Réponse ci 5 fan. » — **« 5 jours »,
  sans « ouvrés », et à moitié en français** : les trois langues ne promettent pas la même chose) ;
- rendu : `takussan-web/src/app/(dashboard)/app/settings/agency/upgrade/page.tsx:115` ;
- origine : critère de TCK-267 (« SLA affiché : "Réponse sous 5 jours ouvrés" ») ;
- **aucun mécanisme ne tient ce délai** : ni commande planifiée dans `routes/console.php`, ni
  relance, ni escalade autour d'`AgencyUpgradeRequest`. Le chiffre est une promesse affichée, pas
  une règle du système.

### W12 — « Je n'ai pas renseigné une seule ligne et on me dit "reprendre là où j'en étais". » — **confirmé**

Capture : tableau de bord, carte « Reprenez là où vous vous étiez arrêté — Vous avez 1 démarche en
cours » avec le bouton « Passage en pro ».

Mécanisme établi : la carte est `WizardDraftsBanner`, qui liste `GET /api/me/wizard-drafts` ; le
libellé « Passage en pro » est celui de la clé `agency-upgrade-{id}`, écrite par le seul
`UpgradeRequestForm`. Ce formulaire appelait `save(0, form)` dans un effet **dès l'hydratation,
sans condition** : ouvrir la page suffisait à écrire le formulaire VIDE ~800 ms plus tard.
`WizardReprenable` (les quatre assistants d'onboarding) portait exactement le même effet. Le serveur
n'y est pour rien : il enregistre ce qu'on lui envoie et ne peut pas savoir à quoi ressemble un
formulaire vide — la cause est côté front, le correctif aussi. Reproduit par des tests : sans le
correctif, `save` est appelé avec le formulaire vide à l'ouverture, et un PUT part sans saisie.

**Seconde cause, relevée par la revue adverse (réparation 1) — et c'est elle qui laissait la carte
du testeur en place.** Le serveur ne rend pas ce que le client a envoyé : le middleware global
`ConvertEmptyStringsToNull` de l'API enregistre chaque `''` en `null`. Mesuré par un test PHP
(PUT `/api/me/wizard-drafts/agency-upgrade-1` avec le formulaire vide, puis GET) :

```
GET DATA={"rc":null,"ninea":null,"rib_pro":null,"address_fiscale":null,"company_legal_name":null,"planned_agents_count":null}
```

`UpgradeRequestForm` réhydratait par simple fusion (`{ ...EMPTY_FORM, ...draft.data }`) : les
`null` écrasaient les `''`, l'état ne valait plus jamais l'état vierge, et le brouillon fantôme était
**réécrit** à chaque ouverture au lieu d'être supprimé. Même cause, second effet : un brouillon réel
repris puis entièrement effacé n'était plus supprimé. La première version du test lisait des `''`,
une donnée que le serveur ne rend jamais — elle était verte avec le défaut. Réécrit avec les `null`
du serveur : 3 rouges sans le correctif (`clear` attendu 1 fois, reçu 0).

Défaut voisin, soupçonné par la revue et **prouvé par un test** : `WizardReprenable` figeait `data`
par `useState(initialData)` au montage, mais calculait l'état vierge depuis `initialData` à
l'hydratation. Un `initialData` qui change pendant le GET du brouillon (l'utilisateur ou l'indicatif
géolocalisé qui arrivent après le premier rendu) écrivait un brouillon sans aucune saisie —
reproduit : 1 PUT sans frappe.

**Réparation 2 — quatre défauts mineurs de la seconde revue, tous reproduits avant correction :**

- La borne « exactement 9 chiffres après `+221` » de `numeroComposable` n'était pas testée : la
  mutation `\d{9}` → `\d{8,9}` laissait les 29 tests W8 verts, et `+22178014371` (8 chiffres,
  E.164 valide en apparence) aurait ouvert « Envoyer le code » pour un 422 de l'API.
- **Un brouillon fantôme hérité de l'assistant hôte n'était pas supprimé** (le risque résiduel de
  la passe précédente le disait supprimé « à la réouverture » : c'était faux). L'ancien autosave a
  écrit, pour un compte sans numéro, `phone_otp.phone = '+221'` ; le nouvel état vierge porte `''`.
  `mergeDraft` réinjectait `+221` brut, l'état relu différait donc du vierge et le brouillon restait
  jusqu'à la purge à 90 jours. Reproduit dans `HostIndividualWizard.test.tsx` : `clear` jamais
  appelé (0 appel au lieu de 1).
- **Un numéro relu d'un brouillon hérité n'était pas remis en E.164** : seul `initialData` passait
  par `recomposerTelephone`. Déduit du code par la revue, reproduit ici dans les trois assistants
  Owner / Agent / ServiceProvider : brouillon `771234567` → le champ affiche bien `771234567`, mais
  « Envoyer le code » reste INACTIF (`expect(element).toBeEnabled()` rouge ×3) ; même chose dans
  l'assistant hôte avec la forme corrompue `780143710+221`.
- AC5 affirmait « rien d'enregistré, aucun code en cache » pour `+22178014371`, mais seul le cas
  `780143710+221` l'assertait.

**Passe de clôture — trois défauts mineurs de la troisième revue, tous reproduits avant correction :**

- **L'ordre « fusion, puis relecture » n'était gardé par aucun test.** Mutation : `relireBrouillon`
  appliqué au brouillon BRUT, avant `mergeDraft` → tous les tests verts. La régression est
  pourtant réelle : le serveur rend `''` en `null`, `mergeDraft` ignore un `null` et garde le numéro
  du compte ; relu avant la fusion, ce `null` devient `''`, que la fusion n'ignore plus, et le numéro
  du compte disparaît du champ. Deux tests neufs la font rougir (Owner et `WizardReprenable`).
- **La borne HAUTE côté API n'était pas testée.** Mutation : `not_regex:/^\+221(?!\d{9})/` (ancre
  de fin retirée) → `PhoneVerificationTest` vert, et `+2217801437100` aurait été enregistré.
- **Un fantôme `+221` relu sous un AUTRE indicatif géo n'était pas nettoyé.** L'ancien autosave
  amorçait le téléphone avec l'indicatif géo du jour de l'écriture ; rouvert sous `+33` (voyage,
  VPN, diaspora), `relireTelephoneBrouillon('+221', '+33')` suivait la branche « international » et
  rendait `+221`. Reproduit : `expected '+221' to be ''`, et dans l'assistant hôte `clear` appelé
  0 fois au lieu de 1.

**Mesure au navigateur (passe de clôture, pile locale, compte `owner1`, `/onboarding/owner`).**
Chrome headless piloté par CDP, 390×844 et 360×740 (dSF 3, mobile) puis 1366×900 :

| vue | champ (h) | préfixe (h, centre vertical) | début du texte / bord droit du préfixe | bouton « Envoyer le code » | défilement horizontal |
|---|---|---|---|---|---|
| 360 | 328×44 | 51,2×28, centré (502,9 = 502,9) | 85,8 / 67,2 | 328×44, sous le champ | aucun (360 = 360) |
| 390 | 358×44 | 51,2×28, centré | 85,8 / 67,2 | 358×44, sous le champ | aucun (390 = 390) |
| 1366 | 402×44 | 47,2×28, centré | 619,3 / 602,2 | 138×44, à droite du champ, même ligne | aucun |

Geste du testeur rejoué (curseur en position 0, puis `780143710`) : le champ affiche `780143710`,
« Envoyer le code » s'active, et le brouillon écrit porte `+221780143710`. À l'ouverture à 390 px,
le brouillon `owner-onboarding-1` hérité (écrit le 2026-09-16 par l'ancien autosave, identique à
l'état vierge) a été **supprimé** (`DELETE /api/me/wizard-drafts/owner-onboarding-1`) sans aucun
PUT. Le brouillon laissé par la mesure a été supprimé ensuite.

## Delta à produire

- [x] `lib/phone.ts` : composition / décomposition indicatif + chiffres, normalisation d'un
      indicatif géo, remise en ordre de la forme corrompue `<chiffres>+<indicatif>`, prédicat
      `numeroComposable` (E.164 8-15 chiffres, 9 chiffres exactement après `+221`), lecture groupée
      `+221 78 014 37 10`.
- [x] `components/ui/phone-input.tsx` : l'indicatif est un **préfixe affiché**, jamais une valeur
      éditable ; un `+` (ou `00`) en tête bascule en numéro international complet (diaspora) ;
      ligne d'aide reliée par `aria-describedby`, ainsi que le préfixe.
- [x] Les quatre assistants d'onboarding l'emploient ; les trois qui l'ignoraient envoient désormais
      le numéro tapé avec la demande de code ; le bouton d'envoi reste inactif tant que le numéro
      n'est pas composable ; le récapitulatif de l'assistant hôte lit le numéro par groupes.
- [x] API : `ResendPhoneVerificationRequest` exige la forme que le canal SMS exige
      (`PhoneNumber::E164_REGEX`) et 9 chiffres après `+221` ; message `validation.rules.phone_e164`
      en fr/en/wo.
- [x] `hooks/useAutosaveBrouillon.ts` : un brouillon existe **si et seulement si** l'état diffère
      de l'état vierge ; revenir à l'état vierge le supprime ; un brouillon vierge hérité de
      l'ancien comportement est supprimé à l'ouverture. Employé par `WizardReprenable` et
      `UpgradeRequestForm`.
- [x] `WizardReprenable` n'annonce plus « Progression sauvegardée » quand rien n'a été saisi.
- [x] Réparation 1 — `lib/agency-upgrade-brouillon.ts` (module pur, sans `'use client'`) :
      `formulaireUpgradeDepuisBrouillon` relit un brouillon dans la forme exacte du formulaire
      (chaîne pour les champs texte, nombre fini ou `null` pour le nombre d'agents, clés inconnues
      écartées) ; `brouillonUpgradeEstVierge` dit qu'un brouillon ne porte aucune saisie.
      `UpgradeRequestForm` réhydrate par elle.
- [x] Réparation 1 — `lib/wizard-drafts.ts` : une règle de reprise peut déclarer `estVierge` ;
      `estDemarcheAReprendre` écarte un brouillon vierge, et `WizardDraftsBanner` ne le compte plus
      comme « démarche en cours ». Seule la règle `agency-upgrade-` le déclare : l'état vierge des
      assistants d'onboarding dépend du compte (champs pré-remplis), la table ne le connaît pas.
- [x] Réparation 1 — `useAutosaveBrouillon` ne réécrit plus à l'identique un brouillon qu'il vient
      de relire (le PUT d'ouverture rajeunissait son `updated_at`, donc le remontait en tête du
      bandeau et repoussait sa purge) ; il suit la dernière écriture DEMANDÉE, pas la dernière
      réussie.
- [x] Réparation 1 — wolof : `ui.phoneInput.hintInternational` écrivait « Nimerou » ; aligné sur
      « Nimero », la graphie de `wo.json` (8 occurrences sur 10 ; l'API écrit « Nimerow »).
- [x] Réparation 1 — `WizardReprenable` : sans brouillon, `data` repart à l'hydratation du même
      `initialData` que l'état vierge.
- [x] Réparation 2 — `WizardReprenable` accepte `relireBrouillon(data)`, appliqué au brouillon
      relu AVANT qu'il ne soit affiché et comparé à l'état vierge (jamais à l'état vierge lui-même).
      Les quatre assistants d'onboarding le fournissent ; il repasse le téléphone par
      `relireTelephoneBrouillon` (`lib/phone.ts`) : `+221` seul → `''`, `771234567` et
      `780143710+221` → `+221…`, `null` ou non-texte → `''`, idempotent sur une valeur E.164.
- [x] Réparation 2 — tests : borne `+221` à 8 / 9 / 10 chiffres ; `send-otp` `+22178014371` asserte
      aussi l'absence d'enregistrement et de code en cache.
- [x] Clôture — `relireTelephoneBrouillon` relit comme vide un indicatif seul, QUEL QU'IL SOIT
      (`+`, `+221`, `+33`, `+1268`), et plus seulement l'indicatif courant. Prix assumé : un `+`
      suivi d'au plus quatre chiffres, tapé puis abandonné dans un brouillon, est oublié à la
      reprise ; aucun numéro composable n'a cette longueur.
- [x] Clôture — tests : l'ordre « fusion, puis relecture » (Owner + `WizardReprenable`) ; `send-otp`
      `+2217801437100` → 422, rien d'enregistré, aucun code en cache ; fantôme `+221` sous `+33`.

## Critères d'acceptation

- [x] AC1 — curseur posé en tête du champ, la frappe de `780143710` affiche `780143710` et part au
      serveur sous la forme `+221780143710` (`HostIndividualWizard.test.tsx`, `phone-input.test.tsx`).
- [x] AC2 — un numéro enregistré sous la forme `780143710+221` s'affiche `780143710` dans le champ
      et `+221 78 014 37 10` au récapitulatif.
- [x] AC3 — un numéro incomplet ne peut pas être envoyé : bouton inactif. Hôte (`+22178`) et,
      depuis la réparation 1, Owner / Agent / ServiceProvider (`7700000`, sept chiffres non vides :
      la mutation `numero.trim() === ''` de la revue fait rougir chacun des trois tests).
      **Réparation 2** : la borne est éprouvée des deux côtés (`+22178014371` refusé,
      `+221780143710` accepté, `+2217801437100` refusé) — la mutation `\d{8,9}` rougit
      `phone.test.ts`.
- [x] AC4 — Owner / Agent / ServiceProvider : le numéro tapé est celui que reçoit
      `phoneSendOtpAction` (`+221770000000`).
- [x] AC5 — API : `send-otp` avec `780143710+221` ou `+22178014371` → 422 sur `phone`, rien
      d'enregistré, aucun code en cache — **asserté pour les deux depuis la réparation 2** ;
      `+221780143710` et `+33612345678` → 200 et enregistrés. Ablation : retirer la règle
      `not_regex` `+221` rougit `test_send_otp_refuse_un_numero_senegalais_incomplet`.
- [x] AC6 — ouvrir `UpgradeRequestForm` sans rien saisir n'appelle jamais `save` ; la première
      saisie l'appelle ; tout effacer appelle `clear` ; un brouillon réel est repris, jamais
      supprimé ni réécrit. **Réparation 1 : les brouillons hérités sont désormais éprouvés dans la
      forme que le SERVEUR rend (champs à `null`)** — le brouillon vide hérité est supprimé à
      l'ouverture (y compris avec des clés inconnues), ses champs s'affichent vides, un brouillon
      réel repris puis entièrement effacé est supprimé, un nombre d'agents repris est conservé.
- [x] AC6 bis — tableau de bord : un brouillon `agency-upgrade-{id}` sans aucune saisie, tel que le
      serveur le rend, ne produit ni la carte « Reprenez là où vous vous étiez arrêté » ni le bouton
      « Passage en pro », et ne compte pas dans « Vous avez N démarches en cours »
      (`WizardDraftsBanner.test.tsx`) ; un brouillon qui porte une saisie reste proposé.
- [x] AC6 ter — `WizardReprenable` : un `initialData` qui change pendant le GET du brouillon ne
      crée aucun brouillon, et c'est le squelette à jour qui s'affiche ; un brouillon relu n'est pas
      réécrit à l'identique à l'ouverture ; un brouillon vierge hérité en `null` est supprimé.
- [x] AC7 — ouvrir un assistant `WizardReprenable` sans rien saisir : aucun PUT, même après le
      débounce ; le quitter : aucun PUT et aucun « Progression sauvegardée ».
- [x] AC7 bis (réparation 2) — un brouillon hérité est relu dans la forme d'aujourd'hui : le
      fantôme de l'assistant hôte (`phone_otp.phone = '+221'`, `code: null`) est supprimé à
      l'ouverture sans être réécrit ; un numéro `771234567` (Owner / Agent / ServiceProvider) ou
      `780143710+221` (hôte) relu d'un brouillon ouvre « Envoyer le code » et part en
      `+221…` ; sans brouillon, `relireBrouillon` n'est jamais appelé
      (`WizardReprenable.test.tsx`, les quatre tests d'assistants, `phone.test.ts`).
- [x] AC8 — chaque correctif ci-dessus a été retiré (ablation) et son test a rougi, puis restauré
      (md5 vérifiée). Réparation 2 : sept ablations — borne `8,9` (1 rouge), helper rendu brut
      (6), `relireBrouillon` ignoré par `WizardReprenable` (6), prop retirée de chaque assistant
      (hôte 2, Owner 1, Agent 1, ServiceProvider 1) — et une ablation API (1 rouge).
      **Clôture** : trois ablations de plus — `relireBrouillon` appliqué avant `mergeDraft` (2
      rouges : Owner, `WizardReprenable`), ancre `$` retirée de la règle `not_regex` (1 rouge :
      `test_send_otp_refuse_un_numero_senegalais_trop_long`), relecture de l'indicatif seul
      retirée (2 rouges : `phone.test.ts`, hôte « fantôme… indicatif géo changé »). md5 restaurées.
- [x] AC7 ter (clôture) — `relireBrouillon` reçoit le brouillon DÉJÀ fusionné : un téléphone `null`
      d'un brouillon hérité n'efface pas le numéro du compte (Owner : le champ garde `770000000`,
      « Envoyer le code » actif) ; un fantôme `+221` relu sous l'indicatif géo `+33` est supprimé à
      l'ouverture sans PUT.
- [x] AC5 bis (clôture) — API : `send-otp` avec `+2217801437100` (10 chiffres après `+221`) → 422
      sur `phone`, rien d'enregistré, aucun code en cache.
- [x] AC9 — relevé au navigateur, 360 px, 390 px et bureau (1366) sur `/onboarding/owner` : le
      préfixe `+221` est centré verticalement dans le champ de 44 px, le texte commence après son
      séparateur, le bouton « Envoyer le code » fait 44 px de haut (sous le champ en mobile, à sa
      droite sur bureau), aucun défilement horizontal (tableau du Contexte). Mesuré sur l'assistant
      propriétaire seulement : le composant `PhoneInput` est le même dans les quatre.
- [x] AC9 bis (solde, TCK-574) — relevé au navigateur sur l'assistant HÔTE `/onboarding/host`, la
      page de la capture, avec un compte temporaire sans profil d'agence, supprimé ensuite. À 320,
      360 et 390 px et au bureau (1280) : aucun défilement horizontal (`scrollWidth` =
      `innerWidth`), champ de 44 px, préfixe `+221` de 51 px (47 px au bureau), bouton « Envoyer
      le code » de 44 px de haut (pleine largeur sous le champ en mobile, 138 px à sa droite au
      bureau). Taper `0771234567` affiche `0771234567` et active « Envoyer le code » (valeur
      `+221771234567`). L'écart entre le séparateur du préfixe et le premier chiffre valait
      **18,5 px** (17,1 px au bureau) pour 10 px de marge avant l'indicatif. Il vaut maintenant
      **10 px** partout, parce que le retrait suit la largeur mesurée du préfixe. *(Mutation
      « retrait estimé en `ch` » → **1 rouge** dans `phone-input.test.tsx`.)*
- [x] AC11 (solde, TCK-574) — un `0` de préfixe national tapé sous un indicatif étranger est
      retiré (`0612345678` sous `+33` → `+33612345678`), sauf là où il est significatif (Italie,
      Saint-Marin, Côte d'Ivoire, Bénin, Gabon, Congo). L'API refuse `+330612345678` à `send-otp`.
      *(TCK-574 AC3 à AC5.)*
- [x] AC12 (solde, TCK-574) — un brouillon rend `''` tel qu'il a été écrit : dans un assistant
      d'onboarding, un champ pré-rempli que la personne a vidé revient vide à la reprise.
      *(TCK-574 AC1 et AC2.)*
- [ ] AC10 — sur preview, après déploiement : la carte « Passage en pro » du compte du testeur
      n'est plus affichée au tableau de bord (brouillon vierge écarté par le bandeau), et le
      brouillon est supprimé en base à la première ouverture du formulaire. **Non mesuré** (exige
      la session du testeur).

## Solde de la vérification (2026-09-24, TCK-574)

| Relevé de la vérification | Mesure | Issue |
|---|---|---|
| W8 — `0612345678` sous `+33` → `+330612345678` | 6 rouges dans `phone.test.ts` et 1 dans `PhoneVerificationTest.php` avant correctif ; `send-otp` rendait 200 | **Corrigé** (TCK-574 b), au front et à l'API |
| W8 — AC9 non mesurée sur `/onboarding/host` | Mesurée avec un compte temporaire sans profil d'agence | **Fait** (AC9 bis) |
| Risque — AC9 relevée sur l'assistant propriétaire seulement | L'hôte est relevé à son tour. Agent et prestataire exigent une invitation et n'ont pas été relevés ; ils emploient le même `<PhoneInput>` | **Réduit** |
| Risque — écart d'environ 18,6 px entre le séparateur et le premier chiffre | 18,5 px mesurés à 320/360/390 px, 17,1 px au bureau | **Corrigé** : 10 px partout (AC9 bis) |
| Risque — perte de fidélité due à `ConvertEmptyStringsToNull` | `WizardDraftFideliteTest` : 3 rouges avant | **Corrigé à la source** (TCK-574 a, AC12) |
| Risque — `send-otp` refuse la forme nationale (`771234567`) | Appelants relevés : les quatre assistants envoient un E.164 composé, `PhoneVerificationSection` et `ProfileContactSection` n'envoient aucun `phone` (`phoneSendOtpAction()` sans argument) | **Sans autre client touché** : le risque est levé. ⚠ repair-1 : l'appel SANS `phone` envoyait le code au numéro ENREGISTRÉ sans le relire — `+330612345678` accepté par le profil, ou `780143710+221`. `send-otp` le juge désormais par les mêmes règles (422, aucun code), et `normalizePhoneInput` retire le 0 de préfixe national au champ du profil (TCK-574 AC5 bis : 4 + 4 rouges avant). repair-2 : un `phone` présent mais vide (`''`, `null`, espaces) relit aussi l'enregistré, désormais épinglé par un test (mutation `filled` → `has` : 3 rouges, TCK-574 AC5 ter) |
| Risque — W11, le wolof à moitié en français | Relevé le 2026-09-24 : `agency.upgrade.page.benefits.sla` ne promet plus de délai dans aucune langue (« sa décision vous parvient par e-mail et dans vos notifications » ; wo « Sunu ekib dina seetlu bépp laaj ; dinga jot tontu bi ci e-mail ak ci say yégle. ») | **Soldé par une autre unité** : les trois langues disent la même chose, et il n'y a plus de chiffre |
| Risque — fantômes supprimés seulement à la réouverture | Inchangé (l'état vierge d'un assistant d'onboarding dépend du compte) | **Accepté** |
| Risque — fantôme de l'hôte reconnu vierge seulement si les champs pré-remplis n'ont pas changé | Inchangé | **Accepté** |
| Risque — `+` suivi d'au plus 4 chiffres relu comme vide | Choix délibéré | **Accepté** |
| Risque — `780143710+221` vérifié sur le compte du testeur | En base de préproduction, hors de portée locale | **Ouvert** (Hors périmètre) |
| Risque — AC10 sur preview | Interdit à cette unité | **Ouvert** |
| Relevé repair-1 — « 0 » tapé sous `+33` reste affiché si le parent remet `''` | Mécanisme confirmé par une sonde jetable ; aucun des quatre assistants ne remet le téléphone à `''` | **Contrat écrit** dans `<PhoneInput>` : remonter (`key`) ; épinglé par un test (TCK-574 AC4 bis) |

## Hors périmètre

- Le libellé « 5 jours ouvrés » (W11) : décision du porteur. Si le chiffre change, les trois langues
  sont à réaligner — le wolof ne dit pas aujourd'hui « ouvrés ».
- La correction en base du numéro corrompu du compte de test (`780143710+221`, vérifié) : le champ
  le remet en ordre à l'affichage et au prochain envoi, rien ne le réécrit d'office.
- `PropertyWizard` (assistant « Publier un bien », groupe E) : son autosave s'abonne à `watch`, qui
  se déclenche aussi sur les valeurs géo posées d'office à l'ouverture. Sa clé
  `property-create-wizard` n'étant pas dans `WIZARD_RESUME_RULES`, aucune carte n'en découle
  aujourd'hui ; à regarder si elle y entre.
- Le profil (`ProfileContactSection`) garde sa saisie E.164 libre : hors du parcours signalé. Sa
  normalisation (`normalizePhoneInput`, `lib/phone.ts`) retire depuis TCK-574 repair-1 le 0 de
  préfixe national.

## Notes d'implémentation

- Le comportement « avancer d'une étape sans rien taper crée un brouillon » est **conservé** :
  choisir « Particulier » puis « Suivant » est un geste, pas une ouverture. Seule l'ouverture sans
  geste ne produit plus rien.
- La comparaison à l'état vierge se fait sur une sérialisation à clés triées : l'ordre des clés d'un
  objet recomposé n'est pas une différence de saisie.
- `WizardReprenable` fige l'état vierge **à l'hydratation** : l'assistant hôte recalcule
  `initialData` quand `refreshUser()` rafraîchit l'utilisateur, la référence ne doit pas bouger.
- ⚠ **Périmé depuis TCK-574 (2026-09-24)** : l'API rend désormais `''` tel quel dans un brouillon
  (écriture exemptée du trim et de `ConvertEmptyStringsToNull`). Le paragraphe suivant décrit
  l'état antérieur. Les relectures typées restent en place pour les brouillons déjà en base.
- **Le serveur de brouillons n'est pas fidèle**, et le front s'en défend plutôt que de le changer :
  `ConvertEmptyStringsToNull` est un middleware GLOBAL (`bootstrap/app.php`), et l'exempter pour
  `me/wizard-drafts/*` changerait ce que relisent `PropertyWizard` (groupe E) et les assistants
  d'onboarding (`mergeDraft` ignore déjà les `null`). Les brouillons déjà en base portent des `null`
  de toute façon : la relecture typée est nécessaire dans les deux cas.
- Test piège mesuré : `act()` ne vide sa file qu'à sa sortie ; l'effet d'autosave qui suit
  l'hydratation n'arme donc son minuteur qu'à la fin de la première attente. Une seule attente, même
  de 600 ms, laissait le test vert sans le correctif — d'où les deux attentes du test AC7.
