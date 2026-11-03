<?php

namespace Database\Seeders\Crm;

use App\Models\Customer;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Services\Property\PrimaryPropertyContact;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

/**
 * TCK-2379 — la boîte des demandes entrantes d'une agence (TCK-441), dans la forme de
 * `ContactLeadService` :
 *
 *  - une part des clients de la fenêtre est née d'une demande : le formulaire d'une annonce, envoyé
 *    peu avant la fiche, puis traitée et convertie (`convert` : `customer_id`, `handled_at`) par
 *    l'agent qui a créé la fiche ;
 *  - des demandes traitées sans suite, et les plus récentes encore à traiter ;
 *  - les clics WhatsApp et Appeler (`recordClick`) : comptés, sans identité, hors de la file.
 *
 * Le destinataire est celui du service : le contact principal du bien (`PrimaryPropertyContact`).
 * L'accusé de réception et l'avis aux destinataires ne sont pas rejoués.
 */
class ContactLeadSeeder extends Seeder
{
    /** Part des clients de la fenêtre arrivés par une demande, en %. */
    private const PART_DES_CLIENTS = 30;

    /** @var array<string, int> `source:medium` => poids ; vide : arrivée directe */
    private const PROVENANCES = [
        ':' => 45,
        'whatsapp:share' => 25,
        'facebook:share' => 18,
        'google:organic' => 12,
    ];

    private const NAVIGATEURS = [
        'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; TECNO KI5k) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
    ];

    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $maintenant = CarbonImmutable::now();

        foreach ($this->ctx->agencies->sortBy('id') as $agency) {
            $biens = Property::query()->public()->where('agency_id', $agency->id)
                ->with(PrimaryPropertyContact::eagerLoads())->orderBy('id')->get()->keyBy('id');
            if ($biens->isEmpty()) {
                continue;
            }

            $this->clientsNesDUneDemande($agency->id, $biens);

            for ($i = 0; $i < $this->ctx->volume(10, $agency->id); $i++) {
                $recue = Timeline::randomDateBetween($maintenant->subDays(90), $maintenant->subHours(2));
                $recente = $recue->greaterThan($maintenant->subDays(10));
                $this->demande($biens, $recue, null, $recente ? null : $this->ctx->agentAu($agency->id, $recue));
            }

            for ($i = 0; $i < $this->ctx->volume(60, $agency->id); $i++) {
                $clic = Timeline::dateCroissante($maintenant->subMonths(6), $maintenant->subMinutes(30));
                $bien = $this->bienEnLigneLe($biens, $clic);
                if ($bien !== null) {
                    Timeline::aLaDate($clic, fn () => PropertyContactLead::create($this->provenance() + [
                        'property_id' => $bien->id,
                        'agency_id' => $bien->agency_id,
                        'recipient_user_id' => PrimaryPropertyContact::for($bien)?->id,
                        'channel' => mt_rand(1, 100) <= 70 ? ContactLeadChannel::Whatsapp : ContactLeadChannel::Call,
                        'locale' => 'fr',
                        'ip' => $this->ip(),
                        'user_agent' => Tirage::un(self::NAVIGATEURS),
                    ]));
                }
            }
        }
    }

    /** @param  Collection<int, Property>  $biens */
    private function clientsNesDUneDemande(int $agencyId, Collection $biens): void
    {
        $clients = ($this->ctx->customersByAgency[$agencyId] ?? collect())
            ->filter(fn (Customer $c) => CarbonImmutable::parse($c->created_at)->greaterThanOrEqualTo(Timeline::seedStart()))
            ->sortBy('id');

        foreach ($clients as $client) {
            if (mt_rand(1, 100) > self::PART_DES_CLIENTS) {
                continue;
            }
            $creee = CarbonImmutable::parse($client->created_at);
            $recue = $creee->subMinutes(mt_rand(20, 2 * 24 * 60));
            // Le bien qu'il a visité ensuite — en ligne à ce moment-là, loué depuis peut-être —, sinon
            // une annonce de l'agence déjà en ligne.
            $visite = PropertyVisit::query()->where('customer_id', $client->id)->orderBy('scheduled_at')->value('property_id');
            $visite = $visite !== null ? ($biens->get($visite) ?? Property::query()->with(PrimaryPropertyContact::eagerLoads())->whereNotNull('published_at')->find($visite)) : null;
            $bien = $visite !== null && CarbonImmutable::parse($visite->published_at)->lessThan($recue) ? $visite : $this->bienEnLigneLe($biens, $recue);
            if ($bien === null) {
                continue;
            }
            $this->demande($biens, $recue, $client, $client->added_by_id, $bien);
        }
    }

    /** @param  Collection<int, Property>  $biens */
    private function demande(Collection $biens, CarbonImmutable $recue, ?Customer $client, ?int $traiteePar, ?Property $bien = null): void
    {
        $bien ??= $this->bienEnLigneLe($biens, $recue);
        if ($bien === null) {
            return;
        }
        $nom = $client !== null
            ? trim($client->first_name.' '.$client->last_name)
            : $this->ctx->faker()->senegaleseFirstName().' '.$this->ctx->faker()->senegaleseLastName();
        $traiteeLe = $client !== null ? CarbonImmutable::parse($client->created_at) : $recue->addHours(mt_rand(2, 40));

        $demande = Timeline::aLaDate($recue, fn () => PropertyContactLead::create($this->provenance() + [
            'property_id' => $bien->id,
            'agency_id' => $bien->agency_id,
            'recipient_user_id' => PrimaryPropertyContact::for($bien)?->id,
            'channel' => ContactLeadChannel::Form,
            'name' => $nom,
            'email' => $client?->email ?? (mt_rand(1, 100) <= 60 ? null : $this->ctx->faker()->safeEmail()),
            'phone' => $client?->phone ?? $this->ctx->faker()->senegalesePhoneNumber(),
            'message' => $this->ctx->texts()->demandeDeContact(),
            'locale' => 'fr',
            'ip' => $this->ip(),
            'user_agent' => Tirage::un(self::NAVIGATEURS),
        ]));

        if ($traiteePar !== null) {
            Timeline::aLaDate($traiteeLe, fn () => $demande->update([
                'handled_at' => now(),
                'handled_by_id' => $traiteePar,
                'customer_id' => $client?->id,
            ]));
        }
    }

    /** @param  Collection<int, Property>  $biens */
    private function bienEnLigneLe(Collection $biens, CarbonInterface $date): ?Property
    {
        $enLigne = $biens->filter(fn (Property $p) => CarbonImmutable::parse($p->published_at ?? $p->created_at)->lessThan($date));

        return $enLigne->isEmpty() ? null : Tirage::un($enLigne->values());
    }

    /** @return array{source: ?string, medium: ?string} */
    private function provenance(): array
    {
        [$source, $medium] = explode(':', StatusDistribution::pick(self::PROVENANCES));

        return ['source' => $source !== '' ? $source : null, 'medium' => $medium !== '' ? $medium : null];
    }

    private function ip(): string
    {
        return Tirage::un(['41.82', '41.83', '154.124', '196.207']).'.'.mt_rand(0, 255).'.'.mt_rand(1, 254);
    }
}
