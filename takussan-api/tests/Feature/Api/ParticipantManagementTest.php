<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-085 — Covers AC3 (admin add → 201 + system msg + notif),
 * AC4 (member add → 403), AC5 (last admin guard) and the leave/promote
 * flows.
 */
class ParticipantManagementTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Build a 3-person group: $admin (admin), $b, $c (members).
     * Returns [$admin, $b, $c, $conversation].
     */
    private function makeGroup(): array
    {
        $admin = User::factory()->create();
        $b = User::factory()->create();
        $c = User::factory()->create();

        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Test group',
            'created_by' => $admin->id,
        ]);

        $conversation->participants()->attach($admin->id, [
            'role' => ParticipantRole::Admin->value,
            'joined_at' => now(),
        ]);
        $conversation->participants()->attach($b->id, [
            'role' => ParticipantRole::Member->value,
            'joined_at' => now(),
        ]);
        $conversation->participants()->attach($c->id, [
            'role' => ParticipantRole::Member->value,
            'joined_at' => now(),
        ]);

        return [$admin, $b, $c, $conversation];
    }

    /**
     * Add a "shared past conversation" between $actor and $candidate so
     * the AddParticipantsRequest scope check passes (relation already
     * exists).
     */
    private function relate(User $actor, User $candidate): void
    {
        $past = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'past',
            'created_by' => $actor->id,
        ]);
        $past->participants()->attach($actor->id, ['joined_at' => now()]);
        $past->participants()->attach($candidate->id, ['joined_at' => now()]);
    }

    public function test_ac3_admin_can_add_participants_emits_system_message(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $newcomer = User::factory()->create();
        $this->relate($admin, $newcomer);

        Sanctum::actingAs($admin);

        $this->postJson("/api/conversations/{$conversation->id}/participants", [
            'user_ids' => [$newcomer->id],
        ])->assertCreated();

        // Newcomer is now a member with no left_at.
        $row = DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $newcomer->id)
            ->first();
        $this->assertNotNull($row);
        $this->assertSame(ParticipantRole::Member->value, $row->role);
        $this->assertNull($row->left_at);

        // A system message was emitted with `metadata.event = participant_added`.
        $systemMsg = DB::table('messages')
            ->where('conversation_id', $conversation->id)
            ->where('type', 'system')
            ->first();
        $this->assertNotNull($systemMsg);
        $this->assertNull($systemMsg->sender_id);
        $meta = json_decode($systemMsg->metadata, true);
        $this->assertSame('participant_added', $meta['event']);
        $this->assertSame($newcomer->id, $meta['target_id']);
    }

    public function test_ac4_member_cannot_add_participants(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $newcomer = User::factory()->create();
        $this->relate($b, $newcomer);

        Sanctum::actingAs($b);

        $this->postJson("/api/conversations/{$conversation->id}/participants", [
            'user_ids' => [$newcomer->id],
        ])->assertForbidden();

        $this->assertDatabaseMissing('conversation_participants', [
            'conversation_id' => $conversation->id,
            'user_id' => $newcomer->id,
        ]);
    }

    public function test_admin_can_remove_participant_with_system_message(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$b->id}")
            ->assertOk();

        $row = DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $b->id)
            ->first();
        $this->assertNotNull($row->left_at);

        $this->assertDatabaseHas('messages', [
            'conversation_id' => $conversation->id,
            'type' => 'system',
        ]);
    }

    public function test_member_cannot_remove_other_participant(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($b);
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$c->id}")
            ->assertForbidden();
    }

    public function test_member_can_leave_themselves(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($b);
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$b->id}")
            ->assertOk();

        $row = DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $b->id)
            ->first();
        $this->assertNotNull($row->left_at);
    }

    public function test_ac5_last_admin_cannot_leave(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$admin->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['role']);

        // Admin is still active.
        $row = DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $admin->id)
            ->first();
        $this->assertNull($row->left_at);
    }

    public function test_admin_can_promote_member_then_leave(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($admin);
        // Promote $b to admin
        $this->patchJson("/api/conversations/{$conversation->id}/participants/{$b->id}", [
            'role' => 'admin',
        ])->assertOk();

        $bRole = DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $b->id)
            ->value('role');
        $this->assertSame('admin', $bRole);

        // Now the original admin can leave.
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$admin->id}")
            ->assertOk();
    }

    public function test_member_cannot_promote(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($b);
        $this->patchJson("/api/conversations/{$conversation->id}/participants/{$c->id}", [
            'role' => 'admin',
        ])->assertForbidden();
    }

    public function test_admin_can_rename_group(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/conversations/{$conversation->id}", [
            'subject' => 'Nouveau nom',
        ])->assertOk();

        $this->assertDatabaseHas('conversations', [
            'id' => $conversation->id,
            'subject' => 'Nouveau nom',
        ]);

        // System message emitted
        $this->assertDatabaseHas('messages', [
            'conversation_id' => $conversation->id,
            'type' => 'system',
        ]);
    }

    public function test_member_cannot_rename(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($b);
        $this->patchJson("/api/conversations/{$conversation->id}", [
            'subject' => 'Hack',
        ])->assertForbidden();
    }

    public function test_ac7_left_participant_no_longer_appears_in_their_list(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($b);
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$b->id}")
            ->assertOk();

        // $b's conversations index should be empty (the only group they
        // were in is now left).
        $resp = $this->getJson('/api/conversations')->assertOk();
        $this->assertSame(0, $resp->json('meta.total'));
    }

    public function test_scope_check_blocks_unrelated_user(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        // Stranger has no relationship with admin and no shared agency.
        $stranger = User::factory()->create(['agency_id' => null]);

        Sanctum::actingAs($admin);
        // Admin themselves has no agency either.
        $admin->update(['agency_id' => null]);

        $this->postJson("/api/conversations/{$conversation->id}/participants", [
            'user_ids' => [$stranger->id],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_ids']);
    }

    // ---------------------------------------------------------------------------------------------
    // TCK-565 — la règle d'ajout lit `MessagingReach`, celle que liste le sélecteur du front.
    // ---------------------------------------------------------------------------------------------

    /** M13 — un compte introuvable : une phrase, pas « The selected user_ids.0 is invalid. ». */
    public function test_un_compte_introuvable_rend_une_seule_phrase_lisible(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $absent = (int) User::query()->max('id') + 1000;

        Sanctum::actingAs($admin);

        $resp = $this->postJson("/api/conversations/{$conversation->id}/participants", [
            'user_ids' => [$absent, $absent + 1],
        ], ['Accept-Language' => 'fr'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_ids']);

        $this->assertSame(__('messaging.errors.participants_unavailable', [], 'fr'), $resp->json('message'));
    }

    /** La règle propre à l'ajout survit : l'équipe de l'agence du bien de la conversation. */
    public function test_un_agent_de_l_agence_du_bien_peut_etre_ajoute_sans_autre_relation(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $agency = Agency::factory()->create();
        $conversation->update(['property_id' => Property::factory()->create(['agency_id' => $agency->id])->id]);
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);

        Sanctum::actingAs($admin);

        $this->postJson("/api/conversations/{$conversation->id}/participants", [
            'user_ids' => [$agent->id],
        ])->assertCreated();
    }

    /**
     * Resserrement délibéré (TCK-565) : l'ancienne règle comparait `agency_id` à `agency_id` et
     * laissait un propriétaire ajouter n'importe quel autre propriétaire de son agence — un client
     * de l'agence découvrant les autres. L'équipe, elle, reste joignable.
     */
    public function test_un_proprietaire_n_ajoute_pas_un_autre_client_de_son_agence(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $agency = Agency::factory()->create();
        $this->materializeRoleProfile($admin, 'owner', $agency);
        $autreProprietaire = User::factory()->create();
        $this->materializeRoleProfile($autreProprietaire, 'owner', $agency);
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);

        Sanctum::actingAs($admin);

        $this->postJson("/api/conversations/{$conversation->id}/participants", [
            'user_ids' => [$autreProprietaire->id],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_ids']);

        $this->postJson("/api/conversations/{$conversation->id}/participants", [
            'user_ids' => [$agent->id],
        ])->assertCreated();
    }

    /**
     * M13 — réparation 1 : `user_ids.*` portait encore `integer` et `distinct`, donc une erreur
     * par position (« user_ids.0 ») dès qu'un identifiant était mal formé ou répété.
     */
    public function test_des_identifiants_mal_formes_ou_repetes_rendent_une_seule_erreur(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $d = User::factory()->create();
        $this->relate($admin, $d);

        Sanctum::actingAs($admin);

        foreach ([
            [['abc', 'def'], 'participants_unavailable'],
            [[$d->id, $d->id], 'participants_duplicate'],
        ] as [$ids, $cle]) {
            $resp = $this->postJson("/api/conversations/{$conversation->id}/participants", [
                'user_ids' => $ids,
            ], ['Accept-Language' => 'fr'])->assertUnprocessable();

            $this->assertSame(['user_ids'], array_keys($resp->json('errors')), json_encode($ids));
            $this->assertSame(__("messaging.errors.{$cle}", [], 'fr'), $resp->json('message'));
        }
    }

    /**
     * La ré-invitation d'un ancien membre est un chemin du service (« Re-invite path ») ; la garde
     * l'interdisait en ne comptant pas la conversation en cours comme une relation, alors que le
     * sélecteur le proposait (relevé du vérificateur : LISTED-D yes, READD-D 422).
     */
    /**
     * TCK-565, passe finale — une liste vide recevait une phrase française écrite en dur dans
     * `AddParticipantsRequest::messages()`, quelle que soit la langue (relevé du vérificateur,
     * passe 3). Chaque langue doit rendre SA phrase, et les trois diffèrent.
     */
    public function test_une_liste_vide_rend_une_phrase_dans_la_langue_de_la_requete(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($admin);

        $phrases = [];
        foreach (['fr', 'en', 'wo'] as $langue) {
            foreach ([[], ['user_ids' => []]] as $corps) {
                $resp = $this->postJson("/api/conversations/{$conversation->id}/participants", $corps, ['Accept-Language' => $langue])
                    ->assertUnprocessable();

                $this->assertSame(['user_ids'], array_keys($resp->json('errors')));
                $this->assertSame(__('messaging.errors.participants_required', [], $langue), $resp->json('message'), $langue);
            }
            $phrases[] = __('messaging.errors.participants_required', [], $langue);
        }
        $this->assertCount(3, array_unique($phrases), 'une phrase par langue, pas une phrase recopiée');
    }

    public function test_un_ancien_membre_peut_etre_reinvite(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $c->id)
            ->update(['left_at' => now()]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/conversations/{$conversation->id}/participants", [
            'user_ids' => [$c->id],
        ])->assertCreated();

        $this->assertNull(DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $c->id)
            ->value('left_at'));
    }

    /**
     * Relevé du 2026-09-24 (risque résiduel de TCK-565) : `GET /api/conversations/{id}` ne rendait
     * PAS `participants`, alors que le front le demande (`include=property,participants`) et que
     * la feuille d'infos d'un groupe en dérive tout — la liste des membres, et le rôle de
     * l'utilisateur, donc le renommage, la gestion des rôles et l'INVITATION par nom de TCK-565.
     * Mesuré sur la pile locale, groupe 241 d'agent1 : clés de `data` sans `participants`. La
     * feuille affichait « 0 participant » et cachait toutes les actions d'administration.
     *
     * Rendu : les membres ACTUELS (un départ n'est pas un membre), leur rôle, et leur nom — jamais
     * leurs coordonnées : un membre d'un groupe n'a pas à lire l'e-mail des autres.
     */
    public function test_le_detail_rend_les_membres_actuels_leur_role_et_leur_nom(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $b->update(['first_name' => 'Awa', 'last_name' => 'Sarr']);
        $conversation->participants()->updateExistingPivot($c->id, ['left_at' => now()]);
        // Réparation 1 (vérificateur, 2026-09-24) : `ChatView` lit la sourdine de l'acteur DANS ce
        // détail (`currentMute`), et un `is_muted` figé à `false` laissait toute la suite verte.
        $conversation->participants()->updateExistingPivot($b->id, ['is_muted' => true]);

        Sanctum::actingAs($b);

        $response = $this->getJson("/api/conversations/{$conversation->id}")->assertOk();
        $membres = collect($response->json('data.participants'));

        $this->assertEqualsCanonicalizing([$admin->id, $b->id], $membres->pluck('user_id')->all(), 'le membre parti n’est pas rendu');
        $awa = $membres->firstWhere('user_id', $b->id);
        $this->assertSame('member', $awa['role']);
        $this->assertSame('Awa Sarr', $awa['user']['full_name']);
        $this->assertSame(['id', 'full_name', 'avatar_url'], array_keys($awa['user']));
        $this->assertNull($awa['left_at']);
        $this->assertNotNull($awa['joined_at']);
        $this->assertIsInt($awa['id']);
        $this->assertSame('admin', $membres->firstWhere('user_id', $admin->id)['role']);
        // Reprise du 2026-09-24 : la sourdine est PRIVÉE. Le lecteur lit la sienne — `ChatView` en
        // tire `currentMute` —, jamais celle des autres (voir le test suivant).
        $this->assertTrue($awa['is_muted'], 'le lecteur lit sa propre sourdine');
        $this->assertArrayNotHasKey('is_muted', $membres->firstWhere('user_id', $admin->id));
        $this->assertStringNotContainsString($admin->email, $response->getContent());

        // Un tiers n'y a toujours pas accès.
        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/conversations/{$conversation->id}")->assertForbidden();
    }

    /**
     * TCK-576, reprise des défauts mineurs (2026-09-24) — le détail rendait `is_muted` de CHAQUE
     * membre à tous les membres : n'importe qui dans un groupe savait qui l'avait mis en sourdine.
     * Le mode silencieux est une préférence PRIVÉE (décision de la session) : il n'est rendu que
     * pour le participant qui lit. Pour les autres, la clé est ABSENTE, pas `null` — le type du
     * front la déclare déjà facultative (`is_muted?: boolean`), et ses trois lecteurs ne lisent que
     * la ligne de l'utilisateur courant.
     *
     * Réparation 1 (vérificateur, 2026-09-24) : `last_read_at` reçoit le même traitement, selon la
     * règle de la session (« s'il n'a aucun consommateur pour les AUTRES membres, même traitement »).
     * Mesuré : aucun — côté front, la seule occurrence est la déclaration de `types/message.ts` ;
     * côté API, le compte de non-lus et `markAsRead` ne lisent que la ligne du lecteur. Il vaut
     * `null` pour les autres, pas absent : le front déclare la clé obligatoire (`string | null`).
     * Cette version épinglait l'exposition (`assertNotNull` sur le `last_read_at` d'un autre).
     */
    public function test_la_sourdine_d_un_membre_n_est_rendue_qu_a_lui_meme(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $conversation->participants()->updateExistingPivot($admin->id, ['last_read_at' => now()->subHour()]);
        $conversation->participants()->updateExistingPivot($b->id, ['is_muted' => true, 'last_read_at' => now()]);
        $conversation->participants()->updateExistingPivot($c->id, ['is_muted' => true, 'last_read_at' => now()]);

        Sanctum::actingAs($admin);

        $membres = collect($this->getJson("/api/conversations/{$conversation->id}")
            ->assertOk()
            ->json('data.participants'));

        $this->assertCount(3, $membres);
        foreach ([$b, $c] as $autre) {
            $this->assertArrayNotHasKey('is_muted', $membres->firstWhere('user_id', $autre->id), 'la sourdine d’un autre ne sort pas');
        }
        $this->assertFalse($membres->firstWhere('user_id', $admin->id)['is_muted'], 'le lecteur lit la sienne');

        // L'état de lecture des autres ne sort pas non plus : la clé reste (type du front), à `null`.
        foreach ([$b, $c] as $autre) {
            $ligne = $membres->firstWhere('user_id', $autre->id);
            $this->assertArrayHasKey('last_read_at', $ligne);
            $this->assertNull($ligne['last_read_at'], 'la lecture d’un autre ne sort pas');
        }
        // Le lecteur lit toujours la sienne.
        $this->assertNotNull($membres->firstWhere('user_id', $admin->id)['last_read_at'], 'le lecteur lit sa propre lecture');

        // Et c'est bien relatif au LECTEUR : vu par B, c'est la ligne de B qui porte l'état.
        Sanctum::actingAs($b);
        $vusParB = collect($this->getJson("/api/conversations/{$conversation->id}")
            ->assertOk()
            ->json('data.participants'));
        $this->assertTrue($vusParB->firstWhere('user_id', $b->id)['is_muted']);
        $this->assertNotNull($vusParB->firstWhere('user_id', $b->id)['last_read_at']);
        $this->assertNull($vusParB->firstWhere('user_id', $admin->id)['last_read_at']);
        $this->assertArrayNotHasKey('is_muted', $vusParB->firstWhere('user_id', $admin->id));
    }
}
