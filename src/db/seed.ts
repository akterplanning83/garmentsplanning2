import "dotenv/config";
import { clearDatabase, seedDatabase } from "./seed-data";
import { pool } from "./index";

async function main() {
  console.log("Clearing database...");
  await clearDatabase();
  console.log("Seeding demo data...");
  await seedDatabase();
  console.log("Done.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
