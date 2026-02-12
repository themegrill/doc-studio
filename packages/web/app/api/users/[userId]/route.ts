import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

// GET /api/users/[userId] - Get single user
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const { userId } = await params;

  try {
    const [user] = await sql`
      SELECT
        u.id,
        u.email,
        u.name,
        u.image,
        u.created_at,
        json_agg(
          json_build_object(
            'project_id', p.id,
            'project_name', p.name,
            'project_slug', p.slug,
            'role', pm.role
          )
        ) FILTER (WHERE pm.project_id IS NOT NULL) as projects
      FROM users u
      LEFT JOIN project_members pm ON u.id = pm.user_id
      LEFT JOIN projects p ON pm.project_id = p.id
      WHERE u.id = ${userId}
      GROUP BY u.id, u.email, u.name, u.image, u.created_at
    `;

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

// PATCH /api/users/[userId] - Update user
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const { userId } = await params;

  // Check if user has admin permissions
  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;

  const userRole = userData?.role || "user";

  if (userRole !== "admin" && userRole !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { email, name, image, password, role } = body;

    // Validate password if provided
    if (password && password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Validate role if provided
    const validRoles = ["user", "admin", "super_admin"];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      );
    }

    // Check if user exists
    const [existingUser] = await sql`
      SELECT id FROM users WHERE id = ${userId}
    `;

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Hash password if provided
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Convert undefined to null for SQL query
    const updateEmail = email ?? null;
    const updateName = name ?? null;
    const updateImage = image ?? null;
    const updateRole = role ?? null;

    // Update user
    const [updatedUser] = await sql`
      UPDATE users
      SET
        email = COALESCE(${updateEmail}, email),
        name = COALESCE(${updateName}, name),
        image = COALESCE(${updateImage}, image),
        role = COALESCE(${updateRole}, role),
        hashed_password = COALESCE(${hashedPassword}, hashed_password),
        updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, email, name, image, role, created_at, updated_at
    `;

    return NextResponse.json(updatedUser);
  } catch (error: any) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update user" },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[userId] - Delete user
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const { userId } = await params;

  // Check if user has admin permissions
  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;

  const userRole = userData?.role || "user";

  if (userRole !== "admin" && userRole !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    // Prevent self-deletion
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    // Check if user exists
    const [existingUser] = await sql`
      SELECT id FROM users WHERE id = ${userId}
    `;

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete user (cascades to project_members)
    await sql`
      DELETE FROM users WHERE id = ${userId}
    `;

    return NextResponse.json({ success: true, message: "User deleted" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
