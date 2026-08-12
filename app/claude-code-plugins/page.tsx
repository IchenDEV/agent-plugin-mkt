import { IntentLanding, intentLandingMetadata } from "@/components/intent-landing";

export const generateMetadata = () => intentLandingMetadata("claude-code");

export default function ClaudeCodePluginsPage() {
  return <IntentLanding intent="claude-code" />;
}
