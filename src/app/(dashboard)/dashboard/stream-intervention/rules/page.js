import StreamInterventionTabs from "../components/StreamInterventionTabs";
import SectionHeader from "../components/SectionHeader";
import { Card, Badge } from "@/shared/components";

export default function StreamInterventionRulesPage() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Rules" subtitle="Manage intervention rule list, builder, and validation" />
      <StreamInterventionTabs />
      <Card>
        <div className="flex items-center justify-between">
          <span className="font-medium">Rule Studio</span>
          <Badge variant="warning" size="sm">Planned</Badge>
        </div>
        <p className="text-sm text-text-muted mt-2">Use Rule Studio to create and validate stream/tool policies.</p>
      </Card>
    </div>
  );
}
