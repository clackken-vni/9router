import StreamInterventionTabs from "../components/StreamInterventionTabs";
import SectionHeader from "../components/SectionHeader";
import { Card, Badge } from "@/shared/components";

export default function StreamInterventionRuntimePage() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Runtime Console" subtitle="Observe stream lifecycle timeline and raw SSE events" />
      <StreamInterventionTabs />
      <Card>
        <div className="flex items-center justify-between">
          <span className="font-medium">Runtime Timeline</span>
          <Badge variant="info" size="sm">Planned</Badge>
        </div>
        <p className="text-sm text-text-muted mt-2">Filter by request/provider/tool and inspect raw SSE transcript.</p>
      </Card>
    </div>
  );
}
