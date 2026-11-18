import { grantExtraCredits } from '../server/entitlements.js';

function usage(): never {
  console.error('Usage: npm run grant:credits -- <userId> <credits>');
  process.exit(1);
}

const [, , userIdArg, creditsArg] = process.argv;
const userId = userIdArg?.trim();
const credits = Number.parseInt(creditsArg || '', 10);

if (!userId || !creditsArg || !Number.isFinite(credits)) {
  usage();
}

try {
  const record = await grantExtraCredits(userId, credits);
  console.log(
    JSON.stringify(
      {
        ok: true,
        userId,
        grantedCredits: credits,
        extraCredits: record.extraCredits,
        plan: record.plan,
        updatedAt: record.updatedAt,
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
