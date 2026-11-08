import { NextResponse } from "next/server";

import { getCurrentSession } from "@/features/auth/session";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json(session.user);
}
