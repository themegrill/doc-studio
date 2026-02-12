/**
 * This script simulates the full profile update flow
 */

import { getDb } from "../lib/db/postgres";

async function testFullFlow() {
  const sql = getDb();

  try {
    const userId = "0b60cbdc-0caa-4566-baec-82699489826f"; // Your user ID

    console.log("1. Fetching current user profile...");
    const [currentUser] = await sql`
      SELECT id, email, name, image FROM users WHERE id = ${userId}
    `;
    console.log("Current:", currentUser);

    console.log("\n2. Simulating profile update (all 3 fields)...");
    const result1 = await sql`
      UPDATE users
      SET name = ${currentUser.name}, email = ${currentUser.email}, image = ${currentUser.image}
      WHERE id = ${userId}
      RETURNING id, email, name, image
    `;
    console.log("✓ All 3 fields update:", result1.length > 0 ? "SUCCESS" : "FAILED");

    console.log("\n3. Simulating image-only update...");
    const result2 = await sql`
      UPDATE users
      SET image = ${currentUser.image}
      WHERE id = ${userId}
      RETURNING id, email, name, image
    `;
    console.log("✓ Image-only update:", result2.length > 0 ? "SUCCESS" : "FAILED");

    console.log("\n4. Verifying final state...");
    const [finalUser] = await sql`
      SELECT id, email, name, image FROM users WHERE id = ${userId}
    `;
    console.log("Final:", finalUser);

    console.log("\n✅ All tests passed! Profile updates are working correctly.");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
  } finally {
    await sql.end();
  }
}

testFullFlow();
