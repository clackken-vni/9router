import StreamInterventionTabs from "../components/StreamInterventionTabs";
import SectionHeader from "../components/SectionHeader";
import { Card, Badge } from "@/shared/components";

export default function StreamInterventionGovernancePage() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Governance" subtitle="Simulator, conflict resolution, publish workflow, and rollback" />
      <StreamInterventionTabs />
      <Card>
        <div className="flex items-center justify-between">
          <span className="font-medium">Governance Workflow</span>
          <Badge variant="info" size="sm">Planned</Badge>
        </div>
        <p className="text-sm text-text-muted mt-2">Validate rule changes before publish and keep rollback ready.</p>
      </Card>
    </div>
  );
}
