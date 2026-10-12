<?php

namespace Tests\Feature\Credits;

use App\Events\Auth\PhoneVerified;
use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditWelcomeGrant;
use App\Models\Enums\CreditLotOrigin;
use App\Models\User;
use App\Notifications\Credits\CreditsGrantedNotification;
use App\Services\Admin\PlatformSettingService;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\WelcomeCreditService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §3, AC13) — 500 crédits dès que l'admin principal a un numéro vérifié :
 * à la naissance de l'espace s'il l'est déjà, sinon à la vérification ; UNE fois par numéro, même
 * réécrit autrement, même après l'anonymisation du compte qui l'a reçue.
 */
class WelcomeCreditOncePerPhoneTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    public function test_admin_deja_verifie_credite_a_la_naissance_de_l_espace(): void
    {
        Notification::fake();
        [$admin, $agency] = $this->espace(verifie: true);

        $lot = app(WelcomeCreditService::class)->onSpaceCreated($agency);

        $this->assertNotNull($lot);
        $this->assertSame(CreditLotOrigin::Welcome, $lot->origin);
        $this->assertSame(500, $lot->initial_amount);
        $this->assertTrue($lot->expires_at->isSameDay(now()->addDays(180)));
        $this->assertSame(500, app(CreditLedger::class)->balance($agency));
        Notification::assertSentTo($admin, CreditsGrantedNotification::class, fn ($n) => $n->credits === 500);
    }

    public function test_non_verifie_rien_a_la_naissance_puis_credite_a_la_verification(): void
    {
        [$admin, $agency] = $this->espace(verifie: false);

        $this->assertNull(app(WelcomeCreditService::class)->onSpaceCreated($agency));
        $this->assertSame(0, CreditLot::query()->count());

        $admin->forceFill(['phone_verified_at' => now()])->save();
        $lot = app(WelcomeCreditService::class)->onPhoneVerified($admin->fresh());

        $this->assertSame($agency->id, $lot->agency_id);
    }

    public function test_un_second_espace_du_meme_numero_ne_recoit_rien(): void
    {
        [$admin, $agency] = $this->espace(verifie: true);
        app(WelcomeCreditService::class)->onSpaceCreated($agency);
        $second = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        $this->assertNull(app(WelcomeCreditService::class)->onSpaceCreated($second));
        $this->assertSame(0, app(CreditLedger::class)->balance($second));
        $this->assertSame(1, CreditWelcomeGrant::query()->count());
    }

    public function test_le_numero_reecrit_ou_repris_apres_anonymisation_ne_recoit_rien(): void
    {
        [$admin, $agency] = $this->espace(verifie: true);
        app(WelcomeCreditService::class)->onSpaceCreated($agency);

        // Ce que fait `AccountDeletionService::anonymize()` (l. 218) au numéro : il l'efface.
        $admin->forceFill(['phone' => null, 'phone_verified_at' => null])->save();

        $autre = User::factory()->create(['phone' => '77 123 45 67', 'phone_verified_at' => now()]);
        $autreEspace = Agency::factory()->create(['primary_admin_id' => $autre->id]);

        $this->assertNull(app(WelcomeCreditService::class)->onSpaceCreated($autreEspace));
        $this->assertSame(0, app(CreditLedger::class)->balance($autreEspace));
    }

    /**
     * La bienvenue se verse UNE fois par espace, pas une fois par numéro : changer de numéro
     * principal (`PATCH /api/auth/profile` remet `phone_verified_at` à null) puis le faire vérifier
     * ne fait pas gagner 500 crédits de plus au même espace. Vérif. adverse du lot F, V1 : 1000.
     */
    public function test_changer_de_numero_puis_le_verifier_ne_recredite_pas_l_espace(): void
    {
        [$admin, $agency] = $this->espace(verifie: true);
        event(new PhoneVerified($admin));
        $this->assertSame(500, app(CreditLedger::class)->balance($agency));

        $admin->forceFill(['phone' => '+221781112233', 'phone_verified_at' => null])->save();
        $admin->forceFill(['phone_verified_at' => now()])->save();
        event(new PhoneVerified($admin->fresh()));

        $this->assertSame(500, app(CreditLedger::class)->balance($agency), 'un numéro neuf ne re-crédite pas le même espace');
        $this->assertSame(1, CreditWelcomeGrant::query()->where('agency_id', $agency->id)->count());
        $this->assertSame(1, CreditLot::query()->where('agency_id', $agency->id)->count());
    }

    public function test_un_montant_regle_a_zero_n_octroie_rien_et_ne_consomme_pas_le_numero(): void
    {
        app(PlatformSettingService::class)->bulkUpdate(['credits.welcome_amount' => 0], User::factory()->create());
        [, $agency] = $this->espace(verifie: true);

        $this->assertNull(app(WelcomeCreditService::class)->onSpaceCreated($agency));
        $this->assertSame(0, CreditWelcomeGrant::query()->count());
    }

    /** @return array{0: User, 1: Agency} */
    private function espace(bool $verifie): array
    {
        $admin = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => $verifie ? now() : null]);
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        return [$admin, $agency];
    }
}
