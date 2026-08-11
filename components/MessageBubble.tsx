export interface ChatMessage {
  id: string;
  role: "bot" | "user";
  text: string;
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isBot = message.role === "bot";
  const lines = message.text.split("\n");

  return (
    <div className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[75%] ${
          isBot
            ? "rounded-bl-sm bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
            : "rounded-br-sm bg-blue-600 text-white"
        }`}
      >
        {lines.map((line, i) => (
          <p key={i} className={i > 0 ? "mt-1.5" : undefined}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
