<?php

namespace Tests\Feature\Agency;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-2669 (ADR-0104 § 5) — une demande de passage refusée se reprend : `resubmit_of` désigne la
 * DERNIÈRE demande refusée de l'agence ; les champs absents, dont le NINEA et le RIB masqués à la
 * lecture, sont repris côté serveur ; les statuts sont toujours fournis à nouveau.
 */
class UpgradeRequestResubmitTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private AgencyUpgradeRequest $rejected;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
        Notification::fake();
        $this->agency = Agency::factory()->individual()->create();
        $this->admin = $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->rejected = AgencyUpgradeRequest::factory()->rejected()->create([
            'agency_id' => $this->agency->id,
            'submitted_by' => $this->admin->id,
            'rc' => 'SN-DKR-2017-B-8841',
            'ninea' => '005512345',
            'rib_pro' => 'SN012 01001 012345678901 23',
            'company_legal_name' => 'Keur Immo SARL',
            'address_fiscale' => 'Rue 10, Dakar',
            'planned_agents_count' => 4,
            'submitted_at' => now()->subDays(3),
        ]);
    }

    /** @param  array<string, mixed>  $data */
    private function submit(array $data, bool $withStatuts = true): TestResponse
    {
        return $this->post("/api/agencies/{$this->agency->id}/upgrade-requests", $data + ($withStatuts ? [
            'statuts_doc' => UploadedFile::fake()->create('statuts.pdf', 200, 'application/pdf'),
        ] : []), ['Accept' => 'application/json']);
    }

    private function latest(): AgencyUpgradeRequest
    {
        return AgencyUpgradeRequest::query()->where('agency_id', $this->agency->id)->latest('id')->firstOrFail();
    }

    public function test_ac4_sans_ninea_ni_rib_les_valeurs_de_la_demande_refusee_sont_reprises(): void
    {
        $response = $this->submit(['resubmit_of' => $this->rejected->id])->assertCreated()
            ->assertJsonPath('data.resubmit_of_id', $this->rejected->id)
            ->assertJsonPath('data.status', 'pending');

        $new = $this->latest();
        $this->assertNotSame($this->rejected->id, $new->id);
        $this->assertSame('005512345', $new->ninea);
        $this->assertSame('SN012 01001 012345678901 23', $new->rib_pro);
        $this->assertSame('SN-DKR-2017-B-8841', $new->rc);
        $this->assertSame('Keur Immo SARL', $new->company_legal_name);
        $this->assertSame('Rue 10, Dakar', $new->address_fiscale);
        $this->assertSame(4, $new->planned_agents_count);
        $this->assertSame($this->rejected->id, $new->resubmit_of_id);
        // Toujours masqués à la lecture.
        $this->assertStringNotContainsString('005512345', (string) $response->json('data.ninea'));
        $this->assertStringNotContainsString('012345678901', (string) $response->json('data.rib_pro'));
    }

    public function test_un_champ_fourni_l_emporte_sur_la_demande_refusee(): void
    {
        $this->submit(['resubmit_of' => $this->rejected->id, 'rib_pro' => 'SN099 99999 999999999999 99', 'address_fiscale' => 'Mermoz'])->assertCreated();

        $new = $this->latest();
        $this->assertSame('SN099 99999 999999999999 99', $new->rib_pro);
        $this->assertSame('Mermoz', $new->address_fiscale);
        $this->assertSame('005512345', $new->ninea);
    }

    public function test_les_statuts_sont_toujours_exiges(): void
    {
        $this->submit(['resubmit_of' => $this->rejected->id], withStatuts: false)
            ->assertStatus(422)->assertJsonValidationErrors('statuts_doc');
    }

    public function test_ac4_la_demande_d_une_autre_agence_est_refusee(): void
    {
        $other = AgencyUpgradeRequest::factory()->rejected()->create();

        $this->submit(['resubmit_of' => $other->id])->assertStatus(422)->assertJsonValidationErrors('resubmit_of');
        $this->assertSame(1, AgencyUpgradeRequest::query()->where('agency_id', $this->agency->id)->count());
    }

    public function test_seule_la_derniere_demande_refusee_se_reprend(): void
    {
        $newer = AgencyUpgradeRequest::factory()->rejected()->create([
            'agency_id' => $this->agency->id, 'submitted_by' => $this->admin->id, 'submitted_at' => now()->subDay(),
        ]);

        $this->submit(['resubmit_of' => $this->rejected->id])->assertStatus(422)->assertJsonValidationErrors('resubmit_of');
        $this->submit(['resubmit_of' => $newer->id])->assertCreated();
    }

    public function test_une_demande_qui_n_est_pas_refusee_ne_se_reprend_pas(): void
    {
        $revoked = AgencyUpgradeRequest::factory()->create([
            'agency_id' => $this->agency->id, 'submitted_by' => $this->admin->id,
            'status' => 'revoked', 'submitted_at' => now(),
        ]);

        $this->submit(['resubmit_of' => $revoked->id])->assertStatus(422)->assertJsonValidationErrors('resubmit_of');
        $this->submit(['resubmit_of' => 'abc'])->assertStatus(422)->assertJsonValidationErrors('resubmit_of');
    }

    public function test_sans_reprise_les_champs_restent_exiges(): void
    {
        $this->submit([])->assertStatus(422)->assertJsonValidationErrors(['rc', 'ninea', 'rib_pro', 'company_legal_name', 'address_fiscale']);
    }

    public function test_une_demande_ordinaire_n_a_pas_de_reprise(): void
    {
        $data = $this->submit([
            'rc' => 'RC-1', 'ninea' => '1', 'rib_pro' => 'SN1', 'company_legal_name' => 'A', 'address_fiscale' => 'B',
        ])->assertCreated()->json('data');

        // La clé est rendue, nulle — pas absente (`assertJsonPath(…, null)` accepterait les deux).
        $this->assertArrayHasKey('resubmit_of_id', $data);
        $this->assertNull($data['resubmit_of_id']);
    }

    public function test_la_reprise_est_journalisee_sans_numero(): void
    {
        $this->submit(['resubmit_of' => $this->rejected->id])->assertCreated();

        $log = Activity::query()->where('event', 'agency_upgrade_requested')->sole();
        $this->assertSame($this->rejected->id, $log->properties['resubmit_of_id']);
        $this->assertStringNotContainsString('005512345', json_encode($log->properties->all()));
    }
}
