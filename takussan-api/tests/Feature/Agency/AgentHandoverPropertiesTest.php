<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Enums\CollaboratorRole;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Property\PrimaryAgentDesignator;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-603 AC5 (part « biens » d'AC12 de TCK-591, ADR-0036, ADR-0059 §3) — la passation transmet les
 * biens du partant : la MARQUE d'agent responsable passe au repreneur sans toucher au propriétaire
 * (`responsible_properties`), et seuls les biens qu'il a saisis changent de titulaire
 * (`held_properties`).
 */
class AgentHandoverPropertiesTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $leaver;

    private User $successor;

    private User $b;

    /** Le bien du bailleur B, dont le partant est l'agent responsable. */
    private Property $deB;

    /** Le bien saisi par le partant (`user_id` = lui). */
    private Property $saisi;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();

        $this->agency = $this->agence();
        $this->admin = $this->personnel($this->agency, 'agency_admin', attributes: [
            'two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);
        $this->leaver = $this->personnel($this->agency);
        $this->successor = $this->personnel($this->agency);
        $this->b = $this->bailleur($this->agency);

        $this->deB = $this->bienDe($this->agency, $this->b);
        app(PrimaryAgentDesignator::class)->designate($this->deB, $this->collaborateur($this->deB, $this->leaver), $this->admin);
        $this->saisi = $this->bienDe($this->agency, $this->leaver);
    }

    private function url(string $suffix, ?User $member = null): string
    {
        $member ??= $this->leaver;

        return "/api/agencies/{$this->agency->id}/members/{$member->id}/{$suffix}";
    }

    private function contactDe(Property $property): ?int
    {
        return PrimaryPropertyContact::for($property->fresh()->load(PrimaryPropertyContact::eagerLoads()))?->id;
    }

    public function test_les_biens_sont_comptes_et_transmissibles(): void
    {
        $this->actingAsApi($this->admin)->apiGet($this->url('portfolio'))->assertOk()
            ->assertJsonPath('data.portfolio.responsible_properties', 1)
            ->assertJsonPath('data.portfolio.held_properties', 1)
            ->assertJsonPath('data.portfolio.collaborations', 1)
            ->assertJsonPath('data.pending', [])
            ->assertJsonPath('data.transferable', [
                'tasks', 'visits', 'maintenance', 'responsible_properties', 'held_properties', 'collaborations', 'customers',
            ]);
    }

    /** AC5 — le bien de B change d'agent responsable, B en reste propriétaire ; le bien saisi change de titulaire. */
    public function test_la_passation_transmet_la_marque_et_le_bien_saisi_sans_deposseder_le_bailleur(): void
    {
        $this->actingAsApi($this->admin)->apiPost($this->url('handover'), [
            'successor_id' => $this->successor->id,
            'remove_after' => true,
        ])->assertOk()
            ->assertJsonPath('data.removed', true)
            ->assertJsonPath('data.moved.responsible_properties', 1)
            ->assertJsonPath('data.moved.held_properties', 1)
            ->assertJsonPath('data.portfolio.responsible_properties', 0)
            ->assertJsonPath('data.portfolio.held_properties', 0);

        $this->assertSame($this->successor->id, $this->contactDe($this->deB));
        $this->assertSame($this->b->id, (int) $this->deB->fresh()->user_id);
        $this->assertSame($this->successor->id, (int) $this->saisi->fresh()->user_id);
        $this->assertSame(0, PropertyCollaborator::query()->where('user_id', $this->leaver->id)->count());

        $journal = Activity::query()->where('log_name', 'AgentHandover')->get()->keyBy('event');
        $this->assertSame([$this->deB->id], $journal['responsible_properties']->properties['ids']);
        $this->assertSame([$this->saisi->id], $journal['held_properties']->properties['ids']);
        $this->assertArrayHasKey('collaborations', $journal->all());

        // ADR-0059 §4 — aucune écriture de `user_id` ne porte la signature que lit la réparation.
        $this->assertSame(0, Activity::query()->where('log_name', 'Property')->where('event', 'updated')
            ->whereRaw("attribute_changes->'attributes'->>'user_id' IS NOT NULL")->count());
    }

    /** AC5 — une erreur injectée à mi-parcours (après les biens, sur les collaborations) ne déplace rien. */
    public function test_une_panne_a_mi_parcours_ne_deplace_aucun_bien(): void
    {
        DB::listen(function ($query) {
            if (str_starts_with($query->sql, 'delete from "property_collaborators"')
                || str_starts_with($query->sql, 'update "property_collaborators" set "user_id"')) {
                throw new \RuntimeException('panne injectée');
            }
        });

        $this->withoutExceptionHandling();
        try {
            $this->actingAsApi($this->admin)->apiPost($this->url('handover'), ['successor_id' => $this->successor->id]);
            $this->fail('La panne injectée aurait dû remonter.');
        } catch (\RuntimeException $e) {
            $this->assertSame('panne injectée', $e->getMessage());
        }

        $this->assertSame($this->leaver->id, $this->contactDe($this->deB));
        $this->assertSame($this->leaver->id, (int) $this->saisi->fresh()->user_id);
        $this->assertSame(0, Activity::query()->where('log_name', 'AgentHandover')->count());
        $this->assertDatabaseMissing('property_collaborators', ['user_id' => $this->successor->id]);
    }

    /** ADR-0053 « Conséquences » — le repreneur collabore déjà : la marque passe à SA ligne avant que celle du partant ne parte. */
    public function test_la_collision_transmet_la_marque_au_lieu_de_la_laisser_tomber(): void
    {
        $premier = $this->personnel($this->agency);
        // Un agent invité AVANT le partant : sans la reprise, le repli le désignerait.
        $this->collaborateur($this->deB, $premier, '2025-01-01 09:00:00');
        PropertyCollaborator::query()->create([
            'property_id' => $this->deB->id, 'user_id' => $this->successor->id, 'role' => CollaboratorRole::Viewer, 'invited_at' => now(),
        ]);

        // Seules les collaborations ont un repreneur : la marque n'a pas été transmise avant.
        $this->actingAsApi($this->admin)->apiPost($this->url('handover'), [
            'successors' => ['collaborations' => $this->successor->id],
            'leave_unassigned' => true,
        ])->assertOk()->assertJsonPath('data.moved.collaborations', 1);

        $this->assertSame($this->successor->id, $this->contactDe($this->deB));
        $this->assertDatabaseHas('property_collaborators', [
            'property_id' => $this->deB->id, 'user_id' => $this->successor->id, 'role' => 'agent', 'is_primary' => true,
        ]);
        $this->assertDatabaseMissing('property_collaborators', ['property_id' => $this->deB->id, 'user_id' => $this->leaver->id]);
        $this->assertSame($this->b->id, (int) $this->deB->fresh()->user_id);
    }

    /** ADR-0036 question 2 — jamais d'un bailleur, jamais vers un bailleur. */
    public function test_les_biens_d_un_bailleur_ne_changent_jamais_de_titulaire(): void
    {
        // Le partant est aussi bailleur de l'agence : son bien n'est pas « saisi pour l'agence ».
        OwnerProfile::factory()->create(['user_id' => $this->leaver->id, 'agency_id' => $this->agency->id]);
        $this->actingAsApi($this->admin)->apiGet($this->url('portfolio'))
            ->assertJsonPath('data.portfolio.held_properties', 0);
        $this->actingAsApi($this->admin)->apiPost($this->url('handover'), ['successor_id' => $this->successor->id])
            ->assertOk();
        $this->assertSame($this->leaver->id, (int) $this->saisi->fresh()->user_id);
        $this->assertSame($this->successor->id, $this->contactDe($this->deB));

        // Un repreneur bailleur de l'agence ne reçoit pas le bien saisi : désassigné, compté.
        $autre = $this->personnel($this->agency);
        $saisiParAutre = $this->bienDe($this->agency, $autre);
        $repreneurBailleur = $this->personnel($this->agency);
        OwnerProfile::factory()->create(['user_id' => $repreneurBailleur->id, 'agency_id' => $this->agency->id]);
        $this->actingAsApi($this->admin)->apiPost($this->url('handover', $autre), [
            'successor_id' => $repreneurBailleur->id, 'leave_unassigned' => true,
        ])->assertOk()->assertJsonPath('data.unassigned.held_properties', 1);
        $this->assertSame($autre->id, (int) $saisiParAutre->fresh()->user_id);
    }

    /** Un bien de B dont le partant n'est QUE collaborateur non marqué n'entre pas dans `responsible_properties`. */
    public function test_un_bien_sans_la_marque_du_partant_n_est_pas_un_bien_dont_il_est_responsable(): void
    {
        $autreBien = $this->bienDe($this->agency, $this->b);
        $marque = $this->personnel($this->agency);
        app(PrimaryAgentDesignator::class)->designate($autreBien, $this->collaborateur($autreBien, $marque), $this->admin);
        $this->collaborateur($autreBien, $this->leaver, '2025-01-01 09:00:00');

        $this->actingAsApi($this->admin)->apiGet($this->url('portfolio'))
            ->assertJsonPath('data.portfolio.responsible_properties', 1)
            ->assertJsonPath('data.portfolio.collaborations', 2);

        $this->actingAsApi($this->admin)->apiPost($this->url('handover'), ['successor_id' => $this->successor->id])->assertOk();
        $this->assertSame($marque->id, $this->contactDe($autreBien));
    }
}
