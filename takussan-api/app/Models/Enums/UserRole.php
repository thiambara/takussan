<?php

namespace App\Models\Enums;

/**
 * Vocabulaire HISTORIQUE des rôles utilisateur.
 *
 * @deprecated TCK-278 — un rôle n'est plus une valeur portée par l'utilisateur
 * mais un **profil polymorphe** scopé par agence (`OwnerProfile`,
 * `AgentProfile`, `AgencyAdminProfile`, `BrokerProfile`,
 * `ServiceProviderProfile`, `PlatformProfile`), et une autorisation est une
 * `Capability` résolue pour un couple *(utilisateur, agence)* par
 * `MembershipCapabilityResolver` (ADR-0002 / ADR-0003).
 *
 * Cette enum **survit uniquement comme vocabulaire de CONTRAT HTTP** : elle
 * nomme les valeurs acceptées par `PUT /api/users/{user}/role`
 * (`Api\UserRoleController`), qui les traduit en mutations de profils.
 * Elle n'exprime aucune autorisation, et ne doit pas
 * être consultée pour en décider — s'y fier redonnerait à un utilisateur un
 * rôle unique et global, exactement la double source de vérité que TCK-278 a
 * supprimée.
 *
 * ⚠️ Trois de ses cas — `Customer`, `ServiceProvider`, et le `tenant` absent
 * d'ici mais accepté par le contrôleur — ne matérialisent aucun profil en
 * phase 1 : le contrôleur les accepte puis les traite en **no-op**. Le
 * sélecteur frontend ne les propose plus.
 *
 * Suppression : TCK-279, une fois `agency_roles` en place.
 */
enum UserRole: string
{
    case Customer = 'customer';
    case AgencyAdmin = 'agency_admin';
    case SuperAdmin = 'super_admin';
    case Agent = 'agent';
    case Owner = 'owner';
    case ServiceProvider = 'service_provider';
}
