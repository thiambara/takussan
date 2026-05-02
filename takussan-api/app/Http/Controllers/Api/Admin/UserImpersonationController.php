<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * TCK-144 — Super-admin user impersonation. The impersonator (a super_admin)
 * receives a fresh Sanctum token tied to the target user, scoped to the name
 * `impersonation` and expiring within an hour.
 *
 * The frontend is expected to hold **both** tokens during a session: the
 * super_admin's own token (used to call privileged endpoints like the stop)
 * and the impersonation token (used to act as the target). Stop revokes the
 * impersonation tokens for the named target without touching the original
 * super_admin session.
 *
 * Both transitions emit `super_admin_impersonation_started` /
 * `super_admin_impersonation_stopped` activity log entries linking the actor
 * (super_admin) to the subject (target user).
 */
class UserImpersonationController extends Controller
{
    private const IMPERSONATION_TOKEN_NAME = 'impersonation';

    private const IMPERSONATION_TTL_MINUTES = 60;

    public function start(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();

        if ($actor->id === $user->id) {
            return $this->json(['message' => 'You cannot impersonate yourself.'], 422);
        }

        // Revoke any prior impersonation tokens for this target so repeated
        // start() calls don't pile up long-lived tokens — every fresh start
        // supersedes the previous session for that user.
        PersonalAccessToken::query()
            ->where('tokenable_type', $user->getMorphClass())
            ->where('tokenable_id', $user->id)
            ->where('name', self::IMPERSONATION_TOKEN_NAME)
            ->delete();

        $expiresAt = now()->addMinutes(self::IMPERSONATION_TTL_MINUTES);
        $token = $user->createToken(self::IMPERSONATION_TOKEN_NAME, ['*'], $expiresAt);

        activity('User')
            ->performedOn($user)
            ->causedBy($actor)
            ->withProperties([
                'actor_id' => $actor->id,
                'target_user_id' => $user->id,
                'expires_at' => $expiresAt->toIso8601String(),
            ])
            ->event('super_admin_impersonation_started')
            ->log('Super-admin impersonation started');

        return $this->json([
            'token' => $token->plainTextToken,
            'expires_at' => $expiresAt->toIso8601String(),
            'actor_id' => $actor->id,
            'target_user_id' => $user->id,
        ]);
    }

    public function stop(Request $request): JsonResponse
    {
        $actor = $request->user();
        $userId = $request->integer('user_id');
        if ($userId <= 0) {
            return $this->json(['message' => 'user_id is required.'], 422);
        }

        $target = User::find($userId);
        if (! $target) {
            return $this->json(['message' => 'Target user not found.'], 404);
        }

        $revoked = PersonalAccessToken::query()
            ->where('tokenable_type', $target->getMorphClass())
            ->where('tokenable_id', $target->id)
            ->where('name', self::IMPERSONATION_TOKEN_NAME)
            ->delete();

        activity('User')
            ->performedOn($target)
            ->causedBy($actor)
            ->withProperties([
                'actor_id' => $actor->id,
                'target_user_id' => $target->id,
                'revoked_count' => $revoked,
            ])
            ->event('super_admin_impersonation_stopped')
            ->log('Super-admin impersonation stopped');

        return $this->json([
            'message' => 'Impersonation stopped.',
            'revoked_count' => $revoked,
        ]);
    }
}
