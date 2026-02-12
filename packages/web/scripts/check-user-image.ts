import { getDb } from "../lib/db/postgres";

async function checkUserImage() {
  const sql = getDb();

  try {
    const users = await sql`
      SELECT id, email, name, image
      FROM users
      ORDER BY updated_at DESC
      LIMIT 5
    `;

    console.log("Recent users:");
    users.forEach((user) => {
      console.log({
        email: user.email,
        name: user.name,
        image: user.image,
      });
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await sql.end();
  }
}

checkUserImage();
