# QA — Tous les utilisateurs authentifiés 👥

**Acteur :** Tout utilisateur connecté (locataire, bailleur, agent, admin)
**Précondition :** Avoir un compte valide sur la plateforme
**Environnement :** `http://localhost:3000` · `http://localhost:8002`
**Testeur :**
**Date :**
**Version :**

> Ces tests s'appliquent à **tous les rôles**. Ils couvrent l'authentification, les notifications, la recherche, les médias et l'internationalisation.

---

## Légende

| Statut | Signification |
|--------|---------------|
| ✅ Pass | Fonctionne comme attendu |
| ❌ Fail | Bug ou comportement incorrect |
| ⚠️ Partiel | Fonctionne avec réserves |
| 🔲 Non testé | Pas encore vérifié |

---

## 1. Inscription (`/auth/register`)

### TC-AUTH-01 — Créer un compte

**Q1 :** Le formulaire affiche les champs Prénom, Nom, Email, Mot de passe, Confirmation du mot de passe ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les options OAuth (Google, Facebook, Apple) sont proposées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La case CGU est présente et doit être cochée pour valider ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Soumettre sans cocher les CGU affiche un message d'erreur en français ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Un mot de passe de moins de 8 caractères déclenche une erreur de validation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** La confirmation de mot de passe incorrecte déclenche une erreur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q7 :** Un email déjà utilisé déclenche un message "cet email est déjà pris" (en français) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q8 :** Après inscription réussie, l'utilisateur reçoit un email de vérification ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q9 :** Le bouton toggle "afficher/masquer mot de passe" (👁) fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Vérification de l'email

### TC-AUTH-02 — Lien de vérification

**Q1 :** L'email de vérification est reçu dans les 2 minutes après inscription ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Cliquer le lien dans l'email confirme le compte et redirige vers l'app ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un lien expiré/invalide affiche un message d'erreur explicite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le bouton "Renvoyer l'email de vérification" fonctionne (`/auth/verify-email`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Connexion (`/auth/login`)

### TC-AUTH-03 — Connexion email/mot de passe

**Q1 :** La connexion avec des identifiants valides redirige vers le dashboard `/app` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Des identifiants incorrects affichent une erreur en français ("Email ou mot de passe incorrect") ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le champ mot de passe dispose d'un toggle afficher/masquer ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Après 5 tentatives ratées, le compte est temporairement bloqué (throttle) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AUTH-04 — OAuth

**Q1 :** "Continuer avec Google" redirige vers la page d'autorisation Google ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Après autorisation Google, l'utilisateur est connecté et redirigé vers `/app` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** "Continuer avec Facebook" fonctionne de la même façon ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** "Continuer avec Apple" fonctionne de la même façon ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. Mot de passe oublié / réinitialisation

### TC-AUTH-05

**Q1 :** La page `/auth/forgot-password` affiche un champ email et un bouton "Envoyer le lien" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Après soumission d'un email valide, un message de confirmation en français s'affiche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'email de réinitialisation est reçu et le lien fonctionne (`/auth/reset-password`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le nouveau mot de passe est accepté et la connexion réussit ensuite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Un lien de réinitialisation utilisé une fois ne peut pas être réutilisé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Édition du profil (`/app/profile`)

### TC-AUTH-06

**Q1 :** La page profil affiche les champs Prénom, Nom, Email, Bio, Avatar ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Modifier le prénom/nom et sauvegarder met à jour les données correctement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'upload d'un avatar (JPG/PNG) fonctionne et affiche la nouvelle photo ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Modifier la bio et sauvegarder conserve les changements après rechargement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Vérification du téléphone (P1)

### TC-AUTH-07

**Q1 :** Un champ numéro de téléphone est disponible dans le profil ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Cliquer "Vérifier le téléphone" envoie un SMS avec un code OTP ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Saisir le bon code OTP marque le téléphone comme vérifié ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Un code OTP incorrect affiche une erreur et ne valide pas le téléphone ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. Authentification à deux facteurs — 2FA (P1)

### TC-AUTH-08

**Q1 :** L'option d'activer la 2FA est disponible dans le profil/sécurité ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'activation affiche un QR code scannable avec une app TOTP (Authy, Google Authenticator) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Confirmer avec un code TOTP valide active la 2FA et affiche des codes de récupération ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Après activation, la prochaine connexion demande le code TOTP ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Un code de récupération peut être utilisé à la place du code TOTP ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** La désactivation de la 2FA nécessite la confirmation du code TOTP ou du mot de passe ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q7 :** La régénération des codes de récupération invalide les anciens codes ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. Gestion des sessions (P1)

### TC-AUTH-09

**Q1 :** La page profil/sécurité liste les sessions actives (appareil, date, IP) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Il est possible de révoquer une session individuelle autre que la session actuelle ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La déconnexion (`/auth/logout`) révoque le token actuel et redirige vers `/auth/login` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 9. Suppression de compte — RGPD (P2)

### TC-AUTH-10

**Q1 :** Une option "Supprimer mon compte" est accessible dans les paramètres du profil ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La suppression demande une confirmation (mot de passe ou texte de confirmation) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Après la demande, tous les tokens sont révoqués (déconnexion forcée) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Il est possible d'annuler la demande de suppression dans un délai de grâce ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. Centre de notifications (`/app/profile/notifications`)

### TC-NOTIF-01

**Q1 :** La cloche de notifications est visible dans la navbar avec un badge de compteur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Cliquer la cloche ouvre un feed des dernières notifications ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les notifications non lues sont visuellement distinctes (fond différent, point bleu) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Cliquer "Tout marquer comme lu" vide le badge et efface les indicateurs ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Une action déclenchant une notification (ex: nouveau message) met à jour le badge en temps réel sans rechargement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Un email transactionnel est reçu pour les événements critiques (réservation, message, paiement) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-NOTIF-02 — Préférences de notifications (P1)

**Q1 :** La page `/app/profile/notifications` permet de configurer les canaux (email, push, SMS) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Désactiver les notifications email pour un type d'événement arrête bien leur envoi ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 11. Recherche et filtres transversaux

### TC-SEARCH-01 — Recherche plein-texte

**Q1 :** La recherche plein-texte sur les biens via `?search=` retourne des résultats pertinents ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les filtres dynamiques (via query params) fonctionnent et se combinent correctement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La pagination standardisée (par_page, page) fonctionne correctement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le tri dynamique sur toutes les colonnes listables fonctionne (sort=, sort=-) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SEARCH-02 — Recherches sauvegardées (P1)

**URL :** `/app/saved-searches`

**Q1 :** Depuis la page de recherche, un bouton "Sauvegarder la recherche" est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La recherche sauvegardée apparaît dans `/app/saved-searches` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Des alertes email sont envoyées quand de nouveaux biens correspondent à une recherche sauvegardée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Il est possible de supprimer une recherche sauvegardée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 12. Upload de médias et fichiers

### TC-MEDIA-01

**Q1 :** L'upload d'un fichier JPG (photo de bien, avatar) fonctionne correctement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un fichier dépassant la taille limite est rejeté avec un message d'erreur explicite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un type de fichier non autorisé (ex: .exe) est refusé par la validation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Les miniatures (thumbnails) des images sont générées automatiquement après upload ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** La suppression d'un fichier uploadé fonctionne et le supprime du stockage ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 13. Internationalisation — i18n

### TC-I18N-01

**Q1 :** Le sélecteur de langue est accessible depuis la navbar (FR / EN / WO) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Passer en anglais traduit l'intégralité de l'interface (labels, boutons, messages d'erreur) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Passer en wolof (WO) traduit l'interface (ou affiche un avertissement si incomplet) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** La préférence de langue est persistée après déconnexion/reconnexion ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Les dates s'affichent selon le format local (DD/MM/YYYY en FR, MM/DD/YYYY en EN) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Les montants sont formatés avec le bon séparateur et la bonne devise (F CFA par défaut) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q7 :** Le fuseau horaire Africa/Dakar est appliqué par défaut pour l'affichage des heures ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q8 :** Aucun message d'erreur ne reste en anglais quand l'interface est en français ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 14. Récapitulatif des bugs trouvés

| # | Sévérité | Fonctionnalité | Description | Statut |
|---|----------|---------------|-------------|--------|
| | P0 | | | |
| | P1 | | | |
| | P2 | | | |
| | P3 | | | |

---

## 15. Notes du testeur

> _______________________________________________
> _______________________________________________
> _______________________________________________
