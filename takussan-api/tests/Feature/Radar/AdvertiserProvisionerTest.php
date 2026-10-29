<?php

namespace Tests\Feature\Radar;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditWelcomeGrant;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\PlatformAbility;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\RadarAdvertiser;
use App\Models\User;
use App\Services\Onboarding\HostIndividualOnboardingService;
use App\Services\Public\PublicProfileFacts;
use App\Services\Radar\AdvertiserProvisioner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * TCK-2389 (ADR-0077 §6, ADR-0033 §3) — le compte et l'espace que « Publier pour lui » crée pour un annonceur : un
 * compte sans mot de passe dont le numéro n'est PAS vérifié (la connexion par code l'ouvre ensuite), un espace
 * individuel, aucun crédit de bienvenue tant que le numéro n'est pas vérifié. Un numéro déjà porté par un utilisateur
 * n'en crée aucun : on ne rattache pas des annonces à un compte qui n'est pas celui de l'annonceur.
 *
 * Les événements ne sont pas simulés : `SpaceCreated` joue son vrai écouteur (l'offre de bienvenue).
 */
class AdvertiserProvisionerTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    private function annonceur(array $surcharge = []): RadarAdvertiser
    {
        return RadarAdvertiser::factory()->create($surcharge + ['phone' => self::NUMERO, 'display_name' => 'Awa Diop']);
    }

    /** L'appel de la publication : dans une transaction, l'annonceur verrouillé. @return array{created: bool, user: User, agency: Agency} */
    private function provisionner(RadarAdvertiser $annonceur): array
    {
        return DB::transaction(function () use ($annonceur): array {
            $locked = RadarAdvertiser::query()->whereKey($annonceur->id)->lockForUpdate()->firstOrFail();

            return app(AdvertiserProvisioner::class)->provision($locked);
        });
    }

    private function assertRefuse(RadarAdvertiser $annonceur, User $porteur): void
    {
        $avant = [$porteur->fresh()->updated_at->toIso8601String(), $porteur->fresh()->phone, User::query()->count(), Agency::query()->count()];

        try {
            $this->provisionner($annonceur);
            $this->fail('Le numéro porté par un utilisateur aurait dû être refusé.');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame('radar.advertiser.phone_registered', $e->errorCode);
        }

        $this->assertSame($avant, [$porteur->fresh()->updated_at->toIso8601String(), $porteur->fresh()->phone, User::query()->count(), Agency::query()->count()]);
        $this->assertNull($annonceur->fresh()->user_id);
        $this->assertTrue(app(AdvertiserProvisioner::class)->phoneRegistered($annonceur->fresh()));
    }

    public function test_le_compte_cree_n_a_ni_mot_de_passe_ni_numero_verifie_ni_email(): void
    {
        $annonceur = $this->annonceur();

        ['created' => $created, 'user' => $user] = $this->provisionner($annonceur);

        $this->assertTrue($created);
        $user = $user->fresh();
        $this->assertSame('Awa', $user->first_name);
        $this->assertSame('Diop', $user->last_name);
        $this->assertNull($user->email);
        $this->assertNull($user->password_set_at);
        $this->assertFalse($user->hasUsablePassword());
        $this->assertFalse(Hash::check('quelconque', (string) $user->password));
        $this->assertSame(self::NUMERO, $user->phone);
        $this->assertNull($user->phone_verified_at);
        $this->assertTrue($user->phone_whatsapp);
        $this->assertSame(UserStatus::Active, $user->status);
        $this->assertSame('fr', $user->preferred_language);
        $this->assertSame($user->id, $annonceur->fresh()->user_id);
    }

    public function test_un_nom_d_un_seul_mot_ou_absent(): void
    {
        $seul = $this->provisionner($this->annonceur(['display_name' => 'Awa', 'phone' => '+221771234501']))['user'];
        $sans = $this->provisionner($this->annonceur(['display_name' => null, 'phone' => '+221771234502']))['user'];

        $this->assertSame(['Awa', ''], [$seul->first_name, $seul->last_name]);
        $this->assertSame(['', ''], [$sans->first_name, $sans->last_name]);
    }

    /** TCK-2390, vérification adverse I-1 — le nom du compte et de l'espace public ne recopient pas un numéro du nom affiché. */
    public function test_le_numero_d_un_nom_affiche_n_entre_ni_dans_le_compte_ni_dans_l_espace(): void
    {
        ['user' => $user, 'agency' => $agency] = $this->provisionner($this->annonceur(['display_name' => '771234567 Awa Diop 77 123 45 67']));

        $this->assertSame(['Awa', 'Diop'], [$user->first_name, $user->last_name]);
        $this->assertSame('Espace de Awa', $agency->name);
    }

    public function test_l_espace_est_individuel_nomme_d_apres_le_prenom_et_l_annonceur_y_est_proprietaire(): void
    {
        ['user' => $user, 'agency' => $agency] = $this->provisionner($this->annonceur());

        $this->assertSame(AgencyKind::Individual, $agency->kind);
        $this->assertSame('Espace de Awa', $agency->name);
        $this->assertSame($user->id, $agency->primary_admin_id);
        $this->assertSame([$user->id => 'owner'], PublicProfileFacts::rolesPublics([$user->id]));
    }

    public function test_aucun_credit_de_bienvenue_tant_que_le_numero_n_est_pas_verifie(): void
    {
        $this->provisionner($this->annonceur());

        $this->assertSame(0, CreditWelcomeGrant::query()->count());
        $this->assertSame(0, CreditLot::query()->count());
    }

    public function test_temoin_le_meme_espace_pour_un_numero_verifie_recoit_bien_l_offre(): void
    {
        // Sans ce témoin, l'absence d'octroi ci-dessus pourrait venir d'un écouteur qui ne tourne pas dans ce test.
        $verifie = User::factory()->create(['phone' => '+221771234599', 'phone_verified_at' => now()]);

        app(HostIndividualOnboardingService::class)->autoOnboard($verifie);

        $this->assertSame(1, CreditWelcomeGrant::query()->count());
    }

    public function test_un_numero_porte_en_principal_non_verifie_est_refuse(): void
    {
        $porteur = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => null]);

        $this->assertRefuse($this->annonceur(), $porteur);
    }

    public function test_un_numero_porte_en_principal_verifie_est_refuse(): void
    {
        $porteur = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);

        $this->assertRefuse($this->annonceur(), $porteur);
    }

    public function test_un_numero_porte_en_secondaire_est_refuse(): void
    {
        $porteur = User::factory()->create(['phone' => '+221771230000']);
        $porteur->forceFill(['secondary_phone' => self::NUMERO])->save();

        $this->assertRefuse($this->annonceur(), $porteur);
    }

    public function test_un_numero_ecrit_autrement_est_refuse(): void
    {
        $principal = User::factory()->create(['phone' => '77 123 45 67']);
        $this->assertRefuse($this->annonceur(), $principal);

        $secondaire = User::factory()->create(['phone' => '+221771230001']);
        $secondaire->forceFill(['secondary_phone' => '77.123.45.68'])->save();
        $this->assertRefuse($this->annonceur(['phone' => '+221771234568']), $secondaire);
    }

    public function test_un_second_appel_rend_le_meme_compte_sans_rien_creer(): void
    {
        $annonceur = $this->annonceur();
        $premier = $this->provisionner($annonceur);
        $comptes = User::query()->count();
        $espaces = Agency::query()->count();

        $second = $this->provisionner($annonceur->fresh());

        $this->assertFalse($second['created']);
        $this->assertSame($premier['user']->id, $second['user']->id);
        $this->assertSame($premier['agency']->id, $second['agency']->id);
        $this->assertSame([$comptes, $espaces], [User::query()->count(), Agency::query()->count()]);
    }

    public function test_un_annonceur_deja_rattache_n_est_pas_refuse_par_son_propre_numero(): void
    {
        $annonceur = $this->annonceur();
        $this->provisionner($annonceur);

        // Son propre compte porte maintenant le numéro : le refus ne vaut que pour un annonceur sans compte.
        $this->assertFalse(app(AdvertiserProvisioner::class)->phoneRegistered($annonceur->fresh()));
        $this->provisionner($annonceur->fresh());
    }

    public function test_le_refus_a_ete_pose_sans_ecrire_pour_l_apercu(): void
    {
        $annonceur = $this->annonceur();
        $provisioner = app(AdvertiserProvisioner::class);

        $this->assertFalse($provisioner->phoneRegistered($annonceur));
        User::factory()->create(['phone' => self::NUMERO]);
        $this->assertTrue($provisioner->phoneRegistered($annonceur));
        $this->assertNull($annonceur->fresh()->user_id);
    }

    public function test_un_stop_ferme_la_creation_meme_quand_le_numero_n_est_pas_encore_purge(): void
    {
        // `RadarConsentWorkflow::stop()` ne purge rien : le numéro reste, `do_not_contact_at` dit tout.
        $annonceur = $this->annonceur(['do_not_contact_at' => now()]);
        $comptes = User::query()->count();

        try {
            $this->provisionner($annonceur);
            $this->fail('Un annonceur qui a dit STOP n\'a pas de compte à créer.');
        } catch (ApiError $e) {
            $this->assertSame('radar.advertiser.do_not_contact', $e->errorCode);
        }

        $this->assertSame($comptes, User::query()->count());
        $this->assertNull($annonceur->fresh()->user_id);
    }

    public function test_un_compte_rattache_supprime_n_est_ni_rouvert_ni_un_404(): void
    {
        $annonceur = $this->annonceur();
        $premier = $this->provisionner($annonceur);
        $premier['user']->delete();
        $avant = [User::query()->count(), Agency::query()->count()];

        $this->assertSame(true, app(AdvertiserProvisioner::class)->accountUnavailable($annonceur->fresh()));
        try {
            $this->provisionner($annonceur->fresh());
            $this->fail('Un compte supprimé ne reçoit pas de publication.');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame('radar.advertiser.account_unavailable', $e->errorCode);
        }

        $this->assertSame($avant, [User::query()->count(), Agency::query()->count()]);
        $this->assertTrue($premier['user']->fresh()->trashed(), 'le compte supprimé reste supprimé');
    }

    public function test_un_compte_rattache_bloque_n_est_pas_reactive_par_la_publication(): void
    {
        $annonceur = $this->annonceur();
        $premier = $this->provisionner($annonceur);
        $premier['user']->forceFill(['status' => UserStatus::Blocked])->save();
        // Le profil d'administration de l'espace est suspendu avec le compte : `autoOnboard()` le réactiverait.
        AgencyAdminProfile::query()->where('user_id', $premier['user']->id)->update(['status' => AgencyAdminProfileStatus::Suspended->value]);
        $profils = AgencyAdminProfile::query()->where('user_id', $premier['user']->id)->get()->map->getAttributes()->all();

        $this->assertTrue(app(AdvertiserProvisioner::class)->accountUnavailable($annonceur->fresh()));
        try {
            $this->provisionner($annonceur->fresh());
            $this->fail('Un compte bloqué ne reçoit pas de publication.');
        } catch (ApiError $e) {
            $this->assertSame('radar.advertiser.account_unavailable', $e->errorCode);
        }

        $this->assertSame(UserStatus::Blocked, $premier['user']->fresh()->status);
        $this->assertEquals($profils, AgencyAdminProfile::query()->where('user_id', $premier['user']->id)->get()->map->getAttributes()->all());
    }

    public function test_un_annonceur_sans_numero_purge_apres_un_stop_n_a_pas_de_compte(): void
    {
        $annonceur = RadarAdvertiser::factory()->doNotContact()->create();
        $comptes = User::query()->count();

        try {
            $this->provisionner($annonceur);
            $this->fail('Un annonceur sans numéro n\'a pas de compte à créer.');
        } catch (ApiError $e) {
            $this->assertSame('radar.advertiser.do_not_contact', $e->errorCode);
        }

        $this->assertSame($comptes, User::query()->count());
    }

    public function test_seul_le_super_admin_publie(): void
    {
        $this->assertFalse(PlatformAbility::RadarPublish->grantedTo(PlatformProfileLevel::Viewer));
        $this->assertFalse(PlatformAbility::RadarPublish->grantedTo(PlatformProfileLevel::Support));
        $this->assertTrue(PlatformAbility::RadarPublish->grantedTo(PlatformProfileLevel::SuperAdmin));
        $this->assertSame('platform.radar.publish', PlatformAbility::RadarPublish->value);
    }

    /**
     * TCK-2390 — le compte orphelin (revue finale de TCK-2389) : le titulaire a vérifié le numéro sur un AUTRE compte. Une
     * seconde publication ne verse plus rien dans le compte du Radar, que la connexion par code n'ouvre plus.
     */
    public function test_tck2390_un_numero_verifie_ailleurs_depuis_refuse_la_seconde_publication(): void
    {
        $annonceur = $this->annonceur();
        ['user' => $compteRadar] = $this->provisionner($annonceur);
        $this->assertFalse(app(AdvertiserProvisioner::class)->phoneRegistered($annonceur->fresh()));

        // Le compte du Radar lui-même, même vérifié, n'est pas « un autre compte ».
        $compteRadar->forceFill(['phone_verified_at' => now()])->save();
        $this->assertFalse(app(AdvertiserProvisioner::class)->phoneRegistered($annonceur->fresh()));
        $compteRadar->forceFill(['phone_verified_at' => null])->save();

        User::factory()->create(['phone' => '77 123 45 67', 'phone_verified_at' => now()]);
        $this->assertTrue(app(AdvertiserProvisioner::class)->phoneRegistered($annonceur->fresh()));

        try {
            $this->provisionner($annonceur->fresh());
            $this->fail('La seconde publication aurait dû être refusée.');
        } catch (ApiError $e) {
            $this->assertSame([422, 'radar.advertiser.phone_registered'], [$e->getStatusCode(), $e->errorCode]);
        }
        $this->assertSame($compteRadar->id, $annonceur->fresh()->user_id);
    }
}
