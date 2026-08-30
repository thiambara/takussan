<?php

namespace App\Support;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\User;

/**
 * Ce que le `kind` d'une agence autorise — et le seul endroit où ça s'écrit.
 *
 * ── Pourquoi une classe et non un `if` par appelant (TCK-449, AC5) ─────────
 *
 * La règle « une agence `individual` n'a pas d'équipe » était écrite QUATRE
 * fois, mot pour mot, dans quatre fichiers :
 * `AgentInvitationService::assertAgencyCanInvite()`,
 * `OwnerInvitationService::assertAgencyCanInvite()`,
 * `AgencyController::addAgent()` et `AgencyMemberRoleController::update()`.
 * Quatre copies d'une même règle ne sont pas une règle : ce sont quatre
 * occasions d'en oublier une, et c'est exactement ce qui s'est produit —
 * `POST /agencies/{id}/members` rendait 200 là où son geste jumeau rendait
 * 403, parce que la cinquième copie n'avait jamais été écrite (TCK-449).
 *
 * ── Deux règles distinctes, pas une seule ─────────────────────────────────
 *
 * `docs/features.md:293` énumère les restrictions de l'agence `individual`
 * comme une LISTE : « pas d'invitation de collaborateurs internes », « un
 * seul `agency_admin` », « pas de rôles personnalisés ». Ce sont des
 * décisions séparées qui coïncident aujourd'hui — pas une seule décision
 * écrite trois fois. Elles portent donc deux prédicats nommés
 * ({@see self::canFormTeam()}, {@see self::allowsCustomRoles()}) et deux
 * messages distincts : le jour où l'une bouge, l'autre ne suit pas en
 * silence.
 */
class AgencyKindGuard
{
    /**
     * Backend twin of `lib/access/server-guards.ts`
     * (`ensureStandardAgencyOrRedirect`).
     *
     * Aborts with 403 when a non-global actor's active agency is on
     * `kind=individual`. Super-admins bypass (cross-tenant scope by design —
     * they may legitimately operate on any agency regardless of kind). Actors
     * without an active agency are passed through (the caller
     * is responsible for the upstream `abort_if($agencyId === null, …)`).
     */
    public static function ensureStandardForNonGlobal(User $user, ?int $agencyId): void
    {
        if ($user->isSuperAdmin()) {
            return;
        }
        if ($agencyId === null) {
            return;
        }
        $agency = Agency::find($agencyId);
        abort_unless(
            $agency && $agency->kind === AgencyKind::Standard,
            403,
            'This feature is reserved for standard agencies.',
        );
    }

    /**
     * TCK-449 (AC5) — LA définition de « qui peut constituer une équipe ».
     *
     * Partagée par les DEUX gestes qui en constituent une : l'invitation
     * (`agents/invite`, `owners/invite`) et le rattachement direct
     * (`POST /agencies/{id}/members` et son alias `…/agents`, plus le
     * changement de rôle d'un membre). Une agence `individual` est un hôte
     * seul (TCK-248).
     */
    public static function canFormTeam(Agency $agency): bool
    {
        return self::kindOf($agency) === AgencyKind::Standard;
    }

    /**
     * 403 si l'agence ne peut pas constituer d'équipe.
     *
     * Le message reste au choix de l'appelant : l'invitation de
     * propriétaires parle de portefeuille, celle d'agents parle d'équipe.
     * C'est le libellé qui diffère, jamais la règle.
     */
    public static function ensureCanFormTeam(
        Agency $agency,
        string $messageKey = 'team.invite.errors.individual_agency',
    ): void {
        abort_if(! self::canFormTeam($agency), 403, __($messageKey));
    }

    /**
     * TCK-454 — « pas de rôles personnalisés » sur une agence `individual`.
     *
     * ⚠ Ce n'est PAS « pas de rôles » : une agence individuelle a bien un
     * rôle SYSTÈME, celui que porte son unique `agency_admin` et que pose
     * `AgencySystemRoleSeeder`. Ce prédicat ne juge donc que le rôle
     * personnalisé — l'appelant vérifie `is_system` avant de le consulter
     * (cf. `AgencyRoleService::assign()`).
     */
    public static function allowsCustomRoles(Agency $agency): bool
    {
        return self::kindOf($agency) === AgencyKind::Standard;
    }

    public static function ensureCustomRolesAllowed(Agency $agency): void
    {
        abort_if(
            ! self::allowsCustomRoles($agency),
            403,
            __('agencies.errors.individual_no_custom_roles'),
        );
    }

    /**
     * Le cast du modèle rend déjà un `AgencyKind`, mais une instance
     * fabriquée à la main (`new Agency(['kind' => 'individual'])`) porte la
     * chaîne brute. Les quatre copies supprimées par TCK-449 faisaient
     * chacune cette normalisation ; elle vit ici, une fois.
     */
    private static function kindOf(Agency $agency): ?AgencyKind
    {
        return $agency->kind instanceof AgencyKind
            ? $agency->kind
            : AgencyKind::tryFrom((string) $agency->kind);
    }
}
