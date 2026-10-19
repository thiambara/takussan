<?php

namespace Tests\Feature\Api\Agency;

use App\Http\Requests\AgencyUpdateRequest;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Finder\Finder;
use Tests\TestCase;

/**
 * TCK-963 (P47.03) — une clé de `agencies.settings` que `app/` lit doit pouvoir s'écrire.
 *
 * `BookingExpirationService` lisait `booking_pending_expiry_hours` et `TenantOnboardingService`
 * `tenant_onboarding_enabled`, mais `AgencyUpdateRequest` n'avait de règle pour aucune des deux :
 * `validated()` les retirait, l'API répondait 200 sans rien écrire, et toutes les agences gardaient
 * le défaut d'un réglage présenté comme le leur.
 */
class AgencySettingsWritableTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Les fichiers de `app/` qui lisent les `settings` d'une agence, tels qu'ils sont aujourd'hui.
     * Épinglés pour que le balayage ne puisse pas devenir vide sans rougir.
     */
    private const LECTEURS_CONNUS = [
        'Models/Agency.php',
        'Services/Booking/BookingExpirationService.php',
        'Services/Tenant/TenantOnboardingService.php',
        'Services/Media/AgencyWatermarkContext.php',
        'Support/Security/TwoFactorRequirement.php',
    ];

    private function admin(array $settings = []): array
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id, 'settings' => $settings]);

        return [$admin, $agency];
    }

    public function test_les_deux_reglages_s_ecrivent(): void
    {
        [$admin, $agency] = $this->admin();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", [
            'settings' => ['booking_pending_expiry_hours' => 0, 'tenant_onboarding_enabled' => false],
        ])->assertOk();

        $settings = $agency->refresh()->settings;
        $this->assertSame(0, $settings['booking_pending_expiry_hours']);
        $this->assertFalse($settings['tenant_onboarding_enabled']);
    }

    /**
     * @return array<string, array{string, mixed}>
     */
    public static function valeursRefusees(): array
    {
        return [
            'seuil au-delà de 168 h' => ['booking_pending_expiry_hours', 169],
            'seuil négatif' => ['booking_pending_expiry_hours', -1],
            'seuil non entier' => ['booking_pending_expiry_hours', 1.5],
            'interrupteur non booléen' => ['tenant_onboarding_enabled', 'x'],
        ];
    }

    #[DataProvider('valeursRefusees')]
    public function test_une_valeur_hors_regle_est_refusee(string $cle, mixed $valeur): void
    {
        [$admin, $agency] = $this->admin();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => [$cle => $valeur]])
            ->assertStatus(422)
            ->assertJsonValidationErrors("settings.{$cle}");

        $this->assertArrayNotHasKey($cle, $agency->refresh()->settings ?? []);
    }

    public function test_toute_cle_lue_par_app_a_une_regle_d_ecriture(): void
    {
        $lues = $this->clesLuesParApp();

        $this->assertSame(
            self::LECTEURS_CONNUS,
            array_values(array_intersect(self::LECTEURS_CONNUS, array_keys($lues))),
            'Un lecteur connu des settings d’agence n’est plus vu par le balayage : le motif est à revoir.',
        );

        $regles = array_keys((new AgencyUpdateRequest)->rules());
        $sansRegle = [];
        foreach ($lues as $fichier => $cles) {
            foreach ($cles as $cle) {
                if (! in_array("settings.{$cle}", $regles, true)) {
                    $sansRegle[] = "{$cle} ({$fichier})";
                }
            }
        }

        $this->assertSame([], $sansRegle, 'Clés de agencies.settings lues par app/ sans règle dans AgencyUpdateRequest.');
    }

    /**
     * Les clés que chaque fichier de `app/` lit dans les `settings` d'une agence. Un fichier en est
     * un lecteur s'il nomme les `settings` d'une agence (`$agency->settings`, `agency?->settings`,
     * `$this->settings` dans `Agency`, `agencies.settings`, ou une requête JSON
     * `'settings->…'`) ; les clés sont celles de `data_get(…->settings, 'clé'`, de
     * `$settings['clé']` et de `'settings->clé'`. Les commentaires sont ignorés.
     *
     * @return array<string, list<string>>
     */
    private function clesLuesParApp(): array
    {
        $lues = [];
        foreach (Finder::create()->files()->in(app_path())->name('*.php') as $fichier) {
            $relatif = str_replace('\\', '/', $fichier->getRelativePathname());
            $code = implode("\n", array_filter(
                explode("\n", $fichier->getContents()),
                fn (string $ligne): bool => ! preg_match('#^\s*(\*|//|/\*)#', $ligne),
            ));

            $lecteur = preg_match('/agency\??->settings|agencies\.settings|[\'"]settings->/i', $code) === 1
                || ($relatif === 'Models/Agency.php' && str_contains($code, '$this->settings'));
            if (! $lecteur) {
                continue;
            }

            preg_match_all(
                '/data_get\(\s*\$[\w>?\-]*settings\s*,\s*[\'"]([a-z_]+)|\$settings\[[\'"]([a-z_]+)[\'"]\]|[\'"]settings->([a-z_]+)/',
                $code,
                $m,
            );
            $cles = array_values(array_unique(array_filter(array_merge($m[1], $m[2], $m[3]))));
            if ($cles !== []) {
                sort($cles);
                $lues[$relatif] = $cles;
            }
        }
        ksort($lues);

        return $lues;
    }
}
