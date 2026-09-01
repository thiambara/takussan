<?php

namespace Tests\Feature\Public;

use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-502 — **la fiche doit nommer celui qui recevra le message.**
 *
 * Deux défauts distincts, et le second est celui qu'on ne voit pas :
 *
 *  1. La carte de contact affichait `property.owner` — nom, avatar, lien vers le profil — pendant
 *     que le message, le lead anonyme et la résolution partaient au collaborateur `agent`. Relevé
 *     le 2026-08-31 sur `terrain-viabilise-a-guediawaye-PVh69x` : l'écran montrait Pape Cissé, le
 *     fil naissait chez Ousmane Ndiaye.
 *  2. Sur un bien à DEUX collaborateurs `agent`, `firstWhere('role', Agent)` prenait celui que la
 *     collection rendait en tête — l'ordre d'insertion. « L'agent principal » n'existait dans
 *     aucune colonne, et le destinataire était donc un tirage.
 *
 * ⚠️ **Aucun test de ce fichier ne peut passer par un seul endpoint.** Le défaut n'existait pas
 * DANS un chemin, il existait ENTRE deux : chaque endpoint pris isolément était cohérent avec
 * lui-même. Chaque test croise donc au moins deux surfaces.
 */
class PropertyPrimaryContactTest extends TestCase
{
    use RefreshDatabase;

    private const INVITE_TOT = '2026-01-10 09:00:00';

    private const INVITE_TARD = '2026-05-20 09:00:00';

    /**
     * Un bien avec ses collaborateurs `agent`, insérés dans l'ORDRE DONNÉ.
     *
     * `$agents` associe l'utilisateur à sa date d'invitation ; l'ordre du tableau est l'ordre
     * des `INSERT`, et c'est précisément la variable que l'AC2 fait bouger.
     *
     * @param  list<array{0: User, 1: string}>  $agents
     */
    private function bienAvecAgents(User $owner, array $agents): Property
    {
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);

        foreach ($agents as [$user, $inviteLe]) {
            PropertyCollaborator::create([
                'property_id' => $property->id,
                'user_id' => $user->id,
                'role' => CollaboratorRole::Agent->value,
                'invited_at' => $inviteLe,
            ]);
        }

        return $property;
    }

    /** L'identifiant du participant du fil qui n'est pas l'expéditeur. */
    private function destinataireDuFil(int $conversationId, int $expediteurId): int
    {
        return (int) \DB::table('conversation_participants')
            ->where('conversation_id', $conversationId)
            ->where('user_id', '!=', $expediteurId)
            ->value('user_id');
    }

    /**
     * AC1 — le nom affiché par la carte est celui qui apparaît dans le fil créé.
     *
     * Le bien a un propriétaire ET un collaborateur `agent` distinct : c'est exactement la
     * configuration où les deux vérités divergeaient.
     */
    public function test_la_carte_nomme_celui_qui_recoit_le_message(): void
    {
        $owner = User::factory()->create(['first_name' => 'Pape', 'last_name' => 'Cissé']);
        $agent = User::factory()->create(['first_name' => 'Ousmane', 'last_name' => 'Ndiaye']);
        $property = $this->bienAvecAgents($owner, [[$agent, self::INVITE_TOT]]);

        $carte = $this->getJson("/api/public/properties/{$property->slug}")->assertOk();

        $visiteur = User::factory()->create();
        Sanctum::actingAs($visiteur);
        $conversationId = $this->postJson("/api/public/properties/{$property->slug}/contact-message", [
            'message' => 'Bonjour',
        ])->assertCreated()->json('data.conversation_id');

        $this->assertSame(
            $this->destinataireDuFil($conversationId, $visiteur->id),
            $carte->json('data.primary_contact.id'),
        );
        $this->assertSame('Ousmane Ndiaye', $carte->json('data.primary_contact.name'));

        // ⚠ `owner` garde son sens : il porte la PROPRIÉTÉ, pas le contact. Six surfaces le
        // lisent pour ça. Le corriger en place aurait réparé la fiche en cassant le reste.
        $this->assertSame($owner->id, $carte->json('data.owner.id'));
    }

    /**
     * AC2 — le destinataire est le même quel que soit l'ordre des lignes en base.
     *
     * ⚠️ **DEUX axes, et le second a failli manquer.** La première version de ce test ne faisait
     * varier que l'ordre d'insertion — et elle restait VERTE sous l'ancienne règle. La raison est
     * mesurable : PostgreSQL sert l'eager load par l'index unique `(property_id, user_id)`, si
     * bien que « la première ligne de la collection » n'était pas la première insérée mais le
     * plus petit `user_id`. Sondé sur ce dépôt : lignes insérées `id 1, 2`, collection rendue
     * `id 2, 1`. L'ancienne règle cochait donc l'AC sans le tenir.
     *
     * *Un AC qui ne fait varier qu'une des deux variables du défaut accepte le mauvais
     * correctif.* Les quatre configurations croisent l'ordre de CRÉATION des utilisateurs — donc
     * l'ordre des `user_id`, celui que l'index impose — et l'ordre d'INSERTION des lignes. Aucune
     * règle « la première ligne gagne » ne les passe toutes les quatre.
     */
    public function test_deux_agents_le_destinataire_ne_depend_ni_de_l_ordre_d_insertion_ni_des_identifiants(): void
    {
        $owner = User::factory()->create();

        foreach ([true, false] as $ancienCreeEnPremier) {
            if ($ancienCreeEnPremier) {
                $ancien = User::factory()->create();
                $recent = User::factory()->create();
            } else {
                $recent = User::factory()->create();
                $ancien = User::factory()->create();
            }

            foreach ([true, false] as $ancienInsereEnPremier) {
                $lignes = [[$ancien, self::INVITE_TOT], [$recent, self::INVITE_TARD]];
                $property = $this->bienAvecAgents($owner, $ancienInsereEnPremier ? $lignes : array_reverse($lignes));

                Sanctum::actingAs(User::factory()->create());

                $this->getJson("/api/public/properties/{$property->slug}/conversation")
                    ->assertOk()
                    ->assertJsonPath('data.recipient.id', $ancien->id);
            }
        }
    }

    /**
     * AC3 — le contact anonyme, le message authentifié et la résolution nomment le même
     * utilisateur, sur les DEUX configurations de l'AC2.
     */
    public function test_les_trois_chemins_de_contact_nomment_la_meme_personne(): void
    {
        $owner = User::factory()->create();
        // ⚠ `$recent` est créé EN PREMIER, donc porte le plus petit `user_id`, et il est aussi
        // inséré en premier : c'est la configuration où toute règle « la première ligne gagne »
        // désigne l'autre personne. Cf. le commentaire de l'AC2.
        $recent = User::factory()->create();
        $ancien = User::factory()->create();

        $unSeulAgent = $this->bienAvecAgents($owner, [[$ancien, self::INVITE_TOT]]);
        $deuxAgents = $this->bienAvecAgents($owner, [
            [$recent, self::INVITE_TARD],
            [$ancien, self::INVITE_TOT],
        ]);

        foreach ([$unSeulAgent, $deuxAgents] as $property) {
            // 1. Le lead ANONYME — aucune session.
            $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
                'name' => 'Awa Sow',
                'email' => 'awa@example.test',
                'message' => 'Bonjour, ce bien est-il disponible ?',
            ])->assertCreated();
            $this->assertDatabaseHas('property_contact_leads', [
                'property_id' => $property->id,
                'recipient_user_id' => $ancien->id,
            ]);

            // 2. La RÉSOLUTION et 3. le MESSAGE authentifié, pour un visiteur connecté.
            $visiteur = User::factory()->create();
            Sanctum::actingAs($visiteur);

            $resolu = $this->getJson("/api/public/properties/{$property->slug}/conversation")
                ->assertOk()->json('data.recipient.id');
            $conversationId = $this->postJson("/api/public/properties/{$property->slug}/contact-message", [
                'message' => 'Bonjour',
            ])->assertCreated()->json('data.conversation_id');

            $this->assertSame($ancien->id, $resolu);
            $this->assertSame($ancien->id, $this->destinataireDuFil($conversationId, $visiteur->id));
            // 4. Et la carte, la surface qui ne passait par aucun des trois.
            $this->assertSame(
                $ancien->id,
                $this->getJson("/api/public/properties/{$property->slug}")
                    ->assertOk()->json('data.primary_contact.id'),
            );
        }
    }

    /** AC4 — le téléphone servi par `/contact` est celui de cette même personne (contrainte 3). */
    public function test_le_telephone_public_est_celui_du_contact_principal(): void
    {
        $owner = User::factory()->create(['phone' => '+221770000001']);
        $agent = User::factory()->create(['phone' => '+221770000002']);
        $property = $this->bienAvecAgents($owner, [[$agent, self::INVITE_TOT]]);

        $this->getJson("/api/public/properties/{$property->slug}/contact")
            ->assertOk()
            ->assertJsonPath('phone', $agent->phone);
    }

    /**
     * Le repli. Un bien sans collaborateur `agent` reste au propriétaire — c'est le cas le plus
     * fréquent du parc, et ce ticket ne le change pas.
     */
    public function test_sans_collaborateur_agent_le_contact_reste_le_proprietaire(): void
    {
        $owner = User::factory()->create(['phone' => '+221770000001']);
        $property = $this->bienAvecAgents($owner, []);
        // Un collaborateur d'un AUTRE rôle ne prend pas la place : seul `agent` répond.
        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => User::factory()->create()->id,
            'role' => CollaboratorRole::Manager->value,
            'invited_at' => '2026-01-01 09:00:00',
        ]);

        $this->assertSame(
            $owner->id,
            $this->getJson("/api/public/properties/{$property->slug}")
                ->assertOk()->json('data.primary_contact.id'),
        );
        $this->getJson("/api/public/properties/{$property->slug}/contact")
            ->assertOk()
            ->assertJsonPath('phone', $owner->phone);
    }

    /**
     * ⚠ **`invited_at` nulle passe DERRIÈRE, jamais devant.**
     *
     * Sans ce repli, une ligne antérieure à `PropertyCollaboratorController::store()` — qui est
     * la seule à poser `invited_at` — trierait en tête et la règle redeviendrait le tirage
     * qu'elle était. Le second repli, sur `id`, tranche entre deux lignes également nulles.
     */
    public function test_un_agent_sans_date_d_invitation_ne_passe_pas_devant_un_agent_date(): void
    {
        $owner = User::factory()->create();
        $sansDate = User::factory()->create();
        $date = User::factory()->create();

        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $sansDate->id,
            'role' => CollaboratorRole::Agent->value,
            'invited_at' => null,
        ]);
        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $date->id,
            'role' => CollaboratorRole::Agent->value,
            'invited_at' => '2026-06-01 09:00:00',
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/public/properties/{$property->slug}/conversation")
            ->assertOk()
            ->assertJsonPath('data.recipient.id', $date->id);
    }
}
