<?php

namespace App\Services\Admin;

use App\Domain\Notifications\NotificationCode;
use App\Models\Enums\ImpersonationEndReason;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\UserStatus;
use App\Models\ImpersonationSession;
use App\Models\User;
use App\Services\Model\NotificationService;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * TCK-600 (ADR-0055) — l'impersonation, refaite : une session de LECTURE de 15 minutes, motivée,
 * journalisée, notifiée à la cible, portée par un jeton dédié qui ne quitte jamais le BFF.
 *
 * Le jeton n'est PAS émis par `SessionTokenIssuer` et ne porte jamais `two_factor_verified_at` :
 * toute action sous step-up lui est donc refusée par construction (`RequireRecentTwoFactor`), en
 * plus du refus explicite d'`EnforceImpersonationReadOnly`.
 */
class ImpersonationService
{
    public const TOKEN_NAME = 'impersonation';

    public const ABILITY = 'impersonation:read';

    public function __construct(
        private readonly NotificationService $notifications,
    ) {}

    /** Le jeton appartient-il au mécanisme d'impersonation (par son nom OU sa capacité) ? */
    public static function isImpersonationToken(PersonalAccessToken $token): bool
    {
        return $token->name === self::TOKEN_NAME
            || in_array(self::ABILITY, (array) $token->abilities, true);
    }

    /**
     * @return array{session: ImpersonationSession, token: string}
     */
    public function start(User $operator, User $target, string $reason): array
    {
        abort_code_if((int) $operator->id === (int) $target->id, 422, 'impersonation.target_self');
        abort_code_if($target->hasActivePlatformProfile(), 422, 'impersonation.target_operator');
        abort_code_if($target->status !== UserStatus::Active, 422, 'impersonation.target_inactive');

        foreach (ImpersonationSession::query()->where('impersonator_id', $operator->id)->whereNull('ended_at')->get() as $precedente) {
            $this->stop($precedente, ImpersonationEndReason::Stopped);
        }

        return DB::transaction(function () use ($operator, $target, $reason): array {
            $expiresAt = now()->addMinutes(ImpersonationSession::TTL_MINUTES);
            $jeton = $target->createToken(self::TOKEN_NAME, [self::ABILITY], $expiresAt);

            $session = ImpersonationSession::query()->create([
                'impersonator_id' => $operator->id,
                'target_user_id' => $target->id,
                'personal_access_token_id' => $jeton->accessToken->id,
                'reason' => $reason,
                'started_at' => now(),
                'expires_at' => $expiresAt,
            ]);

            activity('User')
                ->performedOn($target)
                ->causedBy($operator)
                ->withProperties([
                    'session_id' => $session->id,
                    'reason' => $reason,
                    'expires_at' => $expiresAt->toIso8601String(),
                ])
                ->event('super_admin_impersonation_started')
                ->log('super_admin_impersonation_started');

            return ['session' => $session, 'token' => $jeton->plainTextToken];
        });
    }

    /**
     * Idempotent : une session déjà fermée n'est ni refermée, ni re-notifiée. La ligne est
     * verrouillée — deux fermetures simultanées (`stop` et la commande d'expiration) n'envoient
     * qu'un avis.
     */
    public function stop(ImpersonationSession $session, ImpersonationEndReason $cause): void
    {
        $fermee = DB::transaction(function () use ($session, $cause): ?ImpersonationSession {
            /** @var ImpersonationSession|null $ligne */
            $ligne = ImpersonationSession::query()->whereKey($session->id)->lockForUpdate()->first();
            if ($ligne === null || $ligne->ended_at !== null) {
                return null;
            }

            if ($ligne->personal_access_token_id !== null) {
                PersonalAccessToken::query()->whereKey($ligne->personal_access_token_id)->delete();
            }
            $ligne->forceFill(['ended_at' => now(), 'end_reason' => $cause])->save();

            activity('User')
                ->performedOn($ligne->target()->withTrashed()->first() ?? $ligne->target)
                ->causedBy($ligne->impersonator()->withTrashed()->first())
                ->withProperties([
                    'session_id' => $ligne->id,
                    'end_reason' => $cause->value,
                    'duration_seconds' => (int) $ligne->started_at->diffInSeconds($ligne->ended_at),
                ])
                ->event('super_admin_impersonation_stopped')
                ->log('super_admin_impersonation_stopped');

            return $ligne;
        });

        if ($fermee !== null) {
            $this->notifierLaCible($fermee, $cause);
        }
    }

    /** La session ouverte (non fermée, non échue) que porte ce jeton, s'il y en a une. */
    public function openSessionForToken(PersonalAccessToken $token): ?ImpersonationSession
    {
        return ImpersonationSession::query()
            ->where('personal_access_token_id', $token->id)
            ->open()
            ->first();
    }

    /** Un jeton d'impersonation n'est valide que si sa session l'est, et son opérateur aussi. */
    public function tokenIsValid(PersonalAccessToken $token): bool
    {
        $session = $this->openSessionForToken($token);
        if ($session === null) {
            return false;
        }

        $operateur = $session->impersonator;

        return $operateur instanceof User
            && $operateur->status === UserStatus::Active
            && $operateur->activePlatformLevel() === PlatformProfileLevel::SuperAdmin;
    }

    /** Retrait ou blocage d'un opérateur : ses sessions se ferment. */
    public function closeForOperator(User $operator, ImpersonationEndReason $cause = ImpersonationEndReason::OperatorRevoked): void
    {
        foreach (ImpersonationSession::query()->where('impersonator_id', $operator->id)->whereNull('ended_at')->get() as $session) {
            $this->stop($session, $cause);
        }
    }

    /** Blocage d'une cible : les sessions qui la visent se ferment. */
    public function closeForTarget(User $target): void
    {
        foreach (ImpersonationSession::query()->where('target_user_id', $target->id)->whereNull('ended_at')->get() as $session) {
            $this->stop($session, ImpersonationEndReason::TargetBlocked);
        }
    }

    /** La commande planifiée : toute session ouverte échue. */
    public function closeExpired(): int
    {
        $echues = ImpersonationSession::query()
            ->whereNull('ended_at')
            ->where('expires_at', '<=', now())
            ->get();
        foreach ($echues as $session) {
            $this->stop($session, ImpersonationEndReason::Expired);
        }

        return $echues->count();
    }

    private function notifierLaCible(ImpersonationSession $session, ImpersonationEndReason $cause): void
    {
        $cible = $session->target;
        if (! $cible instanceof User) {
            return;
        }
        $operateur = $session->impersonator()->withTrashed()->first();

        $this->notifications->send($cible, NotificationCode::ImpersonationEnded, [
            'operator' => $operateur instanceof User ? (trim($operateur->first_name.' '.$operateur->last_name) ?: (string) $operateur->email) : '',
            'reason' => $session->reason,
            'started_at' => $session->started_at->toIso8601String(),
            'ended_at' => $session->ended_at->toIso8601String(),
        ]);
    }
}
