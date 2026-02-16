import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";

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
    const { apiKey } = body;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "API key is required" },
        { status: 400 }
      );
    }

    // Test the API key with a simple request using the Anthropic API directly
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 10,
          messages: [
            {
              role: "user",
              content: "Hello",
            },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return NextResponse.json({
          success: false,
          error: error.error?.message || "Invalid API key",
        });
      }

      const data = await response.json();

      return NextResponse.json({
        success: true,
        message: "API key is valid",
        modelUsed: data.model,
      });
    } catch (apiError: any) {
      return NextResponse.json({
        success: false,
        error: apiError.message || "Invalid API key",
      });
    }
  } catch (error) {
    console.error("Error testing API key:", error);
    return NextResponse.json(
      { success: false, error: "Failed to test API key" },
      { status: 500 }
    );
  }
}
