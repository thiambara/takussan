<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\AgenceDeLaCible;
use App\Domain\Notifications\NotificationCode;
use App\Jobs\SendLeasePaymentReminders;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Credits\CreditExpiryNotifier;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\WelcomeCreditService;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\Finder\Finder;
use Tests\TestCase;

/**
 * TCK-2806 — les derniers avis de SECTION d'agence adressés au personnel posent leur agence
 * (`forAgency`, TCK-1761) : le récapitulatif des retards, le doublon d'un paiement sans bail, et
 * les deux avis de crédits. Sans elle, `AgenceDeLaCible::porte()` les rendait comme un lien simple,
 * et un membre de deux agences ouvrait la section de l'agence de son profil actif.
 *
 * Le récapitulatif des retards se fait par agent ET par agence : indexé par agent seul, il cumulait
 * les échéances de deux agences en un total qu'aucune page `/app/payments` ne montre.
 */
class AvisDeSectionPortentLeurAgenceTest extends TestCase
{
    use RefreshDatabase;

    // ─── AC1 — le récapitulatif des retards, un par agence ──────────────────────────────

    /**
     * AC1 — un agent contact principal de baux en retard dans deux agences reçoit deux
     * récapitulatifs, chacun avec l'agence, le compte et le total de cette seule agence. Les montants
     * diffèrent d'une agence à l'autre : un total mêlé ne passerait pas pour l'un d'eux.
     */
    public function test_ac1_un_recapitulatif_par_agence_avec_son_seul_compte_et_son_seul_total(): void
    {
        Notification::fake();
        Carbon::setTestNow('2026-09-30 08:00:00');
        [$agenceA, $agenceB] = Agency::factory()->count(2)->create();
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agenceA->id]);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agenceB->id]);

        // Agence A : deux échéances (150 000 + 100 000) ; agence B : une seule (275 000).
        $this->retard($agenceA, $agent, 150000);
        $this->retard($agenceA, $agent, 100000);
        $this->retard($agenceB, $agent, 275000);

        app()->call([new SendLeasePaymentReminders, 'handle']);

        $digests = AppNotification::query()
            ->where('user_id', $agent->id)
            ->where('code', NotificationCode::LeasePaymentOverdueDigest->value)
            ->get();
        $this->assertCount(2, $digests, 'un récapitulatif par agence, et non un seul qui les mêle');

        $parAgence = $digests->keyBy(fn (AppNotification $ligne) => $ligne->target['agency_id'] ?? null);
        $this->assertEqualsCanonicalizing([$agenceA->id, $agenceB->id], $parAgence->keys()->all());

        $this->assertSame('/app/payments', $parAgence[$agenceA->id]->target['path']);
        $this->assertSame(2, $parAgence[$agenceA->id]->params['count']);
        $this->assertSame('250000.00', $parAgence[$agenceA->id]->params['total']['amount']);
        $this->assertSame(1, $parAgence[$agenceB->id]->params['count']);
        $this->assertSame('275000.00', $parAgence[$agenceB->id]->params['total']['amount']);
        // Les paramètres du code ne changent pas : ni locataire, ni bien, ni autre montant à fuir.
        foreach ($digests as $ligne) {
            $this->assertEqualsCanonicalizing(['count', 'total'], array_keys($ligne->params));
        }

        // Une émission par jour, par agent et par agence : un second passage n'envoie rien.
        app()->call([new SendLeasePaymentReminders, 'handle']);
        $this->assertSame(2, AppNotification::query()->where('user_id', $agent->id)->where('code', NotificationCode::LeasePaymentOverdueDigest->value)->count());
    }

    /** Un bail sans agence (bailleur direct) n'a pas de section d'agence où mener : pas de récapitulatif. */
    public function test_un_bail_sans_agence_ne_produit_pas_de_recapitulatif(): void
    {
        Notification::fake();
        Carbon::setTestNow('2026-09-30 08:00:00');
        $agence = Agency::factory()->create();
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);
        $paiement = $this->retard($agence, $agent, 150000, bailSansAgence: true);

        app()->call([new SendLeasePaymentReminders, 'handle']);

        $this->assertNotNull($paiement->fresh()->metadata['reminder_overdue_1_sent_at'] ?? null, 'témoin : l\'échéance a bien été relancée');
        $this->assertSame(0, AppNotification::query()->where('code', NotificationCode::LeasePaymentOverdueDigest->value)->count());
    }

    // ─── AC2, AC3 — le doublon d'un paiement sans bail ──────────────────────────────────

    /** AC2 — chaque administrateur notifié lit l'agence du paiement, sous un profil actif dans cette agence. */
    public function test_ac2_le_doublon_sans_bail_porte_l_agence_du_paiement(): void
    {
        Notification::fake();
        [$agenceA, $autre] = Agency::factory()->count(2)->create();
        $admins = User::factory()->count(2)->create();
        foreach ($admins as $admin) {
            AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agenceA->id]);
        }
        // Le premier administre aussi une autre agence : son profil actif ne décide plus de la page.
        AgencyAdminProfile::factory()->create(['user_id' => $admins[0]->id, 'agency_id' => $autre->id]);

        $this->doublonSansBail($agenceA);

        $lignes = AppNotification::query()->where('code', NotificationCode::PaymentDuplicate->value)->get();
        $this->assertEqualsCanonicalizing($admins->pluck('id')->all(), $lignes->pluck('user_id')->all());
        foreach ($admins as $admin) {
            Sanctum::actingAs($admin);
            $cible = $this->getJson('/api/notifications')->assertOk()->json('data.0.target');
            $this->assertSame(['kind' => 'payments', 'id' => null, 'path' => '/app/payments', 'agency_id' => $agenceA->id], $cible);
        }
    }

    /**
     * AC3 — le même administrateur, parti de A et actif dans B seulement : la ligne est inerte. Sans
     * agence, elle lui ouvrait les paiements de B, sans le dire.
     */
    public function test_ac3_l_administrateur_parti_n_a_plus_de_lien_vers_les_paiements(): void
    {
        Notification::fake();
        [$agenceA, $agenceB] = Agency::factory()->count(2)->create();
        $admin = User::factory()->create();
        $profilA = AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agenceA->id]);
        AgentProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agenceB->id]);

        $this->doublonSansBail($agenceA);
        $this->assertSame(1, AppNotification::query()->where('user_id', $admin->id)->count(), 'témoin : notifié tant qu\'il était administrateur de A');

        $profilA->forceFill(['status' => AgencyAdminProfileStatus::Archived->value])->save();
        Sanctum::actingAs($admin->fresh());

        $this->assertNull($this->getJson('/api/notifications')->assertOk()->json('data.0.target'));
    }

    // ─── AC4 — les avis de crédits ──────────────────────────────────────────────────────

    /** AC4 — les crédits accordés et ceux qui expirent portent l'agence du lot, lue comme en AC2. */
    public function test_ac4_les_avis_de_credits_portent_l_agence_du_lot(): void
    {
        $admin = User::factory()->create(['phone' => '+221771234567', 'phone_verified_at' => now()]);
        $agence = Agency::factory()->create(['primary_admin_id' => $admin->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agence->id]);
        // L'administrateur tient aussi une autre agence.
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => Agency::factory()->create()->id]);

        $this->assertNotNull(app(WelcomeCreditService::class)->onSpaceCreated($agence));
        // Un second lot qui expire dans deux jours (la bienvenue court 180 jours : hors préavis).
        app(CreditLedger::class)->grant($agence, CreditLotOrigin::Welcome, 40, now()->addDays(2));
        $this->assertSame(1, app(CreditExpiryNotifier::class)->sendNotices(), 'témoin : le lot proche est prévenu');

        Sanctum::actingAs($admin);
        $lignes = collect($this->getJson('/api/notifications')->assertOk()->json('data'));
        $this->assertCount(2, $lignes, 'une bienvenue, un préavis');
        foreach ($lignes as $ligne) {
            $this->assertSame(['kind' => 'credits', 'id' => null, 'path' => '/app/credits', 'agency_id' => $agence->id], $ligne['target']);
        }
    }

    // ─── AC5 — la garde ──────────────────────────────────────────────────────────────────

    /** AC5 — aucune émission de section de `app/` ne part sans son agence. */
    public function test_ac5_aucune_emission_de_section_de_app_ne_part_sans_agence(): void
    {
        $trouvees = [];
        $sansAgence = [];
        foreach ((new Finder)->files()->in(app_path())->name('*.php') as $fichier) {
            $relatif = 'app/'.$fichier->getRelativePathname();
            $releve = self::emissionsDeSection((string) file_get_contents($fichier->getRealPath()));
            foreach ($releve['trouvees'] as $ligne) {
                $trouvees[] = "{$relatif}:{$ligne}";
            }
            foreach ($releve['sans_agence'] as $ligne) {
                $sansAgence[] = "{$relatif}:{$ligne}";
            }
        }

        $this->assertSame([], $sansAgence, 'Émission de section d\'agence sans forAgency() (TCK-1761, TCK-2806) : '.implode(', ', $sansAgence));
        // La garde n'est pas vide : elle voit les émetteurs de ce ticket et ceux d'avant.
        $fichiers = array_unique(array_map(fn (string $site) => explode(':', $site)[0], $trouvees));
        foreach ([
            'app/Jobs/SendLeasePaymentReminders.php',
            'app/Services/Payments/PaymentGatewayService.php',
            'app/Notifications/Credits/CreditsGrantedNotification.php',
            'app/Notifications/Credits/CreditsExpiringNotification.php',
            'app/Services/Account/ErasedMemberPortfolio.php',
            'app/Services/Invitation/InvitationRenewalRequests.php',
        ] as $attendu) {
            $this->assertContains($attendu, $fichiers);
        }
        $this->assertGreaterThanOrEqual(25, count($trouvees));
    }

    /** AC5 — le détecteur lui-même, sur des sources écrites ici : il rougit sur chaque forme sans agence. */
    public function test_ac5_le_detecteur_rougit_sur_une_emission_de_section_sans_agence(): void
    {
        $cas = [
            // [source, lignes sans agence attendues]
            ["NotificationTarget::of('payments');", [1]],
            ["NotificationTarget::of('payments')->forAgency(\$a);", []],
            ["NotificationTarget::of('lease', 3);", []],
            ["NotificationTarget::of('conversation', 3);", []],
            ["NotificationTarget::fromArray(['kind' => 'credits'])?->toArray();", [1]],
            ["NotificationTarget::fromArray(['kind' => 'credits', 'agency_id' => 2]);", []],
            ['NotificationTarget::fromArray($stocke);', []],
            ["\$t = NotificationTarget::of('team');\n\$u = \$t->path();\nsend(\$t->forAgency(1));", []],
            ["\$t = NotificationTarget::of('team');\nsend(\$t);", [1]],
            ['NotificationTarget::of($genre);', [1]],
            ['NotificationTarget::of($genre)->forAgency($a);', []],
            ["\$c = \$x\n    ? NotificationTarget::of('finances')->forAgency(1)\n    : NotificationTarget::of(\n        'payouts'\n    );", [3]],
            ["\\App\\Domain\\Notifications\\NotificationTarget::of('audit');", [1]],
        ];
        foreach ($cas as [$source, $attendu]) {
            // La balise d'ouverture occupe la ligne 1 : les lignes du cas commencent à 2.
            $releve = self::emissionsDeSection("<?php\n".$source)['sans_agence'];
            $this->assertSame($attendu, array_map(fn (int $ligne) => $ligne - 1, $releve), $source);
        }
    }

    // ─── Outils ──────────────────────────────────────────────────────────────────────────

    /**
     * Les émissions de section d'agence d'une source PHP : `NotificationTarget::of(<genre>…)` d'un
     * genre de {@see AgenceDeLaCible::SECTIONS} (ou d'un genre non littéral, qu'on ne peut classer),
     * et `NotificationTarget::fromArray([... 'kind' => <section> ...])` littéral. Chacune doit poser
     * son agence : `->forAgency(` (ou `?->`) juste après, ou, rangée dans une variable,
     * `$variable->forAgency(` plus loin dans le fichier (`ErasedMemberPortfolio`). Un `fromArray` d'un
     * tableau non littéral relit une cible stockée : ce n'est pas une émission.
     *
     * @return array{trouvees: list<int>, sans_agence: list<int>}
     */
    private static function emissionsDeSection(string $source): array
    {
        $jetons = array_values(array_filter(
            \PhpToken::tokenize($source),
            fn (\PhpToken $jeton) => ! $jeton->is([T_WHITESPACE, T_COMMENT, T_DOC_COMMENT, T_OPEN_TAG]),
        ));
        $n = count($jetons);
        $texte = fn (int $i): string => $i >= 0 && $i < $n ? $jetons[$i]->text : '';
        $trouvees = [];
        $sansAgence = [];

        for ($i = 0; $i < $n; $i++) {
            $nom = ltrim($jetons[$i]->text, '\\');
            if (! ($nom === 'NotificationTarget' || str_ends_with($nom, '\\NotificationTarget'))
                || $texte($i + 1) !== '::'
                || ! in_array($texte($i + 2), ['of', 'fromArray'], true)
                || $texte($i + 3) !== '(') {
                continue;
            }
            // La parenthèse fermante de l'appel.
            $profondeur = 0;
            $fin = $i + 3;
            for ($j = $i + 3; $j < $n; $j++) {
                $profondeur += match ($jetons[$j]->text) {
                    '(', '[' => 1, ')', ']' => -1, default => 0
                };
                if ($profondeur === 0) {
                    $fin = $j;
                    break;
                }
            }
            $arguments = array_slice($jetons, $i + 4, $fin - $i - 4);
            $litteral = fn (\PhpToken $jeton): ?string => $jeton->is(T_CONSTANT_ENCAPSED_STRING) ? trim($jeton->text, '\'"') : null;

            $agenceDansLeTableau = false;
            if ($texte($i + 2) === 'of') {
                $genre = isset($arguments[0]) && in_array($arguments[1]->text ?? ')', [',', ')'], true) ? $litteral($arguments[0]) : null;
            } else {
                $genre = null;
                foreach ($arguments as $k => $jeton) {
                    if ($litteral($jeton) === 'kind' && ($arguments[$k + 1]->text ?? '') === '=>' && isset($arguments[$k + 2])) {
                        $genre = $litteral($arguments[$k + 2]);
                    }
                    $agenceDansLeTableau = $agenceDansLeTableau || $litteral($jeton) === 'agency_id';
                }
                if ($genre === null) {
                    continue;
                }
            }
            if ($genre !== null && ! in_array($genre, AgenceDeLaCible::SECTIONS, true)) {
                continue;
            }

            $ligne = $jetons[$i]->line;
            $trouvees[] = $ligne;
            $chainee = in_array($texte($fin + 1), ['->', '?->'], true) && $texte($fin + 2) === 'forAgency';
            $parVariable = false;
            if ($texte($i - 1) === '=' && $jetons[$i - 2]->is(T_VARIABLE)) {
                $variable = $jetons[$i - 2]->text;
                for ($k = $fin + 1; $k + 2 < $n; $k++) {
                    if ($jetons[$k]->text === $variable && in_array($texte($k + 1), ['->', '?->'], true) && $texte($k + 2) === 'forAgency') {
                        $parVariable = true;
                        break;
                    }
                }
            }
            if (! $chainee && ! $parVariable && ! $agenceDansLeTableau) {
                $sansAgence[] = $ligne;
            }
        }

        return ['trouvees' => $trouvees, 'sans_agence' => $sansAgence];
    }

    /**
     * Une échéance en retard d'un jour, sur un bien de `$agence` dont `$agent` est le contact
     * principal, d'un bail de cette agence (ou sans agence : bailleur direct).
     */
    private function retard(Agency $agence, User $agent, int $montant, bool $bailSansAgence = false): LeasePayment
    {
        $bien = Property::factory()->create(['agency_id' => $agence->id, 'user_id' => User::factory()->create()->id]);
        PropertyCollaborator::create(['property_id' => $bien->id, 'user_id' => $agent->id, 'role' => CollaboratorRole::Agent->value, 'invited_at' => now()]);
        $bail = Lease::factory()->active()->create([
            'property_id' => $bien->id,
            'agency_id' => $bailSansAgence ? null : $agence->id,
            'tenant_id' => Customer::factory()->create(['user_id' => User::factory()->create(['preferred_language' => 'fr'])->id])->id,
        ]);

        return LeasePayment::factory()->create([
            'lease_id' => $bail->id,
            'amount' => $montant,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Late,
            'due_date' => now()->subDay()->toDateString(),
        ]);
    }

    /** Le doublon d'un paiement de réservation (sans bail) de `$agence`, par l'émetteur même. */
    private function doublonSansBail(Agency $agence): void
    {
        $paiement = BookingPayment::factory()->create(['booking_id' => Booking::factory()->create(['agency_id' => $agence->id])->id]);

        (fn () => $this->notifyDuplicatePayment($paiement, ['amount' => 25000]))->call(app(PaymentGatewayService::class));
    }
}
