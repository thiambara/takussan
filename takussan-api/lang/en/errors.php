<?php

/*
 * TCK-587 — this ticket's error keys ONLY. TCK-588 also creates this file: on merge, both lists
 * are joined, neither replaces the other.
 */
return [
    'export_unknown_entity' => 'This export does not exist.',
    'export_forbidden' => 'You are not allowed to export this data.',
    'share_password_in_query' => 'A share link password is sent in the request body, never in the URL.',
    'account_block_reserved' => 'Only a super-administrator can block or reactivate an account. An agency administrator suspends a member within their agency.',
    'staff_only' => "This data is reserved for the agency's staff.",
];
