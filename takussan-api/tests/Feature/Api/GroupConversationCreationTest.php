<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-085 — Covers AC1, AC2 + scope/cap rules for `POST /conversations`
 * with `type = group`.
 *
 * TCK-565 — le périmètre est désormais APPLIQUÉ à la création. Le docblock de
 * `CreateGroupConversationRequest` affirmait depuis TCK-085 que « le contrôleur fait la
 * vérification de périmètre », et l'assistant du front l'écrivait à l'utilisateur (« Le serveur
 * vérifie les permissions ») : aucune ligne ne le faisait. N'importe quel compte pouvait ranger
 * n'importe quel autre dans un groupe en devinant un identifiant. Les tests d'avant ne le voyaient
 * pas parce qu'ils créaient des groupes entre inconnus — ils posent maintenant la relation.
 */
class GroupConversationCreationTest extends TestCase
{
    use RefreshDatabase;

    /** Une conversation passée entre deux personnes : la relation la plus simple du périmètre. */
    private function relate(User $actor, User ...$others): void
    {
        foreach ($others as $other) {
            $past = Conversation::create([
                'type' => ConversationType::Direct->value,
                'status' => ConversationStatus::Active->value,
                'subject' => 'past',
                'created_by' => $actor->id,
            ]);
            $past->participants()->attach($actor->id, ['joined_at' => now()]);
            $past->participants()->attach($other->id, ['joined_at' => now()]);
        }
    }

    public function test_ac1_creates_group_conversation_with_creator_as_admin(): void
    {
        $me = User::factory()->create();
        $b = User::factory()->create();
        $c = User::factory()->create();
        $this->relate($me, $b, $c);

        Sanctum::actingAs($me);

        $resp = $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Travaux salle de bain',
            'participants' => [$b->id, $c->id],
        ])->assertCreated();

        $convId = $resp->json('data.id');
        $this->assertNotNull($convId);
        $this->assertSame('group', $resp->json('data.type'));

        // Creator is admin
        $creatorRole = DB::table('conversation_participants')
            ->where('conversation_id', $convId)
            ->where('user_id', $me->id)
            ->value('role');
        $this->assertSame(ParticipantRole::Admin->value, $creatorRole);

        // The other two are members
        foreach ([$b->id, $c->id] as $uid) {
            $r = DB::table('conversation_participants')
                ->where('conversation_id', $convId)
                ->where('user_id', $uid)
                ->value('role');
            $this->assertSame(ParticipantRole::Member->value, $r);
        }
    }

    public function test_ac2_rejects_group_with_only_one_other_participant(): void
    {
        $me = User::factory()->create();
        $b = User::factory()->create();
        $this->relate($me, $b);

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Trop petit',
            'participants' => [$b->id],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['participants']);
    }

    public function test_rejects_group_without_subject(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->relate($me, $a, $b);

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'participants' => [$a->id, $b->id],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['subject']);
    }

    public function test_rejects_group_with_more_than_20_participants(): void
    {
        $me = User::factory()->create();
        $others = User::factory()->count(20)->create();
        $this->relate($me, ...$others->all());

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Trop nombreux',
            'participants' => $others->pluck('id')->all(), // 20 others + 1 creator = 21
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['participants']);
    }

    public function test_direct_conversation_path_still_works(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $this->relate($me, $other);

        Sanctum::actingAs($me);

        $resp = $this->postJson('/api/conversations', [
            'subject' => 'Hello direct',
            'participants' => [$other->id],
        ])->assertCreated();

        $this->assertSame(ConversationType::Direct->value, $resp->json('data.type'));
    }

    public function test_creator_is_filtered_out_if_listed_in_participants(): void
    {
        // Even if the FE redundantly sends the creator id, we accept the
        // payload — the service de-duplicates and never double-attaches.
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->relate($me, $a, $b);

        Sanctum::actingAs($me);

        $resp = $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Dedup test',
            'participants' => [$a->id, $b->id, $me->id],
        ])->assertCreated();

        $convId = $resp->json('data.id');
        $count = DB::table('conversation_participants')->where('conversation_id', $convId)->count();
        $this->assertSame(3, $count);
    }

    // ---------------------------------------------------------------------------------------------
    // TCK-565 — M12 / M13 du retour testeur du 2026-09-23
    // ---------------------------------------------------------------------------------------------

    /**
     * M13 — la capture montrait « The selected participants.0 is invalid. (and 1 more error) » :
     * le nom technique du champ, un index de tableau, et le résumé anglais du framework accolé.
     * Mesuré avant correctif, en français : « La valeur sélectionnée pour participants.0 est
     * invalide. (and 1 more error) ». Deux inconnus doivent produire UNE phrase, localisée.
     */
    public function test_m13_des_participants_introuvables_produisent_une_seule_phrase_localisee(): void
    {
        $me = User::factory()->create();
        Sanctum::actingAs($me);
        $absent = (int) User::query()->max('id') + 1000;

        $resp = $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Test',
            'participants' => [$absent, $absent + 1],
        ], ['Accept-Language' => 'fr'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['participants']);

        $this->assertSame(__('messaging.errors.participants_unavailable', [], 'fr'), $resp->json('message'));
        $this->assertStringNotContainsString('participants.', $resp->json('message'));
        $this->assertStringNotContainsString('more error', $resp->json('message'));
        $this->assertSame([], array_values(array_filter(
            array_keys($resp->json('errors')),
            fn (string $key) => str_starts_with($key, 'participants.'),
        )), 'aucune erreur indexée par position');
    }

    /**
     * TCK-565, passe finale — le message propre au minimum d'un groupe n'était tenu par aucun test
     * (le retirer laissait la suite verte, relevé du vérificateur, passe 3) : sans lui, l'API rend
     * la phrase générique du framework, qui nomme le champ technique « participants ».
     */
    public function test_un_groupe_a_une_seule_autre_personne_rend_la_phrase_du_minimum(): void
    {
        $me = User::factory()->create();
        $autre = User::factory()->create();
        Sanctum::actingAs($me);

        foreach (['fr', 'en', 'wo'] as $langue) {
            $resp = $this->postJson('/api/conversations', [
                'type' => 'group',
                'subject' => 'Test',
                'participants' => [$autre->id],
            ], ['Accept-Language' => $langue])->assertUnprocessable();

            $this->assertSame(['participants'], array_keys($resp->json('errors')));
            $this->assertSame(__('messaging.errors.group_min_participants', [], $langue), $resp->json('message'), $langue);
        }
    }

    /** M13, versant anglais — la langue du testeur. */
    public function test_m13_le_message_suit_la_langue_de_la_requete(): void
    {
        $me = User::factory()->create();
        Sanctum::actingAs($me);
        $absent = (int) User::query()->max('id') + 1000;

        $resp = $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Test',
            'participants' => [$absent, $absent + 1],
        ], ['Accept-Language' => 'en'])->assertUnprocessable();

        $this->assertSame(__('messaging.errors.participants_unavailable', [], 'en'), $resp->json('message'));
    }

    /**
     * M12 — le périmètre annoncé est appliqué : un inconnu deviné par son identifiant est refusé,
     * d'une phrase lisible et sans le révéler par sa position.
     */
    public function test_m12_un_inconnu_est_refuse_a_la_creation(): void
    {
        $me = User::factory()->create();
        $ami = User::factory()->create();
        $inconnu = User::factory()->create();
        $this->relate($me, $ami);

        Sanctum::actingAs($me);

        $resp = $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Test',
            'participants' => [$ami->id, $inconnu->id],
        ], ['Accept-Language' => 'fr'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['participants']);

        $this->assertSame(__('messaging.errors.participants_out_of_reach', [], 'fr'), $resp->json('message'));
        $this->assertSame(0, Conversation::query()->where('type', ConversationType::Group->value)->count());
    }

    /** M12 — l'agence est la frontière : ses agents sont joignables par un propriétaire. */
    public function test_m12_un_proprietaire_cree_un_groupe_avec_les_agents_de_son_agence(): void
    {
        $agency = Agency::factory()->create();
        $me = User::factory()->create();
        $this->materializeRoleProfile($me, 'owner', $agency);
        $agentA = User::factory()->create();
        $this->materializeRoleProfile($agentA, 'agent', $agency);
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Gestion du bien',
            'participants' => [$agentA->id, $admin->id],
        ])->assertCreated();
    }

    /**
     * Le bien rattaché doit être un bien que l'on VOIT. Sans cette garde, `property_id` — qu'on
     * pouvait jusqu'ici saisir à la main — ouvrait ensuite l'ajout de participants à toute
     * l'agence de ce bien (`AddParticipantsRequest`, règle « même agence que le bien »).
     */
    public function test_un_bien_d_une_autre_agence_ne_peut_pas_etre_rattache(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->relate($me, $a, $b);
        $bienAilleurs = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Test',
            'participants' => [$a->id, $b->id],
            'property_id' => $bienAilleurs->id,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['property_id']);
    }

    public function test_son_propre_bien_peut_etre_rattache(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->relate($me, $a, $b);
        $monBien = Property::factory()->create(['user_id' => $me->id]);

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Test',
            'participants' => [$a->id, $b->id],
            'property_id' => $monBien->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.property_id', $monBien->id);
    }

    // ---------------------------------------------------------------------------------------------
    // Réparation 1 (relevé du vérificateur, 2026-09-23)
    // ---------------------------------------------------------------------------------------------

    /**
     * Le refus d'un bail ou d'une demande d'intervention non visibles était annoncé et codé, mais
     * aucun test ne le tenait : retirer `lease_id` et `maintenance_request_id` de la garde laissait
     * 16 tests verts. Ce n'est pas une garde de lecture seulement — le contexte rattaché ouvre
     * ensuite l'ajout de participants à l'équipe de l'agence de son bien.
     */
    public function test_un_bail_ou_une_intervention_d_une_autre_agence_ne_peuvent_pas_etre_rattaches(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->relate($me, $a, $b);
        $ailleurs = Agency::factory()->create();
        $bienAilleurs = Property::factory()->create(['agency_id' => $ailleurs->id]);
        $bailAilleurs = Lease::factory()->create(['property_id' => $bienAilleurs->id, 'agency_id' => $ailleurs->id]);
        $interventionAilleurs = MaintenanceRequest::factory()->create(['property_id' => $bienAilleurs->id]);

        Sanctum::actingAs($me);

        foreach (['lease_id' => $bailAilleurs->id, 'maintenance_request_id' => $interventionAilleurs->id] as $champ => $id) {
            $resp = $this->postJson('/api/conversations', [
                'type' => 'group',
                'subject' => 'Test',
                'participants' => [$a->id, $b->id],
                $champ => $id,
            ], ['Accept-Language' => 'fr'])
                ->assertUnprocessable()
                ->assertJsonValidationErrors([$champ]);

            $this->assertSame(__('messaging.errors.group_context_forbidden', [], 'fr'), $resp->json("errors.{$champ}.0"));
        }

        $this->assertSame(0, Conversation::query()->where('type', ConversationType::Group->value)->count());
    }

    public function test_son_propre_bail_et_sa_propre_intervention_peuvent_etre_rattaches(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->relate($me, $a, $b);
        $bail = Lease::factory()->create(['landlord_id' => $me->id]);
        // L'intervention porte sur le bien du bail : depuis la reprise du 2026-09-24, une
        // intervention d'un AUTRE bien se refuse (les deux fabriques en créaient chacune un).
        $intervention = MaintenanceRequest::factory()->create(['requester_id' => $me->id, 'property_id' => $bail->property_id]);

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Test',
            'participants' => [$a->id, $b->id],
            'lease_id' => $bail->id,
            'maintenance_request_id' => $intervention->id,
        ])->assertCreated();
    }

    /**
     * Relevé du 2026-09-24 (reprise des restes de TCK-565) : la garde de contexte ne vérifiait
     * que ce qu'elle TROUVAIT. `exists:properties,id` accepte une ligne supprimée (il ne lit pas
     * `deleted_at`), puis `Property::query()->find()` la masque (portée `SoftDeletes`) : le modèle
     * est `null`, et la garde passait son tour. Un groupe se rattachait donc au bien SUPPRIMÉ d'une
     * autre agence, que l'acteur n'a jamais pu voir — 201. Même chose pour un bail et une demande
     * d'intervention supprimés. Un contexte qu'on ne peut pas lire se refuse, qu'il soit caché par
     * la policy ou par la suppression.
     */
    public function test_un_contexte_supprime_ne_peut_pas_etre_rattache(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->relate($me, $a, $b);
        $ailleurs = Agency::factory()->create();
        $bien = Property::factory()->create(['agency_id' => $ailleurs->id]);
        $bail = Lease::factory()->create(['property_id' => $bien->id, 'agency_id' => $ailleurs->id]);
        $intervention = MaintenanceRequest::factory()->create(['property_id' => $bien->id]);
        // Supprimés, et même SIENS : un contexte supprimé n'est plus un contexte.
        $monBien = Property::factory()->create(['user_id' => $me->id]);
        $bien->delete();
        $bail->delete();
        $intervention->delete();
        $monBien->delete();

        Sanctum::actingAs($me);

        foreach ([
            'property_id' => $bien->id,
            'lease_id' => $bail->id,
            'maintenance_request_id' => $intervention->id,
            'property_id (le mien)' => $monBien->id,
        ] as $cas => $id) {
            $champ = explode(' ', $cas)[0];
            $this->postJson('/api/conversations', [
                'type' => 'group',
                'subject' => 'Test',
                'participants' => [$a->id, $b->id],
                $champ => $id,
            ])->assertUnprocessable()->assertJsonValidationErrors([$champ]);
        }

        $this->assertSame(0, Conversation::query()->where('type', ConversationType::Group->value)->count());

        // La directe partage la garde (`GuardsConversationScope`) : même refus.
        $avant = Conversation::query()->count();
        $this->postJson('/api/conversations', [
            'participants' => [$a->id],
            'property_id' => $monBien->id,
        ])->assertUnprocessable()->assertJsonValidationErrors(['property_id']);
        $this->assertSame($avant, Conversation::query()->count());
    }

    /**
     * TCK-576, réparation 1 (vérificateur du 2026-09-24) : la garde de contexte vérifiait chaque
     * champ SÉPARÉMENT. Un bien et un bail visibles l'un et l'autre, mais sans rapport, passaient :
     * mesuré sur la pile locale, `property_id=1` + `lease_id=363` (un bail d'un autre bien) → 201.
     * C'est la paire que le sélecteur du front laissait choisir pendant un chargement ; le serveur
     * doit la refuser lui-même, quel que soit le client.
     */
    public function test_un_bail_qui_ne_concerne_pas_le_bien_choisi_est_refuse(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->relate($me, $a, $b);
        $villa = Property::factory()->create(['user_id' => $me->id]);
        $bureau = Property::factory()->create(['user_id' => $me->id]);
        $bailDuBureau = Lease::factory()->create(['property_id' => $bureau->id, 'landlord_id' => $me->id]);

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Test',
            'participants' => [$a->id, $b->id],
            'property_id' => $villa->id,
            'lease_id' => $bailDuBureau->id,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['lease_id'])
            ->assertJsonMissingValidationErrors(['property_id'])
            ->assertJsonPath('errors.lease_id.0', __('messaging.errors.lease_property_mismatch'));
        $this->assertSame(0, Conversation::query()->where('type', ConversationType::Group->value)->count());

        // La directe partage la garde : même refus.
        $avant = Conversation::query()->count();
        $this->postJson('/api/conversations', [
            'participants' => [$a->id],
            'property_id' => $villa->id,
            'lease_id' => $bailDuBureau->id,
        ])->assertUnprocessable()->assertJsonValidationErrors(['lease_id']);
        $this->assertSame($avant, Conversation::query()->count());

        // Témoin : le bail AVEC son bien passe, et chacun seul aussi.
        foreach ([
            ['property_id' => $bureau->id, 'lease_id' => $bailDuBureau->id],
            ['lease_id' => $bailDuBureau->id],
            ['property_id' => $villa->id],
        ] as $contexte) {
            $this->postJson('/api/conversations', [
                'type' => 'group',
                'subject' => 'Test',
                'participants' => [$a->id, $b->id],
            ] + $contexte)->assertCreated();
        }
    }

    /**
     * TCK-576, reprise des défauts mineurs (2026-09-24) — le contrat « la paire se compare APRÈS
     * la visibilité » n'était tenu par aucun test : inverser l'ordre des deux gardes laissait tout
     * vert. Or l'ordre inverse répond « ce bail ne concerne pas le bien choisi » à propos d'un bail
     * qu'on ne peut PAS voir — il confirme son existence et dit quelque chose de son bien. Un bail
     * invisible ne reçoit que la phrase de visibilité, quel que soit le bien envoyé avec lui.
     */
    public function test_un_bail_invisible_avec_un_bien_visible_rend_la_phrase_de_visibilite(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->relate($me, $a, $b);
        $monBien = Property::factory()->create(['user_id' => $me->id]);
        $ailleurs = Agency::factory()->create();
        $bailAilleurs = Lease::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $ailleurs->id])->id,
            'agency_id' => $ailleurs->id,
        ]);

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Test',
            'participants' => [$a->id, $b->id],
            'property_id' => $monBien->id,
            'lease_id' => $bailAilleurs->id,
        ])->assertUnprocessable()
            ->assertJsonMissingValidationErrors(['property_id'])
            ->assertJsonPath('errors.lease_id', [__('messaging.errors.group_context_forbidden')]);

        // La directe partage l'ordre : même phrase de visibilité, la sienne.
        $this->postJson('/api/conversations', [
            'participants' => [$a->id],
            'property_id' => $monBien->id,
            'lease_id' => $bailAilleurs->id,
        ])->assertUnprocessable()
            ->assertJsonPath('errors.lease_id', [__('messaging.errors.conversation_context_forbidden')]);

        $this->assertSame(0, Conversation::query()->where('lease_id', $bailAilleurs->id)->count());
    }

    /**
     * TCK-576, reprise des défauts mineurs (2026-09-24) — la paire bien/bail ignorait la demande
     * d'intervention : une intervention sur le bureau, rattachée à un groupe sur la villa (ou sur
     * le bail de la villa), passait — 201, mesuré avant correctif. Refus sur
     * `maintenance_request_id`, dans la langue de la requête.
     *
     * La conversation DIRECTE n'est pas concernée : elle ne lit pas `maintenance_request_id`
     * (absent de `StoreConversationRequest::rules()`, jamais écrit par le contrôleur).
     */
    public function test_une_intervention_d_un_autre_bien_que_le_contexte_est_refusee(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->relate($me, $a, $b);
        $villa = Property::factory()->create(['user_id' => $me->id]);
        $bureau = Property::factory()->create(['user_id' => $me->id]);
        $bailDeLaVilla = Lease::factory()->create(['property_id' => $villa->id, 'landlord_id' => $me->id]);
        $bailDuBureau = Lease::factory()->create(['property_id' => $bureau->id, 'landlord_id' => $me->id]);
        $interventionAuBureau = MaintenanceRequest::factory()->create(['property_id' => $bureau->id, 'requester_id' => $me->id]);

        Sanctum::actingAs($me);

        $phrases = [];
        foreach ([
            'fr' => ['property_id' => $villa->id],
            'en' => ['lease_id' => $bailDeLaVilla->id],
            'wo' => ['property_id' => $villa->id, 'lease_id' => $bailDeLaVilla->id],
        ] as $langue => $contexte) {
            $resp = $this->postJson('/api/conversations', [
                'type' => 'group',
                'subject' => 'Test',
                'participants' => [$a->id, $b->id],
                'maintenance_request_id' => $interventionAuBureau->id,
            ] + $contexte, ['Accept-Language' => $langue])
                ->assertUnprocessable()
                ->assertJsonMissingValidationErrors(['property_id', 'lease_id']);

            $this->assertSame(
                [__('messaging.errors.maintenance_property_mismatch', [], $langue)],
                $resp->json('errors.maintenance_request_id'),
                $langue,
            );
            $phrases[] = $resp->json('errors.maintenance_request_id.0');
        }
        $this->assertCount(3, array_unique($phrases), 'une phrase par langue, pas une phrase recopiée');
        $this->assertSame(0, Conversation::query()->where('type', ConversationType::Group->value)->count());

        // Témoins : l'intervention avec SON bien, avec un bail de son bien, et seule, passent.
        foreach ([
            ['property_id' => $bureau->id],
            ['lease_id' => $bailDuBureau->id],
            ['property_id' => $bureau->id, 'lease_id' => $bailDuBureau->id],
            [],
        ] as $contexte) {
            $this->postJson('/api/conversations', [
                'type' => 'group',
                'subject' => 'Test',
                'participants' => [$a->id, $b->id],
                'maintenance_request_id' => $interventionAuBureau->id,
            ] + $contexte)->assertCreated();
        }
    }

    /** L'administrateur d'agence est de l'équipe : il range les propriétaires de son agence. */
    public function test_un_administrateur_d_agence_cree_un_groupe_avec_ses_proprietaires(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        $p1 = User::factory()->create();
        $this->materializeRoleProfile($p1, 'owner', $agency);
        $p2 = User::factory()->create();
        $this->materializeRoleProfile($p2, 'owner', $agency);

        Sanctum::actingAs($admin);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Assemblée',
            'participants' => [$p1->id, $p2->id],
        ])->assertCreated();
    }

    /**
     * M13, cas du vérificateur : deux erreurs sur deux champs. Le `message` d'une 422 est le
     * résumé du framework (« première erreur (and 1 more error) ») : le suffixe venait d'une clé
     * JSON que le dépôt ne traduisait pas (aucun `lang/*.json`). Il est désormais localisé.
     */
    public function test_m13_deux_erreurs_sur_deux_champs_restent_en_francais(): void
    {
        $me = User::factory()->create();
        $ami = User::factory()->create();
        $inconnu = User::factory()->create();
        $this->relate($me, $ami);
        $bienAilleurs = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);

        Sanctum::actingAs($me);

        $resp = $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Test',
            'participants' => [$ami->id, $inconnu->id],
            'property_id' => $bienAilleurs->id,
        ], ['Accept-Language' => 'fr'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['participants', 'property_id']);

        $this->assertStringNotContainsString('more error', $resp->json('message'));
        $this->assertSame(
            __('messaging.errors.participants_out_of_reach', [], 'fr').' (et 1 autre erreur)',
            $resp->json('message'),
        );
    }

    /**
     * M13, second cas du vérificateur : `participants=["abc","def"]` rendait encore
     * `participants.0` et `participants.1` — la forme vient de toute règle posée sur
     * `participants.*`, pas seulement d'`exists`.
     */
    public function test_m13_des_identifiants_mal_formes_rendent_une_seule_erreur_sur_la_liste(): void
    {
        $me = User::factory()->create();
        Sanctum::actingAs($me);

        foreach ([['abc', 'def'], [1.5, 2.5], [[1], [2]]] as $participants) {
            $resp = $this->postJson('/api/conversations', [
                'type' => 'group',
                'subject' => 'Test',
                'participants' => $participants,
            ], ['Accept-Language' => 'fr'])->assertUnprocessable();

            $this->assertSame(['participants'], array_keys($resp->json('errors')), json_encode($participants));
            $this->assertSame(__('messaging.errors.participants_unavailable', [], 'fr'), $resp->json('message'));
        }
    }

    public function test_m13_un_doublon_rend_une_seule_erreur_sur_la_liste(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create();
        $this->relate($me, $a);
        Sanctum::actingAs($me);

        $resp = $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Test',
            'participants' => [$a->id, $a->id],
        ], ['Accept-Language' => 'fr'])->assertUnprocessable();

        $this->assertSame(['participants'], array_keys($resp->json('errors')));
        $this->assertSame(__('messaging.errors.participants_duplicate', [], 'fr'), $resp->json('message'));
    }

    /**
     * Le chemin « conversation directe » (`StoreConversationRequest`) : son contrôle d'existence
     * agrégé n'était tenu par aucun test — le restreindre aux groupes laissait 74 tests verts.
     */
    public function test_m13_une_conversation_directe_avec_un_compte_introuvable_rend_une_phrase(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        Sanctum::actingAs($me);
        $absent = (int) User::query()->max('id') + 1000;

        foreach ([[$absent], [$other->id, $absent, $absent + 1], ['abc', 'def']] as $participants) {
            $resp = $this->postJson('/api/conversations', [
                'subject' => 'Direct',
                'participants' => $participants,
            ], ['Accept-Language' => 'fr'])->assertUnprocessable();

            $this->assertSame(['participants'], array_keys($resp->json('errors')), json_encode($participants));
            $this->assertSame(__('messaging.errors.participants_unavailable', [], 'fr'), $resp->json('message'));
        }

        $this->assertSame(0, Conversation::query()->count());
    }
}
