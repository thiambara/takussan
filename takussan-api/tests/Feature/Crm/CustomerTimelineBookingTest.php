<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContactGestureChannel;
use App\Models\Enums\CustomerNoteKind;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Crm\ContactGestureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2894 (ADR-0110 § 9) — la réservation entre au fil de la fiche client : son dépôt, son
 * acceptation et son refus, au seul personnel de l'agence de la fiche (la lecture des visites), et
 * parmi les réservations de ce client les seules de cette agence. Jamais le revenu déclaré, le
 * dossier ni les garants.
 */
class CustomerTimelineBookingTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $admin;

    private User $bailleurAuteur;

    private Customer $fiche;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->admin = $this->personnel($this->agence, 'agency_admin');
        $this->bailleurAuteur = $this->bailleur($this->agence);
        $this->fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->bailleurAuteur->id]);
        $this->bien = $this->bienDe($this->agence, $this->bailleur($this->agence));
        Activity::query()->delete();
    }

    private function candidature(array $attributes = []): Booking
    {
        return Booking::factory()->create($attributes + [
            'property_id' => $this->bien->id,
            'agency_id' => $this->agence->id,
            'customer_id' => $this->fiche->id,
            'kind' => BookingKind::Application,
            'status' => BookingStatus::Pending,
            'total_amount' => 300000,
        ]);
    }

    /** @return list<string> le fil, du plus récent au plus ancien, en `type:jalon|kind` */
    private function suite(string $filtre = ''): array
    {
        return array_map(
            fn (array $e) => $e['type'].':'.($e['milestone'] ?? $e['kind'] ?? $e['channel'] ?? ''),
            $this->getJson("/api/customers/{$this->fiche->id}/timeline?per_page=50{$filtre}")->assertOk()->json('data'),
        );
    }

    public function test_ac1_la_candidature_deposee_puis_acceptee_au_personnel_de_l_agence(): void
    {
        Carbon::setTestNow('2026-11-10 09:00:00');
        $booking = $this->candidature();
        $booking->forceFill(['declared_monthly_income' => 950000])->save();
        Carbon::setTestNow('2026-11-11 15:00:00');
        $booking->forceFill(['status' => BookingStatus::Confirmed, 'confirmed_at' => now()])->save();
        Carbon::setTestNow();

        Sanctum::actingAs($this->admin);
        $json = $this->getJson("/api/customers/{$this->fiche->id}/timeline?filter[type]=booking")->assertOk()->json();

        $this->assertSame(2, $json['meta']['total']);
        [$acceptee, $deposee] = $json['data'];
        $this->assertSame(['booking', 'confirmed', 'application', 'confirmed'], [$acceptee['type'], $acceptee['milestone'], $acceptee['kind'], $acceptee['status']]);
        $this->assertSame(['booking', 'created', $booking->id], [$deposee['type'], $deposee['milestone'], $deposee['id']]);
        $this->assertSame('2026-11-11T15:00:00+00:00', $acceptee['at']);
        $this->assertSame('2026-11-10T09:00:00+00:00', $deposee['at']);
        $this->assertSame(['id' => $this->bien->id, 'title' => $this->bien->title], $deposee['property']);
        $this->assertSame($booking->reference_number, $deposee['reference_number']);
        $this->assertSame('300000.00', $deposee['amount']);

        // Jamais le revenu, le dossier ni les garants.
        $this->assertSame(
            ['type', 'id', 'milestone', 'at', 'kind', 'status', 'reference_number', 'amount', 'currency', 'start_date', 'property'],
            array_keys($deposee),
        );
        $this->assertStringNotContainsString('950000', json_encode($json));
    }

    public function test_ac1_rien_au_bailleur_auteur_ni_a_un_lecteur_d_une_autre_agence(): void
    {
        $this->candidature(['status' => BookingStatus::Confirmed, 'confirmed_at' => now()]);

        // Le bailleur auteur lit la fiche, pas les réservations de l'agence.
        Sanctum::actingAs($this->bailleurAuteur);
        $this->getJson("/api/customers/{$this->fiche->id}/timeline?filter[type]=booking")->assertOk()->assertJsonPath('meta.total', 0);
        $this->assertNotContains('booking', array_column($this->getJson("/api/customers/{$this->fiche->id}/timeline")->assertOk()->json('data'), 'type'));

        // Un bailleur ou un admin d'une autre agence ne lit pas la fiche du tout.
        $ailleurs = $this->agence();
        foreach ([$this->bailleur($ailleurs), $this->personnel($ailleurs, 'agency_admin')] as $lecteur) {
            Sanctum::actingAs($lecteur);
            $this->assertContains($this->getJson("/api/customers/{$this->fiche->id}/timeline?filter[type]=booking")->status(), [403, 404]);
        }
    }

    public function test_une_reservation_du_meme_client_dans_une_autre_agence_n_entre_pas(): void
    {
        $ailleurs = $this->agence();
        $this->candidature(['agency_id' => $ailleurs->id, 'property_id' => $this->bienDe($ailleurs)->id]);
        $ici = $this->candidature();

        Sanctum::actingAs($this->admin);
        $data = $this->getJson("/api/customers/{$this->fiche->id}/timeline?filter[type]=booking")->assertOk()->json('data');

        $this->assertSame([$ici->id], array_column($data, 'id'));
    }

    public function test_le_refus_entre_au_fil_l_annulation_non(): void
    {
        Carbon::setTestNow('2026-11-10 09:00:00');
        $refusee = $this->candidature();
        $annulee = $this->candidature();
        Carbon::setTestNow('2026-11-12 09:00:00');
        $refusee->forceFill(['status' => BookingStatus::Rejected, 'cancelled_at' => now()])->save();
        $annulee->forceFill(['status' => BookingStatus::Cancelled, 'cancelled_at' => now()])->save();
        Carbon::setTestNow();

        Sanctum::actingAs($this->admin);
        $data = $this->getJson("/api/customers/{$this->fiche->id}/timeline?filter[type]=booking")->assertOk()->json('data');

        $this->assertSame(
            [[$refusee->id, 'rejected'], [$annulee->id, 'created'], [$refusee->id, 'created']],
            array_map(fn (array $e) => [$e['id'], $e['milestone']], $data),
        );
        $this->assertSame('rejected', $data[0]['status']);
    }

    /**
     * AC2 — de la demande à la candidature : la note `lead_message`, la visite confirmée, le compte
     * rendu, le geste d'invitation (le lien envoyé par WhatsApp, un geste de contact — ADR-0101 § 4)
     * et la candidature déposée, dans l'ordre du temps.
     */
    public function test_ac2_le_fil_complet_de_la_demande_a_la_candidature(): void
    {
        Carbon::setTestNow('2026-11-03 14:31:00');
        $lead = PropertyContactLead::factory()->create(['property_id' => $this->bien->id, 'customer_id' => $this->fiche->id]);
        CustomerNote::factory()->create([
            'customer_id' => $this->fiche->id, 'author_id' => null,
            'kind' => CustomerNoteKind::LeadMessage, 'body' => 'Une visite samedi est-elle possible ?',
        ]);
        Carbon::setTestNow('2026-11-04 09:00:00');
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'customer_id' => $this->fiche->id, 'agent_id' => $this->admin->id,
            'status' => VisitStatus::Confirmed, 'scheduled_at' => now()->addDays(3),
        ]);
        Carbon::setTestNow('2026-11-07 11:30:00');
        CustomerNote::factory()->create([
            'customer_id' => $this->fiche->id, 'author_id' => $this->admin->id,
            'kind' => CustomerNoteKind::VisitReport, 'property_visit_id' => $visite->id, 'body' => 'Intéressé',
        ]);
        Carbon::setTestNow('2026-11-07 11:35:00');
        app(ContactGestureService::class)->onLead($lead, $this->admin, ContactGestureChannel::Whatsapp);
        Carbon::setTestNow('2026-11-08 18:00:00');
        $this->candidature();
        Carbon::setTestNow();

        Sanctum::actingAs($this->admin);

        $this->assertSame(
            ['booking:created', 'contact:whatsapp', 'note:visit_report', 'visit:confirmed', 'note:lead_message'],
            $this->suite(),
        );
    }

    public function test_le_filtre_booking_est_accepte_et_un_type_inconnu_reste_refuse(): void
    {
        Sanctum::actingAs($this->admin);
        $this->getJson("/api/customers/{$this->fiche->id}/timeline?filter[type]=note,booking")->assertOk();
        $this->getJson("/api/customers/{$this->fiche->id}/timeline?filter[type]=lease")->assertUnprocessable();
    }
}
