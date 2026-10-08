<?php

namespace Tests\Feature\Public;

use App\Models\Enums\ContactLeadChannel;
use App\Models\PropertyContactLead;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-590 AC20 — un clic WhatsApp / Appeler laisse **une** trace, attribuée à sa source, qui
 * n'entre pas dans la file des demandes à traiter. Et AC19 : la fiche dit si un numéro existe.
 */
class PropertyContactClickTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    public function test_un_clic_whatsapp_cree_une_trace_hors_de_la_file(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $bien = $this->bienDe($x);
        $this->collaborateur($bien, $agent);

        $this->postJson("/api/public/properties/{$bien->slug}/contact-click", [
            'channel' => 'whatsapp', 'source' => 'facebook', 'medium' => 'share',
        ])->assertNoContent();

        $clic = PropertyContactLead::query()->sole();
        $this->assertSame(ContactLeadChannel::Whatsapp, $clic->channel);
        $this->assertSame('facebook', $clic->source);
        $this->assertSame('share', $clic->medium);
        $this->assertSame($x->id, $clic->agency_id);
        $this->assertSame($agent->id, $clic->recipient_user_id);
        $this->assertNull($clic->message);

        Sanctum::actingAs($agent);
        $this->getJson('/api/contact-leads?filter[handled]=0')->assertOk()->assertJsonPath('meta.total', 0);
    }

    public function test_un_canal_inconnu_est_refuse(): void
    {
        $bien = $this->bienDe($this->agence());

        $this->postJson("/api/public/properties/{$bien->slug}/contact-click", ['channel' => 'form'])
            ->assertUnprocessable()->assertJsonValidationErrors(['channel']);
        $this->postJson("/api/public/properties/{$bien->slug}/contact-click", ['channel' => 'call', 'source' => '<script>'])
            ->assertUnprocessable()->assertJsonValidationErrors(['source']);

        $this->assertDatabaseCount('property_contact_leads', 0);
    }

    /** AC19 — `has_phone` : la fiche dit si le contact principal a un numéro, sans le livrer. */
    public function test_la_fiche_dit_si_le_contact_a_un_numero(): void
    {
        $x = $this->agence();
        $avec = $this->bienDe($x, $this->bailleur($x, ['phone' => '+221770000009']));
        $sans = $this->bienDe($x, $this->bailleur($x, ['phone' => null]));

        $this->getJson("/api/public/properties/{$avec->slug}")
            ->assertOk()->assertJsonPath('data.primary_contact.has_phone', true);
        $this->getJson("/api/public/properties/{$sans->slug}")
            ->assertOk()->assertJsonPath('data.primary_contact.has_phone', false);
    }
}
