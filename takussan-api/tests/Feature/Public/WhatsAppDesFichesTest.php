<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2576 — WhatsApp au premier rang des fiches d'agence et d'agent : l'API publique dit si le
 * numéro publié est sur WhatsApp, et ne le dit JAMAIS d'un numéro qu'elle ne publie pas.
 *
 * - Agent : `phone_whatsapp` (booléen) servi avec `phone`, et seulement alors — la règle de la fiche
 *   d'un bien (`User::principalPublicSurWhatsApp()`).
 * - Agence (décision du porteur, option a) : le numéro WhatsApp DÉCLARÉ par l'agence
 *   (`agencies.phone_whatsapp`), jamais `phone`, jamais le numéro de son administrateur.
 */
class WhatsAppDesFichesTest extends ApiTestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771230987';

    private const ADMIN = '+221781112233';

    private function agent(bool $verifie, bool $whatsApp): User
    {
        $user = User::factory()->create([
            'username' => 'awa-diop',
            'phone' => self::NUMERO,
            'phone_verified_at' => $verifie ? now() : null,
            'phone_whatsapp' => $whatsApp,
        ]);
        $agence = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);
        Property::factory()->published()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);

        return $user;
    }

    /** AC1 — numéro vérifié et déclaré WhatsApp : la fiche le dit, avec le numéro. */
    public function test_ac1_un_agent_au_numero_verifie_et_declare_whatsapp(): void
    {
        $this->agent(verifie: true, whatsApp: true);

        $this->getJson('/api/public/agents/awa-diop')->assertOk()
            ->assertJsonPath('data.phone', self::NUMERO)
            ->assertJsonPath('data.phone_whatsapp', true);
    }

    /** AC2 — vérifié mais non déclaré : `false`, le front n'offre pas WhatsApp. */
    public function test_ac2_un_numero_verifie_non_declare_whatsapp(): void
    {
        $this->agent(verifie: true, whatsApp: false);

        $this->getJson('/api/public/agents/awa-diop')->assertOk()
            ->assertJsonPath('data.phone', self::NUMERO)
            ->assertJsonPath('data.phone_whatsapp', false);
    }

    /** AC2 — non vérifié (même déclaré WhatsApp) : ni numéro, ni AUCUNE clé WhatsApp. */
    public function test_ac2_un_numero_non_verifie_ne_sert_aucun_champ_whatsapp(): void
    {
        $this->agent(verifie: false, whatsApp: true);

        $reponse = $this->getJson('/api/public/agents/awa-diop')->assertOk()
            ->assertJsonPath('data.phone', null);

        $this->assertArrayNotHasKey('phone_whatsapp', $reponse->json('data'));
        $this->assertStringNotContainsStringIgnoringCase('whatsapp', (string) $reponse->getContent());
    }

    /** Une seule règle : la fiche d'un bien et la fiche de l'agent disent la même chose. */
    public function test_la_regle_est_celle_de_la_fiche_d_un_bien(): void
    {
        $user = User::factory()->make(['phone' => self::NUMERO, 'phone_verified_at' => null, 'phone_whatsapp' => true]);
        $this->assertFalse($user->principalPublicSurWhatsApp());
        $user->phone_verified_at = now();
        $this->assertTrue($user->principalPublicSurWhatsApp());
        $user->phone_whatsapp = false;
        $this->assertFalse($user->principalPublicSurWhatsApp());
    }

    private function agence(array $attributs = []): Agency
    {
        $admin = User::factory()->create([
            'phone' => self::ADMIN,
            'phone_verified_at' => now(),
            'phone_whatsapp' => true,
        ]);
        $agence = Agency::factory()->create(array_merge([
            'slug' => 'dakar-immo',
            'status' => AgencyStatus::Active,
            'kind' => AgencyKind::Standard,
            'phone' => '+221338201234',
            'primary_admin_id' => $admin->id,
        ], $attributs));
        Property::factory()->published()->create(['agency_id' => $agence->id]);

        return $agence;
    }

    /** AC3 — un numéro WhatsApp déclaré par l'agence : servi tel quel. */
    public function test_ac3_l_agence_sert_son_numero_whatsapp_declare(): void
    {
        $this->agence(['phone_whatsapp' => self::NUMERO]);

        $this->getJson('/api/public/agencies/dakar-immo')->assertOk()
            ->assertJsonPath('data.phone', '+221338201234')
            ->assertJsonPath('data.phone_whatsapp', self::NUMERO);
    }

    /**
     * AC3 — rien de déclaré : aucune clé WhatsApp, même si l'agence a un téléphone et que son
     * administrateur a, lui, un numéro vérifié déclaré WhatsApp. Ni `phone`, ni l'admin n'y suppléent.
     */
    public function test_ac3_sans_numero_declare_ni_le_telephone_ni_l_admin_ne_sont_servis_comme_whatsapp(): void
    {
        $this->agence(['phone_whatsapp' => null]);

        $reponse = $this->getJson('/api/public/agencies/dakar-immo')->assertOk()
            ->assertJsonPath('data.phone', '+221338201234');

        $this->assertArrayNotHasKey('phone_whatsapp', $reponse->json('data'));
        $this->assertStringNotContainsString('781112233', (string) $reponse->getContent());
    }

    /** La saisie : normalisée en E.164 comme tout téléphone, relue par l'écran, effaçable. */
    public function test_l_admin_saisit_le_numero_whatsapp_de_l_agence(): void
    {
        $agence = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        $this->patchJson("/api/agencies/{$agence->id}", ['phone_whatsapp' => '77 123 09 87'])
            ->assertOk()
            ->assertJsonPath('data.phone_whatsapp', self::NUMERO);
        $this->assertSame(self::NUMERO, $agence->refresh()->phone_whatsapp);

        // L'écran relit la colonne par ses champs clairsemés (`AGENCY_ADMIN_FIELDS` du front).
        $this->getJson("/api/agencies/{$agence->id}?fields[agencies]=id,phone,phone_whatsapp")
            ->assertOk()
            ->assertJsonPath('data.phone_whatsapp', self::NUMERO);

        $this->patchJson("/api/agencies/{$agence->id}", ['phone_whatsapp' => null])->assertOk();
        $this->assertNull($agence->refresh()->phone_whatsapp);
    }

    public function test_un_numero_whatsapp_injoignable_rend_422(): void
    {
        $agence = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        $this->patchJson("/api/agencies/{$agence->id}", ['phone_whatsapp' => '+77 123 45 67'])
            ->assertUnprocessable()->assertJsonValidationErrors('phone_whatsapp');
        $this->patchJson("/api/agencies/{$agence->id}", ['phone_whatsapp' => 'pas un numéro'])
            ->assertUnprocessable()->assertJsonValidationErrors('phone_whatsapp');
        $this->assertNull($agence->refresh()->phone_whatsapp);
    }
}
