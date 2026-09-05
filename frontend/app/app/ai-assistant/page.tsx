"use client";

import { AssistantChat } from "@/components/ai/AssistantChat";

export default function AiAssistantPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AssistantChat />
    </div>
  );
}
