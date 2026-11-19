<?php

namespace Tests\Feature\TempsReel;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Listeners\Maintenance\SyncMaintenanceConversation;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\Lease;
use App\Models\Message;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Messaging\GroupConversationService;
use App\Services\Messaging\PropertyConversationResolver;
use App\Services\Messaging\SystemMessageFactory;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\FauxTransport;
use App\Support\TempsReel\SignalTempsReel;
use App\Support\TempsReel\TempsReel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2955 (ADR-0129 § 2) — la messagerie en direct, côté API : qui émet quoi, sur quel canal, pour qui.
 *
 * - `message.created` / `message.updated` sur le fil, par `EmetDesSignaux` sur `Message` : les trois écrivains
 *   émettent sans y penser ; `boite.updated` aux participants ACTIFS, en un seul envoi.
 * - `participants.updated` sur le fil, par `EmetDesSignaux` sur le pivot, sur un changement de COMPOSITION
 *   seulement (création, suppression, `left_at`, `role`) ; `boite.updated` à la personne concernée.
 * - `conversation.read` et `boite.updated` au lecteur, par `markAsRead` et `markAsUnread`.
 *
 * Le faux transport est posé APRÈS les fixtures : un `attach()` émet désormais.
 */
class MessagerieEnDirectTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** @param list<User> $actifs */
    private function fil(ConversationType $type, array $actifs, array $partis = []): Conversation
    {
        $fil = Conversation::create([
            'type' => $type->value,
            'status' => ConversationStatus::Active->value,
            'subject' => $type === ConversationType::Group ? 'Groupe' : null,
            'created_by' => $actifs[0]->id,
        ]);
        foreach ($actifs as $i => $user) {
            $fil->participants()->attach($user->id, [
                'role' => $i === 0 && $type === ConversationType::Group ? ParticipantRole::Admin->value : ParticipantRole::Member->value,
                'joined_at' => now()->subDay(),
            ]);
        }
        foreach ($partis as $user) {
            $fil->participants()->attach($user->id, [
                'role' => ParticipantRole::Member->value,
                'joined_at' => now()->subDays(2),
                'left_at' => now()->subDay(),
            ]);
        }

        return $fil;
    }

    /** @return list<SignalTempsReel> */
    private function envoisDe(FauxTransport $faux, CodeDeSignal $code): array
    {
        return array_values(array_filter($faux->envois(), fn (SignalTempsReel $s): bool => $s->code === $code));
    }

    /** @return list<string> les canaux de l'unique envoi de `$code`, triés */
    private function canauxDeLUniqueEnvoi(FauxTransport $faux, CodeDeSignal $code): array
    {
        $envois = $this->envoisDe($faux, $code);
        $this->assertCount(1, $envois, "un seul envoi de {$code->value}");
        $canaux = $envois[0]->canaux;
        sort($canaux);

        return $canaux;
    }

    /** @param list<User> $users */
    private function canauxPersonnels(array $users): array
    {
        $canaux = array_map(fn (User $u): string => "utilisateur.{$u->id}", $users);
        sort($canaux);

        return $canaux;
    }

    // ── AC1 — les trois écrivains émettent ────────────────────────────────────────────────────────

    public function test_ac1_un_message_ecrit_par_conversation_writer_emet_message_created_sur_le_fil(): void
    {
        [$a, $b] = User::factory()->count(2)->create()->all();
        $fil = $this->fil(ConversationType::Direct, [$a, $b]);
        TempsReel::fake();

        Sanctum::actingAs($a);
        $this->postJson("/api/conversations/{$fil->id}/messages", ['content' => 'Bonjour'])->assertCreated();

        TempsReel::assertSignale(CodeDeSignal::MessageCreated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
    }

    public function test_ac1_un_message_du_contact_public_d_une_annonce_emet_message_created_sur_le_fil(): void
    {
        $property = Property::factory()->published()->create(['user_id' => User::factory()->create()->id]);
        $faux = TempsReel::fake();

        Sanctum::actingAs(User::factory()->create());
        $id = $this->postJson("/api/public/properties/{$property->slug}/contact-message", ['message' => 'Ce bien est-il libre ?'])
            ->assertCreated()
            ->json('data.conversation_id');

        TempsReel::assertSignale(CodeDeSignal::MessageCreated, "sujet.conversation.{$id}", "conversation:{$id}", 1);
        $this->assertNotEmpty($this->envoisDe($faux, CodeDeSignal::BoiteUpdated));
    }

    public function test_ac1_un_avis_systeme_emet_message_created_sur_le_fil(): void
    {
        [$a, $b] = User::factory()->count(2)->create()->all();
        $fil = $this->fil(ConversationType::Group, [$a, $b]);
        TempsReel::fake();

        app(SystemMessageFactory::class)->renamed($fil, $a, 'Groupe', 'Le groupe');

        TempsReel::assertSignale(CodeDeSignal::MessageCreated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
    }

    public function test_un_message_modifie_ou_supprime_emet_message_updated_sur_le_fil(): void
    {
        [$a, $b] = User::factory()->count(2)->create()->all();
        $fil = $this->fil(ConversationType::Direct, [$a, $b]);
        $message = Message::create(['conversation_id' => $fil->id, 'sender_id' => $a->id, 'content' => 'Bonjour', 'type' => MessageType::Text->value]);
        $faux = TempsReel::fake();

        $message->update(['content' => 'Bonsoir']);

        TempsReel::assertSignale(CodeDeSignal::MessageUpdated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
        $this->assertSame($this->canauxPersonnels([$a, $b]), $this->canauxDeLUniqueEnvoi($faux, CodeDeSignal::BoiteUpdated));

        $faux = TempsReel::fake();
        $message->delete();

        TempsReel::assertSignale(CodeDeSignal::MessageUpdated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
        $this->assertCount(2, $faux->envois());
    }

    // ── AC2 — les bons destinataires, pas un de plus ─────────────────────────────────────────────

    public function test_ac2_boite_updated_atteint_exactement_les_participants_actifs(): void
    {
        [$a, $b, $c, $parti] = User::factory()->count(4)->create()->all();
        $fil = $this->fil(ConversationType::Group, [$a, $b, $c], [$parti]);
        $faux = TempsReel::fake();

        Sanctum::actingAs($a);
        $this->postJson("/api/conversations/{$fil->id}/messages", ['content' => 'Bonjour'])->assertCreated();

        $this->assertSame($this->canauxPersonnels([$a, $b, $c]), $this->canauxDeLUniqueEnvoi($faux, CodeDeSignal::BoiteUpdated));
        $this->assertSame("conversation:{$fil->id}", $this->envoisDe($faux, CodeDeSignal::BoiteUpdated)[0]->sujet);
        foreach ($faux->envois() as $envoi) {
            $this->assertNotContains("utilisateur.{$parti->id}", $envoi->canaux, 'un ancien participant ne reçoit rien');
        }
    }

    public function test_ac2_un_participant_retire_avant_le_message_n_est_plus_destinataire(): void
    {
        [$admin, $b, $c] = User::factory()->count(3)->create()->all();
        $fil = $this->fil(ConversationType::Group, [$admin, $b, $c]);
        app(GroupConversationService::class)->removeParticipant($fil, $admin, $c);
        $faux = TempsReel::fake();

        Sanctum::actingAs($b);
        $this->postJson("/api/conversations/{$fil->id}/messages", ['content' => 'Après son départ'])->assertCreated();

        $this->assertSame($this->canauxPersonnels([$admin, $b]), $this->canauxDeLUniqueEnvoi($faux, CodeDeSignal::BoiteUpdated));
    }

    // ── AC3 — un appel pour un groupe ────────────────────────────────────────────────────────────

    public function test_ac3_un_groupe_de_30_participants_produit_un_seul_envoi_vers_30_canaux(): void
    {
        $membres = User::factory()->count(30)->create()->all();
        $fil = $this->fil(ConversationType::Group, $membres);
        $faux = TempsReel::fake();

        Sanctum::actingAs($membres[0]);
        $this->postJson("/api/conversations/{$fil->id}/messages", ['content' => 'À tous'])->assertCreated();

        $this->assertSame($this->canauxPersonnels($membres), $this->canauxDeLUniqueEnvoi($faux, CodeDeSignal::BoiteUpdated));
        $this->assertCount(30, $this->envoisDe($faux, CodeDeSignal::BoiteUpdated)[0]->canaux);
    }

    // ── AC4 / AC4 bis — la lecture ───────────────────────────────────────────────────────────────

    public function test_ac4_bis_marquer_lu_emet_exactement_conversation_read_et_boite_updated_au_seul_lecteur(): void
    {
        [$a, $b] = User::factory()->count(2)->create()->all();
        $fil = $this->fil(ConversationType::Direct, [$a, $b]);
        Message::create(['conversation_id' => $fil->id, 'sender_id' => $a->id, 'content' => 'Bonjour', 'type' => MessageType::Text->value]);
        $faux = TempsReel::fake();

        Sanctum::actingAs($b);
        $this->putJson("/api/conversations/{$fil->id}/read")->assertOk();

        TempsReel::assertSignale(CodeDeSignal::ConversationRead, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$b->id}", "conversation:{$fil->id}", 1);
        $this->assertSame(["utilisateur.{$b->id}"], $this->canauxDeLUniqueEnvoi($faux, CodeDeSignal::BoiteUpdated));
        $this->assertSame([], $this->envoisDe($faux, CodeDeSignal::ParticipantsUpdated), 'une lecture ne change pas la composition');
        $this->assertCount(2, $faux->envois(), 'tous les signaux du faux : exactement deux');
    }

    public function test_ac4_marquer_non_lu_emet_conversation_read_et_boite_updated_au_lecteur(): void
    {
        [$a, $b] = User::factory()->count(2)->create()->all();
        $fil = $this->fil(ConversationType::Direct, [$a, $b]);
        Message::create(['conversation_id' => $fil->id, 'sender_id' => $a->id, 'content' => 'Bonjour', 'type' => MessageType::Text->value]);
        $fil->participants()->updateExistingPivot($b->id, ['last_read_at' => now()->addMinute()]);
        $faux = TempsReel::fake();

        Sanctum::actingAs($b);
        $this->putJson("/api/conversations/{$fil->id}/unread")->assertOk();

        TempsReel::assertSignale(CodeDeSignal::ConversationRead, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
        $this->assertSame(["utilisateur.{$b->id}"], $this->canauxDeLUniqueEnvoi($faux, CodeDeSignal::BoiteUpdated));
        $this->assertCount(2, $faux->envois());
    }

    public function test_marquer_non_lu_sans_rien_changer_n_emet_rien(): void
    {
        [$a, $b] = User::factory()->count(2)->create()->all();
        $fil = $this->fil(ConversationType::Direct, [$a, $b]);
        TempsReel::fake();

        Sanctum::actingAs($b);
        $this->putJson("/api/conversations/{$fil->id}/unread")->assertOk();

        TempsReel::assertRienSignale();
    }

    public function test_archiver_ou_mettre_en_sourdine_ne_change_pas_la_composition(): void
    {
        [$a, $b] = User::factory()->count(2)->create()->all();
        $fil = $this->fil(ConversationType::Group, [$a, $b]);
        TempsReel::fake();

        Sanctum::actingAs($b);
        $this->putJson("/api/conversations/{$fil->id}/archive")->assertOk();
        $this->putJson("/api/conversations/{$fil->id}/mute", ['is_muted' => true])->assertOk();

        TempsReel::assertRienSignale();
    }

    // ── AC4 — les participants, par la route ─────────────────────────────────────────────────────

    public function test_ac4_ajouter_un_participant_par_la_route_emet_participants_updated_et_sa_boite(): void
    {
        [$admin, $b, $nouveau] = User::factory()->count(3)->create()->all();
        $fil = $this->fil(ConversationType::Group, [$admin, $b]);
        // `AddParticipantsRequest` : une relation existante entre l'acteur et la personne ajoutée.
        $this->fil(ConversationType::Direct, [$admin, $nouveau]);
        $faux = TempsReel::fake();

        Sanctum::actingAs($admin);
        $this->postJson("/api/conversations/{$fil->id}/participants", ['user_ids' => [$nouveau->id]])->assertCreated();

        TempsReel::assertSignale(CodeDeSignal::ParticipantsUpdated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$nouveau->id}", "conversation:{$fil->id}");
        $this->assertNotEmpty($faux->envois());
    }

    public function test_ac4_retirer_un_participant_par_la_route_emet_participants_updated_et_sa_boite(): void
    {
        [$admin, $b, $c] = User::factory()->count(3)->create()->all();
        $fil = $this->fil(ConversationType::Group, [$admin, $b, $c]);
        $faux = TempsReel::fake();

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/conversations/{$fil->id}/participants/{$c->id}")->assertSuccessful();

        TempsReel::assertSignale(CodeDeSignal::ParticipantsUpdated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$c->id}", "conversation:{$fil->id}", 1);
        // L'avis « retiré » qui suit ne va plus qu'aux actifs.
        $avis = array_values(array_filter(
            $this->envoisDe($faux, CodeDeSignal::BoiteUpdated),
            fn (SignalTempsReel $s): bool => count($s->canaux) > 1,
        ));
        $this->assertCount(1, $avis);
        $canaux = $avis[0]->canaux;
        sort($canaux);
        $this->assertSame($this->canauxPersonnels([$admin, $b]), $canaux);
    }

    public function test_ac4_changer_le_role_par_la_route_emet_participants_updated(): void
    {
        [$admin, $b] = User::factory()->count(2)->create()->all();
        $fil = $this->fil(ConversationType::Group, [$admin, $b]);
        TempsReel::fake();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/conversations/{$fil->id}/participants/{$b->id}", ['role' => ParticipantRole::Admin->value])->assertOk();

        TempsReel::assertSignale(CodeDeSignal::ParticipantsUpdated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
    }

    // ── AC4 — les participants, par une synchronisation ──────────────────────────────────────────

    public function test_ac4_la_reassignation_d_une_intervention_emet_participants_updated(): void
    {
        ['agency' => $agency, 'landlord' => $landlord, 'provider' => $ancien, 'mr' => $mr] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        $sync = app(SyncMaintenanceConversation::class);
        $sync->handle(new MaintenanceStatusChanged($mr, MaintenanceStatus::Open, MaintenanceStatus::Assigned, $landlord, MaintenanceStatusChanged::CAUSE_ASSIGNED));
        $fil = $mr->conversation()->firstOrFail();

        $nouveau = $this->providerFor($agency);
        Event::fake([MaintenanceStatusChanged::class]);
        $mr->forceFill(['assigned_to' => $nouveau->id])->save();
        $faux = TempsReel::fake();

        $sync->handle(new MaintenanceStatusChanged(
            $mr->fresh(), MaintenanceStatus::Assigned, MaintenanceStatus::Assigned, $landlord,
            MaintenanceStatusChanged::CAUSE_ASSIGNED, ['previous_assignee_id' => $ancien->id],
        ));

        TempsReel::assertSignale(CodeDeSignal::ParticipantsUpdated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$ancien->id}", "conversation:{$fil->id}");
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$nouveau->id}", "conversation:{$fil->id}");
        $this->assertNotEmpty($faux->envois());
    }

    public function test_ac4_le_retrait_d_un_membre_d_agence_emet_participants_updated_sur_le_fil_du_bail(): void
    {
        ['agency' => $agency, 'property' => $property, 'tenant' => $tenant] = $this->maintenanceScenario();
        $lease = Lease::query()->where('property_id', $property->id)->sole();
        $lease->forceFill(['agency_id' => $agency->id])->save();
        $agent = $this->agentOf($agency);
        $fil = $this->fil(ConversationType::Group, [$agent, $tenant]);
        $fil->forceFill(['lease_id' => $lease->id])->save();
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        TempsReel::fake();

        app(AgencyMemberRemovalService::class)->remove($agency, $agent, $admin, leaveUnassigned: true);

        TempsReel::assertSignale(CodeDeSignal::ParticipantsUpdated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$agent->id}", "conversation:{$fil->id}", 1);
    }

    public function test_le_retour_d_un_ancien_membre_reinvite_emet_participants_updated(): void
    {
        [$admin, $b, $revenant] = User::factory()->count(3)->create()->all();
        $fil = $this->fil(ConversationType::Group, [$admin, $b], [$revenant]);
        TempsReel::fake();

        app(GroupConversationService::class)->addParticipants($fil, $admin, [$revenant->id]);

        TempsReel::assertSignale(CodeDeSignal::ParticipantsUpdated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$revenant->id}", "conversation:{$fil->id}");
        $this->assertNull(ConversationParticipant::query()->where('conversation_id', $fil->id)->where('user_id', $revenant->id)->value('left_at'));
    }

    public function test_la_transmission_d_un_fil_de_prospect_emet_participants_updated(): void
    {
        [$prospect, $ancien, $nouveau] = User::factory()->count(3)->create()->all();
        $fil = $this->fil(ConversationType::Direct, [$prospect, $ancien]);
        TempsReel::fake();

        app(PropertyConversationResolver::class)->transmit($fil, $nouveau);

        TempsReel::assertSignale(CodeDeSignal::ParticipantsUpdated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$nouveau->id}", "conversation:{$fil->id}", 1);
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$ancien->id}", "conversation:{$fil->id}", 1);
        $this->assertNotNull(ConversationParticipant::query()->where('conversation_id', $fil->id)->where('user_id', $ancien->id)->value('left_at'));
    }
}
