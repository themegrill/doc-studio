import { getDb } from "../lib/db/postgres";

async function testProfileUpdate() {
  const sql = getDb();

  try {
    // Get a test user
    const [user] = await sql`
      SELECT id, email, name, image
      FROM users
      WHERE email = 'aashil.bijukshe@themegrill.com'
      LIMIT 1
    `;

    if (!user) {
      console.log("User not found");
      return;
    }

    console.log("Current user:", user);

    // Test updating just the image
    const testImage = "/uploads/test/test.jpg";

    console.log("\nTesting image update...");
    const result = await sql`
      UPDATE users
      SET image = ${testImage}
      WHERE id = ${user.id}
      RETURNING id, email, name, image
    `;

    console.log("Update result:", result[0]);

    // Restore original image
    console.log("\nRestoring original image...");
    const restore = await sql`
      UPDATE users
      SET image = ${user.image}
      WHERE id = ${user.id}
      RETURNING id, email, name, image
    `;

    console.log("Restored:", restore[0]);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await sql.end();
  }
}

testProfileUpdate();
