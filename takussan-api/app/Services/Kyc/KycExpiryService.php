<?php

namespace App\Services\Kyc;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\User;
use App\Services\Membership\AdminsDeLAgence;
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
 *
 * TCK-2669 (ADR-0104 § 7) — un dossier dont la pièce du dirigeant a été RENOUVELÉE n'est plus
 * `verified` (il est `submitted`, ou `rejected` si le renouvellement a été refusé) mais garde
 * l'échéance de l'ancienne pièce. Ce jour-là, l'agence perd `is_verified` comme ci-dessus, et le
 * dossier garde son statut : il ne repasse pas `pending`, la nouvelle pièce attend la revue.
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

        // TCK-2669 — les renouvellements en revue (ou refusés) dont l'ancienne pièce est échue, tant
        // que l'agence se dit encore vérifiée : idempotent, le second passage ne trouve plus rien.
        // `metadata.expired_at` absent = pas encore passé par une échéance depuis la dernière
        // vérification (que `verify()` efface) : un dossier déjà échu puis renvoyé garde une
        // `expires_at` révolue, et une vérification posée à la main par la modération ne doit pas
        // lui être retirée chaque nuit.
        KycDossier::query()
            ->whereIn('status', [KycDossierStatus::Submitted->value, KycDossierStatus::Rejected->value])
            ->where('subject_type', Agency::class)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->whereNull('metadata->expired_at')
            ->whereIn('subject_id', Agency::query()->where('is_verified', true)->select('id'))
            ->orderBy('id')
            ->each(function (KycDossier $dossier) use (&$counts): void {
                $this->expire($dossier, keepStatus: true);
                $counts['expired']++;
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

        // P207.04 (TCK-2073) — le jalon dit un rappel REÇU (`models-spec.md`, `expiry_reminders`) : il
        // ne se pose qu'après qu'au moins un administrateur a reçu l'avis. Sans destinataire, il reste
        // libre, et le rappel part au passage suivant si un administrateur arrive entre-temps.
        $recus = 0;
        foreach ($this->activeAdmins((int) $dossier->subject_id) as $admin) {
            $recu = $this->notifications->send(
                $admin,
                NotificationCode::KycExpiringSoon,
                ['expires_at' => $dossier->expires_at->toDateString()],
                NotificationTarget::of('agency_kyc')->forAgency($dossier->subject_id),
            );
            if ($recu !== null) {
                $recus++;
            }
        }
        if ($recus === 0) {
            return false;
        }

        $dossier->forceFill(['metadata' => ['expiry_reminders' => [...$sent, $milestone]] + $metadata])->save();

        return true;
    }

    private function expire(KycDossier $dossier, bool $keepStatus = false): void
    {
        DB::transaction(function () use ($dossier, $keepStatus): void {
            $expiresAt = $dossier->expires_at;
            $dossier->update(($keepStatus ? [] : ['status' => KycDossierStatus::Pending]) + [
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
        // TCK-1318 — la liste unique : profil actif et compte joignable.
        return AdminsDeLAgence::destinataires($agencyId);
    }
}
