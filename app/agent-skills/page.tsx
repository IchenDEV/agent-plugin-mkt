import { IntentLanding, intentLandingMetadata } from "@/components/intent-landing";

export const generateMetadata = () => intentLandingMetadata("agent-skills");

export default function AgentSkillsPage() {
  return <IntentLanding intent="agent-skills" />;
}
