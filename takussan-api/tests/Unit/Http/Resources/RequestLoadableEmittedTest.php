<?php

namespace Tests\Unit\Http\Resources;

use Illuminate\Support\Str;
use ReflectionClass;
use Tests\TestCase;

/**
 * TCK-807 (piste P21.05) — un `include=` accepté est un `include=` émis.
 *
 * `$requestLoadable` ouvre `include=<relation>` sur la liste d'un modèle. Quand la ressource du
 * modèle n'émet pas la relation, la requête rend 200, paie le chargement en base, et l'appelant
 * lit une clé absente comme une relation vide (cas réel : P21.04, le garant du bail).
 *
 * Ce test confronte, pour chaque modèle de `app/Models` qui déclare `$requestLoadable` et qui a une
 * ressource `<Modèle>Resource` (dans tout `app/Http/Resources`, TCK-1022), chaque relation déclarée aux `whenLoaded('…')`
 * et `relationLoaded('…')` du source de la ressource. Il lit une forme, pas un comportement : une
 * relation émise autrement (accès direct `$this->rel`) doit être réécrite en `whenLoaded`, ou
 * exemptée ci-dessous avec sa raison.
 *
 * Un modèle sans ressource n'est pas visé : son contrôleur rend le modèle sérialisé, qui émet ses
 * relations chargées.
 */
class RequestLoadableEmittedTest extends TestCase
{
    /**
     * Les écarts relevés par TCK-807 hors des trois modèles de P21.05 (`Lease`, `Payout`,
     * `Booking`), non tranchés : chacun demande de vérifier qu'aucun appelant ne l'envoie, ou de
     * décider d'émettre la relation (donnée exposée, V3). La dette est comptée ici, et le test
     * rougit sur une exemption devenue inutile.
     *
     * @var array<string, list<string>>
     */
    private const EXEMPTIONS = [
        'Agency' => ['primaryAdmin', 'addresses'],
        'AgencyUpgradeRequest' => ['agency', 'submitter', 'reviewer', 'documents'],
        'Customer' => ['user', 'agency', 'addresses', 'tasks'],
        'Document' => ['uploader', 'verifier'],
        'Inventory' => ['conductor', 'tenant'],
        'Invitation' => ['inviter', 'invitedUser', 'agency', 'invitable'],
        'Invoice' => ['customer', 'issuer', 'agency', 'creditedInvoice'],
        'KycDossier' => ['reviewer'],
        'MaintenanceRequest' => ['lease'],
        'OwnerProfile' => ['user', 'agency', 'invitations', 'agencyRole'],
        'PrivacyRequest' => ['user', 'handler'],
        // `tags` est émis sur la fiche par `when($isDetail)`, hors de `whenLoaded`.
        'Property' => ['tags', 'children', 'parent'],
        'ServiceProviderBill' => ['maintenanceRequest', 'property', 'provider', 'payouts'],
        'User' => ['agentProfiles', 'ownerProfiles', 'agencyAdminProfiles', 'platformProfile'],
    ];

    /**
     * @return array<string, array{class-string, string}>
     */
    private function modelesAvecRessource(): array
    {
        $paires = [];
        $ressources = $this->ressourcesParNom();
        $racine = app_path('Models');
        $fichiers = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($racine));

        foreach ($fichiers as $fichier) {
            if (! $fichier->isFile() || $fichier->getExtension() !== 'php') {
                continue;
            }
            $relatif = Str::of($fichier->getPathname())->after($racine.DIRECTORY_SEPARATOR)->beforeLast('.php');
            $classe = 'App\\Models\\'.str_replace(DIRECTORY_SEPARATOR, '\\', (string) $relatif);
            if (! class_exists($classe)) {
                continue;
            }
            $reflet = new ReflectionClass($classe);
            if ($reflet->isAbstract() || ! $reflet->hasProperty('requestLoadable')) {
                continue;
            }
            $ressource = $ressources[$reflet->getShortName().'Resource.php'] ?? null;
            if ($ressource === null) {
                continue;
            }
            $paires[$reflet->getShortName()] = [$classe, $ressource];
        }

        ksort($paires);

        return $paires;
    }

    /**
     * TCK-1022 (P60.01) — la ressource d'un modèle se cherche par son nom dans tout
     * `app/Http/Resources`, sous-dossiers compris (`Api/Admin/`, `Agency/`, `Accounting/`…) : au
     * seul chemin racine, la garde sautait les ressources rangées. La ressource racine l'emporte
     * quand elle existe (`AgencyResource` a une variante sous `Api/Admin/`) ; un nom porté par
     * plusieurs fichiers hors de la racine est ambigu, et refusé plutôt que tranché au hasard du
     * parcours.
     *
     * @return array<string, string> nom de fichier → chemin
     */
    private function ressourcesParNom(): array
    {
        $racine = app_path('Http/Resources');
        $trouvees = [];
        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($racine)) as $fichier) {
            if ($fichier->isFile() && str_ends_with($fichier->getFilename(), 'Resource.php')) {
                $trouvees[$fichier->getFilename()][] = $fichier->getPathname();
            }
        }

        $ressources = [];
        foreach ($trouvees as $nom => $chemins) {
            $aLaRacine = $racine.DIRECTORY_SEPARATOR.$nom;
            if (in_array($aLaRacine, $chemins, true)) {
                $ressources[$nom] = $aLaRacine;

                continue;
            }
            $this->assertCount(1, $chemins, "Plusieurs ressources {$nom} hors de la racine : ".implode(', ', $chemins));
            $ressources[$nom] = $chemins[0];
        }

        return $ressources;
    }

    /**
     * @param  class-string  $classe
     * @return list<string>
     */
    private function relationsNonEmises(string $classe, string $ressource): array
    {
        $propriete = (new ReflectionClass($classe))->getProperty('requestLoadable');

        return $this->absentesDuSource($propriete->getValue() ?? [], (string) file_get_contents($ressource));
    }

    /**
     * @param  list<string>  $relations
     * @return list<string>
     */
    private function absentesDuSource(array $relations, string $source): array
    {
        // TCK-1023 (P60.04) — le source sans ses commentaires : une mention de `whenLoaded('x')` en
        // commentaire ne rend pas la relation émise.
        $source = implode('', array_map(
            fn ($jeton): string => is_array($jeton) ? (in_array($jeton[0], [T_COMMENT, T_DOC_COMMENT], true) ? '' : $jeton[1]) : $jeton,
            token_get_all($source),
        ));

        return array_values(array_filter($relations, fn (string $relation): bool => preg_match(
            '/(whenLoaded|relationLoaded)\(\s*[\'"]'.preg_quote($relation, '/').'[\'"]/',
            $source,
        ) !== 1));
    }

    public function test_chaque_include_accepte_est_emis_par_la_ressource_du_modele(): void
    {
        $paires = $this->modelesAvecRessource();
        // Plancher : le balayage trouve bien les modèles visés, sinon il ne garderait rien.
        $this->assertArrayHasKey('Lease', $paires);
        $this->assertArrayHasKey('Payout', $paires);
        $this->assertArrayHasKey('Booking', $paires);
        // TCK-1022 — et ceux dont la ressource est rangée en sous-dossier (`Agency/`, `Accounting/`).
        $this->assertArrayHasKey('AgencyRole', $paires);
        $this->assertArrayHasKey('BankStatement', $paires);

        $ecarts = [];
        foreach ($paires as $modele => [$classe, $ressource]) {
            $nonEmises = array_diff($this->relationsNonEmises($classe, $ressource), self::EXEMPTIONS[$modele] ?? []);
            if ($nonEmises !== []) {
                $ecarts[] = $modele.' : '.implode(', ', $nonEmises);
            }
        }

        $this->assertSame([], $ecarts, "Des relations de \$requestLoadable que la ressource du modèle n'émet pas.\n"
            .'Les émettre par whenLoaded(), ou les retirer de $requestLoadable.');
    }

    public function test_aucune_exemption_n_est_devenue_inutile(): void
    {
        $paires = $this->modelesAvecRessource();

        $perimees = [];
        foreach (self::EXEMPTIONS as $modele => $relations) {
            if (! isset($paires[$modele])) {
                $perimees[] = $modele.' : plus de ressource ou plus de $requestLoadable';

                continue;
            }
            [$classe, $ressource] = $paires[$modele];
            $encore = array_diff($relations, $this->relationsNonEmises($classe, $ressource));
            if ($encore !== []) {
                $perimees[] = $modele.' : '.implode(', ', $encore);
            }
        }

        $this->assertSame([], $perimees, 'Exemptions à retirer : la relation est émise, ou plus déclarée.');
    }

    /** TCK-1023 (P60.04) — une relation citée en commentaire n'est pas émise. */
    public function test_un_when_loaded_en_commentaire_ne_compte_pas(): void
    {
        $source = <<<'PHP'
            <?php
            // 'agency' => $this->whenLoaded('ligne'),
            # $this->whenLoaded('diese');
            /* $this->relationLoaded('bloc') */
            /** @see whenLoaded('doc') */
            return ['plan' => $this->whenLoaded('plan')];
            PHP;

        $this->assertSame(
            ['ligne', 'diese', 'bloc', 'doc'],
            $this->absentesDuSource(['ligne', 'diese', 'bloc', 'doc', 'plan'], $source),
        );
    }
}
