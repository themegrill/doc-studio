import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sql = getDb();

    // Check if user is admin
    const [user] = await sql`
      SELECT role FROM users WHERE id = ${session.user.id}
    `;

    if (!user || !["admin", "super_admin"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get AI settings from global_settings table
    const settings = await sql`
      SELECT key, value FROM global_settings
      WHERE category = 'ai'
    `;

    // Parse settings into response format
    const config = settings.find((s) => s.key === "ai.config")?.value || {};
    const features = settings.find((s) => s.key === "ai.features")?.value || {};

    // Return settings or defaults
    return NextResponse.json({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || "",
      defaultModel: config.defaultModel || "claude-sonnet-4-5",
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 4096,
      enabledFeatures: features || {
        chat: true,
        textGeneration: true,
        titleGeneration: true,
        descriptionGeneration: true,
      },
    });
  } catch (error) {
    console.error("Error loading AI settings:", error);
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sql = getDb();

    // Check if user is admin
    const [user] = await sql`
      SELECT role FROM users WHERE id = ${session.user.id}
    `;

    if (!user || !["admin", "super_admin"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { apiKey, defaultModel, temperature, maxTokens, enabledFeatures } = body;

    // Update AI config settings
    await sql`
      INSERT INTO global_settings (key, value, category, description, updated_at)
      VALUES (
        'ai.config',
        ${sql.json({
          apiKey,
          defaultModel,
          temperature,
          maxTokens,
        })},
        'ai',
        'AI model configuration and API credentials',
        NOW()
      )
      ON CONFLICT (key)
      DO UPDATE SET
        value = ${sql.json({
          apiKey,
          defaultModel,
          temperature,
          maxTokens,
        })},
        updated_at = NOW()
    `;

    // Update AI features settings
    await sql`
      INSERT INTO global_settings (key, value, category, description, updated_at)
      VALUES (
        'ai.features',
        ${sql.json(enabledFeatures)},
        'ai',
        'Enabled AI features across the platform',
        NOW()
      )
      ON CONFLICT (key)
      DO UPDATE SET
        value = ${sql.json(enabledFeatures)},
        updated_at = NOW()
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving AI settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
