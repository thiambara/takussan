<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Maintenance\MaintenanceJournal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2772 — le carnet des prestataires se cherche par nom et par téléphone (compte, sinon
 * invitation), sert la liste de ses zones, et le délai de réponse médian de chacun.
 *
 * Chaque lecture se juge contre un prestataire d'une AUTRE agence qui répond au même terme : la
 * recherche, les zones et le délai ne sortent jamais des collaborations de l'agence de l'écran.
 */
class CarnetRechercheZonesDelaiTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_la_recherche_trouve_le_nom_du_compte_et_jamais_un_prestataire_d_une_autre_agence(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $astou = $this->prestataire($agency, ['first_name' => 'Astou', 'last_name' => 'Sy', 'phone' => '+221775384106']);
        $this->prestataire($agency, ['first_name' => 'Moussa', 'last_name' => 'Faye', 'phone' => '+221709152860']);
        // Même nom, autre agence : ne sort jamais.
        $this->prestataire(Agency::factory()->create(), ['first_name' => 'Awa', 'last_name' => 'Sy', 'phone' => '+221775380000']);

        Sanctum::actingAs($admin);

        $this->assertSame([$astou], $this->ids($agency, 'filter[search]=Sy'));
        $this->assertSame([$astou], $this->ids($agency, 'filter[search]=astou'));
        $this->assertSame([$astou], $this->ids($agency, 'filter[search]=77538'));
        // Le numéro tel qu'on le dicte : espaces et indicatif ne gênent pas.
        $this->assertSame([$astou], $this->ids($agency, 'filter[search]='.urlencode('77 538 41')));
    }

    public function test_la_recherche_replie_la_casse_hors_ascii(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $elodie = $this->prestataire($agency, ['first_name' => 'Élodie', 'last_name' => 'Ndiaye']);
        $brouillon = $this->invitation($agency, ['first_name' => 'Éric', 'last_name' => 'Mbaye', 'phone' => '+221774026618']);

        Sanctum::actingAs($admin);

        $this->assertSame([$elodie], $this->ids($agency, 'filter[search]='.urlencode('élodie')));
        $this->assertSame([$brouillon], $this->ids($agency, 'filter[search]='.urlencode('ÉRIC').'&filter[collaboration_status]=active,paused'));
    }

    public function test_une_invitation_sans_compte_se_trouve_par_son_nom_et_son_numero(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $froid = $this->invitation($agency, ['first_name' => 'Froid', 'last_name' => 'Service', 'phone' => '+221774026618']);
        $this->invitation(Agency::factory()->create(), ['first_name' => 'Froid', 'last_name' => 'Plus', 'phone' => '+221774026699']);

        Sanctum::actingAs($admin);

        $statuts = '&filter[collaboration_status]=active,paused';
        $this->assertSame([$froid], $this->ids($agency, 'filter[search]=froid'.$statuts));
        $this->assertSame([$froid], $this->ids($agency, 'filter[search]=service'.$statuts));
        $this->assertSame([$froid], $this->ids($agency, 'filter[search]=7740266'.$statuts));
    }

    public function test_les_zones_du_carnet_sont_celles_de_l_agence_triees_et_ne_suivent_pas_les_filtres(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $astou = $this->prestataire($agency, ['first_name' => 'Astou', 'last_name' => 'Sy'], ['Sacré-Cœur', 'Mermoz']);
        $moussa = $this->prestataire($agency, ['first_name' => 'Moussa', 'last_name' => 'Faye'], ['Almadies', 'Mermoz', 'École']);
        $this->prestataire($agency, ['first_name' => 'Sans', 'last_name' => 'Zone'], null);
        $this->prestataire(Agency::factory()->create(), ['first_name' => 'Awa', 'last_name' => 'Sy'], ['Rufisque']);

        Sanctum::actingAs($admin);

        $attendu = ['Almadies', 'École', 'Mermoz', 'Sacré-Cœur'];
        $this->assertSame($attendu, $this->getJson($this->url($agency))->assertOk()->json('meta.zones'));
        // Sous une recherche ou une zone, la liste des zones reste celle du carnet entier.
        $this->assertSame($attendu, $this->getJson($this->url($agency, 'filter[search]=astou'))->assertOk()->json('meta.zones'));
        $this->assertSame($attendu, $this->getJson($this->url($agency, 'filter[zone]=Almadies'))->assertOk()->json('meta.zones'));
        // La recherche trouve aussi le quartier, casse repliée ; jamais celui d'une autre agence.
        $this->assertSame([$astou], $this->ids($agency, 'filter[search]='.urlencode('SACRÉ')));
        $this->assertEqualsCanonicalizing([$astou, $moussa], $this->ids($agency, 'filter[search]=mermoz'));
        $this->assertSame([], $this->ids($agency, 'filter[search]=rufisque'));
    }

    public function test_le_delai_de_reponse_est_la_mediane_sur_les_interventions_de_l_agence(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $ailleurs = Agency::factory()->create();
        $astou = $this->providerFor($agency, userAttributes: ['first_name' => 'Astou', 'last_name' => 'Sy']);
        // Astou collabore aussi avec une autre agence, où elle répond en dix heures.
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => ServiceProviderProfile::query()->where('user_id', $astou->id)->value('id'),
            'agency_id' => $ailleurs->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->subMonth()->toDateString(),
        ]);
        $moussa = $this->providerFor($agency, userAttributes: ['first_name' => 'Moussa', 'last_name' => 'Faye']);

        $this->accepteeApres($agency, $astou, 20);
        $this->accepteeApres($agency, $astou, 60);
        $this->accepteeApres($agency, $astou, 30);
        $this->accepteeApres($ailleurs, $astou, 600);
        $this->accepteeApres($ailleurs, $astou, 600);
        // Assignée, jamais acceptée : ne compte pas.
        $this->assigneeSansReponse($agency, $astou);

        Sanctum::actingAs($admin);

        $lignes = collect($this->getJson($this->url($agency))->assertOk()->json('data'))->keyBy('user_id');
        $this->assertSame(30, $lignes[$astou->id]['response_delay_minutes']);
        $this->assertNull($lignes[$moussa->id]['response_delay_minutes']);
    }

    /**
     * Le délai se calcule dans la requête de la page (sous-requête corrélée agrégée), jamais par
     * prestataire : la lecture d'un carnet de six prestataires mesurés coûte autant de requêtes que
     * celle d'un carnet d'un seul, et une seule requête lit le journal.
     */
    public function test_le_delai_ne_coute_aucune_requete_par_prestataire(): void
    {
        [$petite, $adminPetite] = $this->agencyWithAdmin();
        $this->accepteeApres($petite, $this->providerFor($petite), 20);

        [$grande, $adminGrande] = $this->agencyWithAdmin();
        for ($i = 0; $i < 6; $i++) {
            $this->accepteeApres($grande, $this->providerFor($grande), 10 * ($i + 1));
        }

        [$petiteRequetes, $petiteJournal] = $this->requetesDe($adminPetite, $petite);
        [$grandeRequetes, $grandeJournal] = $this->requetesDe($adminGrande, $grande);

        $this->assertSame($petiteRequetes, $grandeRequetes, 'le nombre de requêtes ne dépend pas du nombre de prestataires');
        $this->assertSame(1, $petiteJournal);
        $this->assertSame(1, $grandeJournal);
    }

    /** @return array{int, int} le nombre de requêtes de la lecture, et celui qui lit le journal */
    private function requetesDe(User $admin, Agency $agency): array
    {
        Sanctum::actingAs($admin);
        $sql = [];
        DB::listen(function ($query) use (&$sql): void {
            $sql[] = $query->sql;
        });
        $lignes = $this->getJson($this->url($agency))->assertOk()->json('data');
        $this->assertNotEmpty($lignes);
        foreach ($lignes as $ligne) {
            $this->assertIsInt($ligne['response_delay_minutes']);
        }
        $mesure = [count($sql), count(array_filter($sql, fn (string $q): bool => str_contains($q, 'activity_log')))];
        DB::flushQueryLog();
        app('events')->forget('Illuminate\Database\Events\QueryExecuted');

        return $mesure;
    }

    public function test_le_delai_se_mesure_depuis_la_derniere_assignation(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $astou = $this->providerFor($agency, userAttributes: ['first_name' => 'Astou', 'last_name' => 'Sy']);
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $mr = MaintenanceRequest::factory()->create(['property_id' => $property->id, 'assigned_to' => $astou->id, 'status' => MaintenanceStatus::Open]);
        $journal = app(MaintenanceJournal::class);

        // Assignée, réassignée ailleurs puis rendue à Astou : seule la dernière assignation compte.
        $this->travelTo(Carbon::parse('2026-11-01 08:00:00'));
        $journal->record($mr, MaintenanceJournal::STATUS_PREFIX.'assigned', $admin, ['from' => 'open', 'to' => 'open']);
        $this->travelTo(Carbon::parse('2026-11-01 12:00:00'));
        $journal->record($mr, MaintenanceJournal::STATUS_PREFIX.'assigned', $admin, ['from' => 'open', 'to' => 'open']);
        $this->travelTo(Carbon::parse('2026-11-01 12:45:00'));
        $mr->forceFill(['accepted_at' => now()])->save();
        // Une assignation postérieure à l'acceptation ne compte pas.
        $this->travelTo(Carbon::parse('2026-11-01 13:00:00'));
        $journal->record($mr, MaintenanceJournal::STATUS_PREFIX.'assigned', $admin, ['from' => 'open', 'to' => 'open']);
        $this->travelBack();

        Sanctum::actingAs($admin);

        $this->assertSame(45, $this->getJson($this->url($agency))->assertOk()->json('data.0.response_delay_minutes'));
    }

    /** Une demande d'un bien de l'agence, assignée à `$minutesAvant` minutes de son acceptation. */
    private function accepteeApres(Agency $agency, User $provider, int $minutes): void
    {
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $mr = MaintenanceRequest::factory()->create(['property_id' => $property->id, 'assigned_to' => $provider->id, 'status' => MaintenanceStatus::InProgress]);
        $this->travelTo(Carbon::parse('2026-11-02 08:00:00'));
        app(MaintenanceJournal::class)->record($mr, MaintenanceJournal::STATUS_PREFIX.'assigned', null, ['from' => 'open', 'to' => 'open']);
        $mr->forceFill(['accepted_at' => now()->addMinutes($minutes)])->save();
        $this->travelBack();
    }

    private function assigneeSansReponse(Agency $agency, User $provider): void
    {
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $mr = MaintenanceRequest::factory()->create(['property_id' => $property->id, 'assigned_to' => $provider->id, 'status' => MaintenanceStatus::Open]);
        $this->travelTo(Carbon::parse('2026-10-01 08:00:00'));
        app(MaintenanceJournal::class)->record($mr, MaintenanceJournal::STATUS_PREFIX.'assigned', null, ['from' => 'open', 'to' => 'open']);
        $this->travelBack();
    }

    /**
     * Un prestataire avec compte, collaboration active, sans police d'assurance (la recherche
     * historique porte sur elle : une police tirée au hasard ne doit pas répondre au terme).
     *
     * @param  array<string, mixed>  $user
     * @param  list<string>|null  $zones
     */
    private function prestataire(Agency $agency, array $user, ?array $zones = ['Dakar']): int
    {
        $compte = $this->providerFor($agency, userAttributes: $user);
        $profil = ServiceProviderProfile::query()->where('user_id', $compte->id)->firstOrFail();
        $profil->forceFill(['insurance_policy_id' => null, 'service_areas' => $zones])->save();

        return $profil->id;
    }

    /**
     * Une invitation sans compte, comme `ServiceProviderInvitationService` la crée : profil `draft`,
     * nom et numéro dans `metadata`, collaboration `paused`.
     *
     * @param  array{first_name: string, last_name: string, phone: string}  $meta
     */
    private function invitation(Agency $agency, array $meta): int
    {
        $profil = ServiceProviderProfile::query()->create([
            'user_id' => null,
            'status' => ServiceProviderProfileStatus::Draft->value,
            'service_areas' => ['Dakar'],
            'metadata' => [...$meta, 'email' => strtolower($meta['first_name']).'@example.test'],
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $profil->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Paused->value,
            'started_at' => now()->toDateString(),
        ]);

        return $profil->id;
    }

    private function url(Agency $agency, string $query = ''): string
    {
        return "/api/agencies/{$agency->id}/service-providers?per_page=100".($query !== '' ? '&'.$query : '');
    }

    /** @return list<int> */
    private function ids(Agency $agency, string $query): array
    {
        return collect($this->getJson($this->url($agency, $query))->assertOk()->json('data'))->pluck('id')->sort()->values()->all();
    }

    /** @return array{Agency, User} */
    private function agencyWithAdmin(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);

        return [$agency, $admin];
    }
}
