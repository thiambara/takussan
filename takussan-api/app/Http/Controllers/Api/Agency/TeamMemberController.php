<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Membership\TeamMemberSheet;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2926 (ADR-0124) — la fiche d'un membre de l'équipe et le rappel de sa double authentification.
 *
 *   · `GET  /api/agencies/{agency}/team/{user}` — portefeuille, commissions dues, dernière connexion
 *     (famille d'appareil, ville seule), date de la 2FA ({@see TeamMemberSheet::for()}) ;
 *   · `POST /api/agencies/{agency}/team/{user}/two-factor-reminder` — l'avis `account.two_factor_reminder`.
 *
 * Lu par qui gère l'équipe — la règle de la liste de l'équipe (`TeamController::index`,
 * `AgentProfilePolicy::viewAny`) ; rien de neuf pour un agent sur un autre agent. Refus dans l'ordre :
 * 403 (l'appelant), 404 (la personne n'est pas membre de l'agence), puis 409 / 429 pour le rappel.
 */
class TeamMemberController extends Controller
{
    public function __construct(private readonly TeamMemberSheet $sheet) {}

    public function show(Agency $agency, User $user): JsonResponse
    {
        $this->authorize('viewAny', [AgentProfile::class, $agency]);
        $this->memberOrNotFound($agency, $user);

        return $this->json(['data' => $this->sheet->for($agency, $user)]);
    }

    public function remindTwoFactor(Agency $agency, User $user): JsonResponse
    {
        $this->authorize('viewAny', [AgentProfile::class, $agency]);
        $this->memberOrNotFound($agency, $user);

        return $this->json(['data' => ['sent' => $this->sheet->remindTwoFactor($agency, $user)]]);
    }

    /** Après la policy : une personne qui n'est pas membre de l'agence rend 404, jamais sa fiche. */
    private function memberOrNotFound(Agency $agency, User $member): void
    {
        abort_code_unless(TeamMemberSheet::isMember((int) $agency->id, (int) $member->id), 404, 'team.member_not_found');
    }
}
