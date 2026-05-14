import { useState, useRef, useEffect } from "react";
import { useChildren } from "../context/ChildrenContext";
import { api } from "../../services/api";
import { MessageCircle, X, Send, Sparkles, Loader2, RefreshCw } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  "How is my child doing today?",
  "Which activity has the highest engagement?",
  "Are there any concerning patterns?",
  "What time of day is best for studying?",
];

// ─── floating chatbot widget ──────────────────────────────────────────────────

export default function AIChatbot() {
  const { selectedChild } = useChildren();
  const [isOpen, setIsOpen]     = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const messagesEndRef          = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0 && selectedChild) {
      setMessages([{
        role:      "assistant",
        content:   `Hi! I'm MindPulse AI. Ask me anything about ${selectedChild.child_name}'s engagement patterns, activities, or wellbeing. 👋`,
        timestamp: new Date(),
      }]);
    }
  }, [isOpen, selectedChild]);

  // Reset messages when child switches
  useEffect(() => {
    setMessages([]);
  }, [selectedChild?.id]);

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || !selectedChild || loading) return;

    const userMsg: Message = { role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
      const res = await api.aiChat(selectedChild.id, text, history);
      setMessages((prev) => [...prev, {
        role:      "assistant",
        content:   res.response ?? "Sorry, I couldn't get a response. Try again.",
        timestamp: new Date(),
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        role:      "assistant",
        content:   "Sorry, I couldn't process that right now. Please try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  if (!selectedChild) return null;

  return (
    <>
      {/* ── FLOATING BUTTON ───────────────────────────────────────────────── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          title="Ask MindPulse AI"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-3 text-white shadow-2xl transition-all hover:scale-105 hover:from-purple-600 hover:to-pink-600"
        >
          <Sparkles size={22} />
          <span className="hidden font-semibold md:inline">Ask AI</span>
        </button>
      )}

      {/* ── CHAT PANEL ───────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[580px] max-h-[calc(100vh-3rem)] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-purple-500/30 bg-gray-900 shadow-2xl">

          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-white/20 p-1.5">
                <Sparkles size={18} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">MindPulse AI</p>
                <p className="text-xs text-white/75">Insights for {selectedChild.child_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMessages([])}
                title="Clear chat"
                className="rounded p-1.5 text-white/70 hover:text-white transition"
              >
                <RefreshCw size={15} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-1.5 text-white/70 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  msg.role === "user"
                    ? "bg-purple-600 text-white"
                    : "border border-gray-700 bg-gray-800 text-gray-100"
                }`}>
                  <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  <p className={`mt-1 text-xs ${msg.role === "user" ? "text-purple-200" : "text-gray-500"}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3">
                  <Loader2 size={15} className="animate-spin text-purple-400" />
                  <span className="text-sm text-gray-400">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested questions (only when ≤1 messages) */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2">
              <p className="mb-1.5 text-xs text-gray-500">Try asking:</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_QUESTIONS.slice(0, 3).map((q, i) => (
                  <button
                    key={i}
                    onClick={() => void sendMessage(q)}
                    className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300 transition hover:bg-gray-700"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-gray-800 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your child…"
                rows={1}
                style={{ maxHeight: 100 }}
                className="flex-1 resize-none rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
              />
              <button
                onClick={() => void sendMessage()}
                disabled={loading || !input.trim()}
                className="rounded-xl bg-purple-600 p-2 text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-700"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="mt-1.5 text-center text-xs text-gray-600">
              ⚡ Powered by Mistral AI · Based on real sensor data
            </p>
          </div>
        </div>
      )}
    </>
  );
}
