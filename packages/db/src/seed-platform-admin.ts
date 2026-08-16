import { isNull, eq, and } from 'drizzle-orm';
import { phoneSchema } from '@forge/shared';

import { closeDb, initDb } from './client.js';
import { runAsSystem, takeFirst, takeFirstOrThrow } from './tenant.js';
import { platformAdmins } from './schema/platform-admins.js';
import { users } from './schema/users.js';

/**
 * Creates the FOUNDING platform administrator.
 *
 * WHY THIS EXISTS AS A SCRIPT RATHER THAN AN ENDPOINT
 *
 * Every other platform admin is invited by an existing one, which means the first one has a
 * bootstrap problem: there is nobody to invite them. The three usual answers are all worse
 * than this one.
 *
 *   - A self-signup endpoint gated by "is the table empty?" is a race and a permanent piece
 *     of attack surface. It only has to be reachable for the few seconds after a fresh
 *     deploy — or after someone truncates the table — for a stranger to own the platform.
 *   - An ADMIN_BOOTSTRAP_PHONE environment variable auto-promoted at boot is a standing
 *     grant that lives in the deployment config forever, and anyone who can edit that config
 *     can hand themselves the console without touching the codebase.
 *   - A hardcoded admin in a migration puts a real phone number in git history, and reruns
 *     of the migration recreate it after a deliberate removal.
 *
 * A script requires database credentials and a human running it. That is the correct bar for
 * creating an account that can see every tenant on the platform.
 *
 *   pnpm --filter @forge/db db:seed-admin -- +919876543210 "Sameer Rathore"
 *
 * IT REFUSES TO CREATE A SECOND ADMIN.
 *
 * Once one exists, the invite flow is the only path, and it leaves an audit trail naming who
 * approved whom. A CLI that could keep adding admins would be a permanent side door around
 * that trail — available to anyone who ever gets the runtime database URL, which includes
 * every past employee and every backup. `--force` is there for genuine recovery (the sole
 * admin lost their phone) and says exactly what it is in the log it prints.
 */

interface Parsed {
  phone: string;
  fullName: string | undefined;
  force: boolean;
}

function parseArgs(argv: string[]): Parsed {
  const force = argv.includes('--force');
  const positional = argv.filter((arg) => !arg.startsWith('--'));

  const [phone, fullName] = positional;

  if (!phone) {
    throw new Error(
      'Usage: db:seed-admin -- <phone> [full name] [--force]\n' +
        '  phone must be E.164 with the country code, e.g. +919876543210',
    );
  }

  /**
   * Validated with the SAME schema the API uses, so a number seeded here is a number the
   * login endpoint will accept. A locally-invented regex here would happily create an admin
   * whose phone can never be matched at sign-in, and the symptom would be "the OTP never
   * arrives" with nothing in any log to explain it.
   */
  const result = phoneSchema.safeParse(phone);
  if (!result.success) {
    throw new Error(
      `"${phone}" is not a valid phone number: ${result.error.issues[0]?.message ?? 'invalid'}`,
    );
  }

  return { phone: result.data, fullName: fullName || undefined, force };
}

async function main(): Promise<void> {
  const { phone, fullName, force } = parseArgs(process.argv.slice(2));

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. It must point at forge_app.');
  }

  // max: 1 — a one-shot script has no reason to hold a pool, and on a managed Postgres the
  // connection cap is shared with every running API container.
  initDb({ url, maxConnections: 1 });

  try {
    const outcome = await runAsSystem('seed:platform-admin', async (tx) => {
      /**
       * The refusal happens INSIDE the transaction, so it reads the same snapshot the
       * insert would write against. Checking first and inserting afterwards is a
       * check-then-act race — two operators running this simultaneously on a fresh database
       * would both see zero admins and both succeed.
       */
      const existing = await tx
        .select({ id: platformAdmins.id })
        .from(platformAdmins)
        .where(and(eq(platformAdmins.status, 'active'), isNull(platformAdmins.deletedAt)));

      if (existing.length > 0 && !force) {
        return { kind: 'refused' as const, count: existing.length };
      }

      /**
       * Find or create the person. Identity is global and keyed on phone, so an admin who
       * is already a gym member reuses their existing row rather than becoming a second
       * account that a DPDP erasure would miss.
       */
      const found = takeFirst(
        await tx
          .select()
          .from(users)
          .where(and(eq(users.phone, phone), isNull(users.deletedAt))),
      );

      const user =
        found ??
        takeFirstOrThrow(
          await tx
            .insert(users)
            .values({ phone, ...(fullName ? { fullName } : {}) })
            .returning(),
          'user',
        );

      // Naming someone who is already an admin is not an error worth failing a deploy over,
      // but it must not silently look like a fresh grant either.
      const already = takeFirst(
        await tx
          .select({ id: platformAdmins.id, status: platformAdmins.status })
          .from(platformAdmins)
          .where(and(eq(platformAdmins.userId, user.id), isNull(platformAdmins.deletedAt))),
      );

      if (already) {
        return { kind: 'exists' as const, status: already.status, userId: user.id };
      }

      const admin = takeFirstOrThrow(
        await tx
          .insert(platformAdmins)
          // invitedBy is deliberately left null: nobody invited the founding admin, and a
          // self-reference here would read as "this account approved itself", which is a
          // claim the audit trail should not make.
          .values({ userId: user.id, status: 'active' })
          .returning(),
        'platform admin',
      );

      // Backfill the name onto an existing user row that has none, so the console has
      // something to render besides a phone number.
      if (fullName && !user.fullName) {
        await tx
          .update(users)
          .set({ fullName, updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }

      return { kind: 'created' as const, adminId: admin.id, userId: user.id };
    });

    if (outcome.kind === 'refused') {
      console.error(
        `[db] refusing to seed: ${outcome.count} active platform admin(s) already exist.\n` +
          '     Invite further admins from the console — that path records who approved whom.\n' +
          '     Pass --force only to recover from a lockout, and expect to justify it.',
      );
      process.exitCode = 1;
      return;
    }

    if (outcome.kind === 'exists') {
      console.log(`[db] ${phone} is already a platform admin (status: ${outcome.status}).`);
      if (outcome.status === 'suspended') {
        console.log('[db] it is SUSPENDED — reinstate it from the console rather than re-seeding.');
      }
      return;
    }

    console.log(`[db] platform admin created for ${phone}`);
    console.log(`[db]   user id  ${outcome.userId}`);
    console.log(`[db]   admin id ${outcome.adminId}`);
    if (force) {
      console.warn('[db] --force was used: this bypassed the invite trail. Record why.');
    }
    console.log('[db] sign in at the console with this number; a code is sent by SMS.');
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error('[db] seeding the platform admin failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
