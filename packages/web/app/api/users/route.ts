import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

// GET /api/users - List all users
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  // Check if user has admin permissions
  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;

  const userRole = userData?.role || "user";

  if (userRole !== "admin" && userRole !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    // Get all users with their project counts and roles
    const users = await sql`
      SELECT
        u.id,
        u.email,
        u.name,
        u.image,
        u.created_at,
        COUNT(DISTINCT pm.project_id) as project_count,
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
      GROUP BY u.id, u.email, u.name, u.image, u.created_at
      ORDER BY u.created_at DESC
    `;

    return NextResponse.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

// POST /api/users - Create a new user
export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

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

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["user", "admin", "super_admin"];
    const userRole = role && validRoles.includes(role) ? role : "user";

    // Check if user already exists
    const existingUser = await sql`
      SELECT id FROM users WHERE email = ${email}
    `;

    if (existingUser.length > 0) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const [user] = await sql`
      INSERT INTO users (email, name, image, hashed_password, role)
      VALUES (${email}, ${name || null}, ${image || null}, ${hashedPassword}, ${userRole})
      RETURNING id, email, name, image, role, created_at
    `;

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
