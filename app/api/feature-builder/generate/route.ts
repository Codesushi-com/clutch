import { NextResponse } from "next/server";

// NOTE: Placeholder route.
// Some builds expect this file to exist (App Router type generation).
// If/when Feature Builder needs a dedicated generate endpoint again,
// replace this stub with the real implementation.

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Feature Builder generate endpoint is not implemented. Use /api/feature-builder/create or other feature-builder routes instead.",
    },
    { status: 501 },
  );
}
