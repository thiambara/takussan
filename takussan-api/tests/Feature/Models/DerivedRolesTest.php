<?php

namespace Tests\Feature\Models;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-492 — `customer` et `tenant` sont des rôles DÉRIVÉS.
 *
 * Ils n'ont ni table, ni profil polymorphe : `customer` est le plancher de
 * toute identité authentifiée, `tenant` se déduit d'un bail en cours et
 * disparaît avec lui.
 *
 * ⚠ Ce que ces tests gardent vraiment : `profileTypes()` a cessé de les émettre
 * au cutover TCK-278 (2026-05-17) et personne ne l'a vu pendant trois mois et
 * demi, parce que le seul symptôme était une condition front qui ne s'allumait
 * plus. Une condition éteinte ne rougit pas.
 */
class DerivedRolesTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_compte_nu_est_deja_un_customer(): void
    {
        $user = User::factory()->create();

        // AC1 — le code d'avant rendait `[]` ici.
        $this->assertSame(['customer'], $user->profileTypes()->all());
    }

    public function test_auth_me_emet_customer_sur_un_compte_sans_aucun_profil(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('roles', ['customer']);
    }

    public function test_un_bail_en_cours_ajoute_tenant_et_sa_fin_le_retire(): void
    {
        [$user, $lease] = $this->userAvecBail(LeaseStatus::Active);

        // AC2 — les deux, pas l'un OU l'autre : le modèle est additif.
        $this->assertSame(['customer', 'tenant'], $user->fresh()->profileTypes()->all());

        $lease->forceFill(['status' => LeaseStatus::Terminated->value])->save();

        $this->assertSame(['customer'], $user->fresh()->profileTypes()->all());
    }

    public function test_un_preavis_en_cours_reste_un_bail_habite(): void
    {
        // `Terminating` = le congé est posé, le loyer reste dû, la personne
        // habite toujours. Lui retirer « Mes baux » le jour de la demande lui
        // retirerait l'écran où son préavis se suit.
        [$user] = $this->userAvecBail(LeaseStatus::Terminating);

        $this->assertContains('tenant', $user->fresh()->profileTypes()->all());
    }

    public function test_un_bail_en_brouillon_ne_fait_pas_un_locataire(): void
    {
        [$user] = $this->userAvecBail(LeaseStatus::Draft);

        $this->assertNotContains('tenant', $user->fresh()->profileTypes()->all());
    }

    public function test_un_agency_admin_qui_loue_par_ailleurs_porte_ses_deux_natures(): void
    {
        // AC3 — le modèle est additif (principe non négociable n° 2), pas
        // exclusif : administrer une agence n'empêche pas d'habiter un
        // logement, et le menu doit servir les deux.
        [$user] = $this->userAvecBail(LeaseStatus::Active);
        $agency = Agency::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $roles = $user->fresh()->profileTypes()->all();

        $this->assertContains('agency_admin', $roles);
        $this->assertContains('customer', $roles);
        $this->assertContains('tenant', $roles);
    }

    public function test_le_bail_d_un_dossier_client_sans_compte_ne_deteint_sur_personne(): void
    {
        // `customers.user_id` est NULLABLE : un dossier locataire existe pour
        // quelqu'un qui n'a pas de compte. Le jour où les séquences `users` et
        // `customers` se croisent, un `hasMany(Lease, 'tenant_id')` posé sur
        // `User` aurait rendu `tenant` au mauvais compte.
        $client = Customer::factory()->create(['user_id' => null]);
        Lease::factory()->create(['tenant_id' => $client->id, 'status' => LeaseStatus::Active]);

        $temoin = User::factory()->create();

        $this->assertSame(['customer'], $temoin->profileTypes()->all());
    }

    public function test_le_bail_d_un_autre_locataire_ne_deteint_pas(): void
    {
        [$locataire] = $this->userAvecBail(LeaseStatus::Active);
        $voisin = User::factory()->create();

        $this->assertContains('tenant', $locataire->fresh()->profileTypes()->all());
        $this->assertNotContains('tenant', $voisin->profileTypes()->all());
    }

    /**
     * AC6 — le coût de la dérivation est MESURÉ, pas supposé. `customer` est
     * gratuit ; `tenant` vaut exactement un `exists()`.
     */
    public function test_la_derivation_coute_une_requete_et_une_seule(): void
    {
        $user = User::factory()->create();

        $requetes = 0;
        \DB::listen(function () use (&$requetes) {
            $requetes++;
        });

        $user->profileTypes();

        // 5 `exists()` de profil — PlatformProfile, agencyAdmin, agent, owner,
        // serviceProvider — plus 1 pour le bail.
        //
        // ⚠ **Ce chiffre valait 7 jusqu'au 2026-08-31** : TCK-495 a retiré le
        // `exists()` du courtier, et ce test a rougi sur la suite entière alors
        // que rien du COÛT de la dérivation n'avait changé. *Un compte écrit en
        // dur mesure la composition de la méthode autant que son coût, et se
        // périme au premier profil ajouté ou retiré.* Il reste néanmoins écrit
        // en dur, et c'est délibéré : le dériver reviendrait à recompter ce que
        // `profileTypes()` fait — un test qui recalcule son sujet ne le mesure
        // plus. Le cliquet est à DEUX sens ; s'il bouge, corriger ICI, avec sa
        // date et son motif.
        $this->assertSame(6, $requetes);
    }

    /**
     * AC6, la moitié qui NE dérive PAS — et c'est elle qui porte le sens.
     *
     * Le cas ci-dessus compte le total, donc il compte aussi le nombre de
     * profils, qui n'a rien à voir avec la dérivation. Celui-ci mesure la seule
     * propriété que le ticket affirmait : **`tenant` vaut exactement un
     * `exists()`**, quel que soit le nombre de profils polymorphes.
     */
    public function test_le_role_tenant_vaut_exactement_une_requete(): void
    {
        [$locataire] = $this->userAvecBail(LeaseStatus::Active);
        $locataire = $locataire->fresh();

        $requetes = 0;
        \DB::listen(function () use (&$requetes) {
            $requetes++;
        });

        $this->assertTrue($locataire->hasActiveTenantLease());

        $this->assertSame(1, $requetes);
    }

    /** @return array{0: User, 1: Lease} */
    private function userAvecBail(LeaseStatus $statut): array
    {
        $user = User::factory()->create();
        $client = Customer::factory()->create(['user_id' => $user->id]);
        $lease = Lease::factory()->create(['tenant_id' => $client->id, 'status' => $statut]);

        return [$user, $lease];
    }
}
