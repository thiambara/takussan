<?php

namespace Tests\Feature\Invitation;

use App\Http\Resources\InvitationResource;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * P181.05 (TCK-2221) — `metadata` d'une invitation porte des clés internes que l'API relit
 * (`level`, `from_maintenance_request_id`, `deep_link_consumed_at`, `locale`) et qu'aucun écran ne
 * lit. `InvitationResource` le rendait entier, à l'émetteur comme à l'invité qui accepte par le
 * jeton : décision du porteur, il n'est plus rendu.
 */
class MetadataDInvitationNonRenduTest extends TestCase
{
    use RefreshDatabase;

    private const METADATA = [
        'locale' => 'fr',
        'level' => 'viewer',
        'from_maintenance_request_id' => 999999,
        'deep_link_consumed_at' => '2026-10-24T10:00:00+00:00',
    ];

    public function test_la_ressource_ne_rend_pas_metadata(): void
    {
        $invitation = Invitation::factory()->create(['metadata' => self::METADATA]);

        $rendu = InvitationResource::make($invitation)->resolve(Request::create('/'));

        $this->assertArrayNotHasKey('metadata', $rendu);
        // Le reste de l'enveloppe est intact : la ressource n'a pas été vidée.
        $this->assertSame($invitation->id, $rendu['id']);
        $this->assertSame($invitation->email, $rendu['email']);
    }

    public function test_la_fiche_et_la_liste_de_l_emetteur_ne_rendent_pas_metadata(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $invitation = Invitation::factory()->create([
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
            'metadata' => self::METADATA,
        ]);

        $fiche = $this->getJson("/api/invitations/{$invitation->id}")->assertOk();
        $this->assertSame($invitation->id, $fiche->json('data.id'));
        $this->assertArrayNotHasKey('metadata', $fiche->json('data'));

        $liste = $this->getJson('/api/invitations')->assertOk();
        $ligne = collect($liste->json('data'))->firstWhere('id', $invitation->id);
        $this->assertNotNull($ligne, 'L’invitation de l’émetteur n’est pas dans sa liste.');
        $this->assertArrayNotHasKey('metadata', $ligne);
    }
}
