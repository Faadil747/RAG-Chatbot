/**
 * No-op seed stub. This project does not ship with fabricated candidate
 * data — candidates are created exclusively via resume uploads that are
 * parsed by the ai-service. Kept here so `prisma db seed` (and `npm run
 * seed`) has something valid to execute in every environment.
 */
async function main(): Promise<void> {
  console.log("no seed data");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
