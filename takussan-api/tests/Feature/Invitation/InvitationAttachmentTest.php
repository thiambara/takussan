<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * TCK-455 — `POST /api/invitations` fabriquait un compte accepté membre de
 * rien.
 *
 * ## Le relevé qui a créé ce ticket, et celui qui l'a réécrit
 *
 * Sonde du 2026-08-29, chaîne ENTIÈRE (émission → acceptation → appartenance),
 * même acteur `agency_admin`, même payload `{email, role:'agent'}` :
 *
 * | Type d'agence | `POST` | `invitable_type` | `accept` | `isAgentAt` / `isOwnerAt` / `isAgencyAdminAt` |
 * |---|---|---|---|---|
 * | **`standard`** | **201** | **NULL** | **200** | **false / false / false** |
 * | `individual`   | 201     | NULL     | 200      | false / false / false |
 *
 * **Le témoin `standard` se comportait exactement comme l'agence
 * individuelle.** Le défaut n'avait donc aucun rapport avec le type d'agence,
 * et la moitié du ticket est tombée avec cette ligne : ce n'est pas une porte
 * à fermer aux agences individuelles, c'est une invitation qui ne savait pas à
 * quoi elle rattachait le compte.
 *
 * ## Ce que ces tests éprouvent
 *
 * Un code de retour ne dit rien de ce qu'il a créé — c'est tout le motif du
 * ticket : le 201 était juste, le 200 de l'acceptation aussi, et le compte
 * n'était membre de rien. Chaque cas passant va donc jusqu'à
 * `isAgentAt()` / `isOwnerAt()`, jamais jusqu'au seul `assertStatus`.
 *
 * Deux témoins, pas un : l'agence `standard` (la garde ne doit pas refuser
 * tout le monde) **et** la cooptation `super_admin` (elle n'a aucun profil à
 * cibler, et une garde qui l'attraperait transformerait ce ticket en
 * régression sur un parcours qui marche).
 */
class InvitationAttachmentTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{Agency, User}
     */
    private function agenceAvecAdmin(AgencyKind $kind): array
    {
        $agency = Agency::factory()->create(['kind' => $kind]);
        $admin = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        return [$agency, $admin];
    }

    /**
     * AC2 — le défaut, sur les QUATRE rôles, et sur les DEUX types d'agence.
     *
     * ⚠ La règle ne se déduit pas du seul `role` : elle est mesurée sur chacun,
     * et `super_admin` reste vert dans le test suivant. Le `nullable` d'origine
     * était commenté « pour la cooptation super-admin » — un cas réel, jamais
     * distingué des autres.
     */
    public function test_une_invitation_qui_ne_rattache_a_rien_est_refusee_a_l_emission(): void
    {
        Mail::fake();

        foreach ([AgencyKind::Standard, AgencyKind::Individual] as $kind) {
            [$agency] = $this->agenceAvecAdmin($kind);

            foreach (['owner', 'agent', 'agency_admin', 'service_provider'] as $role) {
                $email = "sans-attache-{$kind->value}-{$role}@example.com";

                $this->postJson('/api/invitations', [
                    'email' => $email,
                    'role' => $role,
                    'agency_id' => $agency->id,
                ])->assertStatus(422);

                // Un 422 qui écrit quand même n'est pas un refus.
                $this->assertDatabaseMissing('invitations', ['email' => $email]);
            }
        }
    }

    /**
     * TÉMOIN 1 — la cooptation `super_admin` n'a aucun profil à cibler et doit
     * rester ouverte. C'est le cas légitime que le `nullable` d'origine
     * servait, et qu'une garde plate aurait emporté.
     */
    public function test_temoin_la_cooptation_super_admin_reste_ouverte_sans_invitable(): void
    {
        Mail::fake();
        $this->actingAsRole('super_admin');

        $this->postJson('/api/invitations', [
            'email' => 'coopte@example.com',
            'role' => 'super_admin',
        ])->assertStatus(201);

        $invitation = Invitation::query()->where('email', 'coopte@example.com')->firstOrFail();
        $this->assertNull($invitation->invitable_type);
    }

    /**
     * AC2 + AC3 + TÉMOIN 2 — la chaîne ENTIÈRE sur une agence `standard`.
     *
     * Émission avec un profil cible, acceptation, puis **appartenance**. C'est
     * la dernière assertion qui porte le ticket : le relevé d'origine avait
     * 201 puis 200, et `isAgentAt` faux.
     */
    public function test_temoin_une_invitation_qui_rattache_produit_un_membre_sur_agence_standard(): void
    {
        Mail::fake();
        [$agency] = $this->agenceAvecAdmin(AgencyKind::Standard);

        $profil = AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => null,
            'status' => AgentProfileStatus::Draft->value,
        ]);

        $this->postJson('/api/invitations', [
            'email' => 'rattache@example.com',
            'role' => 'agent',
            'agency_id' => $agency->id,
            'invitable_type' => AgentProfile::class,
            'invitable_id' => $profil->id,
        ])->assertStatus(201);

        $invitation = Invitation::query()->where('email', 'rattache@example.com')->firstOrFail();
        $this->assertSame(AgentProfile::class, $invitation->invitable_type);

        $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'password' => 'sup3r-secret',
        ])->assertStatus(200);

        $compte = User::query()->where('email', 'rattache@example.com')->firstOrFail();

        // ⚠ LA ligne du ticket. « Un 201 ne dit rien de ce qu'il a créé. »
        $this->assertTrue(
            $compte->fresh()->isAgentAt((int) $agency->id),
            "Le compte accepté doit être membre de l'agence — c'est tout l'objet de TCK-455.",
        );
        $this->assertSame($compte->id, $profil->fresh()->user_id);
    }

    /**
     * TÉMOIN 3 — la même chaîne sur une agence `individual`.
     *
     * ⚠ `POST /api/invitations` n'est PAS fermé aux agences individuelles, et
     * ce test l'épingle. La mesure a montré que le type d'agence n'était pas le
     * sujet ; la restriction qui, elle, en dépend est traitée par TCK-454.
     * Sans ce témoin, un correctif qui aurait fermé la porte au mauvais critère
     * cocherait quand même les autres critères.
     */
    public function test_temoin_l_endpoint_generique_reste_ouvert_a_une_agence_individuelle(): void
    {
        Mail::fake();
        [$agency] = $this->agenceAvecAdmin(AgencyKind::Individual);

        $profil = AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => null,
            'status' => AgentProfileStatus::Draft->value,
        ]);

        $this->postJson('/api/invitations', [
            'email' => 'individuelle@example.com',
            'role' => 'agent',
            'agency_id' => $agency->id,
            'invitable_type' => AgentProfile::class,
            'invitable_id' => $profil->id,
        ])->assertStatus(201);

        $invitation = Invitation::query()->where('email', 'individuelle@example.com')->firstOrFail();

        $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Modou',
            'last_name' => 'Fall',
            'password' => 'sup3r-secret',
        ])->assertStatus(200);

        $compte = User::query()->where('email', 'individuelle@example.com')->firstOrFail();
        $this->assertTrue($compte->fresh()->isAgentAt((int) $agency->id));
    }

    /**
     * Le couple (rôle, profil visé) doit être COHÉRENT, et pas seulement
     * présent.
     *
     * Un `invitable_type` quelconque suffirait à passer un simple `required`,
     * et referait exactement le couloir sans issue : c'est `finalizeAccept()`
     * qui rattache, et il ne rattache que pour les rôles qu'il connaît. Un
     * `role=owner` pointant un `AgentProfile` rendrait 201, puis 200, puis
     * aucun accès.
     */
    public function test_un_profil_qui_ne_correspond_pas_au_role_est_refuse(): void
    {
        Mail::fake();
        [$agency] = $this->agenceAvecAdmin(AgencyKind::Standard);

        $profil = AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => null,
            'status' => AgentProfileStatus::Draft->value,
        ]);

        $this->postJson('/api/invitations', [
            'email' => 'incoherent@example.com',
            'role' => 'owner',
            'agency_id' => $agency->id,
            'invitable_type' => AgentProfile::class,
            'invitable_id' => $profil->id,
        ])->assertStatus(422);

        $this->assertDatabaseMissing('invitations', ['email' => 'incoherent@example.com']);
    }
}
