# `prisma/verify/` — not part of the app

Everything in this folder exists only because the sandbox that built this
schema migration couldn't reach `binaries.prisma.sh` (Prisma's engine
download host is blocked by that environment's network policy), so the real
Prisma Client couldn't be generated there to test against. These scripts
prove the schema and the anti-oversell reservation logic actually work by
talking to a local Postgres directly with the plain `pg` driver instead.

You almost certainly don't need this folder. Once you run `pnpm install`
normally (where `prisma generate` can reach the network), the real
deliverables — `prisma/schema.prisma`, `prisma/seed.ts`,
`src/lib/costCalculator.ts`, `src/lib/inventory.ts`, and
`tests/lib/costCalculator.test.ts` — are the whole story, and this folder
can be deleted.

If you do want to re-run this verification yourself first:

```bash
pnpm add -D pg @types/pg   # not needed by the app itself, only by this folder
createdb unstitch_verify
psql unstitch_verify -f prisma/verify/hand_derived_ddl.sql
VERIFY_DATABASE_URL="postgresql://localhost/unstitch_verify" npx tsx prisma/verify/seed_raw.ts
VERIFY_DATABASE_URL="postgresql://localhost/unstitch_verify" npx tsx prisma/verify/concurrency_raw.ts
```

`hand_derived_ddl.sql` was hand-derived from the schema (it mirrors what
`prisma migrate dev` would generate) — once you can run the real Prisma
CLI, treat `prisma/schema.prisma` + `prisma migrate dev` as the source of
truth, not this file.
