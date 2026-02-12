import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sql = getDb();
    const result = await sql`
      SELECT id, email, name, image FROM users WHERE id = ${session.user.id}
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("[GET /api/user/profile] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, image } = body;

    if (name === undefined && email === undefined && image === undefined) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const sql = getDb();

    // Build update query - since postgres library doesn't support dynamic column names easily,
    // we'll construct different queries based on what's being updated
    let result;

    if (name !== undefined && email !== undefined && image !== undefined) {
      // All three fields
      result = await sql`
        UPDATE users
        SET name = ${name}, email = ${email}, image = ${image}
        WHERE id = ${session.user.id}
        RETURNING id, email, name, image
      `;
    } else if (name !== undefined && email !== undefined) {
      // Name and email
      result = await sql`
        UPDATE users
        SET name = ${name}, email = ${email}
        WHERE id = ${session.user.id}
        RETURNING id, email, name, image
      `;
    } else if (name !== undefined && image !== undefined) {
      // Name and image
      result = await sql`
        UPDATE users
        SET name = ${name}, image = ${image}
        WHERE id = ${session.user.id}
        RETURNING id, email, name, image
      `;
    } else if (email !== undefined && image !== undefined) {
      // Email and image
      result = await sql`
        UPDATE users
        SET email = ${email}, image = ${image}
        WHERE id = ${session.user.id}
        RETURNING id, email, name, image
      `;
    } else if (name !== undefined) {
      // Name only
      result = await sql`
        UPDATE users
        SET name = ${name}
        WHERE id = ${session.user.id}
        RETURNING id, email, name, image
      `;
    } else if (email !== undefined) {
      // Email only
      result = await sql`
        UPDATE users
        SET email = ${email}
        WHERE id = ${session.user.id}
        RETURNING id, email, name, image
      `;
    } else {
      // Image only
      result = await sql`
        UPDATE users
        SET image = ${image}
        WHERE id = ${session.user.id}
        RETURNING id, email, name, image
      `;
    }

    if (result.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: result[0],
    });
  } catch (error: any) {
    console.error("[PATCH /api/user/profile] Error:", {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });

    // Handle unique constraint violation for email
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
