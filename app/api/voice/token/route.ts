import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      console.error("[VOICE_TOKEN_ERROR] Unauthorized - no clerkId");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      console.error("[VOICE_TOKEN_ERROR] User not found for clerkId:", clerkId);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      console.error("[VOICE_TOKEN_ERROR] sessionId missing in request");
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: user.id },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    if (!session) {
      console.error("[VOICE_TOKEN_ERROR] Session not found for sessionId:", sessionId, "userId:", user.id);
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const agentId = process.env.ELEVENLABS_AGENT_ID;
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!agentId) {
      console.error("[VOICE_TOKEN_ERROR] ELEVENLABS_AGENT_ID not configured");
      return NextResponse.json(
        { error: "ElevenLabs agent not configured" },
        { status: 503 }
      );
    }

    if (!apiKey) {
      console.error("[VOICE_TOKEN_ERROR] ELEVENLABS_API_KEY not configured");
      return NextResponse.json(
        { error: "ElevenLabs API key not configured" },
        { status: 503 }
      );
    }

    console.log("[VOICE_TOKEN] Requesting signed URL from ElevenLabs with agentId:", agentId);

    const elevenlabsUrl = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`;
    
    const response = await fetch(elevenlabsUrl, {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        "[VOICE_TOKEN_ELEVENLABS_ERROR]",
        "Status:", response.status,
        "Response:", responseText,
        "URL:", elevenlabsUrl
      );
      return NextResponse.json(
        { error: `Failed to get voice session URL: ${response.status}` },
        { status: 502 }
      );
    }

    let body: { signed_url?: string };
    try {
      body = JSON.parse(responseText);
    } catch (e) {
      console.error("[VOICE_TOKEN_PARSE_ERROR] Failed to parse response:", responseText);
      return NextResponse.json(
        { error: "Invalid response from ElevenLabs" },
        { status: 502 }
      );
    }

    const signedUrl = body.signed_url;

    if (!signedUrl) {
      console.error("[VOICE_TOKEN_ERROR] No signed_url in response:", body);
      return NextResponse.json(
        { error: "No signed URL in response" },
        { status: 502 }
      );
    }

    console.log("[VOICE_TOKEN_SUCCESS] Successfully obtained signed URL for session:", sessionId);

    return NextResponse.json({
      signedUrl,
      sessionId,
      firstMessageContext: {
        role: session.role,
        interviewType: session.interviewType,
        difficulty: session.difficulty,
        firstQuestion: session.questions[0]?.text ?? "Tell me about yourself.",
      },
    });
  } catch (error) {
    console.error("[VOICE_TOKEN_ERROR]", error instanceof Error ? error.message : String(error), error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
