import { ChatPanel } from "@/components/chat-panel";

export default function ChatPage() {
  return (
    <>
      <header className="shrink-0 border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Chat</h1>
        <p className="text-sm text-muted">Conversation with Kampaku</p>
      </header>
      <ChatPanel />
    </>
  );
}
