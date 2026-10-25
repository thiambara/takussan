<?php

namespace Tests\Feature\Privacy;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Privacy\DataExportBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2366 (P247.01, P247.02, P247.03 ; ADR-0070, amendement du 2026-10-25) — ce que l'archive du
 * droit d'accès rend d'une ligne selon le lien du titulaire avec elle.
 *
 * Précédent TCK-1017 : une ligne dont le titulaire n'est que l'auteur ou l'encaisseur décrit un
 * tiers, et l'archive n'en rend que l'acte. Les noms témoins (« Moussa », « Fatou ») sont la fuite
 * elle-même, lisible dans le JSON.
 */
class ArchiveDuTitulaireTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $bailleur;

    private User $locataire;

    private User $client;

    private Lease $bail;

    private Booking $reservation;

    private LeasePayment $encaissement;

    private Document $cni;

    private Document $contrat;

    private Document $cartePro;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agency);

        $this->bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agency->id]);
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->bailleur->id]);

        $this->locataire = User::factory()->create();
        $ficheLocataire = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->locataire->id,
            'first_name' => 'Fatou', 'last_name' => 'Diop',
        ]);
        $this->bail = Lease::factory()->active()->create([
            'agency_id' => $this->agency->id,
            'property_id' => $bien->id,
            'landlord_id' => $this->bailleur->id,
            'tenant_id' => $ficheLocataire->id,
            'agent_id' => $this->agent->id,
            'commission_amount' => 45000,
            'commission_rate' => 10,
        ]);

        $this->client = User::factory()->create();
        $ficheClient = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->client->id,
            'first_name' => 'Moussa', 'last_name' => 'Ba',
        ]);
        $this->reservation = Booking::factory()->create([
            'property_id' => $bien->id,
            'agency_id' => $this->agency->id,
            'customer_id' => $ficheClient->id,
            'created_by_id' => $this->agent->id,
            'total_amount' => 150000,
            'notes' => 'Message du client Moussa',
            'metadata' => ['source' => 'Moussa au téléphone'],
        ]);

        $this->encaissement = LeasePayment::factory()->create([
            'lease_id' => $this->bail->id,
            'payer_id' => $ficheLocataire->id,
            'collector_id' => $this->agent->id,
            'amount' => 123456,
            'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
            'notes' => 'Espèces remises par Fatou',
        ]);

        $this->cni = $this->piece($ficheLocataire, DocumentType::IdCard, 'CNI Fatou Diop', $this->agent);
        $this->contrat = $this->piece($this->bail, DocumentType::LeaseContract, 'Contrat de bail Fatou', $this->agent);
        // Une pièce qu'il dépose sur son propre profil d'agent le décrit : elle reste entière.
        $this->cartePro = $this->piece(
            AgentProfile::query()->where('user_id', $this->agent->id)->firstOrFail(),
            DocumentType::Other, 'Ma carte professionnelle', $this->agent,
        );
    }

    /** @return array<string, array{bool}> */
    public static function agents(): array
    {
        return ['agent actif' => [false], 'agent retiré' => [true]];
    }

    /** P247.01 — l'auteur ou l'encaisseur ne reçoit que l'acte, actif ou retiré. */
    #[DataProvider('agents')]
    public function test_l_archive_de_l_agent_ne_rend_que_l_acte_des_lignes_qu_il_a_saisies_ou_encaissees(bool $retire): void
    {
        if ($retire) {
            app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->agencyAdmin($this->agency), leaveUnassigned: true);
            $this->assertFalse($this->agent->refresh()->isAgentAt($this->agency->id));
        }

        $archive = app(DataExportBuilder::class)->payloads($this->agent->refresh());
        $tiers = json_encode([$archive['bookings.json'], $archive['payments.json'], $archive['documents.json']], JSON_UNESCAPED_UNICODE);

        $this->assertStringNotContainsString('Moussa', $tiers);
        $this->assertStringNotContainsString('Fatou', $tiers);

        $reservation = $this->ligne($archive['bookings.json'], $this->reservation->id);
        $this->assertSame(['id', 'total_amount', 'currency', 'created_at'], array_keys($reservation));
        $this->assertSame('150000.00', $reservation['total_amount']);

        $encaissement = $this->ligne($archive['payments.json']['lease_payments'], $this->encaissement->id);
        $this->assertSame(['id', 'amount', 'currency', 'payment_type', 'paid_at'], array_keys($encaissement));
        $this->assertSame('123456.00', $encaissement['amount']);

        foreach ([$this->cni, $this->contrat] as $piece) {
            $this->assertSame(['id', 'type', 'created_at'], array_keys($this->ligne($archive['documents.json'], $piece->id)));
        }

        $this->assertSame('Ma carte professionnelle', $this->ligne($archive['documents.json'], $this->cartePro->id)['name']);
    }

    /** P247.01 — le client et le locataire gardent leurs lignes entières. */
    public function test_le_client_et_le_locataire_gardent_leurs_lignes_entieres(): void
    {
        $archive = app(DataExportBuilder::class);

        $reservation = $this->ligne($archive->payloads($this->client)['bookings.json'], $this->reservation->id);
        $this->assertSame('Message du client Moussa', $reservation['notes']);
        $this->assertSame($this->reservation->customer_id, $reservation['customer_id']);

        $encaissement = $this->ligne($archive->payloads($this->locataire)['payments.json']['lease_payments'], $this->encaissement->id);
        $this->assertSame('Espèces remises par Fatou', $encaissement['notes']);
        $this->assertSame($this->encaissement->payer_id, $encaissement['payer_id']);
    }

    /**
     * P247.01 — le bailleur qui saisit la réservation de son bien, ou encaisse le loyer de son bail,
     * n'en est pas que l'auteur : il en est partie, et la ligne reste entière.
     */
    public function test_le_bailleur_auteur_ou_encaisseur_sur_son_bien_garde_la_ligne_entiere(): void
    {
        $this->reservation->update(['created_by_id' => $this->bailleur->id]);
        $this->encaissement->update(['collector_id' => $this->bailleur->id]);

        $archive = app(DataExportBuilder::class)->payloads($this->bailleur);

        $this->assertSame('Message du client Moussa', $this->ligne($archive['bookings.json'], $this->reservation->id)['notes']);
        $this->assertSame('Espèces remises par Fatou', $this->ligne($archive['payments.json']['lease_payments'], $this->encaissement->id)['notes']);
    }

    /** P247.02 — le bail de l'archive porte les colonnes que `LeaseResource` rend hors personnel. */
    public function test_le_bail_de_l_archive_du_locataire_et_du_bailleur_ne_porte_pas_le_montant_de_commission(): void
    {
        foreach (['locataire' => $this->locataire, 'bailleur' => $this->bailleur] as $qui => $titulaire) {
            $bail = $this->ligne(app(DataExportBuilder::class)->payloads($titulaire)['leases.json'], $this->bail->id);

            $this->assertArrayNotHasKey('commission_amount', $bail, $qui);
            $this->assertSame('10.00', $bail['commission_rate'], $qui);
            $this->assertSame($this->agent->id, $bail['agent_id'], $qui);
        }
    }

    /**
     * P247.03 — les pièces de ses fiches client et de ses baux de locataire, déposées par un autre,
     * entrent dans son archive en métadonnées : type, nom, date.
     */
    public function test_l_archive_du_locataire_porte_les_pieces_de_sa_fiche_et_de_son_bail_en_metadonnees(): void
    {
        $autreFiche = Customer::factory()->create(['agency_id' => $this->agency->id]);
        $autrui = $this->piece($autreFiche, DocumentType::IdCard, 'CNI d’autrui', $this->agent);

        $documents = app(DataExportBuilder::class)->payloads($this->locataire)['documents.json'];

        foreach ([$this->cni, $this->contrat] as $piece) {
            $ligne = $this->ligne($documents, $piece->id);
            $this->assertSame(['id', 'type', 'name', 'created_at'], array_keys($ligne));
            $this->assertSame($piece->name, $ligne['name']);
        }
        $this->assertNotContains($autrui->id, array_column($documents, 'id'));
    }

    private function piece(object $porteur, DocumentType $type, string $nom, User $auteur): Document
    {
        return Document::factory()->create([
            'documentable_type' => $porteur::class,
            'documentable_id' => $porteur->getKey(),
            'uploaded_by' => $auteur->id,
            'type' => $type,
            'name' => $nom,
            'description' => "Pièce : {$nom}",
            'metadata' => ['nom' => $nom],
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $lignes
     * @return array<string, mixed>
     */
    private function ligne(array $lignes, int $id): array
    {
        $trouvees = array_values(array_filter($lignes, fn (array $ligne) => $ligne['id'] === $id));
        $this->assertCount(1, $trouvees, "ligne {$id} absente de l'archive");

        return $trouvees[0];
    }
}
