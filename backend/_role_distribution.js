const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

prisma.candidate.findMany({ select: { currentRole: true, jobId: true } }).then((rows) => {
  const counts = {};
  for (const r of rows) {
    const role = (r.currentRole || "(blank)").trim();
    counts[role] = (counts[role] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  console.log(`Total candidates: ${rows.length}`);
  console.log(`Distinct currentRole values: ${sorted.length}`);
  console.log("");
  for (const [role, count] of sorted) {
    console.log(`${count}\t${role}`);
  }
  return prisma.$disconnect();
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
