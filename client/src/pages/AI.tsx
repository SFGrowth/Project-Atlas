import { useState } from "react";
import { HudPanel, PageWrapper, SectionHeader } from "@/components/HudComponents";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";

const SYSTEM_PROMPT = "You are JARVIS, the AI assistant for the Atlas Nexus quantitative trading operating system. You help traders understand their pipeline data, model evaluations, risk metrics, and trading performance. Be concise, technical, and precise. Use the JARVIS voice — calm, intelligent, and slightly formal.";

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Good morning. I am JARVIS — your AI interface to the Atlas Nexus pipeline. I can help you interpret model evaluations, risk metrics, pipeline state, and trading performance. How can I assist you?" },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const chat = trpc.system.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
      setIsLoading(false);
    },
    onError: (err) => {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
      setIsLoading(false);
    },
  });

  const handleSend = (content: string) => {
    const userMsg: Message = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);
    chat.mutate({ messages: newMessages, systemPrompt: SYSTEM_PROMPT });
  };

  return (
    <PageWrapper>
      <div className="p-4 flex flex-col" style={{ height: "calc(100vh - 60px)" }}>
        <SectionHeader title="Atlas AI" subtitle="Ask JARVIS anything about your pipeline, trades, or strategy" />
        <div className="flex-1 min-h-0">
          <HudPanel title="JARVIS — AI Assistant" className="h-full">
            <AIChatBox
              messages={messages}
              onSendMessage={handleSend}
              isLoading={isLoading}
              placeholder="Ask JARVIS about your pipeline, models, or performance…"
            />
          </HudPanel>
        </div>
      </div>
    </PageWrapper>
  );
}
