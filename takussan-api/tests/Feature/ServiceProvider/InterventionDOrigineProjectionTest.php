<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2943 (ADR-0122) — ce que le prestataire invité lit de l'intervention jointe AVANT de l'accepter, en plus de la
 * projection de TCK-2613 : `respond_by` (réglage d'agence, depuis l'invitation), `reported_at`, `reference`,
 * `reported_by_role`, `tenant_quote` (masqué) et `detail_url`. Jamais le nom, le téléphone, le courriel ni l'adresse
 * exacte du locataire.
 */
class InterventionDOrigineProjectionTest extends TestCase
{
    use RefreshDatabase;

    private const RUE = '12 rue Carnot, immeuble Fatou';

    private const TELEPHONE = '+221771234567';

    private const COURRIEL = 'aminata.diop@example.com';

    /** AC1 */
    public function test_la_demande_du_locataire_rend_echeance_date_reference_role_citation_et_lien(): void
    {
        $this->travelTo(Carbon::parse('2026-11-12 10:00:00', 'UTC'));
        [$sp, $prestataire, $mr] = $this->invite(description: "fuite sous l'évier, appelez-moi au 77 123 45 67", id: 42);
        $this->travelTo(Carbon::parse('2026-11-14 08:00:00', 'UTC'));

        Sanctum::actingAs($prestataire);
        $reponse = $this->getJson($this->url($sp))->assertOk();

        $reponse->assertJsonPath('data.id', 42)
            ->assertJsonPath('data.reference', 'INT-0042')
            ->assertJsonPath('data.reported_by_role', 'tenant')
            ->assertJsonPath('data.tenant_quote', "fuite sous l'évier, appelez-moi au [TELEPHONE]")
            ->assertJsonPath('data.detail_url', '/app/maintenance/42');
        $this->assertSame('2026-11-12T10:00:00+00:00', $reponse->json('data.reported_at'));
        // Défaut du réglage d'agence : 48 h depuis l'invitation (posée le 2026-11-13 à 09:00).
        $this->assertSame('2026-11-15T09:00:00+00:00', $reponse->json('data.respond_by'));
        $this->assertStringNotContainsString('77 123 45 67', $reponse->getContent());
    }

    /** AC2 — ni le nom, ni le téléphone, ni le courriel, ni l'adresse exacte du locataire : clés et valeurs. */
    public function test_aucune_donnee_personnelle_du_locataire_ne_sort(): void
    {
        [$sp, $prestataire] = $this->invite(
            description: 'Bonjour, ici Aminata DIOP au '.self::RUE.'. Le siphon fuit. Tel +221 77 123 45 67 ou '.self::COURRIEL,
            titre: 'Fuite chez Diop — rappeler au 77 123 45 67 ou '.self::COURRIEL,
        );

        Sanctum::actingAs($prestataire);
        $reponse = $this->getJson($this->url($sp))->assertOk();
        $corps = $reponse->getContent();

        foreach (['Aminata', 'aminata', 'Diop', 'DIOP', 'Carnot', self::TELEPHONE, '77 123 45 67', '771234567', self::COURRIEL] as $valeur) {
            $this->assertStringNotContainsString($valeur, $corps, "« {$valeur} » ne doit pas sortir");
        }
        foreach (['requester', 'requester_id', 'name', 'first_name', 'last_name', 'phone', 'email', 'street', 'address', 'latitude', 'access_instructions', 'voice_note'] as $cle) {
            $this->assertArrayNotHasKey($cle, $reponse->json('data'));
        }
        $this->assertSame('Bonjour, ici [NOM] [NOM] au [ADRESSE]. Le siphon fuit. Tel [TELEPHONE] ou [EMAIL]', $reponse->json('data.tenant_quote'));
        // Le titre, du même auteur, est masqué de même.
        $this->assertSame('Fuite chez [NOM] — rappeler au [TELEPHONE] ou [EMAIL]', $reponse->json('data.title'));
    }

    public function test_un_nom_compose_et_le_nom_de_la_fiche_client_sont_masques_mot_a_mot(): void
    {
        [$sp, $prestataire, $mr] = $this->invite(description: 'Diarra ici, voisine de Ndeye Sall. Mame est absente le matin.');
        User::query()->whereKey($mr->requester_id)->update(['first_name' => 'Mame Diarra']);
        // L'agence a saisi la fiche client autrement que le compte.
        $mr->lease->tenant->forceFill(['first_name' => 'Ndèye', 'last_name' => 'Ndiaye-Sall'])->save();

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp))->assertOk()
            ->assertJsonPath('data.tenant_quote', '[NOM] ici, voisine de Ndeye [NOM]. [NOM] est absente le matin.');
    }

    public function test_un_signalement_du_personnel_ne_rend_aucune_citation(): void
    {
        [$sp, $prestataire, $mr, $agence] = $this->invite();
        $mr->forceFill(['requester_id' => User::factory()->create()->id, 'lease_id' => null])->save();

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp))->assertOk()
            ->assertJsonPath('data.reported_by_role', 'agency')
            ->assertJsonPath('data.tenant_quote', null);
    }

    public function test_un_signalement_du_bailleur_porte_son_role_sans_citation(): void
    {
        [$sp, $prestataire, $mr] = $this->invite();
        $mr->forceFill(['requester_id' => $mr->property->user_id, 'lease_id' => null])->save();

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp))->assertOk()
            ->assertJsonPath('data.reported_by_role', 'landlord')
            ->assertJsonPath('data.tenant_quote', null);
    }

    public function test_le_locataire_d_un_bail_en_cours_du_bien_est_reconnu_sans_bail_rattache(): void
    {
        [$sp, $prestataire, $mr] = $this->invite();
        $mr->forceFill(['lease_id' => null])->save();

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp))->assertOk()->assertJsonPath('data.reported_by_role', 'tenant');

        // Un bail fini n'en fait plus le locataire du bien.
        Lease::query()->where('property_id', $mr->property_id)->update(['status' => LeaseStatus::Terminated]);
        $this->getJson($this->url($sp))->assertOk()
            ->assertJsonPath('data.reported_by_role', 'agency')
            ->assertJsonPath('data.tenant_quote', null);
    }

    public function test_le_delai_de_reponse_suit_le_reglage_de_l_agence(): void
    {
        $this->travelTo(Carbon::parse('2026-11-12 10:00:00', 'UTC'));
        [$sp, $prestataire, , $agence] = $this->invite();
        Sanctum::actingAs($prestataire);

        $agence->forceFill(['settings' => ['maintenance_provider_response_hours' => 24]])->save();
        $this->assertSame('2026-11-14T09:00:00+00:00', $this->getJson($this->url($sp))->json('data.respond_by'));

        // 0 : l'agence n'annonce aucun délai.
        $agence->forceFill(['settings' => ['maintenance_provider_response_hours' => 0]])->save();
        $this->getJson($this->url($sp))->assertOk()->assertJsonPath('data.respond_by', null);
    }

    public function test_le_reglage_s_ecrit_par_la_route_des_reglages_d_agence_et_reste_borne(): void
    {
        [, , , $agence] = $this->invite();
        $gerant = User::factory()->create();
        $agence->forceFill(['primary_admin_id' => $gerant->id])->save();
        Sanctum::actingAs($gerant);

        $this->patchJson("/api/agencies/{$agence->id}", ['settings' => ['maintenance_provider_response_hours' => 169]])
            ->assertUnprocessable()->assertJsonValidationErrors('settings.maintenance_provider_response_hours');
        $this->patchJson("/api/agencies/{$agence->id}", ['settings' => ['maintenance_provider_response_hours' => 72]])->assertOk();
        $this->assertSame(72, $agence->fresh()->setting('maintenance_provider_response_hours'));
    }

    public function test_la_citation_est_coupee_a_280_caracteres(): void
    {
        [$sp, $prestataire] = $this->invite(description: str_repeat('Le robinet goutte. ', 40));

        Sanctum::actingAs($prestataire);
        $citation = (string) $this->getJson($this->url($sp))->json('data.tenant_quote');

        $this->assertLessThanOrEqual(281, mb_strlen($citation));
        $this->assertStringEndsWith('…', $citation);
    }

    public function test_une_demande_sans_texte_ne_rend_aucune_citation(): void
    {
        [$sp, $prestataire] = $this->invite(description: '');

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp))->assertOk()->assertJsonPath('data.tenant_quote', null);
    }

    public function test_sparse_fieldsets_couvrent_les_cles_neuves(): void
    {
        [$sp, $prestataire, $mr] = $this->invite();

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp).'?fields[intervention_d_origine]=reference,reported_by_role')
            ->assertOk()
            ->assertExactJson(['data' => ['id' => $mr->id, 'reference' => $mr->reference(), 'reported_by_role' => 'tenant']]);

        $this->getJson($this->url($sp))->assertOk()->assertJsonStructure(['data' => [
            'id', 'title', 'category', 'place', 'photo', 'quote',
            'respond_by', 'reported_at', 'reference', 'reported_by_role', 'tenant_quote', 'detail_url',
        ]]);
    }

    /** AC3 — un autre prestataire : la même porte qu'avant ; et la fiche du lien reste fermée avant l'acceptation. */
    public function test_un_autre_prestataire_est_refuse_et_la_fiche_reste_fermee_avant_acceptation(): void
    {
        [$sp, $prestataire, $mr] = $this->invite();
        [, $autre] = $this->invite('autre@example.com');

        Sanctum::actingAs($autre);
        $this->getJson($this->url($sp))->assertForbidden();

        Sanctum::actingAs($prestataire);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertForbidden();
    }

    private function url(ServiceProviderProfile $sp): string
    {
        return "/api/me/profiles/{$sp->id}/intervention-d-origine";
    }

    /** @return array{ServiceProviderProfile, User, MaintenanceRequest, Agency, Invitation} */
    private function invite(
        string $email = 'plombier@example.com',
        string $description = 'Le siphon est fendu.',
        string $titre = 'Fuite sous évier',
        ?int $id = null,
    ): array {
        $agence = Agency::factory()->create();
        $bailleur = User::factory()->create();
        $bien = Property::factory()->create(['agency_id' => $agence->id, 'user_id' => $bailleur->id]);
        Address::factory()->create([
            'addressable_type' => $bien->getMorphClass(),
            'addressable_id' => $bien->id,
            'street' => self::RUE,
            'neighborhood' => 'Mermoz',
            'city' => 'Dakar',
        ]);
        // Le locataire nommé du dossier n'existe qu'une fois (courriel et téléphone uniques) : le second invité a le sien.
        $locataire = User::factory()->create($email === 'plombier@example.com' ? [
            'first_name' => 'Aminata',
            'last_name' => 'Diop',
            'phone' => self::TELEPHONE,
            'email' => self::COURRIEL,
        ] : []);
        $client = Customer::factory()->create(['user_id' => $locataire->id, 'agency_id' => $agence->id]);
        $bail = Lease::factory()->create([
            'property_id' => $bien->id,
            'tenant_id' => $client->id,
            'landlord_id' => $bailleur->id,
            'agency_id' => $agence->id,
            'status' => LeaseStatus::Active,
        ]);
        $mr = MaintenanceRequest::factory()->create(array_filter([
            'id' => $id,
            'property_id' => $bien->id,
            'lease_id' => $bail->id,
            'requester_id' => $locataire->id,
            'title' => $titre,
            'description' => $description,
            'category' => MaintenanceCategory::Plumbing,
            'status' => MaintenanceStatus::Open,
        ], static fn (mixed $v): bool => $v !== null) + ['assigned_to' => null]);

        $this->travel(23)->hours();
        $prestataire = User::factory()->create(['email' => $email]);
        $sp = ServiceProviderProfile::factory()->create([
            'user_id' => $prestataire->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        $invitation = Invitation::factory()->accepted()->create([
            'email' => $email,
            'invited_user_id' => $prestataire->id,
            'agency_id' => $agence->id,
            'role' => 'service_provider',
            'invitable_type' => $sp->getMorphClass(),
            'invitable_id' => $sp->id,
            'metadata' => ['from_maintenance_request_id' => $mr->id],
        ]);

        return [$sp, $prestataire, $mr, $agence, $invitation];
    }
}
