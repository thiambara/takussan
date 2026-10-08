<?php

namespace Tests\Feature\Admin\Platform;

use App\Domain\Alerts\AlertableEvents;
use App\Jobs\SendAdminAlert;
use App\Models\AlertRule;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\PlatformPayout;
use App\Models\User;
use App\Services\Admin\UserSupportService;
use App\Services\Billing\PlatformPayoutService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Symfony\Component\Finder\Finder;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 — AC18b et la moitié « alertes » d'AC15 et d'AC18 : le catalogue des événements
 * alertables couvre les gestes sensibles réellement journalisés, et il est servi par clé.
 */
class AlertableEventsCatalogueTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private const PAYOUTS = [
        'super_admin_payout_approved',
        'super_admin_payout_marked_paid',
        'super_admin_payout_cancelled',
        'super_admin_payout_period_closed',
    ];

    /** AC18b. */
    public function test_les_reversements_sont_alertables_et_une_regle_se_cree(): void
    {
        foreach (self::PAYOUTS as $event) {
            $this->assertTrue(AlertableEvents::has($event), $event);
        }
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson('/api/admin/alert-rules', $this->regle('super_admin_payout_approved'))->assertCreated();
    }

    /** AC18b — la règle part réellement sur l'approbation d'un reversement, une fois. */
    public function test_l_approbation_d_un_reversement_declenche_l_alerte(): void
    {
        Queue::fake();
        $regle = AlertRule::create($this->ligne('super_admin_payout_approved'));
        $operateur = $this->operateur(PlatformProfileLevel::SuperAdmin);

        app(PlatformPayoutService::class)->approve(PlatformPayout::factory()->create(), $operateur);

        Queue::assertPushed(SendAdminAlert::class, 1);
        Queue::assertPushed(SendAdminAlert::class, fn (SendAdminAlert $job) => $job->ruleId === $regle->id);
    }

    /** AC18 — une règle sur `super_admin_2fa_reset` part lors d'une remise à zéro. */
    public function test_la_remise_a_zero_d_une_2fa_declenche_l_alerte(): void
    {
        Queue::fake();
        AlertRule::create($this->ligne('super_admin_2fa_reset'));
        $operateur = $this->operateur(PlatformProfileLevel::Support);
        $cible = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);

        app(UserSupportService::class)->resetTwoFactor($operateur, $cible, 'Téléphone perdu, identité vérifiée.');

        Queue::assertPushed(SendAdminAlert::class, 1);
    }

    /** AC15 — servi par clé : ni `label` dans les règles, ni libellé dans le catalogue. */
    public function test_le_catalogue_et_les_regles_sont_servis_par_cle(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->postJson('/api/admin/alert-rules', $this->regle('super_admin_impersonation_started'))
            ->assertCreated()
            ->assertJsonMissingPath('data.label');

        $reponse = $this->getJson('/api/admin/alert-rules')->assertOk();

        $this->assertSame(AlertableEvents::keys(), $reponse->json('catalogue'));
        $this->assertTrue(array_is_list($reponse->json('catalogue')));
        $this->assertArrayNotHasKey('label', $reponse->json('data.0'));
    }

    /** Un nom de catalogue qui ne serait écrit par aucun code ne déclencherait jamais rien. */
    public function test_chaque_evenement_du_catalogue_est_ecrit_par_le_code(): void
    {
        $sources = '';
        foreach ((new Finder)->files()->in(app_path())->name('*.php')->notName('AlertableEvents.php') as $fichier) {
            $sources .= $fichier->getContents();
        }

        foreach (AlertableEvents::keys() as $event) {
            $this->assertStringContainsString("'{$event}'", $sources, "{$event} n'est écrit par aucun code");
        }
    }

    /** @return array<string,mixed> */
    private function regle(string $event): array
    {
        return [
            'event' => $event,
            'channels' => ['email'],
            'recipients' => ['emails' => ['ops@example.test']],
            'is_active' => true,
        ];
    }

    /** @return array<string,mixed> */
    private function ligne(string $event): array
    {
        return [
            'event' => $event,
            'channels_json' => ['email'],
            'recipients_json' => ['emails' => ['ops@example.test']],
            'is_active' => true,
        ];
    }
}
