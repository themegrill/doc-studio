import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/postgres";

/**
 * Public endpoint to get enabled AI features
 * No auth required - just returns which features are enabled
 */
export async function GET() {
  try {
    const sql = getDb();

    // Get AI features from global_settings
    const [result] = await sql`
      SELECT value FROM global_settings
      WHERE key = 'ai.features'
    `;

    const features = {
      chat: true,
      textGeneration: true,
      titleGeneration: true,
      descriptionGeneration: true,
      editorialReview: true,
      ...(result?.value ?? {}),
    };

    return NextResponse.json({
      features,
    });
  } catch (error) {
    console.error("Error loading AI features:", error);

    // Return defaults on error
    return NextResponse.json({
      features: {
        chat: true,
        textGeneration: true,
        titleGeneration: true,
        descriptionGeneration: true,
        editorialReview: true,
      },
    });
  }
}
