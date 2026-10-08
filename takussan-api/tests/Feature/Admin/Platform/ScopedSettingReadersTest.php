<?php

namespace Tests\Feature\Admin\Platform;

use App\Jobs\Invoice\SendOverdueRemindersJob;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\SettingScope;
use App\Models\Invoice;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\InvoiceOverdueReminderNotification;
use App\Services\Invoice\OverdueReminderService;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\LateFeeCalculator;
use App\Services\Lease\LeaseRenewalService;
use App\Services\Lease\RentReviewService;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionMethod;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-600 (verif-600 H1) — un réglage d'agence ne vaut que pour son agence.
 *
 * Cinq lecteurs lisaient la première ligne `settings` venue, sans portée : un admin d'agence qui
 * posait `invoice.reminder_offsets_days` dans SON agence le réécrivait pour toute la plateforme.
 * Chacun lit désormais par `ScopedSetting` : la ligne de l'agence, sinon la globale, sinon le défaut.
 */
class ScopedSettingReadersTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    /** @return array<string, array{string, mixed, mixed, mixed, Closure(?int): mixed}> */
    public static function lecteurs(): array
    {
        return [
            'relances de facture' => [OverdueReminderService::SETTING_KEY, [40, 41], [5, 9], OverdueReminderService::DEFAULT_OFFSETS,
                fn (?int $a) => app(OverdueReminderService::class)->offsets($a)],
            'plafond de révision' => [RentReviewService::SETTING_KEY, 35, 12, (float) RentReviewService::DEFAULT_MAX_PCT,
                fn (?int $a) => app(RentReviewService::class)->resolveMaxPct($a)],
            'pénalité de résiliation' => [EarlyTerminationService::SETTING_KEY, 5, 3, EarlyTerminationService::SETTING_DEFAULT_MONTHS,
                fn (?int $a) => app(EarlyTerminationService::class)->resolvePenaltyMonths($a)],
            'signature au renouvellement' => ['lease.require_signature', true, false, false,
                fn (?int $a) => self::protegee(LeaseRenewalService::class, 'requireSignatureFlag', $a)],
            'plafond des pénalités de retard' => ['late_fees.cap_percent', 7, 4, null,
                fn (?int $a) => self::protegee(LateFeeCalculator::class, 'capPercent', $a)],
        ];
    }

    #[DataProvider('lecteurs')]
    public function test_la_ligne_d_une_agence_ne_vaut_que_pour_elle(string $cle, mixed $valeurA, mixed $global, mixed $defaut, Closure $lire): void
    {
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $attendu = fn (mixed $v) => is_float($defaut) ? (float) $v : $v;

        $this->ligne($cle, $valeurA, SettingScope::Agency, $a->id);

        $this->assertEquals($attendu($valeurA), $lire($a->id), 'la ligne de A s\'applique à A');
        $this->assertEquals($defaut, $lire($b->id), 'la ligne de A ne change rien pour B');
        $this->assertEquals($defaut, $lire(null), 'ni pour un lecteur sans agence');

        $this->ligne($cle, $global, SettingScope::Global, null);

        $this->assertEquals($attendu($global), $lire($b->id), 'B lit le global');
        $this->assertEquals($attendu($valeurA), $lire($a->id), 'A garde la sienne');
    }

    /** La sonde S6 de verif-600, de bout en bout : par l'API, un admin d'agence n'atteint pas les autres. */
    public function test_un_admin_d_agence_ne_reecrit_pas_les_relances_des_autres(): void
    {
        $a = $this->agence();
        $b = $this->agence();
        $this->actingAsWithStepUp($this->personnel($a, 'agency_admin'));

        $this->postJson('/api/settings', [
            'key' => OverdueReminderService::SETTING_KEY,
            'scope' => 'agency',
            'value' => ['value' => [40, 41]],
        ])->assertCreated();

        $service = app(OverdueReminderService::class);
        $this->assertSame([40, 41], $service->offsets($a->id));
        $this->assertSame(OverdueReminderService::DEFAULT_OFFSETS, $service->offsets($b->id));
    }

    /**
     * verif-600 passe 2, m-B — le balayage quotidien unit les échéances de TOUTES les agences.
     * Une agence dont le seul réglage vaut [40] n'a aucune facture aux échéances par défaut : sans
     * l'union, le balayage ne la listerait jamais, et sa relance de J+40 ne partirait jamais.
     */
    public function test_le_balayage_relance_une_agence_a_ses_seules_echeances(): void
    {
        Notification::fake();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $this->ligne(OverdueReminderService::SETTING_KEY, [40], SettingScope::Agency, $a->id);
        $clientA = $this->factureEchue($a, 40);
        $clientB = $this->factureEchue($b, 40);

        $this->assertContains($a->id, app(OverdueReminderService::class)->agenciesWithRemindableInvoices());
        $this->assertSame(1, app()->call([new SendOverdueRemindersJob, 'handle']));

        Notification::assertSentToTimes($clientA, InvoiceOverdueReminderNotification::class, 1);
        // Témoin : J+40 n'est une échéance que pour A ; B garde le défaut.
        Notification::assertNothingSentTo($clientB);
    }

    private function factureEchue(Agency $agence, int $joursDeRetard): User
    {
        $client = User::factory()->create();
        Invoice::factory()->sent()->create([
            'agency_id' => $agence->id,
            'customer_id' => Customer::factory()->create(['user_id' => $client->id])->id,
            'due_date' => now()->subDays($joursDeRetard)->toDateString(),
        ]);

        return $client;
    }

    private function ligne(string $cle, mixed $valeur, SettingScope $portee, ?int $agence): void
    {
        Setting::query()->create(['key' => $cle, 'value' => ['value' => $valeur], 'scope' => $portee, 'scope_id' => $agence]);
    }

    private static function protegee(string $classe, string $methode, ?int $agence): mixed
    {
        return (new ReflectionMethod($classe, $methode))->invoke(app($classe), $agence);
    }
}
