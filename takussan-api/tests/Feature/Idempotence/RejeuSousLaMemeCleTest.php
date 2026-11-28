<?php

namespace Tests\Feature\Idempotence;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\Currency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\ParticipantRole;
use App\Models\Enums\RentPeriod;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * ADR-0072 — le scénario mesuré de l'angle 144, un par écriture : l'appelant envoie, la réponse se perd, il renvoie
 * 30 s plus tard sous la même `Idempotency-Key`. Avant correctif, chaque écriture doublait (deux messages, deux
 * encaissements `paid`, deux brouillons de facture, deux interventions et deux avis au bailleur, deux réservations,
 * deux demandes de contact). Sous la même clé : la première réponse est rejouée, une ligne, aucun second avis.
 *
 * TCK-3015 (ADR-0140 § 4) — les sept scénarios étaient recopiés dans six fichiers ; ils sont ici un fournisseur de
 * données, sans qu'aucun cas ne parte. Chacun garde son ticket d'origine dans `scenes()`.
 */
class RejeuSousLaMemeCleTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function scenes(): array
    {
        return [
            // TCK-1398 (P144.02, lot 1) — deux `POST` identiques à 30 s d'écart écrivaient deux messages.
            'message d\'une conversation' => ['message'],
            // TCK-1400 (P144.04, lot 2) — le bailleur enregistre un acompte : deux encaissements `paid`.
            'acompte d\'une réservation' => ['acompte'],
            // TCK-1402 (P144.05, lot 2) — deux brouillons de facture de numéros distincts.
            'facture' => ['facture'],
            // TCK-1404 (P144.06, lot 2) — le locataire signale un problème : deux interventions, deux avis.
            'intervention signalée par le locataire' => ['intervention'],
            // TCK-1406 (P144.03, lots 2 et 3) — deux réservations `pending`, prévenues deux fois.
            'réservation du personnel' => ['reservation du personnel'],
            'demande publique de réservation' => ['demande publique de reservation'],
            // TCK-1408 (P144.07, lot 3) — l'action serveur de la fiche abandonne à 30 s (TCK-1215) et renvoie.
            'message depuis la fiche d\'un bien' => ['message de la fiche'],
            // TCK-1410 (P144.08, lot 3) — le contact anonyme : 201, 201, deux demandes.
            'contact d\'un bien' => ['contact d\'un bien'],
            'contact d\'un agent' => ['contact d\'un agent'],
        ];
    }

    #[DataProvider('scenes')]
    public function test_une_ecriture_rejouee_sous_la_meme_cle_ne_s_ecrit_qu_une_fois(string $nom): void
    {
        [$chemin, $corps, $cle, $lignes, $rendu, $previent] = $this->scene($nom);

        $premiere = $this->postJson($chemin, $corps, ['Idempotency-Key' => $cle])->assertCreated();
        $avis = DB::table('app_notifications')->count();
        $this->travel(30)->seconds();
        $rejeu = $this->postJson($chemin, $corps, ['Idempotency-Key' => $cle])
            ->assertCreated()
            ->assertHeader('Idempotent-Replayed', 'true');

        if ($rendu !== null) {
            $this->assertNotNull($premiere->json($rendu), "témoin : la première réponse porte {$rendu}");
            $this->assertSame($premiere->json($rendu), $rejeu->json($rendu), 'la réponse rejouée est la première');
        }
        $this->assertSame(1, $lignes(), 'une seule ligne écrite');
        $this->assertSame($avis, DB::table('app_notifications')->count(), 'aucun second avis');
        if ($previent) {
            $this->assertGreaterThan(0, $avis, 'témoin : le premier envoi prévient bien');
        }
    }

    /**
     * Le décor d'un scénario, appelant authentifié compris : [chemin, corps, clé, lignes écrites, chemin JSON de la
     * réponse rejouée (null : la réponse n'est pas comparée), le premier envoi prévient-il ?].
     *
     * @return array{string, array<string, mixed>, string, Closure(): int, ?string, bool}
     */
    private function scene(string $nom): array
    {
        return match ($nom) {
            'message' => $this->message(),
            'acompte' => $this->acompte(),
            'facture' => $this->facture(),
            'intervention' => $this->intervention(),
            'reservation du personnel' => $this->reservationDuPersonnel(),
            'demande publique de reservation' => $this->demandePubliqueDeReservation(),
            'message de la fiche' => $this->messageDeLaFiche(),
            'contact d\'un bien' => $this->contactDUnBien(),
            'contact d\'un agent' => $this->contactDUnAgent(),
        };
    }

    private function message(): array
    {
        $admin = User::factory()->create();
        $membre = User::factory()->create();
        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil',
            'created_by' => $admin->id,
        ]);
        $conversation->participants()->attach($admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $conversation->participants()->attach($membre->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        Sanctum::actingAs($membre);

        return [
            "/api/conversations/{$conversation->id}/messages", ['content' => 'Je passe demain'],
            'b6f1c9a2-7d3e-4f0a-9c1b-2e5d8f7a6c40', fn () => Message::query()->count(), 'data.id', false,
        ];
    }

    private function acompte(): array
    {
        $owner = User::factory()->create();
        $booking = Booking::factory()->create([
            'property_id' => Property::factory()->create(['user_id' => $owner->id])->id,
            'customer_id' => Customer::factory()->create()->id,
            // Le reste dû borne l'acompte (TCK-1916) : un total tiré sous 100 000 rendait 422.
            'total_amount' => 1_000_000,
        ]);
        Sanctum::actingAs($owner);

        return [
            "/api/bookings/{$booking->id}/payments", ['amount' => 100000, 'payment_type' => 'deposit', 'payment_method' => 'cash'],
            'a1b2c3d4-0000-4000-8000-acompte00001', fn () => BookingPayment::query()->where('status', 'paid')->count(),
            'data.receipt_number', false,
        ];
    }

    private function facture(): array
    {
        $agency = Agency::factory()->create();
        Sanctum::actingAs(User::factory()->withAgentProfile($agency)->create());
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);

        return [
            '/api/invoices', ['customer_id' => $customer->id, 'issue_date' => now()->toDateString(), 'subtotal' => 100000],
            'f4c7e2a9-1b3d-4e5f-8a6b-facture00001', fn () => Invoice::query()->count(), 'data.id', false,
        ];
    }

    private function intervention(): array
    {
        $locataire = User::factory()->create();
        $property = Property::factory()->create();
        Lease::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $locataire->id])->id,
            'landlord_id' => $property->user_id,
            'status' => LeaseStatus::Active,
        ]);
        Sanctum::actingAs($locataire);

        return [
            '/api/maintenance-requests', [
                'property_id' => $property->id,
                'title' => 'Fuite sous l’évier',
                'description' => 'L’eau coule sous l’évier de la cuisine.',
                'category' => 'plumbing',
                'priority' => 'high',
            ],
            'd9e8f7a6-5b4c-4d3e-8f2a-interv000001', fn () => MaintenanceRequest::query()->count(), 'data.id', true,
        ];
    }

    private function reservationDuPersonnel(): array
    {
        $agency = Agency::factory()->create();
        Sanctum::actingAs(User::factory()->withAgentProfile($agency)->create());
        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
            'price' => '20000',
        ]);

        return [
            '/api/bookings', [
                'property_id' => $property->id,
                'customer_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
                'start_date' => now()->addDay()->toDateString(),
                'end_date' => now()->addDays(3)->toDateString(),
            ],
            'e1d2c3b4-a596-4877-8899-reserv000001', fn () => Booking::query()->count(), 'data.id', false,
        ];
    }

    private function demandePubliqueDeReservation(): array
    {
        $property = Property::factory()->published()->create([
            'price' => 50_000,
            'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
        ]);
        Sanctum::actingAs(User::factory()->create());

        return [
            "/api/public/properties/{$property->slug}/booking-request",
            ['start_date' => now()->addDay()->toDateString(), 'end_date' => now()->addDays(4)->toDateString(), 'guests' => 2],
            'e1d2c3b4-a596-4877-8899-reserv000002', fn () => Booking::query()->count(), 'data.id', false,
        ];
    }

    private function messageDeLaFiche(): array
    {
        $property = Property::factory()->published()->create(['user_id' => User::factory()->create()->id]);
        Sanctum::actingAs(User::factory()->create());

        return [
            "/api/public/properties/{$property->slug}/contact-message", ['message' => 'Ce bien est-il libre ?'],
            'a7b6c5d4-e3f2-4a1b-9c8d-fiche0000001', fn () => Message::query()->where('content', 'Ce bien est-il libre ?')->count(),
            'data.conversation_id', false,
        ];
    }

    private function contactDUnBien(): array
    {
        $property = Property::factory()->published()->create(['user_id' => User::factory()->create()->id]);

        return [
            "/api/public/properties/{$property->slug}/contact-lead", self::CONTACT,
            'b1c2d3e4-f5a6-4b7c-8d9e-lead00000001', fn () => PropertyContactLead::query()->count(), null, false,
        ];
    }

    private function contactDUnAgent(): array
    {
        $agent = User::factory()->create(['username' => 'awa-diop']);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => Agency::factory()->create()->id]);

        return [
            '/api/public/agents/awa-diop/contact-lead', self::CONTACT,
            'b1c2d3e4-f5a6-4b7c-8d9e-lead00000002', fn () => PropertyContactLead::query()->count(), null, false,
        ];
    }

    private const CONTACT = [
        'name' => 'Awa Diop',
        'phone' => '+221771234567',
        'message' => 'Bonjour, ce bien est-il encore disponible ?',
    ];
}
