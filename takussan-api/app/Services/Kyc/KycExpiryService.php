<?php

namespace App\Services\Kyc;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Model\NotificationService;
use Illuminate\Support\Facades\DB;

/**
 * TCK-601 (C, ADR-0044 §5) — un dossier KYC d'agence vérifié expire avec la pièce du dirigeant.
 *
 *  · à J-30 puis à J-7, les admins ACTIFS de l'agence sont relancés — une seule fois chacune,
 *    mémorisée dans `metadata.expiry_reminders` (un passage manqué rattrape au suivant, sans doubler) ;
 *  · le jour d'échéance, le dossier repasse `pending`, `metadata.expired_at` est posé, l'activité
 *    `kyc_expired` écrite, et l'agence perd `is_verified` SANS changer de statut : la suspension
 *    relève de TCK-600 et serait disproportionnée pour une pièce à renouveler.
 */
class KycExpiryService
{
    /** Jalons de relance, en jours avant l'échéance, du plus lointain au plus proche. */
    public const REMINDER_DAYS = [30, 7];

    public function __construct(private readonly NotificationService $notifications) {}

    /** @return array{reminded: int, expired: int} */
    public function run(): array
    {
        $counts = ['reminded' => 0, 'expired' => 0];

        KycDossier::query()
            ->where('status', KycDossierStatus::Verified->value)
            ->where('subject_type', Agency::class)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now()->startOfDay()->addDays(max(self::REMINDER_DAYS)))
            ->orderBy('id')
            ->each(function (KycDossier $dossier) use (&$counts): void {
                if ($dossier->expires_at->lte(now())) {
                    $this->expire($dossier);
                    $counts['expired']++;
                } elseif ($this->remind($dossier)) {
                    $counts['reminded']++;
                }
            });

        return $counts;
    }

    private function remind(KycDossier $dossier): bool
    {
        $daysLeft = (int) now()->startOfDay()->diffInDays($dossier->expires_at->copy()->startOfDay(), false);
        $metadata = $dossier->metadata ?? [];
        $sent = $metadata['expiry_reminders'] ?? [];

        // Le jalon le plus proche atteint ; les plus lointains déjà franchis ne partent plus.
        $milestone = collect(self::REMINDER_DAYS)->filter(fn (int $days) => $daysLeft <= $days)->min();
        if ($milestone === null || in_array($milestone, $sent, true)) {
            return false;
        }

        $dossier->forceFill(['metadata' => ['expiry_reminders' => [...$sent, $milestone]] + $metadata])->save();

        foreach ($this->activeAdmins((int) $dossier->subject_id) as $admin) {
            $this->notifications->send(
                $admin,
                NotificationCode::KycExpiringSoon,
                ['expires_at' => $dossier->expires_at->toDateString()],
                NotificationTarget::of('agency_kyc'),
            );
        }

        return true;
    }

    private function expire(KycDossier $dossier): void
    {
        DB::transaction(function () use ($dossier): void {
            $expiresAt = $dossier->expires_at;
            $dossier->update([
                'status' => KycDossierStatus::Pending,
                'metadata' => ['expired_at' => now()->toIso8601String()] + ($dossier->metadata ?? []),
            ]);

            Agency::query()->whereKey($dossier->subject_id)->first()?->update(['is_verified' => false]);

            activity('KYC')
                ->performedOn($dossier)
                ->event('kyc_expired')
                ->withProperties(['expires_at' => $expiresAt?->toIso8601String()])
                ->log('kyc_expired');
        });
    }

    /** @return iterable<User> */
    private function activeAdmins(int $agencyId): iterable
    {
        return AgencyAdminProfile::query()
            ->where('agency_id', $agencyId)
            ->active()
            ->with('user')
            ->get()
            ->pluck('user')
            ->filter()
            ->unique('id');
    }
}
