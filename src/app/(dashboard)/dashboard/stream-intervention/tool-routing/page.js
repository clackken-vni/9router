import StreamInterventionTabs from "../components/StreamInterventionTabs";
import SectionHeader from "../components/SectionHeader";
import { Card, Badge } from "@/shared/components";

export default function StreamInterventionToolRoutingPage() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Tool Routing" subtitle="Map tools to MCP/API executors with policy safeguards" />
      <StreamInterventionTabs />
      <Card>
        <div className="flex items-center justify-between">
          <span className="font-medium">Executor Mapping</span>
          <Badge variant="warning" size="sm">Planned</Badge>
        </div>
        <p className="text-sm text-text-muted mt-2">Configure timeout and fail-open policy per tool mapping.</p>
      </Card>
    </div>
  );
}
