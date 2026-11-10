# Security policy

CareerOS takes the privacy of its users seriously: it stores only the domains of the sites you
choose and the start and end of each study period ([privacy](https://careeros-taupe.vercel.app/privacy)).

## Reporting a vulnerability

Please report security issues **privately**, through GitHub's
[private vulnerability reporting](https://github.com/vbenedito/careeros/security/advisories/new)
for this repository. Do not open a public issue for a vulnerability.

Include what you found, how to reproduce it and the impact you expect. You will get an answer
within a few days; fixes are released as soon as they are verified.

## Scope

- The dashboard at https://careeros-taupe.vercel.app
- The Chrome extension (latest release on this repository)
- The database rules in `supabase/migrations`

Please do not test against other users' accounts or data, do not run denial-of-service tests,
and do not access more data than needed to show the problem.

## Supported versions

Only the latest release of the extension and the current dashboard receive fixes.
