<?php

namespace Tests\Feature\Messaging\Boite;

use App\Models\Conversation;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Messaging\FilDeLObjet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2967 (ADR-0128 § 7) — les deux règles du dépassement d'un geste attendu (`NonLus::gesteToujoursAttendu`),
 * sur le fil d'une intervention, lues comme le lecteur les lit : sa file, et `action_attendue`.
 *
 * (a) un événement postérieur du même objet qui attend D'AUTRES ne retire rien au lecteur (TCK-2961) ;
 * (b) un événement postérieur dont le code CLÔT le sien (`eteint` au catalogue) le retire à tous.
 *
 * Le locataire qui a payé (la règle (b) sur un loyer) : `FileDuFilTest::test_le_locataire_qui_a_paye_n_est_plus_attendu`.
 */
class CloturesDesGestesTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    private MaintenanceRequest $mr;

    private User $bailleur;

    private User $prestataire;

    private Conversation $fil;

    protected function setUp(): void
    {
        parent::setUp();
        ['mr' => $mr, 'landlord' => $this->bailleur, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $this->prestataire = $this->providerFor($agency);
        Sanctum::actingAs($this->bailleur);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $this->prestataire->id])->assertOk();
        $this->mr = $mr->refresh();
        $this->fil = $this->mr->conversation()->firstOrFail();
    }

    /** @param  list<User>  $pour */
    private function ecrire(string $code, array $pour): void
    {
        app(EvenementsDuFil::class)->ecrire($this->fil, $this->mr, $code, [], $pour);
    }

    /** @return array<string, bool> code → `action_attendue`, pour `$lecteur`, sur les événements de la demande */
    private function attendus(User $lecteur): array
    {
        Sanctum::actingAs($lecteur);

        return collect($this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()->json('data'))
            ->filter(fn (array $m) => ($m['metadata']['object']['id'] ?? null) === $this->mr->id && $m['metadata']['object']['type'] === 'maintenance_request')
            ->mapWithKeys(fn (array $m) => [$m['metadata']['code'] => $m['action_attendue']])
            ->all();
    }

    private function file(User $lecteur): string
    {
        Sanctum::actingAs($lecteur);

        return collect($this->getJson('/api/conversations')->assertOk()->json('data'))->firstWhere('id', $this->fil->id)['file'];
    }

    /**
     * Règle (a), le cas de TCK-2961 : le prestataire, attendu sur `slot_requested` (poser le créneau), le reste
     * quand un `quote_submitted` postérieur n'attend que qui décide du devis — `quote_submitted` ne clôt pas
     * `slot_requested`.
     */
    public function test_le_prestataire_reste_attendu_apres_un_devis_qui_attend_un_autre(): void
    {
        $this->ecrire('maintenance.slot_requested', [$this->prestataire]);
        $this->travel(1)->seconds();
        $this->ecrire('maintenance.quote_submitted', [$this->bailleur]);

        $this->assertTrue($this->attendus($this->prestataire)['maintenance.slot_requested']);
        $this->assertSame('vous', $this->file($this->prestataire));
        $this->assertTrue($this->attendus($this->bailleur)['maintenance.quote_submitted']);
    }

    /** Règle (b) : le devis approuvé clôt le devis soumis ; le bailleur n'est plus attendu, le créneau reste dû. */
    public function test_le_devis_approuve_clot_le_devis_soumis(): void
    {
        $this->ecrire('maintenance.slot_requested', [$this->prestataire]);
        $this->ecrire('maintenance.quote_submitted', [$this->bailleur]);
        $this->assertSame('vous', $this->file($this->bailleur));

        $this->travel(1)->seconds();
        $this->ecrire('maintenance.quote_approved', []);

        $this->assertFalse($this->attendus($this->bailleur)['maintenance.quote_submitted']);
        $this->assertNotSame('vous', $this->file($this->bailleur));
        $this->assertTrue($this->attendus($this->prestataire)['maintenance.slot_requested'], 'approuver le devis ne pose pas le créneau');
    }

    /**
     * L'intervention annulée écrit `maintenance.cancelled` (et non `maintenance.transition`, qui ne dit pas
     * l'annulation) : le devis et le créneau qui attendaient ne sont plus attendus de personne.
     */
    public function test_l_intervention_annulee_clot_tout_ce_qu_elle_attendait(): void
    {
        $this->ecrire('maintenance.slot_requested', [$this->prestataire]);
        $this->ecrire('maintenance.quote_submitted', [$this->bailleur]);
        $this->travel(1)->seconds();

        Sanctum::actingAs($this->bailleur);
        $this->putJson("/api/maintenance-requests/{$this->mr->id}/status", ['status' => 'cancelled', 'reason' => 'Doublon'])->assertOk();

        $annulation = $this->fil->messages()->latest('id')->firstOrFail();
        $this->assertSame('maintenance.cancelled', $annulation->metadata['code']);
        $this->assertSame('cancelled', $annulation->metadata['data']['status']);
        $this->assertFalse($this->attendus($this->bailleur)['maintenance.quote_submitted']);
        $this->assertFalse($this->attendus($this->prestataire)['maintenance.slot_requested']);
        $this->assertNotSame('vous', $this->file($this->bailleur));
        $this->assertNotSame('vous', $this->file($this->prestataire));
    }

    /**
     * Décision du porteur : un prestataire retiré (`unassigned`) ou qui refuse (`declined`) n'a plus de créneau
     * à poser, et son devis n'attend plus personne. Jugé chez le bailleur, qui reste au fil.
     *
     * @return array<string, array{0: string, 1: \Closure(self): void}>
     */
    public static function departsDuPrestataire(): array
    {
        return [
            'retiré' => ['maintenance.unassigned', function (self $t): void {
                Sanctum::actingAs($t->bailleur);
                $t->patchJson("/api/maintenance-requests/{$t->mr->id}", ['assigned_to' => null])->assertOk();
            }],
            'refuse' => ['maintenance.declined', function (self $t): void {
                Sanctum::actingAs($t->prestataire);
                $t->postJson("/api/maintenance-requests/{$t->mr->id}/decline", ['reason' => 'Indisponible'])->assertOk();
            }],
        ];
    }

    #[DataProvider('departsDuPrestataire')]
    public function test_le_prestataire_qui_part_clot_le_creneau_et_le_devis(string $code, \Closure $partir): void
    {
        $this->ecrire('maintenance.slot_requested', [$this->bailleur, $this->prestataire]);
        $this->ecrire('maintenance.quote_submitted', [$this->bailleur]);
        $this->assertSame('vous', $this->file($this->bailleur));
        $this->travel(1)->seconds();

        $partir($this);

        $this->assertSame($code, $this->fil->messages()->where('type', 'event')->latest('id')->firstOrFail()->metadata['code']);
        $attendus = $this->attendus($this->bailleur);
        $this->assertFalse($attendus['maintenance.slot_requested']);
        $this->assertFalse($attendus['maintenance.quote_submitted']);
        $this->assertNotSame('vous', $this->file($this->bailleur));
    }

    /** Le catalogue ne dit ce qui clôt un geste que pour les codes déclarés `attend` : les autres n'en portent pas. */
    public function test_un_code_qui_n_attend_rien_ne_porte_pas_de_geste(): void
    {
        $this->expectException(LogicException::class);

        $this->ecrire('maintenance.transition', [$this->bailleur]);
    }

    /** Refusé AVANT `afterCommit`, dont l'échec n'est que rapporté : l'événement ne se perd pas sans bruit. */
    public function test_parler_refuse_un_geste_sur_un_code_qui_n_attend_rien(): void
    {
        $this->expectException(LogicException::class);

        app(FilDeLObjet::class)->parler($this->mr, 'maintenance.slot_set', ['scheduled_at' => null], fn (User $partie): bool => true);
    }
}
