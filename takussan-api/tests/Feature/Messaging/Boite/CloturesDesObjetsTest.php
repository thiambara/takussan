<?php

namespace Tests\Feature\Messaging\Boite;

use App\Models\Conversation;
use App\Models\Inventory;
use App\Models\Message;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Inventory\InventorySignatureService;
use App\Services\Messaging\PropertyConversationResolver;
use App\Services\Messaging\SallesDuFil;
use App\Services\Model\InventoryService;
use App\Services\Visit\VisitSchedulingService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\ScenesDeSalles;

/**
 * TCK-2967 (ADR-0128 § 7) — les objets qui ne disaient pas la fin de ce qu'ils attendaient la disent :
 *
 * - l'état des lieux : à chaque signature, `inventory.signed_by_party` clôt l'attente du signataire et
 *   attend les parties qui doivent encore signer ; signé par tous, `inventory.signed` clôt tout ;
 * - la visite annulée : `visit.cancelled` clôt `visit.rescheduled`.
 *
 * Écrits par les chemins réels (signature, annulation), lus comme le lecteur les lit (`action_attendue`,
 * sa file). L'intervention annulée : `CloturesDesGestesTest`.
 */
class CloturesDesObjetsTest extends ApiTestCase
{
    use RefreshDatabase, ScenesDeSalles;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo=';

    /** @return array<string, bool> code → `action_attendue` pour `$lecteur`, sur les événements de `$objet` */
    private function attendus(User $lecteur, Conversation $fil, Model $objet): array
    {
        Sanctum::actingAs($lecteur);

        $attendus = collect($this->getJson("/api/conversations/{$fil->id}/messages")->assertOk()->json('data'))
            ->filter(fn (array $m) => ($m['metadata']['object']['id'] ?? null) === $objet->getKey())
            ->mapWithKeys(fn (array $m) => [$m['metadata']['code'] => $m['action_attendue']])
            ->all();
        ksort($attendus);

        return $attendus;
    }

    private function file(User $lecteur, Conversation $fil): string
    {
        Sanctum::actingAs($lecteur);

        return collect($this->getJson('/api/conversations?per_page=100')->assertOk()->json('data'))->firstWhere('id', $fil->id)['file'];
    }

    private function dernier(Conversation $fil, string $code): Message
    {
        return $fil->messages()->where('content', $code)->latest('id')->firstOrFail();
    }

    public function test_chaque_signature_clot_l_attente_du_signataire_et_garde_celle_des_autres(): void
    {
        $s = $this->sceneDuBail();
        $salle = app(SallesDuFil::class)->salleDe($s['lease']);
        $inventaire = Inventory::factory()->create([
            'lease_id' => $s['lease']->id,
            'property_id' => $s['property']->id,
            'tenant_id' => $s['customer']->id,
            'conducted_by' => $s['agent']->id,
        ]);
        app(InventoryService::class)->submit($inventaire);
        $this->assertSame('vous', $this->file($s['tenant'], $salle));
        $this->travel(1)->seconds();

        app(InventorySignatureService::class)->sign($inventaire->refresh(), $s['tenant'], 'tenant', self::SIGNATURE);

        $signe = $this->dernier($salle, 'inventory.signed_by_party');
        $this->assertSame(['type' => 'move_in', 'party' => 'tenant'], $signe->metadata['data']);
        $this->assertNotContains($s['tenant']->id, $signe->metadata['action_for']);
        $this->assertContains($s['landlord']->id, $signe->metadata['action_for']);
        $this->assertSame(['inventory.awaiting_signature' => false, 'inventory.signed_by_party' => false], $this->attendus($s['tenant'], $salle, $inventaire));
        $this->assertNotSame('vous', $this->file($s['tenant'], $salle), 'le locataire qui a signé n\'est plus attendu');
        $this->assertSame(['inventory.awaiting_signature' => false, 'inventory.signed_by_party' => true], $this->attendus($s['landlord'], $salle, $inventaire));
        $this->assertSame('vous', $this->file($s['landlord'], $salle), 'le bailleur doit encore signer');

        $this->travel(1)->seconds();
        app(InventorySignatureService::class)->sign($inventaire->refresh(), $s['landlord'], 'landlord', self::SIGNATURE);

        $this->assertSame([], $this->dernier($salle, 'inventory.signed')->metadata['action_for']);
        $this->assertNotContains(true, $this->attendus($s['landlord'], $salle, $inventaire));
        $this->assertNotSame('vous', $this->file($s['landlord'], $salle));
    }

    public function test_la_visite_annulee_clot_l_autre_moment_propose(): void
    {
        $proprietaire = User::factory()->create();
        $prospect = User::factory()->create();
        $bien = Property::factory()->create(['user_id' => $proprietaire->id, 'agency_id' => null]);
        $visite = PropertyVisit::factory()->create(['property_id' => $bien->id, 'visitor_id' => $prospect->id, 'scheduled_at' => now()->addDays(3)->setTime(11, 0)]);
        $fil = app(PropertyConversationResolver::class)->firstOrCreate($bien, $prospect, $proprietaire);
        app(VisitSchedulingService::class)->rescheduleOrFail($visite->refresh(), now()->addDays(6)->setTime(15, 0)->toImmutable());
        $this->assertTrue($this->attendus($proprietaire, $fil, $visite)['visit.rescheduled']);
        $this->travel(1)->seconds();

        app(VisitSchedulingService::class)->cancelOrFail($visite->refresh(), null);

        $this->assertSame([], $this->dernier($fil, 'visit.cancelled')->metadata['action_for']);
        $this->assertSame(['visit.cancelled' => false, 'visit.rescheduled' => false], $this->attendus($proprietaire, $fil, $visite));
        $this->assertNotSame('vous', $this->file($proprietaire, $fil));
    }
}
