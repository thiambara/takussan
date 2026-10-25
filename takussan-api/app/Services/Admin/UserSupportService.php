<?php

namespace App\Services\Admin;

use App\Models\User;
use App\Services\Auth\LoginLock;
use App\Services\Auth\MetadataDuCompte;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Laravel\Sanctum\PersonalAccessToken;

class UserSupportService
{
    public function forcePasswordReset(User $actor, User $target, string $reason): int
    {
        $this->guardTarget($actor, $target);
        // TCK-1995 (P193.02) — un compte sans e-mail (créé par téléphone) n'a pas de lien à recevoir :
        // refusé avant `sendResetLink()`, qui écrivait une ligne `password_reset_tokens` à e-mail nul (500).
        abort_code_if(blank($target->email), 409, 'support.no_email');

        $status = Password::broker()->sendResetLink(['email' => $target->email]);
        if ($status !== Password::RESET_LINK_SENT) {
            abort_code(502, 'mail.password_reset_not_sent');
        }

        $target->tokens()->delete();

        return $this->log($actor, $target, 'super_admin_password_reset_forced', $reason, [
            'tokens_revoked' => true,
        ]);
    }

    public function unlock(User $actor, User $target, string $reason): int
    {
        $this->guardTarget($actor, $target);
        // Vérification adverse M1 — un verrou par canal : celui du numéro vérifié se lève aussi.
        $lock = app(LoginLock::class);
        $numero = $target->phone_verified_at !== null && $target->phone ? (string) $target->phone : null;
        // P83.04 (TCK-1775) — juger comme la connexion juge : un `locked_at` échu ne ferme plus
        // rien, le « débloquer » rendait 200 et journalisait un déblocage qui n'en était pas un.
        abort_code_if($lock->lockedUntil($target) === null, 409, 'support.account_not_locked');

        // P245.02 (TCK-2367) — les clés se retirent sur la ligne en base : recomposée depuis le compte
        // chargé, la colonne effaçait le drapeau d'une réinitialisation de la 2FA écrite entre-temps.
        $lock->clear($target);
        if ($numero !== null) {
            $lock->clearNumber($numero);
        }

        return $this->log($actor, $target, 'super_admin_account_unlocked', $reason);
    }

    public function resetTwoFactor(User $actor, User $target, string $reason): int
    {
        $this->guardTarget($actor, $target);

        abort_code_unless($target->two_factor_enabled, 409, 'support.two_factor_already_disabled');

        // P245.02 (TCK-2367) — le drapeau se pose sur la ligne en base, pas sur le compte chargé : un
        // échec de connexion écrit entre-temps reste compté. Les colonnes passent par le modèle, que
        // le journal d'activité suit (`two_factor_enabled`).
        DB::transaction(function () use ($target): void {
            $target->forceFill([
                'two_factor_enabled' => false,
                'two_factor_secret' => null,
                'two_factor_recovery_codes' => null,
            ])->save();
            MetadataDuCompte::poser($target, 'force_2fa_reconfigure', true);
        });

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

        abort_code_if($revoked === 0, 409, 'support.no_revocable_session');

        return $this->log($actor, $target, 'super_admin_sessions_revoked', $reason, [
            'revoked_count' => $revoked,
            'kept_current_session' => $keepCurrentSession,
        ]);
    }

    public function revokeSession(User $actor, User $target, int $tokenId, string $reason): int
    {
        $this->guardTarget($actor, $target);
        $currentId = $this->currentTokenId($actor);
        abort_code_if($currentId !== null && $currentId === $tokenId, 409, 'support.cannot_revoke_current');

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
        abort_code_if($target->isSuperAdmin(), 409, 'support.target_super_admin');
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
