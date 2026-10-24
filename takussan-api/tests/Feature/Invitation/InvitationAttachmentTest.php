<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Invitation\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
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
 *
 * ## P208.01 et P208.05 (TCK-2190)
 *
 * La route générique `POST /api/invitations` est retirée : ces tests éprouvent la garde là où
 * elle vit, `InvitationService::send()`, que traversent les routes par rôle et la cooptation.
 * Le témoin « le générique reste ouvert à une agence individuelle » est retiré avec la route :
 * les routes par rôle refusent déjà l'agence `individual` (`InviteAgentTest`,
 * `test_individual_agency_admin_gets_403`), ce que `docs/features.md` § 1.12 écrit.
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

    /** @param  array<string,mixed>  $payload */
    private function envoyer(array $payload, User $inviter): Invitation
    {
        return app(InvitationService::class)->send($payload, $inviter);
    }

    /** @param  array<string,mixed>  $payload */
    private function assertRefuse(array $payload, User $inviter): void
    {
        try {
            $this->envoyer($payload, $inviter);
            $this->fail('L\'émission devait être refusée en 422.');
        } catch (ValidationException $e) {
            $this->assertSame(422, $e->status);
        }
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
            [$agency, $admin] = $this->agenceAvecAdmin($kind);

            foreach (['owner', 'agent', 'agency_admin', 'service_provider'] as $role) {
                $email = "sans-attache-{$kind->value}-{$role}@example.com";

                $this->assertRefuse([
                    'email' => $email,
                    'role' => $role,
                    'agency_id' => $agency->id,
                ], $admin);

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
        $operateur = $this->actingAsRole('super_admin');

        $this->envoyer([
            'email' => 'coopte@example.com',
            'role' => 'super_admin',
        ], $operateur);

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
        [$agency, $admin] = $this->agenceAvecAdmin(AgencyKind::Standard);

        $profil = AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => null,
            'status' => AgentProfileStatus::Draft->value,
        ]);

        $this->envoyer([
            'email' => 'rattache@example.com',
            'role' => 'agent',
            'agency_id' => $agency->id,
            'invitable_type' => AgentProfile::class,
            'invitable_id' => $profil->id,
        ], $admin);

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
        [$agency, $admin] = $this->agenceAvecAdmin(AgencyKind::Standard);

        $profil = AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => null,
            'status' => AgentProfileStatus::Draft->value,
        ]);

        $this->assertRefuse([
            'email' => 'incoherent@example.com',
            'role' => 'owner',
            'agency_id' => $agency->id,
            'invitable_type' => AgentProfile::class,
            'invitable_id' => $profil->id,
        ], $admin);

        $this->assertDatabaseMissing('invitations', ['email' => 'incoherent@example.com']);
    }
}
