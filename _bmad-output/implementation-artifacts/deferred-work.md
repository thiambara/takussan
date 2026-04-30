# Deferred Work

## Deferred from: code review of 1-1-tck-013-auth-accounts (2026-04-15)

- `password` in User `$fillable` — mass-assignment surface wider than necessary; not exploitable in current controllers but risky for future code. Consider removing `password` from `$fillable` and using `forceFill()` only where needed.
