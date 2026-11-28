<?php

namespace Tests\Feature\Admin\Platform;

use App\Jobs\Invoice\SendOverdueRemindersJob;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\SettingScope;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\InvoiceOverdueReminderNotification;
use App\Services\Invoice\OverdueReminderService;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\LateFeeCalculator;
use App\Services\Lease\LeaseRenewalService;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Lease\RentReviewService;
use App\Support\ScopedSetting;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * Les réglages métier à repli par agence : `ScopedSetting::value()` et les cinq services qui le lisent.
 *
 * TCK-3014 (ADR-0140 § 1 et § 5) — une classe pour le module, au lieu de trois nées d'un ticket
 * chacune (`ScopedSettingReadersTest`, TCK-600 ; `RentalSettingsCatalogueTest`, TCK-651 ;
 * `AgencySettingRowCatalogueTest`, TCK-964) qui partageaient un fournisseur et recopiaient une
 * réflexion sur deux lecteurs privés. Ces deux-là (`LeaseRenewalService::requireSignatureFlag`,
 * `LateFeeCalculator::capPercent`) se lisent désormais par ce qu'ils décident en public : le statut
 * d'un renouvellement, la pénalité d'une échéance en retard.
 *
 * - TCK-600 (verif-600 H1) — une ligne d'agence ne vaut que pour son agence : cinq lecteurs lisaient
 *   la première ligne `settings` venue, et un admin d'agence réécrivait le réglage de la plateforme.
 * - TCK-651 (ADR-0065) — la valeur globale s'écrit au catalogue (`PATCH /api/admin/settings`), et
 *   c'est elle que lit le service pour une agence sans réglage propre.
 * - TCK-964 (P47.04) — une ligne d'agence de `POST /api/settings` obéit aux bornes du catalogue, et
 *   une ligne écrite avant elles se lit à la borne.
 */
class ScopedSettingTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    /** L'échéance de sonde : 100 000 en retard de 15 jours, pénalité de 200 % — le plafond mord toujours. */
    private const SONDE_MONTANT = 100_000;

    private const SONDE_PENALITE_SANS_PLAFOND = 200_000.0;

    /**
     * Les cinq lecteurs, chacun par sa voie publique. `null` : un lecteur sans agence (pour les deux
     * lecteurs liés au bail, un bail sans agence).
     *
     * @return array<string, Closure(?int): mixed>
     */
    private static function lecteurs(): array
    {
        return [
            OverdueReminderService::SETTING_KEY => fn (?int $a) => app(OverdueReminderService::class)->offsets($a),
            RentReviewService::SETTING_KEY => fn (?int $a) => app(RentReviewService::class)->resolveMaxPct($a),
            EarlyTerminationService::SETTING_KEY => fn (?int $a) => app(EarlyTerminationService::class)->resolvePenaltyMonths($a),
            'lease.require_signature' => fn (?int $a) => self::signatureExigeeAuRenouvellement($a),
            'late_fees.cap_percent' => fn (?int $a) => self::plafondDesPenalites($a),
        ];
    }

    /** @return array<string, array{string, mixed, mixed, mixed}> */
    public static function portees(): array
    {
        return [
            'relances de facture' => [OverdueReminderService::SETTING_KEY, [40, 41], [5, 9], OverdueReminderService::DEFAULT_OFFSETS],
            'plafond de révision' => [RentReviewService::SETTING_KEY, 35, 12, (float) RentReviewService::DEFAULT_MAX_PCT],
            'pénalité de résiliation' => [EarlyTerminationService::SETTING_KEY, 5, 3, EarlyTerminationService::SETTING_DEFAULT_MONTHS],
            'signature au renouvellement' => ['lease.require_signature', true, false, false],
            'plafond des pénalités de retard' => ['late_fees.cap_percent', 7, 4, null],
        ];
    }

    /** TCK-600 (verif-600 H1) — la ligne d'une agence ne vaut que pour elle. */
    #[DataProvider('portees')]
    public function test_la_ligne_d_une_agence_ne_vaut_que_pour_elle(string $cle, mixed $valeurA, mixed $global, mixed $defaut): void
    {
        $lire = self::lecteurs()[$cle];
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $attendu = fn (mixed $v) => is_float($defaut) ? (float) $v : $v;

        $this->ligne($cle, $valeurA, SettingScope::Agency, $a->id);

        $this->assertEquals($attendu($valeurA), $lire($a->id), 'la ligne de A s\'applique à A');
        $this->assertEquals($defaut, $lire($b->id), 'la ligne de A ne change rien pour B');
        $this->assertEquals($defaut, $lire(null), 'ni pour un lecteur sans agence');

        $this->ligne($cle, $global, SettingScope::Global, null);

        $this->assertEquals($attendu($global), $lire($b->id), 'B lit le global');
        $this->assertEquals($attendu($valeurA), $lire($a->id), 'A garde la sienne');
    }

    /** La sonde S6 de verif-600, de bout en bout : par l'API, un admin d'agence n'atteint pas les autres. */
    public function test_un_admin_d_agence_ne_reecrit_pas_les_relances_des_autres(): void
    {
        $a = $this->agence();
        $b = $this->agence();
        $this->actingAsWithStepUp($this->personnel($a, 'agency_admin'));

        $this->postJson('/api/settings', [
            'key' => OverdueReminderService::SETTING_KEY,
            'scope' => 'agency',
            'value' => ['value' => [40, 41]],
        ])->assertCreated();

        $service = app(OverdueReminderService::class);
        $this->assertSame([40, 41], $service->offsets($a->id));
        $this->assertSame(OverdueReminderService::DEFAULT_OFFSETS, $service->offsets($b->id));
    }

    /**
     * verif-600 passe 2, m-B — le balayage quotidien unit les échéances de TOUTES les agences.
     * Une agence dont le seul réglage vaut [40] n'a aucune facture aux échéances par défaut : sans
     * l'union, le balayage ne la listerait jamais, et sa relance de J+40 ne partirait jamais.
     */
    public function test_le_balayage_relance_une_agence_a_ses_seules_echeances(): void
    {
        Notification::fake();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $this->ligne(OverdueReminderService::SETTING_KEY, [40], SettingScope::Agency, $a->id);
        $clientA = $this->factureEchue($a, 40);
        $clientB = $this->factureEchue($b, 40);

        $this->assertContains($a->id, app(OverdueReminderService::class)->agenciesWithRemindableInvoices());
        $this->assertSame(1, app()->call([new SendOverdueRemindersJob, 'handle']));

        Notification::assertSentToTimes($clientA, InvoiceOverdueReminderNotification::class, 1);
        // Témoin : J+40 n'est une échéance que pour A ; B garde le défaut.
        Notification::assertNothingSentTo($clientB);
    }

    /**
     * verif-600 passe 6 — les POINTS D'APPEL lisent l'agence du BAIL. Bail NON figé (colonnes
     * nulles) : A règle autrement que le global et lit son réglage ; B, sans ligne, lit le global.
     */
    public function test_un_bail_non_fige_lit_le_reglage_de_son_agence_a_chaque_point_d_appel(): void
    {
        Event::fake();
        [$a, $b] = [Agency::factory()->create(), Agency::factory()->create()];
        $this->ligne(EarlyTerminationService::SETTING_KEY, 3, SettingScope::Global, null);
        $this->ligne(EarlyTerminationService::SETTING_KEY, 6, SettingScope::Agency, $a->id);
        $this->ligne(RentReviewService::SETTING_KEY, 10, SettingScope::Global, null);
        $this->ligne(RentReviewService::SETTING_KEY, 20, SettingScope::Agency, $a->id);
        $this->ligne('lease.require_signature', false, SettingScope::Global, null);
        $this->ligne('lease.require_signature', true, SettingScope::Agency, $a->id);
        $this->ligne('late_fees.cap_percent', 50, SettingScope::Global, null);
        $this->ligne('late_fees.cap_percent', 3, SettingScope::Agency, $a->id);
        [$bailA, $bailB] = [self::bailNonFige($a->id), self::bailNonFige($b->id)];

        // K1, K2 — l'indemnité et le plafond qu'exécute un bail non figé.
        $this->assertSame([6, 3], [app(EarlyTerminationService::class)->penaltyMonthsFor($bailA), app(EarlyTerminationService::class)->penaltyMonthsFor($bailB)]);
        $this->assertSame([20.0, 10.0], [app(RentReviewService::class)->maxPctFor($bailA), app(RentReviewService::class)->maxPctFor($bailB)]);

        // K3 — le renouvellement sans changement de terme : la signature dépend du réglage de l'agence.
        $this->assertSame(LeaseStatus::PendingSignature, self::renouveler($bailA)->status);
        $this->assertSame(LeaseStatus::Active, self::renouveler($bailB)->status);

        // K6 — la pénalité de retard, 10 % de 100 000, plafonnée au cap de l'agence : 3 % pour A, 50 % pour B.
        $retard = fn (Lease $bail) => app(LateFeeCalculator::class)->compute(self::echeanceEnRetard($bail)->fresh());
        $bailA->forceFill(['late_fee_percent' => 10])->save();
        $bailB->forceFill(['late_fee_percent' => 10])->save();
        $this->assertSame([3000.0, 10000.0], [$retard($bailA), $retard($bailB)]);

        // Le gel du contrat fige ce même réglage d'agence (TCK-3014 : par `freezeRenewal`, plus par
        // réflexion sur `executionTerms`).
        $aFiger = self::bailNonFige($a->id);
        app(LeaseSignatureService::class)->freezeRenewal($aFiger);
        $aFiger->refresh();
        $this->assertSame([6, 20.0], [$aFiger->early_termination_penalty_months, (float) $aFiger->rent_review_max_pct]);
    }

    /**
     * TCK-778 (P13.07) — UN lecteur porte le déballage d'une ligne d'agence. Les formes stockées
     * se lisent comme les cinq copies qu'il remplace : `{"value": x}`, la forme héritée
     * `{"months": 3}` (première valeur d'un objet), et une liste laissée intacte pour une clé que le
     * catalogue type `integer_list`.
     *
     * @return array<string, array{string, mixed, mixed}>
     */
    public static function formesStockees(): array
    {
        return [
            'enveloppe value' => [EarlyTerminationService::SETTING_KEY, ['value' => 4], 4],
            'objet hérité' => [EarlyTerminationService::SETTING_KEY, ['months' => 3], 3],
            'liste pour une clé scalaire' => [RentReviewService::SETTING_KEY, [12], 12],
            'enveloppe value nulle' => ['late_fees.cap_percent', ['value' => null], null],
            'liste d\'échéances nue' => [OverdueReminderService::SETTING_KEY, [3, 9], [3, 9]],
            'liste d\'échéances enveloppée' => [OverdueReminderService::SETTING_KEY, ['value' => [3, 9]], [3, 9]],
        ];
    }

    #[DataProvider('formesStockees')]
    public function test_le_lecteur_unique_deballe_chaque_forme_stockee(string $cle, array $stocke, mixed $attendu): void
    {
        $a = Agency::factory()->create();
        Setting::query()->create(['key' => $cle, 'value' => $stocke, 'scope' => SettingScope::Agency, 'scope_id' => $a->id]);

        $this->assertSame($attendu, ScopedSetting::value($cle, $a->id, 'global'));
    }

    public function test_sans_ligne_d_agence_le_lecteur_unique_deballe_la_valeur_globale(): void
    {
        $a = Agency::factory()->create();

        $this->assertSame(7, ScopedSetting::value(EarlyTerminationService::SETTING_KEY, $a->id, 7));
        $this->assertSame(3, ScopedSetting::value(EarlyTerminationService::SETTING_KEY, null, ['months' => 3]));
        $this->assertSame([3, 9], ScopedSetting::value(OverdueReminderService::SETTING_KEY, $a->id, [3, 9]));
    }

    /** TCK-778 (P13.07) — aucune copie du déballage ne survit hors de `ScopedSetting`. */
    public function test_aucun_lecteur_ne_recopie_le_deballage(): void
    {
        $copies = [];
        $fichiers = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path(), \FilesystemIterator::SKIP_DOTS));
        foreach ($fichiers as $fichier) {
            if ($fichier->getExtension() !== 'php' || str_ends_with($fichier->getPathname(), 'Support/ScopedSetting.php')) {
                continue;
            }
            $source = (string) file_get_contents($fichier->getPathname());
            if (str_contains($source, 'ScopedSetting::agencyRow(') || preg_match('/array_values\(\$value\)\[0\]/', $source) === 1) {
                $copies[] = str_replace(app_path().'/', '', $fichier->getPathname());
            }
        }

        $this->assertSame([], $copies, 'ces fichiers déballent eux-mêmes une ligne de settings au lieu de ScopedSetting::value()');
    }

    /**
     * r6, étendu aux deux plafonds de bail (signalé par terrain-7, sur le modèle de `LeaseDefaults`, acee36b80) —
     * une ligne d'agence sans valeur valable n'est pas un réglage : le plafond retombe sur le GLOBAL du
     * catalogue, jamais sur la constante du service. `{"value": null}` et `{}` se lisaient 0, donc la
     * constante ; 0 est hors des règles du catalogue de la révision (`gt:0`), une ligne écrite avant elles.
     * TCK-2842 — 0 est un réglage de l'indemnité (« aucune indemnité », `min:0`) : `BorneDeLIndemniteDeDepartTest`.
     *
     * @return array<string, array{string, mixed, int|float}>
     */
    public static function plafondsDeBail(): array
    {
        return [
            'pénalité, {"value": null}' => [EarlyTerminationService::SETTING_KEY, ['value' => null], 7],
            'pénalité, {}' => [EarlyTerminationService::SETTING_KEY, [], 7],
            'révision, {"value": null}' => [RentReviewService::SETTING_KEY, ['value' => null], 12.5],
            'révision, {}' => [RentReviewService::SETTING_KEY, [], 12.5],
            'révision, {"value": 0}' => [RentReviewService::SETTING_KEY, ['value' => 0], 12.5],
        ];
    }

    #[DataProvider('plafondsDeBail')]
    public function test_une_ligne_d_agence_sans_valeur_retombe_sur_le_global(string $cle, array $ligne, int|float $global): void
    {
        $a = Agency::factory()->create();
        $this->ligne($cle, $global, SettingScope::Global, null);
        Setting::query()->create(['key' => $cle, 'value' => $ligne, 'scope' => SettingScope::Agency, 'scope_id' => $a->id]);

        $this->assertEquals($global, self::lecteurs()[$cle]($a->id), 'le global, pas la constante du service');
        $this->assertNotEquals($global, $cle === RentReviewService::SETTING_KEY ? (float) RentReviewService::DEFAULT_MAX_PCT : EarlyTerminationService::SETTING_DEFAULT_MONTHS, 'témoin : le global diffère de la constante');
    }

    /** @return array<string, array{string, mixed, mixed, mixed}> */
    public static function catalogue(): array
    {
        return [
            'relances de facture' => [OverdueReminderService::SETTING_KEY, [20, 5, 10, 5], [5, 10, 20], [40]],
            'plafond de révision' => [RentReviewService::SETTING_KEY, 12.5, 12.5, 30.0],
            'pénalité de résiliation' => [EarlyTerminationService::SETTING_KEY, 4, 4, 6],
            'signature au renouvellement' => ['lease.require_signature', true, true, false],
            'plafond des pénalités de retard' => ['late_fees.cap_percent', 7.5, 7.5, 3.0],
        ];
    }

    /** TCK-651 (ADR-0065) — la valeur écrite au catalogue est celle que lit le service. */
    #[DataProvider('catalogue')]
    public function test_la_valeur_du_catalogue_est_celle_que_lit_le_service(string $cle, mixed $envoye, mixed $lu, mixed $agence): void
    {
        $lire = self::lecteurs()[$cle];
        $this->actingAsRole('super_admin');
        $sansReglage = Agency::factory()->create();
        $avecReglage = Agency::factory()->create();
        Setting::query()->create(['key' => $cle, 'value' => ['value' => $agence], 'scope' => SettingScope::Agency, 'scope_id' => $avecReglage->id]);

        $this->patchJson('/api/admin/settings', [$cle => $envoye])->assertOk();

        $this->assertSame($lu, $lire($sansReglage->id), 'une agence sans réglage lit le catalogue');
        $this->assertSame($lu, $lire(null), 'un lecteur sans agence aussi');
        $this->assertSame($agence, $lire($avecReglage->id), 'la ligne de l\'agence l\'emporte');

        $journal = Activity::query()->where('event', 'super_admin_setting_updated')->latest('id')->first();
        $this->assertSame($cle, $journal?->properties['key']);
        $this->assertSame($lu, $journal->properties['new_value']);
    }

    /** Sans rien au catalogue, chaque service lit le défaut que le catalogue lui emprunte. */
    public function test_le_defaut_du_catalogue_est_celui_du_service(): void
    {
        $lire = self::lecteurs();

        $this->assertSame(OverdueReminderService::DEFAULT_OFFSETS, $lire[OverdueReminderService::SETTING_KEY](null));
        $this->assertSame((float) RentReviewService::DEFAULT_MAX_PCT, $lire[RentReviewService::SETTING_KEY](null));
        $this->assertSame(EarlyTerminationService::SETTING_DEFAULT_MONTHS, $lire[EarlyTerminationService::SETTING_KEY](null));
        $this->assertFalse($lire['lease.require_signature'](null));
        $this->assertNull($lire['late_fees.cap_percent'](null));
    }

    /** @return array<string, array{string, mixed}> */
    public static function horsReglesDuCatalogue(): array
    {
        return [
            'plafond de révision non numérique' => [RentReviewService::SETTING_KEY, 'abc'],
            'plafond de révision nul' => [RentReviewService::SETTING_KEY, 0],
            'plafond de révision au-delà de 100' => [RentReviewService::SETTING_KEY, 150],
            'aucune relance' => [OverdueReminderService::SETTING_KEY, []],
            'relance à zéro jour' => [OverdueReminderService::SETTING_KEY, [0, 7]],
            'pénalité au-delà de douze mois' => [EarlyTerminationService::SETTING_KEY, 13], // TCK-2842
            'pénalité décimale' => [EarlyTerminationService::SETTING_KEY, 1.5],
            'signature non booléenne' => ['lease.require_signature', 'peut-être'],
            'plafond des pénalités négatif' => ['late_fees.cap_percent', -1],
        ];
    }

    #[DataProvider('horsReglesDuCatalogue')]
    public function test_une_valeur_globale_hors_regles_est_refusee_et_n_est_pas_ecrite(string $cle, mixed $valeur): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/settings', [$cle => $valeur])
            ->assertUnprocessable()
            ->assertJsonValidationErrors($cle);

        $this->assertFalse(Setting::query()->where('key', $cle)->exists());
        $this->assertFalse(Activity::query()->where('event', 'super_admin_setting_updated')->exists());
    }

    /** Un plafond des pénalités vide se lit « aucun plafond », pas zéro. */
    public function test_un_plafond_des_penalites_vide_retire_le_plafond(): void
    {
        $this->actingAsRole('super_admin');
        $this->patchJson('/api/admin/settings', ['late_fees.cap_percent' => 5])->assertOk();

        $this->patchJson('/api/admin/settings', ['late_fees.cap_percent' => null])
            ->assertOk()
            ->assertJsonPath('data.rentals.4.value', null);

        $this->assertNull(self::plafondDesPenalites(null));
    }

    /** @return array<string, array{string, array<mixed>}> */
    public static function ligneDAgenceHorsBornes(): array
    {
        return [
            'hausse de loyer à 500 %' => [RentReviewService::SETTING_KEY, ['value' => 500]],
            'plafond des pénalités à 1000 %' => ['late_fees.cap_percent', ['value' => 1000]],
            'indemnité de 99 mois' => [EarlyTerminationService::SETTING_KEY, ['value' => 99]],
            'indemnité de 13 mois' => [EarlyTerminationService::SETTING_KEY, ['value' => 13]], // TCK-2842 : 0 vaut, 12 au plus
            'relances non numériques' => [OverdueReminderService::SETTING_KEY, ['value' => 'abc']],
            'relance à 400 jours' => [OverdueReminderService::SETTING_KEY, ['value' => [3, 400]]],
            'signature non booléenne' => ['lease.require_signature', ['value' => 'peut-être']],
        ];
    }

    /** TCK-964 (P47.04) — une ligne d'agence obéit aux bornes du catalogue. */
    #[DataProvider('ligneDAgenceHorsBornes')]
    public function test_une_ligne_d_agence_hors_des_regles_du_catalogue_est_refusee(string $cle, array $valeur): void
    {
        $this->adminDAgence();

        $this->postJson('/api/settings', ['key' => $cle, 'value' => $valeur, 'scope' => SettingScope::Agency->value])
            ->assertStatus(422)
            ->assertJsonValidationErrors('value');

        $this->assertSame(0, Setting::query()->count());
    }

    /** @return array<string, array{string}> */
    public static function horsCatalogue(): array
    {
        return [
            'clé sans lecteur' => ['site_name'],
            'clé du catalogue sans repli par agence' => ['credits.welcome_amount'],
        ];
    }

    #[DataProvider('horsCatalogue')]
    public function test_une_cle_hors_catalogue_est_refusee(string $cle): void
    {
        $this->adminDAgence();

        $this->postJson('/api/settings', ['key' => $cle, 'value' => ['value' => 8], 'scope' => SettingScope::Agency->value])
            ->assertStatus(422)
            ->assertJsonValidationErrors('key');

        $this->assertSame(0, Setting::query()->count());
    }

    public function test_une_ligne_d_agence_dans_les_bornes_s_ecrit_et_se_lit(): void
    {
        $agence = $this->adminDAgence();

        $this->postJson('/api/settings', ['key' => RentReviewService::SETTING_KEY, 'value' => ['value' => 8], 'scope' => 'agency'])->assertCreated();
        $this->postJson('/api/settings', ['key' => OverdueReminderService::SETTING_KEY, 'value' => ['value' => [40, 41]], 'scope' => 'agency'])->assertCreated();
        $this->postJson('/api/settings', ['key' => 'late_fees.cap_percent', 'value' => ['value' => null], 'scope' => 'agency'])->assertCreated();

        $this->assertSame(8.0, app(RentReviewService::class)->resolveMaxPct($agence->id));
        $this->assertSame([40, 41], app(OverdueReminderService::class)->offsets($agence->id));
    }

    /** L'autorisation prime toujours : un agent ne lit pas le catalogue dans un 422 (CLAUDE.md, « Validation », piège 2). */
    public function test_un_agent_recoit_403_meme_pour_une_cle_hors_catalogue(): void
    {
        $agence = Agency::factory()->create();
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agence);
        Sanctum::actingAs($agent);

        $this->postJson('/api/settings', ['key' => 'site_name', 'value' => ['value' => 1], 'scope' => 'agency'])
            ->assertForbidden();
        $this->postJson('/api/settings', ['key' => 'site_name', 'value' => ['value' => 1], 'scope' => 'global'])
            ->assertForbidden()
            ->assertJsonPath('code', 'setting.global_forbidden');
    }

    public function test_une_ligne_deja_ecrite_hors_borne_se_lit_a_la_borne(): void
    {
        $agence = Agency::factory()->create();
        foreach ([
            RentReviewService::SETTING_KEY => 500,
            EarlyTerminationService::SETTING_KEY => 99,
            'late_fees.cap_percent' => 1000,
        ] as $cle => $valeur) {
            Setting::query()->create(['key' => $cle, 'value' => ['value' => $valeur], 'scope' => SettingScope::Agency, 'scope_id' => $agence->id]);
        }

        $this->assertSame(100.0, app(RentReviewService::class)->resolveMaxPct($agence->id));
        $this->assertSame(12, app(EarlyTerminationService::class)->resolvePenaltyMonths($agence->id)); // TCK-2842
        $this->assertSame(100.0, self::plafondDesPenalites($agence->id));
    }

    public function test_un_plafond_negatif_deja_ecrit_se_lit_a_zero(): void
    {
        $agence = Agency::factory()->create();
        Setting::query()->create(['key' => 'late_fees.cap_percent', 'value' => ['value' => -5], 'scope' => SettingScope::Agency, 'scope_id' => $agence->id]);

        $this->assertSame(0.0, self::plafondDesPenalites($agence->id));
    }

    /**
     * Le plafond des pénalités de retard que `LateFeeCalculator` applique aux baux de l'agence, lu par
     * la pénalité qu'il calcule : une échéance de 100 000 à 200 % de pénalité, que tout plafond (au plus
     * 100 %) ramène à `plafond × 1 000`. `null` : la pénalité n'est pas plafonnée.
     */
    private static function plafondDesPenalites(?int $agence): ?float
    {
        $bail = self::bailNonFige($agence);
        $bail->forceFill(['late_fee_percent' => 200])->save();
        // Une instance neuve : le calculateur garde le plafond lu pour la vie de l'instance (TCK-779).
        $penalite = (new LateFeeCalculator)->compute(self::echeanceEnRetard($bail)->fresh());

        return $penalite === self::SONDE_PENALITE_SANS_PLAFOND ? null : $penalite * 100 / self::SONDE_MONTANT;
    }

    /** La signature que `LeaseRenewalService` exige d'un renouvellement sans changement de terme, pour un bail de l'agence. */
    private static function signatureExigeeAuRenouvellement(?int $agence): bool
    {
        return self::renouveler(self::bailNonFige($agence))->status === LeaseStatus::PendingSignature;
    }

    private static function renouveler(Lease $bail): Lease
    {
        return app(LeaseRenewalService::class)->renew($bail, [
            'start_date' => $bail->end_date->copy()->addDay()->toDateString(),
            'end_date' => $bail->end_date->copy()->addYear()->toDateString(),
        ]);
    }

    private static function bailNonFige(?int $agence): Lease
    {
        return Lease::factory()->active()->create([
            'agency_id' => $agence,
            'property_id' => Property::factory()->create(['agency_id' => $agence])->id,
            'tenant_id' => Customer::factory()->create()->id,
            'start_date' => now()->subYear(),
            'end_date' => now(),
            'monthly_rent' => 400_000,
            'late_fee_percent' => 10,
            'late_fee_grace_days' => 0,
            'early_termination_penalty_months' => null,
            'rent_review_max_pct' => null,
            'contract_sha256' => null,
        ]);
    }

    private static function echeanceEnRetard(Lease $bail): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $bail->id,
            'amount' => self::SONDE_MONTANT,
            'due_date' => now()->subDays(15)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);
    }

    private function adminDAgence(): Agency
    {
        $agence = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agence);
        Sanctum::actingAs($admin);

        return $agence;
    }

    private function factureEchue(Agency $agence, int $joursDeRetard): User
    {
        $client = User::factory()->create();
        Invoice::factory()->sent()->create([
            'agency_id' => $agence->id,
            'customer_id' => Customer::factory()->create(['user_id' => $client->id])->id,
            'due_date' => now()->subDays($joursDeRetard)->toDateString(),
        ]);

        return $client;
    }

    private function ligne(string $cle, mixed $valeur, SettingScope $portee, ?int $agence): void
    {
        Setting::query()->create(['key' => $cle, 'value' => ['value' => $valeur], 'scope' => $portee, 'scope_id' => $agence]);
    }
}
