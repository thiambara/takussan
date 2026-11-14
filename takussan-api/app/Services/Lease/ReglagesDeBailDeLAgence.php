<?php

namespace App\Services\Lease;

use App\Domain\Settings\EditablePlatformSettings;
use App\Models\Agency;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use App\Models\User;
use App\Support\ScopedSetting;

/**
 * TCK-2832 — les réglages de bail qu'une agence règle une fois pour tous ses baux neufs : pour chaque
 * clé, la valeur qu'un bail neuf reprend ({@see LeaseDefaults}, mêmes résolveurs), sa source, la
 * valeur de la plateforme (celle que « revenir à la plateforme » rendra), la ligne d'agence (que
 * `DELETE /api/settings/{id}` retire) et les bornes du catalogue, pour que l'écran les dise.
 *
 * La source suit LA règle de {@see ScopedSetting::numericAgencyValue()} (TCK-2643 r6) : une ligne sous
 * le plancher du catalogue n'est pas un réglage de l'agence, mais elle existe et se retire.
 */
final class ReglagesDeBailDeLAgence
{
    /** L'ordre est celui de l'écran. */
    public const CLES = [
        'lease.late_fee_percent',
        'lease.late_fee_grace_days',
        EarlyTerminationService::SETTING_KEY,
        RentReviewService::SETTING_KEY,
    ];

    public function __construct(
        private readonly LeaseDefaults $defaults,
        private readonly EarlyTerminationService $earlyTermination,
        private readonly RentReviewService $rentReview,
    ) {}

    /**
     * Qui peut écrire ces réglages pour l'agence donnée : la règle de `StoreSettingRequest`,
     * `UpdateSettingRequest` et `SettingController::destroy` (son agence, et `AgencyPolicy::configure`).
     */
    public static function peutModifier(User $user, ?int $agencyId): bool
    {
        if ($agencyId === null || $user->agency_id === null || (int) $user->agency_id !== $agencyId) {
            return false;
        }

        $agence = Agency::query()->find($agencyId);

        return $agence !== null && $user->can('configure', $agence);
    }

    /** @return list<array<string, mixed>> */
    public function pour(int $agencyId): array
    {
        $lignes = Setting::query()
            ->where('scope', SettingScope::Agency)
            ->where('scope_id', $agencyId)
            ->whereIn('key', self::CLES)
            ->pluck('id', 'key');

        return array_map(fn (string $cle) => [
            'key' => $cle,
            'value' => $this->valeur($cle, $agencyId),
            'source' => ScopedSetting::numericAgencyValue($cle, $agencyId) !== null
                ? LeaseDefaults::SOURCE_AGENCY
                : LeaseDefaults::SOURCE_PLATFORM,
            'platform_value' => $this->valeur($cle, null),
            'setting_id' => isset($lignes[$cle]) ? (int) $lignes[$cle] : null,
            ...self::bornes($cle),
        ], self::CLES);
    }

    private function valeur(string $cle, ?int $agencyId): int|float
    {
        $valeur = match ($cle) {
            'lease.late_fee_percent' => $this->defaults->lateFeePercent($agencyId),
            'lease.late_fee_grace_days' => $this->defaults->lateFeeGraceDays($agencyId),
            EarlyTerminationService::SETTING_KEY => $this->earlyTermination->resolvePenaltyMonths($agencyId),
            RentReviewService::SETTING_KEY => $this->rentReview->resolveMaxPct($agencyId),
        };

        return is_float($valeur) && floor($valeur) === $valeur ? (int) $valeur : $valeur;
    }

    /**
     * Les bornes lues sur les règles du catalogue, jamais recopiées : `min`/`gt` (plancher, exclusif
     * pour `gt`) et `max`.
     *
     * @return array{type: string, min: int|float|null, min_exclusive: bool, max: int|float|null}
     */
    private static function bornes(string $cle): array
    {
        $definition = EditablePlatformSettings::get($cle);
        $bornes = ['type' => (string) $definition['type'], 'min' => null, 'min_exclusive' => false, 'max' => null];
        foreach ($definition['rules'] as $regle) {
            if (is_string($regle) && preg_match('/^(min|gt|max):(-?[0-9.]+)$/', $regle, $m) === 1) {
                $nombre = str_contains($m[2], '.') ? (float) $m[2] : (int) $m[2];
                if ($m[1] === 'max') {
                    $bornes['max'] = $nombre;
                } else {
                    $bornes['min'] = $nombre;
                    $bornes['min_exclusive'] = $m[1] === 'gt';
                }
            }
        }

        return $bornes;
    }
}
