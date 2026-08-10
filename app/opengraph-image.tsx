import { ImageResponse } from "next/og";

export const alt = "Agent Plugins Marketplace — find plugins for Codex, Claude Code, and Agent Plugins";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#f6f7f9",
        color: "#161a25",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        padding: "72px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "flex-start",
          border: "2px solid #dfe2e8",
          borderRadius: "28px",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          padding: "58px 64px",
          width: "100%",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", fontSize: 34, fontWeight: 700 }}>
          <span
            style={{
              alignItems: "center",
              background: "#161a25",
              borderRadius: "10px",
              color: "white",
              display: "flex",
              height: 52,
              justifyContent: "center",
              marginRight: 20,
              width: 52,
            }}
          >
            /
          </span>
          Agent Plugins <span style={{ color: "#5147e5", marginLeft: 8 }}>Marketplace</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 70, fontWeight: 750, letterSpacing: "-3px", lineHeight: 1.05 }}>
            Find plugins for your AI tools
          </div>
          <div style={{ color: "#596171", fontSize: 29, marginTop: 28 }}>
            Compare plugin formats, skills, and MCP servers.
          </div>
        </div>
        <div style={{ color: "#5147e5", display: "flex", fontSize: 24, fontWeight: 600 }}>
          Search plugins · review source · connect with REST or MCP
        </div>
      </div>
    </div>,
    size,
  );
}
