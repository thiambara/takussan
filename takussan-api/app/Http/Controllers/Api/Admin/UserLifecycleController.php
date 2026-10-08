<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Notifications\NotificationCode;
use App\Exceptions\ApiError;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Admin\BlockUserRequest;
use App\Http\Requests\Admin\EraseUserRequest;
use App\Http\Requests\Admin\ReactivateUserRequest;
use App\Models\CalendarFeed;
use App\Models\Enums\UserStatus;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use App\Services\Admin\ImpersonationService;
use App\Services\Model\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * TCK-600 — le cycle de vie d'un compte, depuis la console plateforme.
 *
 * Bloquer et réactiver sont des gestes du `support` (ADR-0047) ; effacer, du seul `super_admin`.
 * Un opérateur actif ne se bloque ni ne s'efface par ici : on le RETIRE d'abord
 * (`super-admins/{user}/revoke`), sans quoi bloquer le dernier `super_admin` contournerait la
 * garde du retrait. Le refus par requête d'un jeton de compte bloqué est la clause de statut
 * d'`AccessTokenGate` (TCK-589) ; ici, les jetons du moment sont supprimés en plus.
 *
 * L'effacement n'a qu'un chemin, `AccountDeletionService` : obligations, délai de grâce,
 * notification — l'opérateur en est le causeur.
 */
class UserLifecycleController extends Controller
{
    public function __construct(
        private readonly AccountDeletionService $deletion,
        private readonly NotificationService $notifications,
    ) {}

    public function block(BlockUserRequest $request, User $user): JsonResponse
    {
        $this->refuserSoiEtOperateur($request->user(), $user, 'user.cannot_block_self');
        $reason = (string) $request->validated('reason');

        DB::transaction(function () use ($request, $user, $reason): void {
            $user->forceFill(['status' => UserStatus::Blocked])->save();
            $user->tokens()->delete();
            CalendarFeed::query()->active()->where('user_id', $user->id)->update(['revoked_at' => now()]);

            $this->journaliser($request->user(), $user, 'super_admin_user_blocked', $reason);
        });
        $this->notifications->send($user, NotificationCode::AccountBlocked, ['reason' => $reason]);
        // ADR-0055 §4 — les sessions d'impersonation qui visent ce compte se ferment.
        app(ImpersonationService::class)->closeForTarget($user);

        return $this->json(['data' => ['id' => $user->id, 'status' => $user->status->value]]);
    }

    public function reactivate(ReactivateUserRequest $request, User $user): JsonResponse
    {
        abort_code_unless($user->status === UserStatus::Blocked, 422, 'user.not_blocked');
        $reason = (string) $request->validated('reason');

        $user->forceFill(['status' => UserStatus::Active])->save();
        $this->journaliser($request->user(), $user, 'super_admin_user_reactivated', $reason);
        $this->notifications->send($user, NotificationCode::AccountReactivated, ['reason' => $reason]);

        return $this->json(['data' => ['id' => $user->id, 'status' => $user->status->value]]);
    }

    public function erase(EraseUserRequest $request, User $user): JsonResponse
    {
        $operateur = $request->user();
        $this->refuserSoiEtOperateur($operateur, $user, 'user.cannot_erase_self');
        $reason = (string) $request->validated('reason');

        $obligations = $this->deletion->collectOpenObligations($user);
        if ($obligations !== []) {
            throw (new ApiError(422, 'account_deletion.has_obligations'))->with(['obligations' => $obligations]);
        }

        $demande = DB::transaction(function () use ($operateur, $user, $reason) {
            $demande = $this->deletion->requestDeletion($user, $reason, null, 'operator', $operateur);
            $this->journaliser($operateur, $user, 'super_admin_user_erasure_requested', $reason, [
                'scheduled_for' => $demande->scheduled_for?->toIso8601String(),
            ]);

            return $demande;
        });

        return $this->json(['data' => [
            'id' => $demande->id,
            'user_id' => $user->id,
            'scheduled_for' => $demande->scheduled_for?->toIso8601String(),
        ]], 202);
    }

    private function refuserSoiEtOperateur(User $acteur, User $cible, string $codeSoi): void
    {
        abort_code_if((int) $acteur->id === (int) $cible->id, 422, $codeSoi);
        abort_code_if($cible->hasActivePlatformProfile(), 422, 'platform.revoke_operator_first');
    }

    /** @param  array<string, mixed>  $extra */
    private function journaliser(User $operateur, User $cible, string $event, string $reason, array $extra = []): void
    {
        activity('User')
            ->performedOn($cible)
            ->causedBy($operateur)
            ->withProperties(['reason' => $reason] + $extra)
            ->event($event)
            ->log($event);
    }
}
