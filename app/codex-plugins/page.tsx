import { IntentLanding, intentLandingMetadata } from "@/components/intent-landing";

export const generateMetadata = () => intentLandingMetadata("codex");

export default function CodexPluginsPage() {
  return <IntentLanding intent="codex" />;
}
