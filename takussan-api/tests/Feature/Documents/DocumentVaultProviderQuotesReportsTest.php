<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\LaravelPdf\Facades\Pdf;
use Tests\Support\CoffreDeDocuments;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2897 (ADR-0099, amendement du 2026-11-15) — « Devis et rapports » (`quotes_reports`) au coffre du
 * PRESTATAIRE : ses devis soumis et un rapport de fin d'intervention par demande au travail rendu, listés
 * depuis la demande sous la règle de leur endpoint (`actAsProvider` : assigné ET encore assignable), en
 * un nombre de requêtes qui ne dépend pas du nombre de demandes.
 */
class DocumentVaultProviderQuotesReportsTest extends TestCase
{
    use CoffreDeDocuments;
    use MaintenanceActors;
    use RefreshDatabase;

    private User $provider;

    private ServiceProviderProfile $profile;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();
        $this->provider = $this->providerFor($this->agency);
        $this->profile = ServiceProviderProfile::query()->where('user_id', $this->provider->id)->sole();
    }

    private function demande(MaintenanceStatus $status, array $attributes = [], ?User $assignee = null, ?Property $property = null): MaintenanceRequest
    {
        return MaintenanceRequest::factory()->create(array_merge([
            'property_id' => ($property ?? $this->property)->id,
            'requester_id' => $this->tenant->id,
            'assigned_to' => ($assignee ?? $this->provider)->id,
            'status' => $status,
        ], $attributes));
    }

    private function devisSoumis(array $attributes = []): array
    {
        return array_merge([
            'quote_amount' => 45_000,
            'quote_currency' => 'XOF',
            'quote_submitted_at' => now()->subDays(2),
            'quote_lines' => [['label' => 'Pose', 'kind' => 'labour', 'quantity' => '1.00', 'unit_price' => '45000.00', 'total' => '45000.00']],
        ], $attributes);
    }

    /** @return array<string, mixed> */
    private function dossier(): array
    {
        $this->connecter($this->provider, $this->profile);

        return collect($this->coffre()['folders'])->firstWhere('key', 'quotes_reports');
    }

    public function test_ac3_un_devis_et_douze_interventions_closes_font_treize_entrees_qui_s_ouvrent_toutes(): void
    {
        $devis = $this->demande(MaintenanceStatus::QuoteSubmitted, $this->devisSoumis());
        $closes = collect(range(1, 12))->map(fn (int $i) => $this->demande($i % 2 === 0 ? MaintenanceStatus::Closed : MaintenanceStatus::Completed, [
            'title' => "Intervention {$i}",
            'resolution_notes' => "Travaux {$i} réalisés.",
            'completed_at' => now()->subDays($i),
        ]));
        // Ni le travail en cours sans devis, ni la demande d'un autre prestataire, ni l'annulée.
        $this->demande(MaintenanceStatus::InProgress);
        $this->demande(MaintenanceStatus::Closed, [], $this->providerFor($this->agency));
        $this->demande(MaintenanceStatus::Cancelled);

        $dossier = $this->dossier();

        $this->assertSame('quotes_reports', $dossier['kind']);
        $this->assertCount(13, $dossier['entries']);
        $this->assertEqualsCanonicalizing(
            ["/api/maintenance-requests/{$devis->id}/quote/pdf", ...$closes->map(fn (MaintenanceRequest $mr) => "/api/maintenance-requests/{$mr->id}/completion-report/pdf")->all()],
            array_column($dossier['entries'], 'download_path'),
        );
        $this->assertSame(1, collect($dossier['entries'])->where('category', 'maintenance_quote')->count());
        $this->assertSame(12, collect($dossier['entries'])->where('category', 'maintenance_completion_report')->count());

        Pdf::fake();
        foreach ($dossier['entries'] as $entree) {
            $reponse = $this->get($entree['download_path']);
            $reponse->assertOk();
            $this->assertStringStartsWith('application/pdf', (string) $reponse->headers->get('Content-Type'), $entree['download_path']);
        }
    }

    public function test_une_intervention_close_avec_devis_rend_son_devis_et_son_rapport(): void
    {
        $mr = $this->demande(MaintenanceStatus::Closed, $this->devisSoumis(['completed_at' => now()->subDay()]));

        $this->assertEqualsCanonicalizing(
            ["/api/maintenance-requests/{$mr->id}/quote/pdf", "/api/maintenance-requests/{$mr->id}/completion-report/pdf"],
            array_column($this->dossier()['entries'], 'download_path'),
        );
    }

    public function test_une_collaboration_finie_retire_les_entrees_comme_l_endpoint_les_refuse(): void
    {
        $mr = $this->demande(MaintenanceStatus::Closed, $this->devisSoumis());
        // Témoin : listée et ouverte tant que la collaboration est active.
        $this->assertCount(2, $this->dossier()['entries']);

        // Il reste assignable dans une autre agence : la liste est jugée agence par agence, pas « a-t-il
        // une collaboration quelque part ».
        $ailleurs = Agency::factory()->create();
        $this->profile->agencyCollaborations()->update(['status' => CollaborationStatus::Ended->value]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $this->profile->id,
            'agency_id' => $ailleurs->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->subWeek()->toDateString(),
        ]);

        $dossier = $this->dossier();
        $this->assertSame([], $dossier['entries']);
        Pdf::fake();
        $this->get("/api/maintenance-requests/{$mr->id}/quote/pdf")->assertForbidden();
        $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf")->assertNotFound();
    }

    public function test_le_dossier_existe_vide_et_n_est_qu_au_profil_prestataire(): void
    {
        $dossier = $this->dossier();
        $this->assertSame([], $dossier['entries']);
        $this->assertNull($dossier['parent']);

        $this->connecter($this->landlord, OwnerProfile::query()->where('user_id', $this->landlord->id)->sole());
        $this->assertNotContains('quotes_reports', array_column($this->coffre()['folders'], 'key'));
    }

    /** AC6 — 30 interventions ou 1 : le même nombre de requêtes. */
    public function test_ac6_le_nombre_de_requetes_ne_depend_pas_du_nombre_d_interventions(): void
    {
        $this->demande(MaintenanceStatus::Closed, $this->devisSoumis());
        $this->connecter($this->provider, $this->profile);
        $this->coffre();
        $une = $this->requetes(fn () => $this->coffre());

        foreach (range(1, 29) as $i) {
            $this->demande($i % 3 === 0 ? MaintenanceStatus::Completed : MaintenanceStatus::Closed, $i % 2 === 0 ? $this->devisSoumis() : [], property: $i % 2 === 0 ? $this->otherProperty : $this->property);
        }

        $vault = $this->coffre();
        $this->assertCount(30 + 15, collect($vault['folders'])->firstWhere('key', 'quotes_reports')['entries']);
        $this->assertSame($une, $this->requetes(fn () => $this->coffre()));
    }
}
