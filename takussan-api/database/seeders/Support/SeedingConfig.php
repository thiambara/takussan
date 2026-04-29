<?php

namespace Database\Seeders\Support;

/**
 * Configuration centralisée pour le seeding des données démo.
 *
 * Permet de contrôler les volumes et comportements du seeding
 * selon le contexte (démo complète, test rapide, etc.)
 */
class SeedingConfig
{
    /**
     * @param  int  $agencies  Nombre d'agences à créer
     * @param  int  $propertiesPerAgency  Properties par agence
     * @param  int  $customersPerAgency  Customers par agence
     * @param  int  $bookingsPerAgency  Bookings par agence
     * @param  int  $leasesPerAgency  Leases par agence
     * @param  int  $maintenanceRequestsPerAgency  Demandes de maintenance par agence
     * @param  int  $conversationsPerAgency  Conversations par agence
     * @param  int  $documentsPerAgency  Documents par agence
     * @param  bool  $includeEdgeCases  Générer des cas limites
     * @param  bool  $ensureReferentialIntegrity  Vérifier/corriger la cohérence
     * @param  bool  $includeFilterCoverage  Générer données pour couverture filtres
     * @param  bool  $includeDemoUsers  Créer utilisateurs de test prédéfinis
     * @param  bool  $downloadMedia  Télécharger des images réelles
     */
    public function __construct(
        public int $agencies = 3,
        public int $propertiesPerAgency = 150,
        public int $customersPerAgency = 120,
        public int $bookingsPerAgency = 100,
        public int $leasesPerAgency = 90,
        public int $maintenanceRequestsPerAgency = 50,
        public int $conversationsPerAgency = 60,
        public int $documentsPerAgency = 40,
        public bool $includeEdgeCases = true,
        public bool $ensureReferentialIntegrity = true,
        public bool $includeFilterCoverage = true,
        public bool $includeDemoUsers = true,
        public bool $downloadMedia = false,
    ) {}

    /**
     * Configuration pour démo complète (volumes élevés).
     */
    public static function demo(): self
    {
        return new self(
            agencies: 3,
            propertiesPerAgency: 150,
            customersPerAgency: 120,
            bookingsPerAgency: 100,
            leasesPerAgency: 90,
            maintenanceRequestsPerAgency: 50,
            conversationsPerAgency: 60,
            documentsPerAgency: 40,
            includeEdgeCases: true,
            ensureReferentialIntegrity: true,
            includeFilterCoverage: true,
            downloadMedia: false,
        );
    }

    /**
     * Configuration pour tests rapides (volumes réduits).
     */
    public static function test(): self
    {
        return new self(
            agencies: 1,
            propertiesPerAgency: 20,
            customersPerAgency: 15,
            bookingsPerAgency: 10,
            leasesPerAgency: 8,
            maintenanceRequestsPerAgency: 5,
            conversationsPerAgency: 6,
            documentsPerAgency: 4,
            includeEdgeCases: false,
            ensureReferentialIntegrity: true,
            includeFilterCoverage: false,
            downloadMedia: false,
        );
    }

    /**
     * Configuration minimale pour CI/rapid testing.
     */
    public static function minimal(): self
    {
        return new self(
            agencies: 1,
            propertiesPerAgency: 5,
            customersPerAgency: 5,
            bookingsPerAgency: 3,
            leasesPerAgency: 2,
            maintenanceRequestsPerAgency: 2,
            conversationsPerAgency: 2,
            documentsPerAgency: 2,
            includeEdgeCases: false,
            ensureReferentialIntegrity: false,
            includeFilterCoverage: false,
            includeDemoUsers: false,
            downloadMedia: false,
        );
    }

    /**
     * Créer depuis les variables d'environnement.
     */
    public static function fromEnv(): self
    {
        return new self(
            agencies: (int) env('SEED_AGENCIES', 3),
            propertiesPerAgency: (int) env('SEED_PROPERTIES_PER_AGENCY', 150),
            customersPerAgency: (int) env('SEED_CUSTOMERS_PER_AGENCY', 120),
            bookingsPerAgency: (int) env('SEED_BOOKINGS_PER_AGENCY', 100),
            leasesPerAgency: (int) env('SEED_LEASES_PER_AGENCY', 90),
            maintenanceRequestsPerAgency: (int) env('SEED_MAINTENANCE_PER_AGENCY', 50),
            conversationsPerAgency: (int) env('SEED_CONVERSATIONS_PER_AGENCY', 60),
            documentsPerAgency: (int) env('SEED_DOCUMENTS_PER_AGENCY', 40),
            includeEdgeCases: (bool) env('SEED_EDGE_CASES', true),
            ensureReferentialIntegrity: (bool) env('SEED_REFERENTIAL_INTEGRITY', true),
            includeFilterCoverage: (bool) env('SEED_FILTER_COVERAGE', true),
            includeDemoUsers: (bool) env('SEED_DEMO_USERS', true),
            downloadMedia: (bool) env('SEED_DOWNLOAD_MEDIA', false),
        );
    }
}
