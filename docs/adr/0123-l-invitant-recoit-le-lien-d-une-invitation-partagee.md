# ADR-0123 — L'invitant reçoit le lien d'une invitation partagée ; l'invité l'accepte par le code SMS du numéro saisi

- **Statut** : Accepté le 2026-11-15 — décision prise à l'implémentation de TCK-2927, « valide tes choix » du porteur, à confirmer à la revue
- **Date** : 2026-11-15
- **Tickets** : TCK-2927 (API), TCK-2928 (écran)
- **Amende** : [ADR-0094](0094-l-invitation-se-lit-avant-d-entrer-et-s-accepte-par-code.md) — le jeton porteur ne voyageait que du serveur à l'invité (courriel ou SMS) ; il peut désormais sortir vers l'invitant
- **S'appuie sur** : [ADR-0055](0055-impersonation-en-lecture-seule-sans-jeton-dans-la-page.md) § 3 (aucun secret durable sous impersonation), [ADR-0033](0033-le-telephone-verifie-est-un-identifiant-de-connexion.md) (le numéro vérifié est un identifiant)

## Contexte

Relevé le 2026-11-15 : `POST /api/agencies/{agency}/agents/invite` envoie toujours un courriel ou un
SMS, et `InvitationResource` ne rend jamais le jeton (`Invitation::$hidden`). L'admin qui veut inviter
un membre en lui envoyant le lien sur WhatsApp, depuis son propre téléphone, n'a donc aucun lien à
partager (écart de TCK-2668, « Lien par WhatsApp : hors périmètre »).

Deux prémisses du code tiennent seulement parce que le lien arrive par le canal de la plateforme :

- l'acceptation **sans session** d'une invitation par SMS (`acceptAsNewUser`) pose le numéro
  **vérifié** — « le lien est arrivé par SMS sur ce numéro » (TCK-589) ;
- l'acceptation par code pose l'e-mail de l'invitation **vérifié** (ADR-0094 § 6) — « le lien est
  arrivé à cette adresse ».

Un lien remis à l'invitant ne prouve plus rien de tel : l'admin le détient, et peut le transmettre à
n'importe qui.

## Décision

**Une invitation peut être créée « partagée » : aucun envoi, et le lien complet est rendu à
l'invitant, à la création et au renouvellement seulement. Elle est adressée à un numéro, sans
e-mail, et ne s'accepte que par la preuve de ce numéro.**

1. **Création** — `POST /api/agencies/{agency}/agents/invite` accepte `delivery: "share"`.
   - Le numéro est **exigé**, l'e-mail **refusé** (422) : l'invitation est adressée au numéro saisi
     par l'admin, `email = null`. Aucune voie ne peut donc poser un e-mail vérifié (ADR-0094 § 6 ne
     s'applique pas).
   - Le drapeau `auth.phone_login.enabled` éteint, `delivery` est refusé (422) : les routes du code
     rendent 404, l'invitation ne pourrait pas s'accepter.
   - Aucun courriel, aucun SMS ; le plafond journalier des SMS d'invitation n'est pas consommé.
   - L'invitation porte `metadata.delivery = "share"` (`Invitation::estPartagee()`).
   - La réponse de **cette seule création** porte `share_url`, le lien d'acceptation complet
     (`LienFront`, le même que le courriel et le SMS), en `Cache-Control: no-store`.
2. **Renouvellement** — `POST /api/invitations/{invitation}/share-link` rend un `share_url` **neuf** :
   le jeton est renouvelé sous verrou (l'ancien lien rend 404), l'échéance repart pour sept jours,
   comme une relance. Recevable sur une invitation d'**équipe** (`AgentProfile`) en cours ou expirée
   (même résurrection gardée que `resend`), adressée à un numéro **sans e-mail** ; sinon 422. Une
   invitation par SMS renouvelée ainsi devient partagée. Même règle d'accès que la relance
   (`InvitationPolicy::resend`), même step-up 2FA, même limiteur `throttle:invitations-send`.
3. **Aucune autre lecture ne rend le lien.** `InvitationResource` ne change pas : `GET
   /api/invitations` et `GET /api/invitations/{id}` n'ont ni jeton ni lien. `share_url` n'est ajouté
   que par les deux contrôleurs, à côté de la ressource.
4. **Acceptation** — par le **code SMS envoyé au numéro de l'invitation** (ADR-0094 § 5), ou par un
   compte qui a déjà **vérifié** ce numéro (règles d'`acceptForAuthenticatedUser`). L'acceptation
   publique **sans session** (`POST /api/invitations/{token}/accept`), qui créerait un compte au
   numéro posé vérifié sans preuve, rend **403 `invitation.code_required`** pour une invitation
   partagée.
5. **La plateforme n'envoie rien d'une invitation partagée** : le rappel de J+2
   (`invitations:remind`) l'ignore. La relance classique (`resend`) reste permise : elle **envoie**
   le lien par SMS au numéro, et l'invitation cesse d'être partagée (le lien est alors bien arrivé
   par SMS).
6. **Secret** :
   - les deux routes sont des `POST` : une session d'impersonation les refuse (403
     `impersonation.read_only`, ADR-0055 § 3) ; `ImpersonationReadSweepTest` reconnaît désormais un
     lien d'invitation complet dans toute réponse `GET` ;
   - le journal d'activité (`invitation_sent` avec `delivery: share`, `invitation_share_link_issued`)
     ne porte ni le jeton ni le lien ; les options de journal du modèle excluent `token` ;
   - la contrainte 1 de TCK-610 (jeton hors mesure d'audience, `Referrer-Policy: no-referrer` de la
     page) est conservée : rien ne change côté page.

## Conséquences

- L'invitant détient un secret porteur pendant sept jours au plus ; le renouvellement le coupe.
- Une invitation partagée exige un numéro joignable par SMS (le code), même si le lien voyage par
  WhatsApp.
- Le front (TCK-2928) affiche `share_url` une fois, propose « Envoyer sur WhatsApp » et
  « Repartager » (le renouvellement).

## Options écartées

- **Rendre le lien dans `InvitationResource`, ou le relire par un `GET`.** Un secret relisible sous
  toute lecture de liste, et sous impersonation ; et rien ne l'exige : le renouvellement suffit.
- **Garder l'acceptation sans session pour une invitation partagée.** Qui détient le lien — l'admin
  compris — créerait un compte au numéro posé vérifié, donc un identifiant de connexion d'autrui
  (ADR-0033).
- **Permettre un e-mail sur une invitation partagée.** L'acceptation par code poserait cet e-mail
  vérifié (ADR-0094 § 6) sans qu'aucun message y soit arrivé.
- **Envoyer par l'API WhatsApp de la plateforme.** Hors périmètre (TCK-2927).

## Application

- `App\Http\Requests\Invitation\InviteAgentRequest` (`delivery`), `App\Services\Invitation\InvitationService`
  (`send` sans envoi, `renewShareLink`, `shareUrl`, refus d'`acceptAsNewUser`, rappel et relance),
  `App\Services\Invitation\AgentInvitationService::renewShareLink`, `App\Models\Invitation::estPartagee()`,
  `AgentInvitationController`, `InvitationController::shareLink`, `routes/api/invitations.php`,
  `App\Support\Security\ProtectedActions`.
- `tests/Feature/Invitation/AgentInvitationShareTest.php` ; marqueur « lien d'invitation » de
  `tests/Feature/Admin/Platform/ImpersonationReadSweepTest.php`.
