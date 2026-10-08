<?php

namespace App\Support\Security;

use App\Http\Controllers\Api\Admin\FeatureFlagController;
use App\Http\Controllers\Api\Admin\IntegrationController as AdminIntegrationController;
use App\Http\Controllers\Api\Admin\PlatformPayoutController;
use App\Http\Controllers\Api\Admin\PlatformSettingController;
use App\Http\Controllers\Api\Admin\PropertyModerationController;
use App\Http\Controllers\Api\Admin\SuperAdminInvitationController;
use App\Http\Controllers\Api\Admin\UserImpersonationController;
use App\Http\Controllers\Api\Admin\UserLifecycleController;
use App\Http\Controllers\Api\Admin\UserSupportController;
use App\Http\Controllers\Api\Agency\AgentAbsenceController;
use App\Http\Controllers\Api\Agency\AgentHandoverController;
use App\Http\Controllers\Api\Agency\AgentInvitationController;
use App\Http\Controllers\Api\Agency\OwnerInvitationController;
use App\Http\Controllers\Api\Agency\RoleController;
use App\Http\Controllers\Api\Agency\ServiceProviderInvitationController;
use App\Http\Controllers\Api\Agency\TeamController;
use App\Http\Controllers\Api\Agency\TeamMemberSuspensionController;
use App\Http\Controllers\Api\AgencyController;
use App\Http\Controllers\Api\AgencyMemberRoleController;
use App\Http\Controllers\Api\AgentProfileController;
use App\Http\Controllers\Api\Auth\SuperAdminTwoFactorController;
use App\Http\Controllers\Api\Auth\TwoFactorController;
use App\Http\Controllers\Api\BookingPaymentController;
use App\Http\Controllers\Api\IntegrationController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\LeaseDepositRefundController;
use App\Http\Controllers\Api\Me\PayoutMethodController as MePayoutMethodController;
use App\Http\Controllers\Api\PayoutController;
use App\Http\Controllers\Api\PayoutMethodController;
use App\Http\Controllers\Api\Permissions\RoleDelegationController;
use App\Http\Controllers\Api\Profile\AgencyRoleController;
use App\Http\Controllers\Api\ReviewController;
use App\Http\Controllers\Api\ServiceProviderBillController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\UserRoleController;
use App\Http\Controllers\Public\InvitationAcceptController;
use App\Http\Middleware\RequireRecentTwoFactor;
use App\Http\Middleware\RequireTwoFactor;

/**
 * TCK-589 — les actions où le second facteur est exigé (ADR-0033, contraintes 7 à 9).
 *
 * Les listes apparient par ACTION DE CONTRÔLEUR (`Classe@méthode`), jamais par nom
 * de route : `PATCH integrations/{id}`, `PATCH agencies/{agency}` et l'alias `PUT`
 * d'`agency-roles.php` n'ont pas de nom, et une liste de noms les aurait laissés
 * passer. `ProtectedActionsCoverageTest` garde les deux sens : une entrée qui ne
 * résout aucune route, et une route mutante d'une famille absente des deux listes,
 * cassent la suite.
 *
 * Lues par {@see RequireTwoFactor} et
 * {@see RequireRecentTwoFactor}.
 */
final class ProtectedActions
{
    /**
     * Familles protégées pour le personnel d'agence : reversements, intégrations,
     * rôles et délégations, équipe et invitations. Fichier de routes ⇒ `null` si
     * tout le fichier en est, sinon les seuls contrôleurs qui en sont.
     *
     * @var array<string, list<class-string>|null>
     */
    public const FAMILIES = [
        'payouts.php' => null,
        'integrations.php' => null,
        'agency-roles.php' => null,
        'invitations.php' => null,
        'users.php' => null,
        // Suspendre ou retirer un agent de l'équipe (TCK-258).
        'profiles.php' => null,
        // TCK-591 — la passation retire un membre (`remove_after`) et transmet son portefeuille ;
        // l'absence est une délégation qui fait couvrir les tâches de l'absent par un suppléant.
        'agent-handover.php' => null,
        'agency-absences.php' => null,
        'agencies.php' => [
            AgencyController::class,
            AgencyMemberRoleController::class,
            RoleDelegationController::class,
            OwnerInvitationController::class,
            AgentInvitationController::class,
            ServiceProviderInvitationController::class,
            TeamController::class,
            // TCK-587 — la suspension DANS l'agence remplace le blocage du compte.
            TeamMemberSuspensionController::class,
        ],
    ];

    /**
     * Vérification adverse M4 — contrôleurs d'une famille, où que soient leurs routes. La
     * garde apparie par CONTRÔLEUR : toute route enregistrée dont le contrôleur est ici, ou
     * dans un fichier de {@see self::FAMILIES}, figure dans une liste. `profiles.php` portait
     * la gestion d'équipe hors de toute famille, et la garde, qui rejouait les seuls fichiers
     * déclarés, ne pouvait pas le voir.
     *
     * @var list<class-string>
     */
    public const FAMILY_CONTROLLERS = [
        // Décision du porteur : de l'argent qui SORT (remboursement, restitution de caution).
        BookingPaymentController::class,
        LeaseDepositRefundController::class,
        // TCK-591 — gestes d'équipe, rattachés par contrôleur aussi : leurs routes ont
        // chacune leur fichier, et un déplacement ne doit pas les faire sortir de la famille.
        AgentHandoverController::class,
        AgentAbsenceController::class,
    ];

    /**
     * Actions mutantes des familles : 2FA exigée d'un admin d'agence, et du
     * personnel quand l'agence a coché `settings.require_team_two_factor`.
     *
     * @var list<string>
     */
    public const AGENCY_TWO_FACTOR = [
        PayoutController::class.'@store',
        // TCK-594 (ADR-0039 §4, §6) — le second geste des quatre yeux, et la vérification d'une
        // destination : qui la vérifie décide où l'argent part.
        PayoutController::class.'@approve',
        PayoutMethodController::class.'@verify',
        PayoutController::class.'@markProcessed',
        PayoutController::class.'@markFailed',
        PayoutController::class.'@cancel',

        IntegrationController::class.'@store',
        IntegrationController::class.'@update',
        IntegrationController::class.'@test',
        IntegrationController::class.'@destroy',
        // TCK-293 (ADR-0046 §7) — régénérer l'URL de webhook coupe les notifications de paiement.
        IntegrationController::class.'@rotateWebhookEndpoint',

        RoleController::class.'@store',
        RoleController::class.'@update',
        RoleController::class.'@destroy',
        RoleController::class.'@syncCapabilities',
        AgencyRoleController::class.'@update',
        RoleDelegationController::class.'@store',
        RoleDelegationController::class.'@destroy',
        AgencyMemberRoleController::class.'@update',
        UserRoleController::class.'@update',

        // `PATCH agencies/{agency}` (sans nom) porte l'interrupteur
        // `settings.require_team_two_factor` lui-même.
        AgencyController::class.'@update',
        // TCK-594 (VERIF-594 M-2) — le second geste d'un relâchement du seuil des quatre yeux.
        AgencyController::class.'@confirmPayoutThreshold',
        AgencyController::class.'@destroy',
        AgencyController::class.'@addAgent',
        AgencyController::class.'@removeAgent',
        TeamMemberSuspensionController::class.'@suspend',
        TeamMemberSuspensionController::class.'@reactivate',
        AgentProfileController::class.'@suspend',
        AgentProfileController::class.'@destroy',
        // TCK-591 — même retrait que `removeAgent` quand `remove_after` est coché, et la
        // transmission du portefeuille dans tous les cas.
        AgentHandoverController::class.'@store',
        // TCK-591 (ADR-0035) — une délégation : le suppléant couvre les tâches de l'absent.
        AgentAbsenceController::class.'@store',
        AgentAbsenceController::class.'@destroy',

        OwnerInvitationController::class.'@__invoke',
        AgentInvitationController::class.'@__invoke',
        ServiceProviderInvitationController::class.'@__invoke',
        InvitationController::class.'@store',
        InvitationController::class.'@revoke',
        InvitationController::class.'@resend',

        // Vérification adverse M4 — de l'argent qui sort.
        BookingPaymentController::class.'@refund',
        LeaseDepositRefundController::class.'@store',
    ];

    /**
     * Routes mutantes d'une famille, délibérément hors de la liste — avec la raison.
     *
     * @var array<string, string>
     */
    public const EXEMPT = [
        // L'invité n'a pas encore de compte : il accepte par le lien reçu.
        InvitationAcceptController::class.'@__invoke' => 'acceptation publique d\'une invitation',
        // Qui crée son agence n'en est pas encore l'admin : l'exigence le prend au
        // premier geste protégé, dans l'agence créée.
        AgencyController::class.'@store' => 'création d\'une agence',
        // L'argent ENTRE : le client règle sa réservation, il n'est le personnel de personne.
        BookingPaymentController::class.'@store' => 'paiement d\'une réservation par le client',
    ];

    /**
     * Step-up (contrainte 9) : un TOTP saisi sur CE jeton il y a moins de 10 min.
     *
     * @var list<string>
     */
    public const STEP_UP = [
        PlatformPayoutController::class.'@closePeriod',
        PlatformPayoutController::class.'@approve',
        PlatformPayoutController::class.'@markPaid',
        PlatformPayoutController::class.'@cancel',
        AdminIntegrationController::class.'@update',
        AdminIntegrationController::class.'@test',
        PlatformSettingController::class.'@bulkUpdate',
        FeatureFlagController::class.'@update',
        FeatureFlagController::class.'@override',
        SuperAdminInvitationController::class.'@store',
        SuperAdminInvitationController::class.'@resend',
        SuperAdminInvitationController::class.'@revoke',
        // TCK-600 (ADR-0047) — retirer un opérateur actif.
        SuperAdminInvitationController::class.'@revokeOperator',
        UserImpersonationController::class.'@start',
        // TCK-600 — cycle de vie d'un compte depuis la console.
        UserLifecycleController::class.'@block',
        UserLifecycleController::class.'@reactivate',
        UserLifecycleController::class.'@erase',
        // Vérification adverse B1 — lever le verrou d'un compte rouvre son accès.
        UserSupportController::class.'@unlock',
        UserSupportController::class.'@reset2fa',
        UserSupportController::class.'@revokeSessions',
        UserSupportController::class.'@destroySession',

        // TCK-594 (ADR-0039 §4, §6, §8) — ce qui décide qu'un argent sort, et vers où : le second
        // geste des quatre yeux, le marquage payé, le paiement d'une facture d'intervention, et les
        // destinations du titulaire. Un jeton volé ne les tient plus sans le TOTP. Les gestes
        // plateforme (`PlatformPayoutController`) sont plus haut.
        PayoutController::class.'@approve',
        PayoutController::class.'@markProcessed',
        ServiceProviderBillController::class.'@pay',
        MePayoutMethodController::class.'@store',
        MePayoutMethodController::class.'@update',
        MePayoutMethodController::class.'@destroy',
        // VERIF-594 passe 4, P4-6 (décision de session, réversible) — qui vérifie une destination
        // décide où l'argent part ; un membre sans second facteur, agent compris, ne vérifie plus.
        PayoutMethodController::class.'@verify',

        // Codes de secours : une session volée ne les lit plus sans le TOTP.
        TwoFactorController::class.'@recoveryCodes',
        TwoFactorController::class.'@regenerateRecoveryCodes',
    ];

    /**
     * Step-up exigé seulement quand l'appelant agit depuis la console plateforme :
     * ces actions servent aussi l'admin d'agence sur sa propre équipe (TCK-147).
     *
     * @var list<string>
     */
    public const STEP_UP_FOR_PLATFORM = [
        // Vérification adverse B1 — `PUT users/{u}/role`, qui CRÉE un super-admin quand l'acteur en
        // est un : hors `/api/admin/*`, il échappait aux deux gardes. Un jeton volé sans step-up
        // promouvait le compte de l'attaquant. (Bloquer et débloquer un compte y figuraient aussi :
        // TCK-600 a retiré ces routes au profit de la console.)
        UserRoleController::class.'@update',
    ];

    /**
     * Vérification adverse B1 — les actions dont le contrôleur CONFÈRE un pouvoir plateforme
     * (écrit un `PlatformProfile`, rouvre un compte, coopte un super-admin) sans être dans
     * `STEP_UP` ni `STEP_UP_FOR_PLATFORM`, avec la raison. `ProtectedActionsCoverageTest`
     * repère ces contrôleurs dans le code et casse sur toute action mutante non rangée.
     *
     * @var array<string, string>
     */
    public const PLATFORM_POWER_EXEMPT = [
        // Le coopté enrôle SA 2FA : c'est le second facteur lui-même, il n'en a pas encore.
        SuperAdminTwoFactorController::class.'@enroll' => 'enrôlement de la 2FA du coopté',
        SuperAdminTwoFactorController::class.'@confirm' => 'confirmation de la 2FA du coopté',
    ];

    /**
     * TCK-597 (verif-597 passe 3, M5 ; ADR-0043 §4) — la modération que la PLATEFORME tranche hors
     * de `/api/admin/*` : retirer ou trancher un avis de n'importe quelle agence, approuver un bien
     * (ce qui lève le verrou plateforme) ou le refuser. 2FA exigée des seuls profils plateforme,
     * comme pour la décision symétrique de `/api/admin/moderation` ; jamais de l'admin d'agence,
     * qui garde ses gestes d'agence (avis en attente, bien sans verrou) : d'où une liste à part
     * d'`AGENCY_TWO_FACTOR`. Pas de step-up : la console n'en exige pas non plus.
     *
     * Toute action mutante d'un contrôleur de cette liste y figure, ou dans
     * `PLATFORM_TWO_FACTOR_EXEMPT` avec sa raison (`ProtectedActionsCoverageTest`).
     *
     * @var list<string>
     */
    public const PLATFORM_TWO_FACTOR = [
        PropertyModerationController::class.'@approve',
        PropertyModerationController::class.'@reject',
        ReviewController::class.'@moderate',
        ReviewController::class.'@approve',
        ReviewController::class.'@reject',
        // TCK-600 (verif-600 R1) — les réglages génériques : la portée `global` est réservée au
        // `super_admin` (`setting.global_forbidden`) et règle tout le parc, y compris les clés hors
        // catalogue que lisent les services métier (`invoice.reminder_offsets_days`,
        // `lease.require_signature`…). La portée `agency` de l'admin d'agence reste hors de cette
        // liste : elle ne s'applique qu'aux profils plateforme.
        SettingController::class.'@store',
        SettingController::class.'@update',
        SettingController::class.'@destroy',
    ];

    /** @var array<string, string> */
    public const PLATFORM_TWO_FACTOR_EXEMPT = [
        PropertyModerationController::class.'@resubmit' => "le publieur renvoie son bien en file : rien n'est tranché",
        ReviewController::class.'@storeForProperty' => "dépôt d'un avis par son auteur",
        ReviewController::class.'@storeForAgency' => "dépôt d'un avis par son auteur",
        ReviewController::class.'@storeForAgent' => "dépôt d'un avis par son auteur",
        ReviewController::class.'@storeForServiceProvider' => "dépôt d'un avis par son auteur",
        // verif-597 passe 4, n5 — le super-admin y passe encore sans 2FA : à reprendre là-bas.
        ReviewController::class.'@reply' => 'réponse du sujet ; le chemin super-admin (Gate::before) est un pouvoir plateforme antérieur, renvoyé au ticket de suite',
        ReviewController::class.'@deleteReply' => 'réponse du sujet ; le chemin super-admin (Gate::before) est un pouvoir plateforme antérieur, renvoyé au ticket de suite',
        ReviewController::class.'@report' => 'un signalement range, il ne tranche rien (ADR-0043 §6)',
    ];

    public static function requiresPlatformTwoFactor(?string $action): bool
    {
        return in_array(self::normalize($action), self::PLATFORM_TWO_FACTOR, true);
    }

    public static function requiresAgencyTwoFactor(?string $action): bool
    {
        return in_array(self::normalize($action), self::AGENCY_TWO_FACTOR, true);
    }

    public static function requiresStepUp(?string $action): bool
    {
        return in_array(self::normalize($action), self::STEP_UP, true);
    }

    public static function requiresStepUpForPlatform(?string $action): bool
    {
        return in_array(self::normalize($action), self::STEP_UP_FOR_PLATFORM, true);
    }

    /** `Classe` (contrôleur invocable) ⇒ `Classe@__invoke`. */
    public static function normalize(?string $action): string
    {
        $action = ltrim((string) $action, '\\');

        return str_contains($action, '@') ? $action : $action.'@__invoke';
    }
}
