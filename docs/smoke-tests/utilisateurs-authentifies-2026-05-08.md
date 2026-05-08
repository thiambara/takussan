---
date: 2026-05-08
tester: Codex
source: docs/qa/utilisateurs-authentifies-qa.md
environment: local dev, frontend http://localhost:3000, backend http://localhost:8002
account: agent1@dakarimmo.sn / password; fatou.diop@example.com cree pendant le test
---

# Smoke test browser - Utilisateurs authentifies

## Contexte

Smoke execute dans un vrai navigateur local via Chrome DevTools MCP. Les serveurs etaient deja demarres sur les ports attendus. La base SQLite locale etait migree et seedee.

Limites: les parcours necessitant une boite mail reelle, un SMS reel, une validation OAuth externe, un code TOTP authenticator, un compte multi-profil, ou des fichiers de test lourds n'ont pas ete finalises. Les emails de dev ont ete verifies via `takussan-api/storage/logs/laravel.log`.

Mutations de test nettoyees: bio de `agent1@dakarimmo.sn` remise a `null`; preference `message_received/email` remise a `enabled=true`.

## Synthese

| Statut | Nombre |
|---|---:|
| Pass | 17 |
| Partiel | 20 |
| Fail | 11 |
| Non teste / bloque | 24 |

## Resultats par test

| TC | Statut | Reponses smoke |
|---|---|---|
| TC-AUTH-01 - Formulaire inscription | Partiel | Panneau gauche, logo, tagline et image Unsplash presents. Champs et placeholders corrects. OAuth Google/Apple/Facebook presents. Fail: l'ordre est OAuth -> separateur -> champs, alors que la spec attend champs -> submit -> separateur -> OAuth. Separateur affiche `OU CONTINUER AVEC EMAIL` en majuscules. |
| TC-AUTH-02 - Validation inscription | Partiel | Erreurs client presentes. Email invalide, mot de passe trop court, sans chiffre, sans lettre, confirmation differente et CGU fonctionnent. Reserve: champ mot de passe vide affiche `Le mot de passe doit contenir au moins 8 caracteres.` au lieu de `Le mot de passe est requis.` |
| TC-AUTH-03 - Inscription reussie | Pass | `fatou.diop@example.com` cree; redirection vers `/auth/verify-email`; message de verification affiche. Email de verification recu dans les logs dans la minute. |
| TC-AUTH-04 - Email deja utilise | Non teste | Non rejoue dans ce smoke pour eviter de multiplier les soumissions d'inscription. |
| TC-AUTH-05 - Toggle mot de passe | Fail | Mot de passe masque par defaut; clic oeil rend visible et change le libelle en `Masquer le mot de passe`. Fail: aucun toggle independant pour confirmation; le toggle unique rend les deux champs visibles. |
| TC-AUTH-06 - Lien verification email | Fail | Le lien email pointe vers `http://127.0.0.1:8002/api/auth/verify-email/...`; ouvert directement, il retourne `{"message":"Unauthenticated."}` au lieu d'afficher la page frontend de succes. |
| TC-AUTH-07 - Lien verification invalide | Pass | `/auth/verify-email/999999/invalidhash123` affiche `Verification impossible` et le lien `Demander un nouveau lien` vers `/auth/verify-email`. |
| TC-AUTH-08 - Renvoyer verification | Fail | Sur `/auth/verify-email`, clic `Renvoyer l'email de verification` affiche `Impossible de renvoyer l'email. Reessayez dans quelques instants.` Pas de bandeau vert constate. Lien `Continuer vers le tableau de bord` present. |
| TC-AUTH-09 - Formulaire login | Partiel | Champs, lien forgot, submit, OAuth et lien inscription presents. Toggle password OK. Reserve: placeholder password est `••••••••`, pas `........`. |
| TC-AUTH-10 - Connexion reussie | Pass | `agent1@dakarimmo.sn / password` redirige vers `/app`; navbar affiche `Ousmane Ndiaye`; menu utilisateur contient `Mon profil` et `Deconnexion`. |
| TC-AUTH-11 - Identifiants incorrects | Fail | L'utilisateur reste sur login et les champs sont conserves. Fail: message API affiche `Invalid credentials.` en anglais. |
| TC-AUTH-12 - Validation login | Pass | Champs vides: erreurs email et mot de passe requises. Email invalide: `Adresse e-mail invalide.` |
| TC-AUTH-13 - 2FA challenge login | Non teste | Aucun compte 2FA actif disponible. |
| TC-AUTH-14 - Throttle login | Pass | Apres tentatives, login affiche `Trop de tentatives. Reessayez dans quelques minutes.` |
| TC-AUTH-15 - Session expiree | Non teste | Suppression manuelle de cookie non executee dans ce smoke. |
| TC-AUTH-16 - OAuth Google | Partiel | Clic redirige bien vers `accounts.google.com` avec callback `http://localhost:3000/auth/oauth/google/callback`. Autorisation externe non finalisee. |
| TC-AUTH-17 - OAuth Facebook | Partiel | Clic redirige vers Facebook, mais Facebook affiche `Invalid App ID`. Connexion retour non testable. |
| TC-AUTH-18 - OAuth Apple | Partiel | Clic redirige vers `appleid.apple.com`, mais Apple affiche `invalid_request / Invalid OAuth Client Request`. Connexion retour non testable. |
| TC-AUTH-19 - Echec OAuth | Non teste | Refus OAuth externe non execute. |
| TC-AUTH-20 - Provider inconnu | Pass | `/auth/oauth/github/callback?code=test&state=test` affiche `Fournisseur inconnu`, sans spinner. |
| TC-AUTH-21 - Forgot password formulaire | Pass | Champ email placeholder `vous@exemple.com`, bouton `Envoyer le lien`, lien retour vers `/auth/login`. |
| TC-AUTH-22 - Forgot password soumission | Pass | Email existant et inexistant affichent le meme succes anti-enumeration. Email reset recu dans les logs pour l'email existant. |
| TC-AUTH-23 - Reset password valide | Partiel | Email recu, mais le lien fourni est `/reset-password?...` et ouvre une 404. En corrigeant manuellement vers `/auth/reset-password?...`, le formulaire fonctionne, l'ancien mot de passe echoue et le nouveau connecte. Reserve: un seul toggle, et pas de message `Mot de passe reinitialise avec succes` sur `/auth/login?reset=1`. |
| TC-AUTH-24 - Reset password invalide | Pass | `/auth/reset-password` sans parametres affiche `Lien invalide` et lien `Demander un nouveau lien` vers `/auth/forgot-password`. |
| TC-AUTH-25 - Reutilisation lien reset | Non teste | Le meme lien n'a pas ete rejoue apres succes. |
| TC-AUTH-26 - Page profil | Pass | Header profil avec avatar, nom, email, role, bouton `Modifier le profil`. |
| TC-AUTH-27 - Modification nom/bio modal | Fail | Modale avec prenom, nom, bio. Sauvegarde nom `Amadou Diallo` ferme la modale mais l'en-tete reste `Ousmane Ndiaye`. |
| TC-AUTH-28 - Section contact | Pass | Email verifie, telephone non verifie, bio et compteur `/500`. Bio modifiee puis persiste apres reload. |
| TC-AUTH-29 - Avatar upload | Fail | Aucun champ upload avatar visible dans la modale `Modifier le profil`. |
| TC-AUTH-30 - Mes profils | Partiel | Section `Mes profils` affiche le profil Agent et l'agence. Champs owner non verifiables avec ce compte. |
| TC-AUTH-31 - Profile switcher | Partiel | Compte mono-profil: label statique `Agent · Dakar Immo` visible. Multi-profil non teste. |
| TC-AUTH-32 - Securite overview | Partiel | Sections Email, 2FA, telephone, sessions, suppression visibles. Reserve i18n: bloc suppression en anglais (`Delete my account`). |
| TC-AUTH-33 - Activation 2FA | Partiel | Clic `Activer la 2FA` affiche QR code, cle secrete et champ code 6 chiffres. Activation TOTP finale non executee. |
| TC-AUTH-34 - Regeneration recovery codes | Non teste | 2FA non activee. |
| TC-AUTH-35 - Desactivation 2FA | Non teste | 2FA non activee. |
| TC-AUTH-36 - Verification telephone | Partiel | Section telephone et bouton `Envoyer le code` visibles. OTP SMS/log non finalise. |
| TC-AUTH-37 - Echec OTP telephone | Non teste | OTP non declenche. |
| TC-AUTH-38 - Sessions actives | Partiel | Liste sessions affiche `auth_token`, derniere activite et session courante. IP absente dans l'UI. Revocation non executee. |
| TC-AUTH-39 - Deconnexion | Pass | Menu utilisateur -> `Deconnexion` redirige vers `/auth/login`; acces a `/app` apres logout redirige vers `/auth/login?redirect=%2Fapp`. |
| TC-AUTH-40 - Suppression compte | Fail | Modal ouverte, mais contenu en anglais (`Delete your account`, `Quality issue`, `Privacy concerns`, `Other`) au lieu des libelles FR attendus. Etapes de reauth/suppression non executees. |
| TC-AUTH-41 - Blocage obligations | Non teste | Compte avec obligations cible non utilise. |
| TC-AUTH-42 - Annulation suppression | Non teste | Pas de demande creee. |
| TC-AUTH-43 - Compte a rebours suppression | Non teste | Pas de demande creee. |
| TC-NOTIF-01 - Cloche notifications | Fail | Aucune icone cloche visible dans la navbar du dashboard/profil; seule une region live `Notifications` existe. |
| TC-NOTIF-02 - Lu/non lu | Non teste | Pas de feed cloche accessible. |
| TC-NOTIF-03 - Marquer comme lu | Non teste | Pas de feed cloche accessible. |
| TC-NOTIF-04 - Temps reel | Non teste | Non execute. |
| TC-NOTIF-05 - Emails transactionnels | Non teste | Hors smoke navigateur; depend de Mailpit/MailHog ou email reel. |
| TC-NOTIF-06 - Preferences notifications | Pass | Matrice presente; categories Messages, Reservations, Baux, Maintenance, Avis, Alertes presentes; In-app coche et disabled. |
| TC-NOTIF-07 - Toggle canal | Fail | Clic sur `Nouveau message - Email` declenche une erreur runtime Next.js: `Cannot read properties of undefined (reading 'map')` dans `NotificationPreferencesMatrix.tsx:190`. |
| TC-NOTIF-08 - Telephone non verifie | Pass | Bandeau SMS visible; cases SMS disabled. |
| TC-SEARCH-01 - Recherche plein texte | Partiel | `/properties?search=appartement` appelle l'API avec `search=appartement` et affiche 177 resultats. Reserve: les premiers resultats ne sont pas clairement pertinents (`Chambre`, `Maison`, `Entrepot` avant plusieurs appartements). |
| TC-SEARCH-02 - Combinaison filtres | Non teste | Non finalise dans ce smoke. |
| TC-SEARCH-03 - Pagination | Pass | Clic page 2 produit `/properties?search=appartement&page=2` et conserve le parametre `search`. |
| TC-SEARCH-04 - Tri | Non teste | Non finalise dans ce smoke. |
| TC-SEARCH-05 - Recherches sauvegardees | Partiel | Bouton visible mais disabled en visiteur. Sauvegarde connectee non testee. |
| TC-MEDIA-01..06 - Medias | Non teste | Upload media non execute. Avatar upload indisponible sur profil. |
| TC-I18N-01 - Selecteur langue | Pass | Selecteur navbar visible avec `French FR`, `English EN`, `Wolof WO`. |
| TC-I18N-02 - Passage EN | Partiel | L'interface est deja mixte FR/EN sur plusieurs pages (`Sign in`, `List a property`, footer anglais, filtres FR). Changement complet non valide. |
| TC-I18N-03 - Wolof | Non teste | Option WO presente, couverture non verifiee. |
| TC-I18N-04 - Persistance langue | Non teste | Non execute. |
| TC-I18N-05 - Dates | Partiel | Dates profil en format FR `08/05/2026`; EN non verifie. |
| TC-I18N-06 - Montants | Pass | Montants affiches en format `500 000 F CFA` / espaces fines sur listings. |
| TC-I18N-07 - Fuseau horaire | Non teste | Pas de comparaison serveur/client effectuee. |
| TC-I18N-08 - Erreurs API FR | Fail | Login invalide affiche `Invalid credentials.` en anglais. |
| TC-AUTH-46 - Liste avis | Fail | `/app/profile/reviews` liste des sejours/baux eligibles avec CTA `Laisser un avis`, pas les avis deja postes avec note, texte, date, statut comme attendu. |
| TC-AUTH-47 - Profil Customer | Non teste | Compte agent utilise. |
| TC-AUTH-48 - Profil Owner | Non teste | Compte agent utilise. |
| TC-AUTH-49 - Profil Agent | Partiel | Section profil agent visible: bio pro, specialisations disabled, numero licence, agence liee. Certains champs attendus manquent ou sont non cables (commission, langues). |
| TC-AUTH-50 - Profil Admin | Non teste | Compte admin non utilise. |
| TC-AUTH-44 - Protection routes | Partiel | Acces anonyme `/app/properties` redirige vers `/auth/login?redirect=%2Fapp%2Fproperties`. Retour apres login non valide car le compte etait throttle pendant ce sous-test. |
| TC-AUTH-45 - Dashboard par role | Partiel | Dashboard agent OK. Autres roles non testes. |

## Bugs trouves

| # | Severite | TC | Page | Description | Statut |
|---|---|---|---|---|---|
| 1 | P0 | TC-NOTIF-07 | `/app/profile/notifications` | Toggle preference email provoque crash runtime `Cannot read properties of undefined (reading 'map')` dans `NotificationPreferencesMatrix.tsx:190`. | Ouvert |
| 2 | P1 | TC-AUTH-06 | Email verification | Le lien email pointe vers l'API backend et retourne `Unauthenticated` en ouverture directe. | Ouvert |
| 3 | P1 | TC-AUTH-23 | Reset password | Email reset pointe vers `/reset-password?...`, route inexistante (404); la route fonctionnelle est `/auth/reset-password?...`. | Ouvert |
| 4 | P1 | TC-NOTIF-01 | Dashboard/profil | Aucune cloche de notifications visible dans la navbar. | Ouvert |
| 5 | P1 | TC-AUTH-27 | `/app/profile` | Sauvegarde prenom/nom via modale ne met pas l'en-tete a jour. | Ouvert |
| 6 | P2 | TC-AUTH-11, TC-I18N-08 | `/auth/login` | Erreur 401 affichee en anglais: `Invalid credentials.` | Ouvert |
| 7 | P2 | TC-AUTH-40 | `/app/profile` | Suppression de compte affichee en anglais. | Ouvert |
| 8 | P2 | TC-AUTH-05, TC-AUTH-23 | Auth forms | Toggle password non independant / absent pour confirmation. | Ouvert |
| 9 | P2 | TC-AUTH-01 | `/auth/register` | Ordre formulaire/OAuth non conforme a la spec. | Ouvert |
| 10 | P2 | TC-SEARCH-01 | `/properties` | Recherche `appartement` retourne des resultats peu pertinents en tete de liste. | Ouvert |
| 11 | P2 | TC-AUTH-46 | `/app/profile/reviews` | Page avis ne correspond pas a la spec "avis postes"; elle liste des eligibilites. | Ouvert |
| 12 | P3 | i18n global | public/app | UI mixte FR/EN sur plusieurs surfaces (`Sign in`, footer, suppression compte). | Ouvert |

## Notes

- Le compte `fatou.diop@example.com` a ete cree pendant le smoke et son mot de passe final est `NouveauPass123!`.
- Le throttle login a ete atteint pendant les tests de redirection; il peut temporairement bloquer les nouveaux essais avec `agent1@dakarimmo.sn`.
- Les tests destructifs (suppression compte, revocation session, activation definitive 2FA) ont ete limites a l'ouverture des interfaces, sans validation finale.
