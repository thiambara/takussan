<?php

namespace App\Models\Enums;

enum RelationshipType: string
{
    case OwnerTenant = 'owner_tenant';
    case AgentClient = 'agent_client';
    case BrokerClient = 'broker_client';
}
