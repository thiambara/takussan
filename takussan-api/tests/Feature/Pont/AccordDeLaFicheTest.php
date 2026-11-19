<?php

namespace Tests\Feature\Pont;

use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\MessageRelay;
use App\Models\User;
use App\Services\Messaging\SallesDuFil;
use App\Services\Pont\EtatDAccord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\Pont\FauxCanal;
use Tests\Support\SceneDuPont;

/**
 * TCK-2981 (ADR-0132 § 2, décision du porteur du 2026-11-19) — le locataire SANS COMPTE rejoint la salle de son bail
 * par l'accord à l'invitation, et par rien d'autre ; un numéro porté par un autre compte ne crée rien (AC6).
 */
class AccordDeLaFicheTest extends ApiTestCase
{
    use RefreshDatabase;
    use SceneDuPont;

    private const TEL_FICHE = '+221776660000';

    private Customer $fiche;

    private Conversation $salle;

    protected function setUp(): void
    {
        parent::setUp();
        FauxCanal::remettreAZero();
        $this->monterLePont();
        config()->set('messagerie.canaux.'.FauxCanal::NOM, ['actif' => true, 'pilote' => FauxCanal::class]);
        config()->set('messagerie.repli', [FauxCanal::NOM, 'sms']);
        FauxCanal::$numeros = ['FAUX-A' => $this->agence->id];
        FauxCanal::$boutons = true;

        $this->fiche = Customer::factory()->create(['agency_id' => $this->agence->id, 'user_id' => null, 'phone' => self::TEL_FICHE, 'first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $bail = Lease::factory()->create([
            'property_id' => $this->bien->id,
            'agency_id' => $this->agence->id,
            'landlord_id' => $this->bailleur->id,
            'agent_id' => $this->auteur->id,
            'tenant_id' => $this->fiche->id,
            'status' => LeaseStatus::Active,
        ]);
        $salle = app(SallesDuFil::class)->ouvrir($bail);
        $this->assertNotNull($salle);
        $this->salle = $salle;
    }

    private function inviterLaFiche(?int $fiche = null): TestResponse
    {
        Sanctum::actingAs($this->auteur);

        return $this->postJson('/api/conversations/'.$this->salle->id.'/pont/invitations', ['customer_id' => $fiche ?? $this->fiche->id]);
    }

    /** @param  array<string, string>  $message */
    private function entrant(array $message): void
    {
        $this->withHeaders(['X-Faux-Signature' => 'ok'])->postJson('/api/webhooks/messagerie/faux/'.FauxCanal::JETON, [
            'messages' => [['de' => self::TEL_FICHE, 'vers' => 'FAUX-A', 'id' => 'faux-in-'.uniqid()] + $message],
        ])->assertOk();
    }

    private function accepter(): void
    {
        $invitation = MessageRelay::query()->where('purpose', MessageRelay::PURPOSE_INVITATION)->where('customer_id', $this->fiche->id)->latest('id')->firstOrFail();
        $this->entrant(['bouton' => 'pont-invitation:'.$invitation->id]);
    }

    public function test_l_accord_de_la_fiche_en_fait_un_membre_de_sa_salle(): void
    {
        $this->inviterLaFiche()->assertCreated();
        $this->assertCount(1, FauxCanal::$envois);
        $this->assertSame(self::TEL_FICHE, FauxCanal::$envois[0]['telephone']);

        $this->accepter();

        $compte = User::query()->where('phone', self::TEL_FICHE)->sole();
        $this->assertNotNull($compte->phone_verified_at);
        $this->assertNull($compte->password_set_at);
        $this->assertSame($compte->id, (int) $this->fiche->fresh()->user_id);
        $this->assertTrue($this->salle->participants()->where('users.id', $compte->id)->wherePivotNull('left_at')->exists());
        $this->assertSame(EtatDAccord::Accorde, FauxCanal::$accords[self::TEL_FICHE]);
        $this->assertDatabaseHas('messages', ['conversation_id' => $this->salle->id, 'content' => 'pont.accord', 'visibility' => 'team']);
    }

    public function test_un_message_libre_du_numero_de_la_fiche_ne_cree_aucun_compte(): void
    {
        $this->inviterLaFiche()->assertCreated();

        $this->entrant(['texte' => 'Bonjour, oui']);
        $this->entrant(['bouton' => 'pont-invitation:999999']);

        $this->assertFalse(User::query()->where('phone', self::TEL_FICHE)->exists());
        $this->assertNull($this->fiche->fresh()->user_id);
    }

    public function test_un_numero_porte_par_un_autre_compte_ne_cree_rien(): void
    {
        $this->inviterLaFiche()->assertCreated();
        // Un compte prend ce numéro entre l'invitation et l'accord, SANS le vérifier.
        $autre = User::factory()->create(['phone' => self::TEL_FICHE, 'phone_verified_at' => null]);

        $this->accepter();

        $this->assertSame(1, User::query()->where('phone', self::TEL_FICHE)->count());
        $this->assertNull($this->fiche->fresh()->user_id);
        $this->assertNotSame(EtatDAccord::Accorde, FauxCanal::$accords[self::TEL_FICHE] ?? EtatDAccord::Inconnu);
        $this->assertFalse($this->salle->participants()->where('users.id', $autre->id)->exists());
        $this->assertDatabaseHas('messages', ['conversation_id' => $this->salle->id, 'content' => 'pont.numero_deja_a_un_compte', 'visibility' => 'team']);

        // Et l'invitation elle-même est refusée quand le numéro est déjà porté.
        $this->inviterLaFiche()->assertStatus(422)->assertJsonPath('code', 'pont.numero_deja_a_un_compte');
    }

    public function test_une_fiche_hors_de_ce_bail_est_refusee(): void
    {
        $ailleurs = Customer::factory()->create(['agency_id' => $this->agence->id, 'user_id' => null, 'phone' => '+221776661111']);

        $this->inviterLaFiche($ailleurs->id)->assertStatus(422)->assertJsonPath('code', 'pont.customer_not_in_room');
        $this->assertSame([], FauxCanal::$envois);
    }
}
