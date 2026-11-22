<?php

namespace Tests\Feature\Documents;

use App\Models\Enums\DocumentType;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\ServiceProviderBill;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\LaravelPdf\Facades\Pdf;
use Tests\Support\CoffreDeDocuments;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2655 (ADR-0099 §2) — le coffre du PRESTATAIRE, au profil prestataire actif : ses factures
 * d'intervention (la branche prestataire de `ServiceProviderBillController::visibleTo`) et ses pièces.
 * TCK-2897 — une facture se télécharge en PDF (`service-provider-bills/{bill}/pdf`).
 */
class DocumentVaultProviderTest extends TestCase
{
    use CoffreDeDocuments;
    use MaintenanceActors;
    use RefreshDatabase;

    public function test_the_bills_folder_lists_its_own_bills_only(): void
    {
        $this->batirLeCoffre();
        $provider = $this->providerFor($this->agency);
        $profile = ServiceProviderProfile::query()->where('user_id', $provider->id)->sole();
        $mine = ServiceProviderBill::factory()->count(2)->create(['provider_id' => $provider->id, 'agency_id' => $this->agency->id]);
        $theirs = ServiceProviderBill::factory()->create(['provider_id' => User::factory()->create()->id, 'agency_id' => $this->agency->id]);
        $piece = $this->document($provider, $provider, DocumentType::Insurance, 'Assurance RC pro', today()->addDays(30)->toDateString());

        $this->connecter($provider, $profile);
        $vault = $this->coffre();

        // TCK-2897 — « Devis et rapports » suit « Mes factures ».
        $this->assertSame(['pieces', 'bills', 'quotes_reports'], array_column($vault['folders'], 'key'));
        $bills = collect($vault['folders'])->firstWhere('key', 'bills');
        $this->assertEqualsCanonicalizing(
            // TCK-2897 — le PDF de la facture, plus sa fiche JSON.
            $mine->map(fn (ServiceProviderBill $b) => "/api/service-provider-bills/{$b->id}/pdf")->all(),
            array_column($bills['entries'], 'download_path'),
        );
        $this->assertNotContains("/api/service-provider-bills/{$theirs->id}/pdf", $this->chemins($vault));
        Pdf::fake();
        foreach ($bills['entries'] as $entry) {
            $this->assertSame('provider_bill', $entry['category']);
            $this->get($entry['download_path'])->assertOk();
        }
        $this->getJson("/api/service-provider-bills/{$theirs->id}")->assertNotFound();

        $pieces = collect($vault['folders'])->firstWhere('key', 'pieces');
        $this->assertSame([$piece->id], array_column($pieces['entries'], 'document_id'));
        $this->assertSame(['expiring_soon' => 1, 'unverified' => 1], $vault['counts']);

        // Rien des baux ni des biens de l'agence.
        $this->assertSame([], array_values(array_filter($this->chemins($vault), fn (string $p) => str_contains($p, '/leases/') || str_contains($p, '/inventories/'))));
    }

    public function test_an_empty_bills_folder_still_exists(): void
    {
        $this->batirLeCoffre();
        $provider = $this->providerFor($this->agency);
        $profile = ServiceProviderProfile::query()->where('user_id', $provider->id)->sole();

        $this->connecter($provider, $profile);
        $vault = $this->coffre();

        $this->assertSame([], collect($vault['folders'])->firstWhere('key', 'bills')['entries']);
    }
}
