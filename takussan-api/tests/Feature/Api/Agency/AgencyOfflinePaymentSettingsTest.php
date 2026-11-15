<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-2504 — les moyens de paiement hors ligne que l'agence déclare (numéros Wave et Orange Money,
 * coordonnées bancaires), rendus sur ses liens de paiement. Trois clés du catalogue `AgencySettings`,
 * écrites par `PATCH /api/agencies/{id}` : normalisées comme tout téléphone saisi (`TelephoneSaisi`),
 * refusées mal formées, réservées à qui configure l'agence.
 */
class AgencyOfflinePaymentSettingsTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @return array{User, Agency} */
    private function admin(): array
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id, 'settings' => ['watermark_enabled' => false]]);

        return [$admin, $agency];
    }

    public function test_les_numeros_sont_normalises_et_les_autres_reglages_intacts(): void
    {
        [$admin, $agency] = $this->admin();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => [
            'offline_payment_wave_number' => '77 123 45 67',
            'offline_payment_orange_money_number' => '00221 78-765.43.21',
            'offline_payment_bank_details' => "CBAO — SN012 01001 012345678901 23\nTitulaire : Agence Test",
        ]])->assertOk()
            ->assertJsonPath('data.settings.offline_payment_wave_number', '+221771234567')
            ->assertJsonPath('data.settings.offline_payment_orange_money_number', '+221787654321');

        $settings = $agency->refresh()->settings;
        $this->assertSame('+221771234567', $settings['offline_payment_wave_number']);
        $this->assertSame('+221787654321', $settings['offline_payment_orange_money_number']);
        $this->assertStringStartsWith('CBAO', $settings['offline_payment_bank_details']);
        $this->assertFalse($settings['watermark_enabled'], 'la fusion clé par clé garde les autres réglages');

        // `null` retire la clé.
        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['offline_payment_wave_number' => null]])->assertOk();
        $this->assertArrayNotHasKey('offline_payment_wave_number', $agency->refresh()->settings);
        $this->assertNull($agency->setting('offline_payment_wave_number'));
    }

    /**
     * Changer les coordonnées de paiement laisse une trace (`Agency::AUDIT_ONLY` porte `settings`) :
     * les détourner en silence vers un autre compte est la fraude que le journal doit voir.
     */
    public function test_changer_les_coordonnees_bancaires_laisse_une_trace(): void
    {
        [$admin, $agency] = $this->admin();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => [
            'offline_payment_bank_details' => 'CBAO SN012 01001 012345678901 23',
        ]])->assertOk();
        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => [
            'offline_payment_bank_details' => 'BOA SN099 99999 999999999999 99',
        ]])->assertOk();

        $traces = Activity::query()
            ->where('subject_type', $agency->getMorphClass())
            ->where('subject_id', $agency->id)
            ->orderBy('id')
            ->get()
            ->filter(fn (Activity $a) => str_contains((string) json_encode($a->attribute_changes), 'offline_payment_bank_details'));

        $this->assertCount(2, $traces);
        $derniere = $traces->last();
        $this->assertSame($admin->id, (int) $derniere->causer_id);
        $this->assertSame('BOA SN099 99999 999999999999 99', $derniere->attribute_changes['attributes']['settings']['offline_payment_bank_details'] ?? null);
        $this->assertSame('CBAO SN012 01001 012345678901 23', $derniere->attribute_changes['old']['settings']['offline_payment_bank_details'] ?? null);
    }

    /** AC3 — un numéro mal formé est refusé en 422 ; un texte bancaire trop long aussi. */
    public function test_un_numero_mal_forme_est_refuse(): void
    {
        [$admin, $agency] = $this->admin();
        Sanctum::actingAs($admin);

        foreach (['abc', '+77 123 45 67', '+221 77 123', '+330612345678'] as $numero) {
            $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['offline_payment_wave_number' => $numero]])
                ->assertUnprocessable()->assertJsonValidationErrors(['settings.offline_payment_wave_number']);
            $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['offline_payment_orange_money_number' => $numero]])
                ->assertUnprocessable()->assertJsonValidationErrors(['settings.offline_payment_orange_money_number']);
        }
        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['offline_payment_bank_details' => str_repeat('a', 501)]])
            ->assertUnprocessable()->assertJsonValidationErrors(['settings.offline_payment_bank_details']);

        $this->assertArrayNotHasKey('offline_payment_wave_number', $agency->refresh()->settings ?? []);
    }

    /** Qui ne configure pas l'agence (un agent) ne les écrit pas : 403, avant toute validation. */
    public function test_un_agent_ne_les_ecrit_pas(): void
    {
        [, $agency] = $this->admin();
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);
        Sanctum::actingAs($agent);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['offline_payment_wave_number' => '771234567']])->assertForbidden();
        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['offline_payment_wave_number' => 'abc']])->assertForbidden();
        $this->assertArrayNotHasKey('offline_payment_wave_number', $agency->refresh()->settings ?? []);
    }
}
