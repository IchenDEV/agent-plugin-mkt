import { IntentLanding, intentLandingMetadata } from "@/components/intent-landing";

export const generateMetadata = () => intentLandingMetadata("mcp-servers");

export default function McpServersPage() {
  return <IntentLanding intent="mcp-servers" />;
}
