# QA — Tous les utilisateurs authentifiés 👥

**Acteur :** Tout utilisateur connecté (locataire, bailleur, agent, admin)
**Précondition :** Avoir un compte valide sur la plateforme
**Environnement :** `http://localhost:3000` (frontend) · `http://localhost:8002` (backend)
**Testeur :**
**Date :**
**Version :** dev

> Ces tests s'appliquent à **tous les rôles**. Ils couvrent l'authentification, le profil, la sécurité, les notifications, la recherche transversale, les médias et l'internationalisation.
> Les fonctionnalités spécifiques à un rôle sont dans les fichiers dédiés : `agent-qa.md`, `bailleur-proprietaire-qa.md`, `locataire-acheteur-qa.md`, `admin-qa.md`.

---

## Légende

| Statut | Signification |
|--------|---------------|
| ✅ Pass | Fonctionne comme attendu |
| ❌ Fail | Bug ou comportement incorrect |
| ⚠️ Partiel | Fonctionne avec réserves |
| 🔲 Non testé | Pas encore vérifié |

---

## Ordre de test optimisé

Suivre l'ordre ci-dessous pour éviter les allers-retours :

1. **Inscription** → `/auth/register`
2. **Vérification email** → lien reçu par email
3. **Connexion** → `/auth/login`
4. **OAuth** → Google / Facebook / Apple (depuis la page login)
5. **Mot de passe oublié** → `/auth/forgot-password`
6. **Réinitialisation mot de passe** → lien reçu par email
7. **Profil** → `/app/profile` (édition, contact, profils)
8. **Sécurité** → 2FA, sessions, vérification téléphone (sur `/app/profile`)
9. **Suppression compte RGPD** → `/app/profile`
10. **Notifications** → `/app/profile/notifications` + cloche navbar
11. **Recherche transversale** → `/properties`
12. **Upload médias** → testé via formulaire bien ou profil
13. **i18n** → changement de langue global

---

## 1. Inscription (`/auth/register`)

### TC-AUTH-01 — Formulaire d'inscription

**Précondition :** Être déconnecté (ouvrir une fenêtre privée/incognito).

**Étape 1 :** Naviguer vers `http://localhost:3000/auth/register`.

**Q1 :** La page affiche le panneau de gauche (logo Takussan + tagline + image de fond) sur desktop ?
> Le panneau gauche doit contenir le logo "Takussan" cliquable (retour à `/`), la phrase "Votre porte d'entrée vers l'immobilier du Sénégal." et une image Unsplash avec overlay dégradé.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le formulaire affiche les champs dans cet ordre : Prénom, Nom (côte à côte sur desktop), Email, Mot de passe, Confirmation du mot de passe, Checkbox CGU, Bouton submit, Séparateur OAuth, Boutons OAuth ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les placeholders sont-ils corrects ? Email = "vous@exemple.com", Mot de passe = "Au moins 8 caractères", Confirmation = vide.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Les boutons OAuth sont présents : "Continuer avec Google", "Continuer avec Apple", "Continuer avec Facebook" (dans cet ordre) ?
> Chaque bouton doit avoir l'icône du provider.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Le séparateur entre le formulaire et les boutons OAuth affiche "ou continuer avec email" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Le lien "Se connecter" en bas du formulaire pointe vers `/auth/login` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-02 — Validation client (Zod)

**Précondition :** Sur `/auth/register`.

**Étape 1 :** Cliquer "Créer mon compte" sans remplir aucun champ.

**Q1 :** Les messages d'erreur apparaissent-ils sous chaque champ requis ?
> Messages attendus (en français) :
> - Prénom : "Le prénom est requis."
> - Nom : "Le nom est requis."
> - Email : "L'adresse e-mail est requise."
> - Mot de passe : "Le mot de passe est requis."
> - Confirmation : message de validation
> - CGU : message d'erreur
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Saisir un email invalide (ex: "pasunemail") et soumettre.

**Q2 :** Le message "Adresse e-mail invalide." apparaît sous le champ email ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Saisir un mot de passe de 5 caractères (ex: "abc12").

**Q3 :** Le message "Le mot de passe doit contenir au moins 8 caractères." apparaît ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Saisir un mot de passe de 8 caractères sans chiffre (ex: "abcdefgh").

**Q4 :** Le message "Le mot de passe doit contenir au moins un chiffre." apparaît ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 5 :** Saisir un mot de passe de 8 caractères sans lettre (ex: "12345678").

**Q5 :** Le message "Le mot de passe doit contenir au moins une lettre." apparaît ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 6 :** Saisir un mot de passe valide (ex: "Test1234") mais une confirmation différente (ex: "Test5678").

**Q6 :** Le message "Les mots de passe ne correspondent pas." apparaît sous le champ de confirmation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 7 :** Remplir tous les champs correctement mais décocher la case CGU.

**Q7 :** Un message d'erreur indique que les CGU doivent être acceptées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-03 — Inscription réussie

**Précondition :** Sur `/auth/register`, tous les champs sont vides.

**Étape 1 :** Remplir :
- Prénom : `Fatou`
- Nom : `Diop`
- Email : `fatou.diop@example.com`
- Mot de passe : `Fatou2024!` (8+ caractères, lettre + chiffre)
- Confirmation : `Fatou2024!`
- Cocher la case CGU
- Cliquer "Créer mon compte"

**Q1 :** L'utilisateur est redirigé vers `/auth/verify-email` après inscription réussie ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La page `/auth/verify-email` affiche le message demandant de vérifier l'email ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'utilisateur reçoit un email de vérification dans les 2 minutes ?
> Vérifier la boîte mail de fatou.diop@example.com.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-04 — Email déjà utilisé

**Précondition :** Sur `/auth/register`.

**Étape 1 :** Remplir le formulaire avec un email déjà existant (ex: `agent1@dakarimmo.sn`), un mot de passe valide, et les CGU cochées. Soumettre.

**Q1 :** L'API retourne une erreur 422. Le message "Cet email est déjà utilisé." ou équivalent apparaît-il en français sous le champ email ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-05 — Toggle mot de passe

**Précondition :** Sur `/auth/register`.

**Étape 1 :** Saisir un mot de passe dans le champ "Mot de passe".

**Q1 :** Le mot de passe est masqué par défaut (points ou astérisques) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer l'icône œil (👁) à droite du champ mot de passe.

**Q2 :** Le mot de passe devient visible en clair. L'icône change (œil barré).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Recliquer l'icône.

**Q3 :** Le mot de passe est de nouveau masqué. L'icône revient à l'état initial.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Vérifier que le toggle fonctionne indépendamment pour le champ "Confirmer le mot de passe".

**Q4 :** Le toggle du champ confirmation contrôle uniquement ce champ, pas le champ mot de passe ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Vérification de l'email

### TC-AUTH-06 — Lien de vérification

**Précondition :** Avoir reçu l'email de vérification (suite à TC-AUTH-03).

**Étape 1 :** Dans l'email reçu, cliquer le lien "Verify Email Address" ou équivalent.

**Q1 :** Le navigateur s'ouvre sur `/auth/verify-email/[id]/[hash]`. La page affiche un checkmark vert et le message "Adresse email vérifiée ! Votre adresse est confirmée. Vous pouvez maintenant accéder à l'ensemble des fonctionnalités de Takussan."
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer le bouton "Accéder au tableau de bord".

**Q2 :** L'utilisateur est redirigé vers `/app` (ou la page dashboard appropriée à son rôle).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-07 — Lien invalide / expiré

**Précondition :** Construire une URL invalide : `/auth/verify-email/999999/invalidhash123`.

**Étape 1 :** Naviguer vers cette URL.

**Q1 :** La page affiche une icône warning rouge et le message "Vérification impossible — Ce lien est invalide ou a expiré. Demandez un nouvel email de vérification depuis votre espace."
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Demander un nouveau lien".

**Q2 :** Redirige vers `/auth/verify-email`.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-08 — Renvoyer l'email de vérification

**Précondition :** Être connecté avec un compte non vérifié. Naviguer vers `/auth/verify-email`.

**Étape 1 :** Cliquer "Renvoyer l'email de vérification".

**Q1 :** Un bandeau vert apparaît : "Email de vérification renvoyé. Pensez à vérifier votre dossier spam."
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un nouvel email de vérification est reçu.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Le lien "Continuer vers le tableau de bord" est présent et pointe vers `/app`.

**Q3 :** Le lien fonctionne.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Connexion (`/auth/login`)

### TC-AUTH-09 — Formulaire de connexion

**Précondition :** Être déconnecté. Naviguer vers `http://localhost:3000/auth/login`.

**Q1 :** Les champs Email (placeholder "vous@exemple.com") et Mot de passe (placeholder "........") sont présents ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le lien "Mot de passe oublié ?" est présent au-dessus du champ mot de passe et pointe vers `/auth/forgot-password` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le bouton submit affiche "Se connecter" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Les 3 boutons OAuth (Google, Apple, Facebook) sont présents sous le séparateur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Le lien "S'inscrire" en bas pointe vers `/auth/register` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Le toggle afficher/masquer mot de passe fonctionne sur le champ mot de passe ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-10 — Connexion réussie

**Précondition :** Utiliser un compte valide (ex: `agent1@dakarimmo.sn` / `password`).

**Étape 1 :** Saisir l'email et le mot de passe. Cliquer "Se connecter".

**Q1 :** L'utilisateur est redirigé vers `/app` (ou vers l'URL du paramètre `?redirect=` si présent).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La navbar affiche maintenant le nom/prénom de l'utilisateur ou son avatar (plus de bouton "Connexion").
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le menu utilisateur dans la navbar permet d'accéder au profil et de se déconnecter.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-11 — Identifiants incorrects

**Précondition :** Sur `/auth/login`.

**Étape 1 :** Saisir `inconnu@example.com` / `mauvaispassword`. Soumettre.

**Q1 :** L'API retourne une erreur 401. Un message d'erreur en français apparaît ("Email ou mot de passe incorrect" ou similaire).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'utilisateur reste sur la page de login, les champs ne sont pas vidés.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-12 — Validation client (Zod)

**Précondition :** Sur `/auth/login`.

**Étape 1 :** Cliquer "Se connecter" sans rien saisir.

**Q1 :** Les erreurs "L'adresse e-mail est requise." et "Le mot de passe est requis." apparaissent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Saisir un email invalide. Soumettre.

**Q2 :** Le message "Adresse e-mail invalide." apparaît ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-13 — 2FA challenge (si activé)

**Précondition :** Utiliser un compte avec 2FA activée.

**Étape 1 :** Se connecter avec email + mot de passe.

**Q1 :** Au lieu d'être redirigé, le formulaire affiche maintenant un champ "Code à 6 chiffres" avec placeholder "123456".
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un lien "Utiliser un code de récupération" est présent.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Utiliser un code de récupération".

**Q3 :** Le champ change pour accepter un code de récupération (format XXXXX-XXXXX).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer "Utiliser mon application TOTP" pour revenir au mode code.

**Q4 :** Le champ revient au mode 6 chiffres.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Saisir un code TOTP valide depuis l'app authenticator. Cliquer "Vérifier".

**Q5 :** L'utilisateur est connecté et redirigé vers `/app`.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 5 :** Se déconnecter, puis retenter la connexion. Cette fois utiliser un code de récupération.

**Q6 :** Le code de récupération fonctionne et connecte l'utilisateur.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-14 — Throttle (limitation de tentatives)

**Précondition :** Sur `/auth/login`.

**Étape 1 :** Saisir 5 fois de suite un mot de passe incorrect pour le même email.

**Q1 :** Après 5 tentatives, l'API retourne 429 Too Many Requests. Un message indique "Trop de tentatives, veuillez réessayer plus tard" ou similaire.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-15 — Session expirée

**Précondition :** Être connecté. Supprimer manuellement le cookie `auth_token` dans les DevTools (Application > Cookies).

**Étape 1 :** Rafraîchir la page.

**Q1 :** L'utilisateur est redirigé vers `/auth/login?redirect=...` avec un message "Votre session a expiré. Veuillez vous reconnecter."
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. OAuth

### TC-AUTH-16 — OAuth Google

**Précondition :** Sur `/auth/login` ou `/auth/register`, être déconnecté.

**Étape 1 :** Cliquer "Continuer avec Google".

**Q1 :** Le navigateur est redirigé vers l'URL d'autorisation Google (`accounts.google.com`).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Autoriser l'accès sur la page Google.

**Q2 :** L'utilisateur est redirigé vers `/auth/oauth/google/callback?code=...&state=...`. Une page transitoire affiche "Connexion en cours..." avec un spinner.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Après traitement, l'utilisateur est connecté et redirigé vers `/app` (ou l'URL du paramètre `redirect`).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-17 — OAuth Facebook

**Précondition :** Sur `/auth/login`, être déconnecté.

**Étape 1 :** Cliquer "Continuer avec Facebook".

**Q1 :** Redirection vers la page d'autorisation Facebook.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Autoriser l'accès.

**Q2 :** Retour sur Takussan, connexion réussie, redirection vers `/app`.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-18 — OAuth Apple

**Précondition :** Sur `/auth/login`, être déconnecté.

**Étape 1 :** Cliquer "Continuer avec Apple".

**Q1 :** Redirection vers la page d'autorisation Apple.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Autoriser l'accès.

**Q2 :** Retour sur Takussan, connexion réussie, redirection vers `/app`.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-19 — Échec OAuth

**Précondition :** Simuler un échec OAuth (ex: refuser l'autorisation sur Google).

**Étape 1 :** Refuser l'autorisation.

**Q1 :** L'utilisateur est redirigé vers `/auth/login?error=oauth_failed` (ou `oauth_invalid`). Un message d'erreur approprié est affiché.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-20 — Provider inconnu

**Précondition :** Naviguer vers `/auth/oauth/github/callback?code=test&state=test`.

**Q1 :** La page affiche "Fournisseur inconnu" sans spinner.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Mot de passe oublié (`/auth/forgot-password`)

### TC-AUTH-21 — Formulaire

**Précondition :** Être déconnecté. Naviguer vers `http://localhost:3000/auth/forgot-password`.

**Q1 :** La page affiche un champ email (placeholder "vous@exemple.com") et un bouton "Envoyer le lien" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le lien "Retour à la connexion" pointe vers `/auth/login` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-22 — Soumission (protection anti-énumération)

**Précondition :** Sur `/auth/forgot-password`.

**Étape 1 :** Saisir l'email `agent1@dakarimmo.sn` (email existant). Cliquer "Envoyer le lien".

**Q1 :** La page passe en mode "succès" : icône checkmark verte, titre "Vérifiez votre boîte mail", message "Si un compte existe pour agent1@dakarimmo.sn, un lien de réinitialisation vient de vous être envoyé. Il est valable 60 minutes."
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un email de réinitialisation est bien reçu.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Retourner à `/auth/forgot-password`. Saisir un email inexistant `inconnu123@fake.com`. Soumettre.

**Q3 :** Le même message de succès apparaît (pas de message "email introuvable" — protection anti-énumération).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Réinitialisation du mot de passe (`/auth/reset-password`)

### TC-AUTH-23 — Lien valide

**Précondition :** Cliquer le lien reçu par email (format `/auth/reset-password?token=...&email=...`).

**Étape 1 :** La page s'ouvre.

**Q1 :** Les champs "Nouveau mot de passe" (placeholder "Au moins 8 caractères") et "Confirmer le mot de passe" sont affichés avec des toggles œil.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le bouton submit affiche "Définir le nouveau mot de passe" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Saisir `NouveauPass123!` dans les deux champs. Soumettre.

**Q3 :** L'utilisateur est redirigé vers `/auth/login?reset=1`. Un message "Mot de passe réinitialisé avec succès, connectez-vous." apparaît-il ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Se connecter avec l'ancien mot de passe.

**Q4 :** La connexion échoue (l'ancien mot de passe ne fonctionne plus).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Se connecter avec le nouveau mot de passe `NouveauPass123!`.

**Q5 :** La connexion réussit.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-24 — Lien invalide

**Précondition :** Naviguer vers `/auth/reset-password` sans paramètres (ou avec `token=invalide`).

**Q1 :** La page affiche une icône warning rouge et le message "Lien invalide — Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau."
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le lien "Demander un nouveau lien" pointe vers `/auth/forgot-password`.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-25 — Réutilisation du lien

**Précondition :** Avoir déjà utilisé un lien de reset avec succès.

**Étape 1 :** Réessayer le même lien (même token et email).

**Q1 :** Le lien ne fonctionne plus — message "Lien invalide" ou "Ce lien a déjà été utilisé".
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. Édition du profil (`/app/profile`)

### TC-AUTH-26 — Page profil

**Précondition :** Être connecté (ex: `agent1@dakarimmo.sn`). Naviguer vers `/app/profile`.

**Q1 :** La page affiche l'en-tête avec avatar (initiales si pas de photo), nom complet, email, et badge de rôle ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un bouton "Modifier le profil" est visible dans l'en-tête ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-27 — Modification nom / bio

**Précondition :** Sur `/app/profile`.

**Étape 1 :** Cliquer "Modifier le profil".

**Q1 :** Une modale s'ouvre avec les champs Prénom, Nom, Bio (max 500 caractères).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Modifier le prénom en `Amadou`, le nom en `Diallo`, la bio en `Agent immobilier chez Dakar Immo.`. Sauvegarder.

**Q2 :** La modale se ferme. L'en-tête est mis à jour immédiatement avec le nouveau nom "Amadou Diallo".
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Rafraîchir la page.

**Q3 :** Les modifications sont persistées.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Restaurer les valeurs originales.

**Q4 :** La modification inverse fonctionne aussi.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-28 — Section contact (bio + téléphone)

**Précondition :** Sur `/app/profile`.

**Q1 :** La section "Contact" affiche l'email (avec statut vérifié/non vérifié), le téléphone (avec statut vérifié/non vérifié) et la bio ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 1 :** Modifier la bio directement dans cette section. Ex: "Nouvelle bio test 123". Sauvegarder.

**Q2 :** La bio est mise à jour. Le compteur de caractères fonctionne (max 500).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-29 — Avatar (upload)

**Précondition :** Sur `/app/profile`, dans la modale "Modifier le profil".

**Q1 :** Un champ d'upload d'avatar est présent (JPG/PNG accepté) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 1 :** Uploader une image JPG valide (< 2 Mo).

**Q2 :** L'image est uploadée et l'avatar est mis à jour dans l'en-tête.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-30 — Section "Mes profils"

**Précondition :** Sur `/app/profile`, utilisateur avec au moins un profil (ex: agent1 a un profil Agent).

**Q1 :** La section "Mes profils" liste chaque profil avec son type (badge coloré), le nom de l'agence, et les champs KYC ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Pour un agent : les champs license_number et spécialisation sont affichés (lecture seule si pas encore câblés).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Pour un owner : les champs RIB et tax_id sont affichés.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-31 — Profile Switcher (multi-profils)

**Précondition :** Utiliser un compte avec plusieurs profils (ex: un user qui est à la fois owner chez Agence A et agent chez Agence B). Si aucun compte multi-profil n'existe, passer ce TC (🔲).

**Étape 1 :** Ouvrir le menu de sélection de profil dans la navbar/header.

**Q1 :** La liste des profils est affichée, groupée par type (Agent, Propriétaire, Courtier, Prestataire). Le profil actif est coché.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sélectionner un autre profil.

**Q2 :** L'interface change pour refléter le nouveau profil actif (rôle, permissions, données). Pas de re-login nécessaire.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un utilisateur mono-profil voit un label statique au lieu d'un dropdown.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. Sécurité (`/app/profile` — sections sécurité)

### TC-AUTH-32 — Section sécurité (vue d'ensemble)

**Précondition :** Sur `/app/profile`, descendre à la section sécurité.

**Q1 :** La section sécurité affiche les sous-sections : Email (statut vérification), 2FA (statut activation), Téléphone (statut vérification), Sessions actives, Suppression de compte.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-33 — Activation 2FA (TOTP)

**Précondition :** 2FA désactivée. Dans la section sécurité sur `/app/profile`.

**Étape 1 :** Cliquer "Activer la 2FA".

**Q1 :** Un QR code s'affiche. En dessous, la clé secrète en texte (pour copie manuelle).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Scanner le QR code avec Google Authenticator ou Authy. Noter le code TOTP généré.

**Q2 :** L'app d'authentification affiche un code à 6 chiffres pour Takussan.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Saisir le code TOTP dans le champ de confirmation et valider.

**Q3 :** Un bandeau ambre affiche les codes de récupération (5 codes). La section 2FA passe en état "Activée".
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Copier les codes de récupération et les sauvegarder.

**Q4 :** Le bouton "Régénérer les codes de récupération" est disponible.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-34 — Régénération codes de récupération

**Précondition :** 2FA activée.

**Étape 1 :** Cliquer "Régénérer les codes de récupération".

**Q1 :** Une confirmation est demandée. Les anciens codes sont invalidés. De nouveaux codes sont affichés.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-35 — Désactivation 2FA

**Précondition :** 2FA activée.

**Étape 1 :** Cliquer "Désactiver la 2FA".

**Q1 :** Le système demande le mot de passe (ou un code TOTP) pour confirmer.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Saisir le mot de passe correct et valider.

**Q2 :** La 2FA est désactivée. Le statut passe à "Désactivée". Les prochaines connexions ne demandent plus de code TOTP.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-36 — Vérification téléphone (OTP)

**Précondition :** Sur `/app/profile`, section téléphone.

**Étape 1 :** Saisir un numéro de téléphone (format +221XXXXXXXXX). Sauvegarder.

**Q1 :** Le numéro est enregistré. Un bandeau ambre invite à vérifier le numéro.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Vérifier le téléphone". Un SMS avec code OTP est envoyé (en dev : vérifier les logs backend).

**Q2 :** Un champ de saisie à 6 chiffres apparaît.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Saisir le code reçu par SMS. Valider.

**Q3 :** Le téléphone est marqué comme vérifié. Le bandeau ambre disparaît. Une icône verte "✓ Vérifié" apparaît.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-37 — Échec OTP téléphone

**Précondition :** Téléphone non vérifié, code OTP demandé.

**Étape 1 :** Saisir un code OTP incorrect (ex: 000000). Valider.

**Q1 :** Un message d'erreur "Code incorrect" apparaît. Le téléphone reste non vérifié.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Tenter de renvoyer un code OTP plusieurs fois rapidement.

**Q2 :** Un rate-limiting s'applique (429). Message "Trop de tentatives, réessayez dans X secondes."
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-38 — Sessions actives

**Précondition :** Sur `/app/profile`, section "Sessions actives".

**Q1 :** La liste des sessions est affichée avec pour chaque session : nom (device), dernière activité, IP.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La session actuelle est marquée (label "Session actuelle" ou bouton "Révoquer" désactivé).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 1 :** Cliquer "Révoquer" sur une session autre que l'actuelle.

**Q3 :** La session disparaît de la liste. L'appareil correspondant sera déconnecté à sa prochaine requête.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-39 — Déconnexion

**Précondition :** Être connecté.

**Étape 1 :** Depuis la navbar, ouvrir le menu utilisateur et cliquer "Déconnexion" (ou "Se déconnecter").

**Q1 :** Le cookie `auth_token` est supprimé. L'utilisateur est redirigé vers `/auth/login`.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Tenter d'accéder à `/app` après déconnexion redirige vers `/auth/login`.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 9. Suppression de compte — RGPD

### TC-AUTH-40 — Demande de suppression

**Précondition :** Être connecté avec un compte sans baux actifs ni paiements en attente. Sur `/app/profile`, section "Suppression de compte".

**Étape 1 :** Cliquer "Supprimer mon compte".

**Q1 :** Une modale s'ouvre avec un sélecteur de motif (radio) : "Service complété", "Qualité du service", "Confidentialité", "Autre". Un champ texte libre optionnel est disponible.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sélectionner "Autre" et saisir "Test QA suppression". Cliquer "Continuer".

**Q2 :** Une deuxième étape demande de ré-authentifier : mot de passe requis (+ code TOTP si 2FA activée).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Saisir le mot de passe correct. Valider.

**Q3 :** La demande est enregistrée. Un bandeau rouge sticky apparaît en haut de toutes les pages : "Votre compte sera supprimé le [date J+30]". Un bouton "Annuler la suppression" est présent.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-41 — Blocage si obligations

**Précondition :** Utiliser un compte avec des baux actifs ou des paiements en attente.

**Étape 1 :** Tenter de supprimer le compte.

**Q1 :** L'API retourne 422 avec la liste des obligations. La modale affiche "Vous ne pouvez pas supprimer votre compte car vous avez des obligations en cours : [liste des baux/paiements]".
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-42 — Annulation de la suppression

**Précondition :** Avoir une demande de suppression en cours (bannière rouge visible).

**Étape 1 :** Cliquer "Annuler la suppression" sur la bannière.

**Q1 :** La bannière disparaît. La demande est annulée. Le compte n'est plus programmé pour suppression.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-43 — Compte à rebours

**Précondition :** Avoir une demande de suppression.

**Q1 :** La bannière affiche le nombre exact de jours restants (ex: "Suppression dans 29 jours"). Le jour J, elle indique "Aujourd'hui".
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. Centre de notifications

### TC-NOTIF-01 — Cloche de notifications

**Précondition :** Être connecté.

**Q1 :** Une icône cloche est visible dans la navbar. S'il y a des notifications non lues, un badge rouge avec le nombre est affiché.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 1 :** Cliquer la cloche.

**Q2 :** Un dropdown/feed s'ouvre avec la liste des notifications récentes.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-NOTIF-02 — Distinction lu / non lu

**Précondition :** Avoir des notifications (ex: après réception d'un message).

**Q1 :** Les notifications non lues ont un fond différent (gris clair ou point bleu) par rapport aux notifications lues.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-NOTIF-03 — Marquer comme lu

**Étape 1 :** Cliquer sur une notification non lue.

**Q1 :** La notification passe en état "lu". Le badge de compteur diminue de 1.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Tout marquer comme lu" (si disponible).

**Q2 :** Toutes les notifications passent en "lu". Le badge disparaît.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-NOTIF-04 — Temps réel (polling)

**Précondition :** Ouvrir deux onglets : un avec le dashboard, un autre pour déclencher une notification.

**Étape 1 :** Depuis l'onglet 2, envoyer un message à l'utilisateur de l'onglet 1.

**Q1 :** Dans l'onglet 1, le badge de notifications se met à jour automatiquement (sans rechargement manuel).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-NOTIF-05 — Notifications email transactionnelles

**Précondition :** Configurer le backend pour envoyer de vrais emails (ou utiliser Mailpit/MailHog en dev).

**Q1 :** Un email est reçu pour les événements suivants : nouveau message, changement de statut de réservation, rappel de paiement, alerte de visite.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 11. Préférences de notifications (`/app/profile/notifications`)

### TC-NOTIF-06 — Matrice de préférences

**Précondition :** Être connecté. Naviguer vers `/app/profile/notifications`.

**Q1 :** La page affiche une matrice avec les catégories d'événements en lignes et les canaux en colonnes (In-app, Email, Push, SMS) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les 6 catégories sont présentes : Messages, Réservations, Baux, Maintenance, Avis, Alertes ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le canal "In-app" est toujours activé (cases grisées/lockées).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-NOTIF-07 — Toggle de canal

**Étape 1 :** Décocher "Email" pour la catégorie "Messages". Cocher "Push".

**Q1 :** La modification est enregistrée immédiatement (pas de bouton submit global). Un indicateur de succès apparaît brièvement.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Rafraîchir la page.

**Q2 :** Les préférences sont persistées.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-NOTIF-08 — Téléphone non vérifié

**Précondition :** Téléphone non vérifié.

**Q1 :** Un bandeau ambre en haut de la page indique "Vous devez vérifier votre numéro de téléphone pour activer les notifications SMS."
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les cases SMS sont grisées/lockées quand le téléphone n'est pas vérifié.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 12. Recherche et filtres transversaux

### TC-SEARCH-01 — Recherche plein-texte

**Précondition :** Naviguer vers `/properties`.

**Q1 :** La recherche via le paramètre `?search=appartement` retourne des résultats filtrés par pertinence ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SEARCH-02 — Combinaison de filtres

**Étape 1 :** Appliquer simultanément : type=Villa, transaction=Vente, ville=Dakar, budget 10M-50M FCFA.

**Q1 :** Les résultats sont correctement filtrés (intersection de tous les critères). L'URL reflète tous les paramètres.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SEARCH-03 — Pagination

**Q1 :** La pagination fonctionne avec des URLs de type `?page=2`. Le changement de page conserve les autres paramètres de filtre.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SEARCH-04 — Tri

**Étape 1 :** Trier par prix croissant, prix décroissant, date (plus récent), pertinence.

**Q1 :** Chaque option de tri réordonne correctement les résultats. L'URL contient le paramètre `sort`.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SEARCH-05 — Recherches sauvegardées

**Précondition :** Être connecté. Sur `/properties` avec des filtres actifs.

**Q1 :** Un bouton "Sauvegarder la recherche" est-il disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 1 :** Cliquer "Sauvegarder la recherche". Nommer la recherche "Test QA".

**Q2 :** La recherche apparaît dans `/app/saved-searches` (si cette page existe). Des alertes email sont envoyées quand de nouveaux biens correspondent.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 13. Upload de médias et fichiers

### TC-MEDIA-01 — Upload image JPG

**Précondition :** Testé via l'upload d'avatar sur `/app/profile` ou via le formulaire de création de bien sur `/app/properties/new`.

**Étape 1 :** Uploader un fichier JPG valide (< 2 Mo).

**Q1 :** L'upload réussit. Une miniature est générée automatiquement. Le fichier est visible dans l'interface.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-MEDIA-02 — Fichier trop volumineux

**Étape 1 :** Tenter d'uploader une image > 10 Mo.

**Q1 :** Un message d'erreur explicite en français indique la taille maximale autorisée.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-MEDIA-03 — Type de fichier non autorisé

**Étape 1 :** Tenter d'uploader un fichier .exe ou .zip renommé en .jpg.

**Q1 :** Le fichier est refusé. Message de validation : "Type de fichier non autorisé" ou similaire.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-MEDIA-04 — Suppression

**Étape 1 :** Supprimer un média uploadé.

**Q1 :** Le média disparaît de l'interface. Après rafraîchissement, il n'est plus visible.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-MEDIA-05 — Multi-upload (drag & drop)

**Précondition :** Sur la page de gestion des médias d'un bien.

**Q1 :** Le drag & drop de plusieurs fichiers simultanément est-il supporté ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-MEDIA-06 — Réorganisation

**Précondition :** Avoir plusieurs médias sur un bien.

**Q1 :** Le glisser-déposer permet de réordonner les médias. L'ordre est persisté après rafraîchissement.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 14. Internationalisation — i18n

### TC-I18N-01 — Sélecteur de langue

**Précondition :** Être connecté, sur n'importe quelle page.

**Q1 :** Un sélecteur de langue est visible dans la navbar ou le footer. Les options sont : FR (Français), EN (English), WO (Wolof).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-I18N-02 — Changement de langue

**Étape 1 :** Passer de FR à EN.

**Q1 :** Toute l'interface passe en anglais : labels de navigation, boutons, titres de section, placeholders de formulaire, messages d'erreur.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Vérifier spécifiquement sur `/auth/login` : le titre, les champs, le bouton submit, le lien "Mot de passe oublié", et le lien "S'inscrire" sont-ils tous en anglais ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Vérifier sur `/app/profile` : les titres de section (Profil, Sécurité, Notifications) sont-ils traduits ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Vérifier la page d'erreur 404 : le message est-il traduit ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-I18N-03 — Wolof (couverture partielle)

**Étape 1 :** Passer en WO (Wolof).

**Q1 :** Les éléments suivants sont-ils traduits en wolof : nom de l'app (Takussan), navigation principale (Kër, Kër yi, Yi ma bëgg...), bouton Connexion/Déconnexion ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les éléments NON traduits tombent-ils gracieusement en français (fallback) et non en anglais ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-I18N-04 — Persistance de la langue

**Étape 1 :** Passer en EN. Se déconnecter. Se reconnecter.

**Q1 :** L'interface est toujours en anglais après reconnexion.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-I18N-05 — Format des dates

**Étape 1 :** En français : vérifier que les dates s'affichent en DD/MM/YYYY (ex: 04/05/2026).
**Étape 2 :** En anglais : vérifier le format US MM/DD/YYYY.

**Q1 :** Le format de date change selon la langue sélectionnée.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-I18N-06 — Format des montants

**Étape 1 :** Vérifier l'affichage d'un prix (ex: 15000000) sur une fiche bien.

**Q1 :** En français : "15 000 000 F CFA" (séparateur espace, devise F CFA). Le format est cohérent sur toutes les pages (dashboard, liste, fiche).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-I18N-07 — Fuseau horaire

**Q1 :** Les heures affichées (ex: "dernière connexion il y a X minutes", "créé le ...") sont dans le fuseau Africa/Dakar (UTC+0).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-I18N-08 — Messages d'erreur API en français

**Étape 1 :** Provoquer une erreur 422 (champ invalide) ou 401 (connexion échouée).

**Q1 :** Le message d'erreur est en français (pas en anglais). Ex: "L'adresse e-mail est requise." et non "The email field is required."
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 15. Protection des routes authentifiées

### TC-AUTH-44 — Redirection après login

**Précondition :** Être déconnecté. Tenter d'accéder à une route protégée.

**Étape 1 :** Naviguer vers `/app/properties` sans être connecté.

**Q1 :** Redirigé vers `/auth/login?redirect=%2Fapp%2Fproperties`. Après connexion, l'utilisateur revient sur `/app/properties`.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-45 — Accès dashboard par rôle

**Précondition :** Se connecter avec chaque rôle disponible (agent, owner, customer/tenant, agency_admin, super_admin).

**Q1 :** Chaque rôle accède à un dashboard adapté sans erreur 403. Les menus et liens visibles correspondent aux permissions du rôle.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 16. Récapitulatif des bugs trouvés

| # | Sévérité | TC | Page | Description | Statut |
|---|----------|----|------|-------------|--------|
| | P0 | | | | |
| | P1 | | | | |
| | P2 | | | | |
| | P3 | | | | |

---

## 17. Notes du testeur

> _______________________________________________
> _______________________________________________
> _______________________________________________
