<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\AgenceDeLaCible;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\BankStatement;
use App\Models\Enums\KycDossierStatus;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\KycDossier;
use App\Models\LeasePayment;
use App\Models\Profiles\AgentProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2813 (décision (b) du 2026-11-14) — la déduction de cible des lignes anciennes
 * ({@see NotificationTarget::derive()}) ne rend jamais une cible de SECTION d'agence : elle ne
 * connaît pas l'agence de l'objet, et une section lit celle du profil ACTIF. Les quatre cas
 * (échéance disparue, `referenceable` `KycDossier`, `BankStatement`, `RoleDelegation`) rendent une
 * ligne sans cible : elle se lit, elle n'ouvre rien — même pour un membre de l'agence de l'objet.
 */
class CiblesDeduitesDeSectionPortentLeurAgenceTest extends TestCase
{
    use RefreshDatabase;

    /**
     * AC1 + AC2 (réduits par la décision (b)) — les quatre lignes anciennes, lues par un membre de
     * l'agence de l'objet sous le profil d'une AUTRE agence, sous celui de la bonne agence, et par
     * un lecteur sans profil dans l'agence : aucune cible, pour personne.
     */
    public function test_les_quatre_lignes_anciennes_de_section_n_ont_de_cible_pour_aucun_lecteur(): void
    {
        [$agenceA, $agenceB] = Agency::factory()->count(2)->create();
        $membre = User::factory()->create();
        $profilA = AgentProfile::factory()->create(['user_id' => $membre->id, 'agency_id' => $agenceA->id]);
        $profilB = AgentProfile::factory()->create(['user_id' => $membre->id, 'agency_id' => $agenceB->id]);
        $etranger = User::factory()->create();

        $objets = $this->objetsDe($agenceA);
        foreach ([$membre, $etranger] as $lecteur) {
            $this->lignesAnciennes($lecteur, $objets);
        }

        $lectures = [
            'membre sous le profil de B' => [$membre, ['X-Profile-Id' => "agent:{$profilB->id}"]],
            'membre sous le profil de A' => [$membre, ['X-Profile-Id' => "agent:{$profilA->id}"]],
            'lecteur sans profil dans A' => [$etranger, []],
        ];
        foreach ($lectures as $qui => [$lecteur, $entetes]) {
            Sanctum::actingAs($lecteur);
            $cibles = collect($this->getJson('/api/notifications', $entetes)->assertOk()->json('data'))
                ->mapWithKeys(fn (array $ligne) => [$ligne['title'] => $ligne['target']])
                ->all();

            $this->assertSame([
                'échéance disparue' => null,
                'kyc' => null,
                'relevé bancaire' => null,
                'délégation' => null,
            ], $this->trier($cibles), "{$qui} : une ligne ancienne de section ne doit pas être un lien.");
        }
    }

    /**
     * AC3 — une ligne `referenceable` `LeasePayment` dont l'échéance n'existe plus n'a pas de cible ;
     * la même forme dont l'échéance existe garde sa cible d'OBJET (le bail), qui ne change pas.
     */
    public function test_une_echeance_disparue_ne_rend_pas_de_cible_et_une_echeance_presente_rend_son_bail(): void
    {
        $user = User::factory()->create();
        $echeance = LeasePayment::factory()->create();

        $disparue = $this->ligne($user, 'r', ['referenceable_type' => LeasePayment::class, 'referenceable_id' => $echeance->id + 1000]);
        $presente = $this->ligne($user, 'p', ['referenceable_type' => LeasePayment::class, 'referenceable_id' => $echeance->id]);

        $this->assertNull(NotificationTarget::derive($disparue));
        $this->assertSame(['kind' => 'lease', 'id' => $echeance->lease_id, 'path' => "/app/leases/{$echeance->lease_id}"], NotificationTarget::derive($presente)?->toArray());
    }

    /**
     * AC4 (réduit) — les trois `referenceable` sans objet à relire n'ajoutent aucune requête : une
     * page de 20 lignes coûte ce que coûte une page de 4.
     */
    public function test_une_page_de_vingt_lignes_anciennes_coute_ce_que_coute_une_page_de_quatre(): void
    {
        $agence = Agency::factory()->create();
        $peu = User::factory()->create();
        $beaucoup = User::factory()->create();
        $types = $this->objetsDe($agence);
        $i = 0;
        foreach ([[$peu, 4], [$beaucoup, 20]] as [$lecteur, $n]) {
            for ($k = 0; $k < $n; $k++) {
                $type = array_keys($types)[$k % 3];
                $this->ligne($lecteur, 'l'.$i++, ['referenceable_type' => $type, 'referenceable_id' => $types[$type]]);
            }
        }

        $this->assertSame($this->requetes($peu, 4), $this->requetes($beaucoup, 20));
    }

    /**
     * AC5 — la garde : aucun genre de {@see AgenceDeLaCible::SECTIONS} n'apparaît dans `derive()` ni
     * dans `fromReferenceable()` hors d'une instruction qui lui pose son agence (`forAgency(`).
     */
    public function test_la_deduction_ne_construit_aucune_section_sans_agence(): void
    {
        $source = (string) file_get_contents(app_path('Domain/Notifications/NotificationTarget.php'));
        $debut = strpos($source, 'public static function derive(');
        $this->assertNotFalse($debut, 'derive() introuvable : la garde ne lit plus rien.');
        $corps = substr($source, $debut);
        $this->assertStringContainsString('function fromReferenceable(', $corps, 'fromReferenceable() doit suivre derive() : la garde lit jusqu\'à la fin de la classe.');

        $this->assertSame([], $this->sectionsSansAgence($corps), 'derive() construit une cible de SECTION sans agence : une section lit l\'agence du profil actif, qui n\'est peut-être pas celle de l\'objet. Rendre `null`, ou poser l\'agence de l\'objet par forAgency() (TCK-2813).');
    }

    /** AC5 — le détecteur de la garde, éprouvé sur des formes connues. */
    public function test_le_detecteur_reconnait_une_section_sans_agence(): void
    {
        $this->assertSame(['finances'], $this->sectionsSansAgence("BankStatement::class => new self('finances', null),"));
        $this->assertSame(['payments'], $this->sectionsSansAgence("return \$leaseId !== null ? new self('lease', 1) : new self('payments', null);"));
        $this->assertSame(['team'], $this->sectionsSansAgence("'role_delegation_id' => 'team',"));
        $this->assertSame([], $this->sectionsSansAgence("new self('finances', null)->forAgency(\$agence),"));
        $this->assertSame([], $this->sectionsSansAgence("'booking_id' => 'booking', 'kyc_dossier', KycDossier::class => null,"));
    }

    /**
     * Les genres de section cités dans `$code` sur une ligne qui ne pose pas d'agence.
     *
     * @return list<string>
     */
    private function sectionsSansAgence(string $code): array
    {
        $trouves = [];
        foreach (preg_split('/\R/', $code) ?: [] as $ligne) {
            if (str_contains($ligne, 'forAgency(')) {
                continue;
            }
            preg_match_all("/'([a-z_]+)'/", $ligne, $m);
            foreach ($m[1] as $genre) {
                if (in_array($genre, AgenceDeLaCible::SECTIONS, true)) {
                    $trouves[] = $genre;
                }
            }
        }

        return $trouves;
    }

    /**
     * Un objet de chaque genre, dans l'agence `$agence` : la ligne n'est pas inerte faute d'objet.
     *
     * @return array<class-string, int>
     */
    private function objetsDe(Agency $agence): array
    {
        return [
            KycDossier::class => KycDossier::query()->create(['subject_type' => Agency::class, 'subject_id' => $agence->id, 'status' => KycDossierStatus::Submitted, 'submitted_at' => now()])->id,
            BankStatement::class => BankStatement::factory()->create(['agency_id' => $agence->id])->id,
            RoleDelegation::class => RoleDelegation::factory()->create(['agency_id' => $agence->id])->id,
        ];
    }

    /**
     * Les quatre formes de lignes anciennes, sans `target`.
     *
     * @param  array<class-string, int>  $objets
     */
    private function lignesAnciennes(User $lecteur, array $objets): void
    {
        $this->ligne($lecteur, 'échéance disparue', ['data' => ['lease_payment_id' => 987654]]);
        $this->ligne($lecteur, 'kyc', ['referenceable_type' => KycDossier::class, 'referenceable_id' => $objets[KycDossier::class]]);
        $this->ligne($lecteur, 'relevé bancaire', ['referenceable_type' => BankStatement::class, 'referenceable_id' => $objets[BankStatement::class]]);
        $this->ligne($lecteur, 'délégation', ['referenceable_type' => RoleDelegation::class, 'referenceable_id' => $objets[RoleDelegation::class]]);
    }

    /** @param  array<string, mixed>  $attributs */
    private function ligne(User $user, string $titre, array $attributs): AppNotification
    {
        return AppNotification::query()->create(array_merge([
            'user_id' => $user->id,
            'type' => NotificationType::System,
            'delivery_channel' => NotificationChannel::App,
            'title' => $titre,
            'body' => 'Ligne ancienne, sans cible stockée.',
            'is_read' => false,
            'sent_at' => now(),
        ], $attributs));
    }

    private function requetes(User $lecteur, int $attendues): int
    {
        Sanctum::actingAs($lecteur);
        DB::flushQueryLog();
        DB::enableQueryLog();
        $lignes = $this->getJson('/api/notifications?per_page=50')->assertOk()->json('data');
        $n = count(DB::getQueryLog());
        DB::disableQueryLog();
        $this->assertCount($attendues, $lignes);
        foreach ($lignes as $ligne) {
            $this->assertNull($ligne['target'], $ligne['title']);
        }

        return $n;
    }

    /**
     * @param  array<string, mixed>  $cibles
     * @return array<string, mixed>
     */
    private function trier(array $cibles): array
    {
        $ordre = ['échéance disparue', 'kyc', 'relevé bancaire', 'délégation'];

        return array_merge(array_fill_keys($ordre, 'absente'), array_intersect_key($cibles, array_flip($ordre)));
    }
}
