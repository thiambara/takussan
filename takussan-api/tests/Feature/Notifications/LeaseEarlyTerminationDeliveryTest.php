<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationTarget;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\RentReviewService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1129 (P75.04) — la résiliation anticipée et la révision de loyer écrivent leurs lignes de
 * cloche chez qui doit les lire, sans `Notification::fake()` : les classes qui exercent ces
 * services posaient la façade en faux et n'assertaient aucun envoi, si bien qu'un changement de
 * destinataire (`NotifyOnEarlyTermination`, `NotifyTenantOfRentReview`), de titre à clé dynamique
 * ou de cible ne rougissait rien.
 *
 * Résiliation : le locataire (s'il a un compte) et le bailleur, jamais d'autre compte, pour chacune
 * des trois transitions. Révision : le locataire seul.
 */
class LeaseEarlyTerminationDeliveryTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: Lease, 1: User, 2: User} */
    private function bail(): array
    {
        $bailleur = User::factory()->create();
        $locataire = User::factory()->create();
        $bien = Property::factory()->create(['user_id' => $bailleur->id]);
        $client = Customer::factory()->create(['user_id' => $locataire->id]);
        $bail = Lease::factory()->active()->create([
            'landlord_id' => $bailleur->id,
            'property_id' => $bien->id,
            'tenant_id' => $client->id,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
            'monthly_rent' => 400_000,
            'deposit_amount' => 800_000,
        ]);

        return [$bail, $bailleur, $locataire];
    }

    /**
     * Les lignes de cloche du bail pour la clé de titre donnée : une par destinataire attendu, ni
     * plus ni moins, chacune titrée et menant au bail.
     *
     * @param  list<User>  $destinataires
     */
    private function assertCloche(Lease $bail, string $cleTitre, array $destinataires): void
    {
        $params = ['reference' => $bail->reference_number ?? '#'.$bail->id];
        // Le titre est écrit dans la langue du destinataire, pas dans celle du test.
        $titres = array_map(fn (string $langue) => __($cleTitre, $params, $langue), ['fr', 'en']);
        $this->assertNotContains($cleTitre, $titres, 'la clé de titre se traduit');
        $lignes = AppNotification::query()->whereIn('title', $titres)->get();

        $attendus = array_map(fn (User $u) => $u->id, $destinataires);
        sort($attendus);
        $recus = $lignes->pluck('user_id')->map(fn ($id) => (int) $id)->sort()->values()->all();
        $this->assertSame($attendus, $recus, "destinataires de « {$cleTitre} »");

        foreach ($lignes as $ligne) {
            $destinataire = User::query()->findOrFail($ligne->user_id);
            $this->assertSame(__($cleTitre, $params, $destinataire->preferredLocale() ?? 'fr'), $ligne->title);
            $cible = NotificationTarget::forRow($ligne);
            $this->assertNotNull($cible);
            $this->assertSame('lease', $cible->kind);
            $this->assertSame($bail->id, $cible->id);
        }
    }

    public function test_la_demande_puis_l_annulation_vont_au_locataire_et_au_bailleur(): void
    {
        [$bail, $bailleur, $locataire] = $this->bail();
        $service = app(EarlyTerminationService::class);

        $service->request($bail, $bailleur, ['effective_date' => now()->addDays(45)->toDateString(), 'reason' => 'Mutation']);
        $this->assertCloche($bail, 'notifications.lease_early_termination.requested.subject', [$bailleur, $locataire]);

        $service->cancel($bail->fresh(), $bailleur);
        $this->assertCloche($bail, 'notifications.lease_early_termination.cancelled.subject', [$bailleur, $locataire]);

        $this->assertSame(4, AppNotification::query()->count(), 'aucun autre compte (agence, agent) n\'est notifié');
    }

    public function test_la_confirmation_va_au_locataire_et_au_bailleur(): void
    {
        [$bail, $bailleur, $locataire] = $this->bail();
        $service = app(EarlyTerminationService::class);

        $service->request($bail, $bailleur, ['effective_date' => now()->addDays(45)->toDateString()]);
        Invoice::query()->whereKey($bail->fresh()->early_termination_invoice_id)->firstOrFail()
            ->forceFill(['status' => InvoiceStatus::Paid])->save();
        $this->travel(46)->days();
        $service->confirm($bail->fresh(), $bailleur);

        $this->assertCloche($bail, 'notifications.lease_early_termination.confirmed.subject', [$bailleur, $locataire]);
    }

    public function test_un_locataire_sans_compte_laisse_le_bailleur_seul_notifie(): void
    {
        [$bail, $bailleur] = $this->bail();
        Customer::query()->whereKey($bail->tenant_id)->update(['user_id' => null]);

        app(EarlyTerminationService::class)->request($bail->fresh(), $bailleur, ['effective_date' => now()->addDays(45)->toDateString()]);

        $this->assertCloche($bail, 'notifications.lease_early_termination.requested.subject', [$bailleur]);
    }

    public function test_la_revision_de_loyer_va_au_locataire_seul(): void
    {
        [$bail, $bailleur, $locataire] = $this->bail();

        app(RentReviewService::class)->review($bail, $bailleur, ['new_rent' => 420_000, 'reason' => 'Indexation annuelle']);

        $this->assertCloche($bail, 'notifications.lease_rent_reviewed.subject', [$locataire]);
        $this->assertSame(1, AppNotification::query()->count());
    }
}
