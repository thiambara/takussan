<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use App\Services\Invoice\OverdueReminderService;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\LateFeeCalculator;
use App\Services\Lease\LeaseRenewalService;
use App\Services\Lease\RentReviewService;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionMethod;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-651 (ADR-0065) — les cinq réglages métier à repli par agence s'écrivent au catalogue.
 *
 * Leur valeur globale ne s'écrivait que par la route brute, sans règle ni journal. Ici, de bout en
 * bout : `PATCH /api/admin/settings` → le service lit la valeur pour une agence sans réglage propre,
 * et la ligne d'une agence l'emporte toujours.
 */
class RentalSettingsCatalogueTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string, mixed, mixed, mixed, Closure(?int): mixed}> */
    public static function reglages(): array
    {
        return [
            'relances de facture' => ['invoice.reminder_offsets_days', [20, 5, 10, 5], [5, 10, 20], [40],
                fn (?int $a) => app(OverdueReminderService::class)->offsets($a)],
            'plafond de révision' => ['lease.rent_review_max_pct', 12.5, 12.5, 30.0,
                fn (?int $a) => app(RentReviewService::class)->resolveMaxPct($a)],
            'pénalité de résiliation' => ['lease.early_termination_penalty_months', 4, 4, 6,
                fn (?int $a) => app(EarlyTerminationService::class)->resolvePenaltyMonths($a)],
            'signature au renouvellement' => ['lease.require_signature', true, true, false,
                fn (?int $a) => self::protegee(LeaseRenewalService::class, 'requireSignatureFlag', $a)],
            'plafond des pénalités de retard' => ['late_fees.cap_percent', 7.5, 7.5, 3.0,
                fn (?int $a) => self::protegee(LateFeeCalculator::class, 'capPercent', $a)],
        ];
    }

    #[DataProvider('reglages')]
    public function test_la_valeur_du_catalogue_est_celle_que_lit_le_service(string $cle, mixed $envoye, mixed $lu, mixed $agence, Closure $lire): void
    {
        $this->actingAsRole('super_admin');
        $sansReglage = Agency::factory()->create();
        $avecReglage = Agency::factory()->create();
        Setting::query()->create(['key' => $cle, 'value' => ['value' => $agence], 'scope' => SettingScope::Agency, 'scope_id' => $avecReglage->id]);

        $this->patchJson('/api/admin/settings', [$cle => $envoye])->assertOk();

        $this->assertSame($lu, $lire($sansReglage->id), 'une agence sans réglage lit le catalogue');
        $this->assertSame($lu, $lire(null), 'un lecteur sans agence aussi');
        $this->assertSame($agence, $lire($avecReglage->id), 'la ligne de l\'agence l\'emporte');

        $journal = Activity::query()->where('event', 'super_admin_setting_updated')->latest('id')->first();
        $this->assertSame($cle, $journal?->properties['key']);
        $this->assertSame($lu, $journal->properties['new_value']);
    }

    /** Sans rien au catalogue, chaque service lit le défaut que le catalogue lui emprunte. */
    public function test_le_defaut_du_catalogue_est_celui_du_service(): void
    {
        $this->assertSame(OverdueReminderService::DEFAULT_OFFSETS, app(OverdueReminderService::class)->offsets(null));
        $this->assertSame((float) RentReviewService::DEFAULT_MAX_PCT, app(RentReviewService::class)->resolveMaxPct(null));
        $this->assertSame(EarlyTerminationService::SETTING_DEFAULT_MONTHS, app(EarlyTerminationService::class)->resolvePenaltyMonths(null));
        $this->assertFalse(self::protegee(LeaseRenewalService::class, 'requireSignatureFlag', null));
        $this->assertNull(self::protegee(LateFeeCalculator::class, 'capPercent', null));
    }

    /** @return array<string, array{string, mixed}> */
    public static function horsRegles(): array
    {
        return [
            'plafond de révision non numérique' => ['lease.rent_review_max_pct', 'abc'],
            'plafond de révision nul' => ['lease.rent_review_max_pct', 0],
            'plafond de révision au-delà de 100' => ['lease.rent_review_max_pct', 150],
            'aucune relance' => ['invoice.reminder_offsets_days', []],
            'relance à zéro jour' => ['invoice.reminder_offsets_days', [0, 7]],
            'pénalité de zéro mois' => ['lease.early_termination_penalty_months', 0],
            'pénalité décimale' => ['lease.early_termination_penalty_months', 1.5],
            'signature non booléenne' => ['lease.require_signature', 'peut-être'],
            'plafond des pénalités négatif' => ['late_fees.cap_percent', -1],
        ];
    }

    #[DataProvider('horsRegles')]
    public function test_une_valeur_hors_regles_est_refusee_et_n_est_pas_ecrite(string $cle, mixed $valeur): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/settings', [$cle => $valeur])
            ->assertUnprocessable()
            ->assertJsonValidationErrors($cle);

        $this->assertFalse(Setting::query()->where('key', $cle)->exists());
        $this->assertFalse(Activity::query()->where('event', 'super_admin_setting_updated')->exists());
    }

    /** Un plafond des pénalités vide se lit « aucun plafond », pas zéro. */
    public function test_un_plafond_des_penalites_vide_retire_le_plafond(): void
    {
        $this->actingAsRole('super_admin');
        $this->patchJson('/api/admin/settings', ['late_fees.cap_percent' => 5])->assertOk();

        $this->patchJson('/api/admin/settings', ['late_fees.cap_percent' => null])
            ->assertOk()
            ->assertJsonPath('data.rentals.4.value', null);

        $this->assertNull(self::protegee(LateFeeCalculator::class, 'capPercent', null));
    }

    private static function protegee(string $classe, string $methode, ?int $agence): mixed
    {
        return (new ReflectionMethod($classe, $methode))->invoke(app($classe), $agence);
    }
}
