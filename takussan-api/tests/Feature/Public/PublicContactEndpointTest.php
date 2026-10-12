<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\PrimaryPropertyContact;
use App\Services\Property\PropertyContactNumbers;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** TCK-633 (lot C, AC8 / AC12) — `GET /public/properties/{slug}/contact` rend la LISTE des numéros. */
class PublicContactEndpointTest extends TestCase
{
    use RefreshDatabase;

    private function bienDe(User $owner): Property
    {
        return Property::factory()->create(['user_id' => $owner->id, 'agency_id' => null]);
    }

    public function test_principal_second_puis_sur_place(): void
    {
        $owner = User::factory()->create(['phone' => '+221770000801', 'phone_verified_at' => now(), 'phone_whatsapp' => true]);
        $owner->forceFill(['secondary_phone' => '+221770000802', 'secondary_phone_verified_at' => now()])->save();
        $bien = $this->bienDe($owner);
        $bien->contacts()->create(['label' => 'Voisine', 'phone' => '+221770000804', 'has_whatsapp' => false, 'position' => 1]);
        $bien->contacts()->create(['label' => 'Gardien', 'phone' => '+221770000803', 'has_whatsapp' => true, 'position' => 0]);

        $this->getJson("/api/public/properties/{$bien->slug}/contact")->assertOk()->assertExactJson(['data' => [
            ['phone' => '+221770000801', 'whatsapp' => true, 'label' => null, 'kind' => 'primary'],
            ['phone' => '+221770000802', 'whatsapp' => false, 'label' => null, 'kind' => 'secondary'],
            ['phone' => '+221770000803', 'whatsapp' => true, 'label' => 'Gardien', 'kind' => 'on_site'],
            ['phone' => '+221770000804', 'whatsapp' => false, 'label' => 'Voisine', 'kind' => 'on_site'],
        ]]);
    }

    public function test_un_second_numero_non_verifie_ne_sort_pas(): void
    {
        $owner = User::factory()->create(['phone' => '+221770000811', 'phone_verified_at' => now()]);
        $owner->forceFill(['secondary_phone' => '+221770000812', 'secondary_phone_verified_at' => null])->save();

        $this->getJson("/api/public/properties/{$this->bienDe($owner)->slug}/contact")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.kind', 'primary');
    }

    /**
     * Correction du lot C, tour 2 (décision de la session sur D10) — un numéro principal NON
     * vérifié n'est jamais servi au public : ni par `…/contact`, ni comme WhatsApp, ni comme
     * « Appeler » sur la fiche. Le bien reste en ligne ; ses contacts sur place restent servis.
     */
    public function test_un_principal_non_verifie_ne_sort_pas(): void
    {
        $owner = User::factory()->create(['phone' => '+221770000841', 'phone_verified_at' => null, 'phone_whatsapp' => true]);
        $bien = $this->bienDe($owner);

        $this->getJson("/api/public/properties/{$bien->slug}/contact")->assertOk()->assertExactJson(['data' => []]);
        $fiche = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk()
            ->assertJsonPath('data.primary_contact.has_phone', false)
            ->assertJsonPath('data.primary_contact.has_whatsapp', false);
        $this->assertStringNotContainsString('770000841', (string) $fiche->getContent());

        $bien->contacts()->create(['label' => 'Gardien', 'phone' => '+221770000842', 'has_whatsapp' => false, 'position' => 0]);
        $this->getJson("/api/public/properties/{$bien->slug}/contact")->assertOk()->assertExactJson(['data' => [
            ['phone' => '+221770000842', 'whatsapp' => false, 'label' => 'Gardien', 'kind' => 'on_site'],
        ]]);
        // Un contact sur place suffit à proposer « Appeler ».
        $this->getJson("/api/public/properties/{$bien->slug}")->assertOk()
            ->assertJsonPath('data.primary_contact.has_phone', true);
    }

    /** Le contact change de numéro : le nouveau, non vérifié, ne sort pas tant qu'il ne l'est pas. */
    public function test_un_numero_change_ne_sort_qu_une_fois_verifie(): void
    {
        $owner = User::factory()->create(['phone' => '+221770000851', 'phone_verified_at' => now()]);
        $bien = $this->bienDe($owner);
        $this->getJson("/api/public/properties/{$bien->slug}/contact")->assertOk()
            ->assertJsonPath('data.0.phone', '+221770000851');

        $owner->forceFill(['phone' => '+221770000852', 'phone_verified_at' => null])->save();
        $this->getJson("/api/public/properties/{$bien->slug}/contact")->assertOk()->assertExactJson(['data' => []]);

        $owner->forceFill(['phone_verified_at' => now()])->save();
        $this->getJson("/api/public/properties/{$bien->slug}/contact")->assertOk()->assertExactJson(['data' => [
            ['phone' => '+221770000852', 'whatsapp' => false, 'label' => null, 'kind' => 'primary'],
        ]]);
    }

    /**
     * Un bien d'agence EN LIGNE confié à un agent sans numéro vérifié : l'affectation reste
     * permise et le bien reste en ligne, mais le numéro de l'agent n'est pas servi.
     */
    public function test_un_agent_assigne_sans_numero_verifie_n_est_pas_servi(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['phone' => '+221770000861', 'phone_verified_at' => now()]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        $agent = User::factory()->create(['phone' => '+221770000862', 'phone_verified_at' => null, 'phone_whatsapp' => true]);
        $this->materializeRoleProfile($agent, 'agent', $agency);
        $bien = Property::factory()->published()->create(['user_id' => $admin->id, 'agency_id' => $agency->id, 'visibility' => 'public']);
        $this->assertTrue(Property::query()->public()->whereKey($bien->id)->exists());

        Sanctum::actingAs($admin);
        $this->putJson("/api/properties/{$bien->id}/assigned-agent", ['user_id' => $agent->id])
            ->assertOk()->assertJsonPath('data.primary_contact.id', $agent->id);
        $this->assertTrue(Property::query()->public()->whereKey($bien->id)->exists());

        $contact = $this->getJson("/api/public/properties/{$bien->slug}/contact")->assertOk()->assertExactJson(['data' => []]);
        $this->assertStringNotContainsString('770000862', (string) $contact->getContent());
        $this->getJson("/api/public/properties/{$bien->slug}")->assertOk()
            ->assertJsonPath('data.primary_contact.has_whatsapp', false);

        $agent->forceFill(['phone_verified_at' => now()])->save();
        $this->getJson("/api/public/properties/{$bien->slug}/contact")->assertOk()
            ->assertJsonPath('data.0.phone', '+221770000862')->assertJsonPath('data.0.whatsapp', true);
    }

    public function test_sans_numero_la_liste_est_vide(): void
    {
        $owner = User::factory()->create(['phone' => null]);

        $this->getJson("/api/public/properties/{$this->bienDe($owner)->slug}/contact")
            ->assertOk()->assertExactJson(['data' => []]);
    }

    /** WhatsApp : le bouton public s'affiche s'il existe au moins un numéro déclaré WhatsApp. */
    public function test_has_whatsapp(): void
    {
        $owner = User::factory()->create(['phone' => '+221770000821', 'phone_verified_at' => now()]);
        $bien = $this->bienDe($owner)->load(['contacts', ...PrimaryPropertyContact::eagerLoads()]);
        $this->assertFalse(PropertyContactNumbers::hasWhatsApp($bien, $owner));

        $bien->contacts()->create(['phone' => '+221770000822', 'has_whatsapp' => true, 'position' => 0]);
        $this->assertTrue(PropertyContactNumbers::hasWhatsApp($bien->load('contacts'), $owner));

        $owner->forceFill(['phone_whatsapp' => true])->save();
        $this->assertTrue(PropertyContactNumbers::hasWhatsApp($bien->setRelation('contacts', collect()), $owner->fresh()));

        // Un second numéro déclaré WhatsApp mais NON vérifié ne compte pas.
        $owner->forceFill(['phone_whatsapp' => false, 'secondary_phone' => '+221770000823', 'secondary_phone_whatsapp' => true])->save();
        $this->assertFalse(PropertyContactNumbers::hasWhatsApp($bien->setRelation('contacts', collect()), $owner->fresh()));
    }

    public function test_la_fiche_dit_has_whatsapp_sans_reveler_le_numero(): void
    {
        $owner = User::factory()->create(['phone' => '+221770000831', 'phone_verified_at' => now(), 'phone_whatsapp' => true]);
        $bien = $this->bienDe($owner);

        $fiche = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk()
            ->assertJsonPath('data.primary_contact.has_whatsapp', true);
        $this->assertStringNotContainsString('770000831', (string) $fiche->getContent());

        $owner->forceFill(['phone_whatsapp' => false])->save();
        $this->getJson("/api/public/properties/{$bien->slug}")->assertOk()
            ->assertJsonPath('data.primary_contact.has_whatsapp', false);

        // Un contact SUR PLACE déclaré WhatsApp suffit — et son numéro ne sort pas non plus.
        $bien->contacts()->create(['label' => 'Gardien', 'phone' => '+221770000832', 'has_whatsapp' => true, 'position' => 0]);
        $fiche = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk()
            ->assertJsonPath('data.primary_contact.has_whatsapp', true);
        $this->assertStringNotContainsString('770000832', (string) $fiche->getContent());
    }
}
