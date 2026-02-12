"use client";

import { useCallback, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";
import type { TranscriptEntry } from "@/types";

interface Question {
  id: string;
  text: string;
  order: number;
}

interface UseVoiceAgentOptions {
  sessionId: string;
  questions: Question[];
  onTranscriptUpdate: (entry: TranscriptEntry) => void;
  onSessionEnd: () => void;
}

type CallStatus = "idle" | "connecting" | "active" | "ended";

interface ConversationMessage {
  role?: string;
  message?: string;
  source?: string;
}

export function useVoiceAgent({
  sessionId,
  onTranscriptUpdate,
  onSessionEnd,
}: UseVoiceAgentOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const conversationRef = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null);

  const startSession = useCallback(async () => {
    setError(null);
    setCallStatus("connecting");
    try {
      console.log("[v0] Voice Session: Requesting token for sessionId:", sessionId);
      const res = await fetch(`/api/voice/token?sessionId=${encodeURIComponent(sessionId)}`);
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errorMsg = data.error ?? `Failed to get voice session (${res.status})`;
        console.error("[v0] Voice Session: Token request failed:", errorMsg, "Status:", res.status);
        throw new Error(errorMsg);
      }
      
      const data = (await res.json()) as {
        signedUrl: string;
        sessionId: string;
      };
      
      console.log("[v0] Voice Session: Successfully obtained token, starting conversation");
      

      const conversation = await Conversation.startSession({
        signedUrl: data.signedUrl,
        connectionType: "websocket",
        onConnect: () => {
          setIsConnected(true);
          setCallStatus("active");
        },
        onDisconnect: () => {
          setIsConnected(false);
          setCallStatus("ended");
          conversationRef.current = null;
          onSessionEnd();
        },
        onMessage: (message: ConversationMessage) => {
          const role = message.role ?? message.source ?? "agent";
          const text = typeof message.message === "string" ? message.message : String(message.message ?? "");
          if (!text.trim()) return;
          const speaker: "ai" | "user" = role === "user" ? "user" : "ai";
          const entry: TranscriptEntry = {
            speaker,
            text,
            timestamp: new Date(),
          };
          setTranscript((prev) => [...prev, entry]);
          onTranscriptUpdate(entry);
        },
        onModeChange: (mode: { mode?: string }) => {
          const m = mode?.mode ?? "";
          if (m === "speaking") {
            setIsSpeaking(true);
            setIsUserSpeaking(false);
          } else if (m === "listening") {
            setIsSpeaking(false);
            setIsUserSpeaking(true);
          } else {
            setIsSpeaking(false);
            setIsUserSpeaking(false);
          }
        },
        onError: (err: unknown) => {
          setError(err instanceof Error ? err.message : "Voice error");
        },
        onStatusChange: (status: { status?: string }) => {
          if (status.status === "connected") {
            setIsConnected(true);
            setCallStatus("active");
          } else if (status.status === "disconnected") {
            setIsConnected(false);
            setCallStatus("ended");
          }
        },
      });

      conversationRef.current = conversation;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start";
      console.error("[v0] Voice Session Error:", errorMessage, err);
      setError(errorMessage);
      setCallStatus("idle");
    }
  }, [sessionId, onSessionEnd, onTranscriptUpdate]);

  const stopSession = useCallback(() => {
    if (conversationRef.current) {
      conversationRef.current.endSession().catch(() => {});
      conversationRef.current = null;
    }
    setIsConnected(false);
    setCallStatus("ended");
    onSessionEnd();
  }, [onSessionEnd]);

  return {
    isConnected,
    isSpeaking,
    isUserSpeaking,
    transcript,
    currentQuestionIndex,
    setCurrentQuestionIndex,
    callStatus,
    error,
    startSession,
    stopSession,
  };
}
