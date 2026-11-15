<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2592 (décision 1b, AC4) — `filter[exited_within_days]=N` : la tuile « Conversion » ouvre les
 * fiches qu'elle compte, les sorties datées par le journal (`PipelineStatsService::sortiesRecentes`),
 * jamais par `updated_at`. Une valeur hors contrat rend 422 : elle ne rend jamais toute la liste.
 */
class CustomerExitedWithinDaysFilterTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
    }

    private function fiche(CustomerPipelineStage $stage, ?User $auteur = null): Customer
    {
        return Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => ($auteur ?? $this->agent)->id,
            'status' => CustomerStatus::Active,
            'pipeline_stage' => $stage,
        ]);
    }

    /** @return list<int> */
    private function ids(string $valeur, ?User $lecteur = null): array
    {
        Sanctum::actingAs($lecteur ?? $this->agent);

        return collect($this->getJson('/api/customers?fields[customers]=id&per_page=100&filter[exited_within_days]='.$valeur)
            ->assertOk()->json('data'))->pluck('id')->sort()->values()->all();
    }

    /** Une sortie il y a `$jours` jours, la fiche créée la veille. */
    private function sortie(CustomerPipelineStage $vers, int $jours, CustomerPipelineStage $depuis = CustomerPipelineStage::Negotiating, ?User $auteur = null): Customer
    {
        $this->travelTo(now()->subDays($jours + 1));
        $fiche = $this->fiche($depuis, $auteur);
        $this->travel(1)->days();
        $fiche->update(['pipeline_stage' => $vers]);
        $this->travelBack();

        return $fiche;
    }

    public function test_les_sorties_de_la_periode_et_elles_seules_celles_que_la_tuile_compte(): void
    {
        $gagnee = $this->sortie(CustomerPipelineStage::Converted, 10);
        $perdue = $this->sortie(CustomerPipelineStage::Lost, 3);
        $ancienne = $this->sortie(CustomerPipelineStage::Converted, 45);
        // Gagnée il y a 60 jours, retouchée aujourd'hui : `updated_at` récent, sortie ancienne.
        $retouchee = $this->sortie(CustomerPipelineStage::Converted, 60);
        $retouchee->update(['phone' => '+221779998877']);
        $vivante = $this->fiche(CustomerPipelineStage::Qualified);
        // Créée gagnée il y a 40 jours : sa création est son passage (le journal la date), hors des 30 jours.
        $this->travelTo(now()->subDays(40));
        $neeGagnee = $this->fiche(CustomerPipelineStage::Converted);
        $this->travelBack();

        $this->assertSame([$gagnee->id, $perdue->id], $this->ids('30'));
        $this->assertSame([$perdue->id], $this->ids('5'));
        $this->assertSame(collect([$gagnee->id, $perdue->id, $ancienne->id, $retouchee->id, $neeGagnee->id])->sort()->values()->all(), $this->ids('90'));
        $this->assertNotContains($vivante->id, $this->ids('90'));

        // La tuile compte les mêmes sorties.
        Sanctum::actingAs($this->agent);
        $stats = $this->getJson('/api/customers/pipeline-stats')->assertOk()->json('data');
        $this->assertSame(['converted' => 1, 'lost' => 1], $stats['exits_last_30d']);
    }

    public function test_une_fiche_sortie_deux_fois_paraît_une_fois_et_une_fiche_rouverte_reste_une_sortie(): void
    {
        $deuxFois = $this->sortie(CustomerPipelineStage::Lost, 12);
        $this->travelTo(now()->subDays(8));
        $deuxFois->update(['pipeline_stage' => CustomerPipelineStage::Negotiating]);
        $this->travel(1)->days();
        $deuxFois->update(['pipeline_stage' => CustomerPipelineStage::Converted]);
        $this->travelBack();

        $rouverte = $this->sortie(CustomerPipelineStage::Lost, 6);
        $this->travelTo(now()->subDays(2));
        $rouverte->update(['pipeline_stage' => CustomerPipelineStage::Prospect]);
        $this->travelBack();

        // Une ligne par fiche ; la fiche rouverte compte comme la tuile la compte (un passage daté).
        $this->assertSame([$deuxFois->id, $rouverte->id], $this->ids('30'));
        Sanctum::actingAs($this->agent);
        $stats = $this->getJson('/api/customers/pipeline-stats')->assertOk()->json('data');
        $this->assertSame(['converted' => 1, 'lost' => 2], $stats['exits_last_30d']);
    }

    public function test_hors_personnel_le_filtre_ne_rend_rien(): void
    {
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id]);
        $sienne = $this->sortie(CustomerPipelineStage::Converted, 4, CustomerPipelineStage::Negotiating, $bailleur->fresh());

        Sanctum::actingAs($bailleur->fresh());
        $toutes = collect($this->getJson('/api/customers?fields[customers]=id&per_page=100')->assertOk()->json('data'))->pluck('id');
        $this->assertContains($sienne->id, $toutes, 'le bailleur auteur lit sa fiche');
        $this->assertSame([], $this->ids('30', $bailleur->fresh()));
    }

    /** @return array<string, array{0: string}> */
    public static function valeursHorsContrat(): array
    {
        return [
            'vide' => [''],
            'espaces' => ['%20%20'],
            'zéro' => ['0'],
            'au-delà de 90' => ['91'],
            'négatif' => ['-5'],
            'texte' => ['abc'],
            'décimal' => ['7.5'],
            'liste' => ['1,2'],
        ];
    }

    #[DataProvider('valeursHorsContrat')]
    public function test_une_valeur_hors_contrat_rend_422_jamais_toute_la_liste(string $valeur): void
    {
        $this->sortie(CustomerPipelineStage::Converted, 4);
        $this->fiche(CustomerPipelineStage::Qualified);

        Sanctum::actingAs($this->agent);
        $this->getJson('/api/customers?fields[customers]=id&filter[exited_within_days]='.$valeur)
            ->assertStatus(422);
    }
}
