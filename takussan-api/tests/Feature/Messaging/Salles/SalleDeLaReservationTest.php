<?php

namespace Tests\Feature\Messaging\Salles;

use App\Models\Enums\BookingStatus;
use App\Models\Enums\ConversationType;
use App\Services\Messaging\ConversationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Support\ScenesDeSalles;

/**
 * TCK-2960 (ADR-0128 § 2, AC3) — la salle d'une réservation : le candidat et le contact principal du
 * bien. Le contact n'a pas de point unique de changement : l'ancien perd la salle tout de suite (la
 * branche d'accès juge le contact ACTUEL), le nouveau y entre à l'ouverture.
 */
class SalleDeLaReservationTest extends ApiTestCase
{
    use RefreshDatabase, ScenesDeSalles;

    public function test_la_reservation_demandee_a_sa_salle_avec_le_candidat_et_le_contact_principal(): void
    {
        ['booking' => $booking, 'owner' => $owner, 'candidat' => $candidat, 'property' => $property] = $this->sceneDeLaReservation();

        $salle = $this->salleDe($booking);
        $this->assertNotNull($salle);
        $this->assertSame(ConversationType::Booking, $salle->type);
        $this->assertSame('booking', $salle->subject_type);
        $this->assertSame($booking->id, $salle->subject_id);
        $this->assertSame($property->id, (int) $salle->property_id);
        $this->assertNull($salle->lease_id);
        $this->assertSame($this->ids([$owner, $candidat]), $this->membresActifs($salle));
        $access = app(ConversationAccess::class);
        $this->assertTrue($access->allowsWriting($owner, $salle));
        $this->assertTrue($access->allowsWriting($candidat, $salle));
    }

    public function test_l_ancien_contact_perd_la_salle_tout_de_suite_et_le_nouveau_entre_a_l_ouverture(): void
    {
        ['booking' => $booking, 'owner' => $owner, 'candidat' => $candidat, 'property' => $property, 'agency' => $agency] = $this->sceneDeLaReservation();
        $salle = $this->salleDe($booking);
        $access = app(ConversationAccess::class);
        $this->assertTrue($access->allows($owner, $salle), 'témoin : le propriétaire répond');

        $agent = $this->agentDe($agency);
        $this->confierLeBienA($property, $agent);

        // Avant toute écriture dans la salle : l'ancien contact, toujours participant et lecteur de la
        // réservation (propriétaire du bien), n'y a plus accès.
        $this->assertTrue($owner->can('view', $booking->fresh()), 'prémisse : il lit toujours la réservation');
        $this->assertContains($owner->id, $this->membresActifs($salle), 'prémisse : toujours participant');
        $this->assertFalse($access->allows($owner, $salle->fresh()));
        $this->assertNotContains($salle->id, $access->participatingQuery($owner)->pluck('id')->all());
        $this->assertTrue($access->allows($candidat, $salle->fresh()), 'le candidat garde sa salle');

        // Le nouveau contact ouvre la salle depuis la fiche : il y entre, l'ancien en sort.
        $this->actingAsApi($agent);
        $this->apiPost('/api/conversations/rooms', ['subject_type' => 'booking', 'subject_id' => $booking->id])
            ->assertOk()
            ->assertJsonPath('data.id', $salle->id)
            ->assertJsonPath('data.abilities.can_send_message', true);
        $this->assertSame($this->ids([$agent, $candidat]), $this->membresActifs($salle));
        $this->assertTrue($access->allows($agent, $salle->fresh()));
    }

    /** @return array<string, array{BookingStatus, bool}> */
    public static function statuts(): array
    {
        return [
            'pending' => [BookingStatus::Pending, true],
            'confirmed' => [BookingStatus::Confirmed, true],
            'completed' => [BookingStatus::Completed, true],
            'rejected' => [BookingStatus::Rejected, false],
            'cancelled' => [BookingStatus::Cancelled, false],
            'expired' => [BookingStatus::Expired, false],
        ];
    }

    #[DataProvider('statuts')]
    public function test_une_reservation_close_sans_avoir_eu_lieu_se_lit_et_ne_s_ecrit_plus(BookingStatus $statut, bool $ecriture): void
    {
        ['booking' => $booking, 'candidat' => $candidat] = $this->sceneDeLaReservation();
        $booking->forceFill(['status' => $statut])->save();
        $salle = $this->salleDe($booking);
        $access = app(ConversationAccess::class);

        $this->assertTrue($access->allows($candidat, $salle->fresh()));
        $this->assertSame($ecriture, $access->allowsWriting($candidat, $salle->fresh()));
    }

    public function test_une_reservation_supprimee_rend_sa_salle_illisible(): void
    {
        ['booking' => $booking, 'candidat' => $candidat] = $this->sceneDeLaReservation();
        $salle = $this->salleDe($booking);

        $booking->delete();

        $this->assertFalse(app(ConversationAccess::class)->allows($candidat, $salle->fresh()));
        $this->assertSame([], app(ConversationAccess::class)->participatingQuery($candidat)->pluck('id')->all());
    }

    public function test_la_liste_montre_la_salle_au_candidat_et_au_contact(): void
    {
        ['booking' => $booking, 'owner' => $owner, 'candidat' => $candidat] = $this->sceneDeLaReservation();
        $salle = $this->salleDe($booking);

        foreach ([$owner, $candidat] as $membre) {
            $this->actingAsApi($membre);
            $this->assertContains($salle->id, collect($this->apiGet('/api/conversations')->assertOk()->json('data'))->pluck('id')->all());
        }
    }
}
