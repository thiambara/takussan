<?php

namespace App\Services\Admin;

use App\Models\User;
use Illuminate\Support\Facades\Password;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpKernel\Exception\HttpException;

class UserSupportService
{
    public function forcePasswordReset(User $actor, User $target, string $reason): int
    {
        $this->guardTarget($actor, $target);

        $status = Password::broker()->sendResetLink(['email' => $target->email]);
        if ($status !== Password::RESET_LINK_SENT) {
            throw new HttpException(502, 'Password reset email could not be sent.');
        }

        $target->tokens()->delete();

        return $this->log($actor, $target, 'super_admin_password_reset_forced', $reason, [
            'tokens_revoked' => true,
        ]);
    }

    public function unlock(User $actor, User $target, string $reason): int
    {
        $this->guardTarget($actor, $target);
        $metadata = $target->metadata ?? [];

        abort_if(empty($metadata['locked_at']), 409, 'Account is not locked.');

        unset($metadata['locked_at'], $metadata['failed_login_attempts']);
        $target->forceFill(['metadata' => $metadata])->save();

        return $this->log($actor, $target, 'super_admin_account_unlocked', $reason);
    }

    public function resetTwoFactor(User $actor, User $target, string $reason): int
    {
        $this->guardTarget($actor, $target);

        abort_unless($target->two_factor_enabled, 409, 'Two-factor authentication is already disabled.');

        $metadata = $target->metadata ?? [];
        $metadata['force_2fa_reconfigure'] = true;
        $target->forceFill([
            'two_factor_enabled' => false,
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
            'metadata' => $metadata,
        ])->save();

        return $this->log($actor, $target, 'super_admin_2fa_reset', $reason);
    }

    public function revokeSessions(User $actor, User $target, string $reason, bool $keepCurrentSession = true): int
    {
        $this->guardTarget($actor, $target);
        $currentId = $keepCurrentSession ? $this->currentTokenId($actor) : null;

        $query = $target->tokens();
        if ($currentId !== null) {
            $query->where('id', '!=', $currentId);
        }
        $revoked = $query->delete();

        abort_if($revoked === 0, 409, 'No revocable sessions found.');

        return $this->log($actor, $target, 'super_admin_sessions_revoked', $reason, [
            'revoked_count' => $revoked,
            'kept_current_session' => $keepCurrentSession,
        ]);
    }

    public function revokeSession(User $actor, User $target, int $tokenId, string $reason): int
    {
        $this->guardTarget($actor, $target);
        $currentId = $this->currentTokenId($actor);
        abort_if($currentId !== null && $currentId === $tokenId, 409, 'Cannot revoke the current super-admin session.');

        $token = PersonalAccessToken::query()
            ->where('tokenable_type', User::class)
            ->where('tokenable_id', $target->id)
            ->whereKey($tokenId)
            ->firstOrFail();
        $token->delete();

        return $this->log($actor, $target, 'super_admin_sessions_revoked', $reason, [
            'revoked_token_id' => $tokenId,
        ]);
    }

    private function guardTarget(User $actor, User $target): void
    {
        abort_if($target->isSuperAdmin(), 409, 'Support actions cannot target another super-admin.');
    }

    private function currentTokenId(User $actor): ?int
    {
        $token = $actor->currentAccessToken();

        return $token instanceof PersonalAccessToken ? (int) $token->id : null;
    }

    private function log(User $actor, User $target, string $event, string $reason, array $extra = []): int
    {
        $activity = activity('UserSupport')
            ->causedBy($actor)
            ->performedOn($target)
            ->withProperties([
                'actor_id' => $actor->id,
                'target_user_id' => $target->id,
                'reason' => $reason,
            ] + $extra)
            ->event($event)
            ->log("User support action {$event}");

        return (int) $activity->id;
    }
}
