import { ImageResponse } from "next/og";

// Link-preview card image WhatsApp shows when the chat URL is sent in a message.
export const alt = "Chat with HDFC Bank";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#008069",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            width: 160,
            height: 160,
            borderRadius: 80,
            background: "#ffffff",
            color: "#004c8f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 96,
            fontWeight: 700,
          }}
        >
          H
        </div>
        <div style={{ marginTop: 40, fontSize: 72, fontWeight: 700 }}>HDFC Bank</div>
        <div style={{ marginTop: 16, fontSize: 36, opacity: 0.85 }}>Tap to chat with us</div>
      </div>
    ),
    size
  );
}
