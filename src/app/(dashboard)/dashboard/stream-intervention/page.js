"use client";

import Link from "next/link";
import { Card, Badge } from "@/shared/components";
import SectionHeader from "./components/SectionHeader";

const summary = [
  { label: "Active rules", value: "0", variant: "success" },
  { label: "Draft rules", value: "0", variant: "warning" },
  { label: "Intercept success rate", value: "--", variant: "info" },
  { label: "Fail-open (24h)", value: "0", variant: "default" }
];

const modules = [
  {
    href: "/dashboard/stream-intervention/rules",
    title: "Rules",
    description: "Rule List + Builder + Validation"
  },
  {
    href: "/dashboard/stream-intervention/runtime",
    title: "Runtime Console",
    description: "Timeline, filters, and raw SSE inspector"
  },
  {
    href: "/dashboard/stream-intervention/tool-routing",
    title: "Tool Routing",
    description: "Tool -> MCP/API executor mappings"
  },
  {
    href: "/dashboard/stream-intervention/governance",
    title: "Governance",
    description: "Simulator, publish workflow, rollback"
  }
];

export default function StreamInterventionLandingPage() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Stream Intervention"
        subtitle="Configure stream/tool intervention and observe runtime behavior in one place"
        help="Fail-open is the recommended default. Keep timeout mandatory for external interception."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {summary.map((item) => (
          <Card key={item.label} padding="sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">{item.label}</span>
              <Badge variant={item.variant} size="sm">{item.value}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <Card padding="sm" className="border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-500">warning</span>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-text-main">Production safeguards</p>
            <ul className="text-sm text-text-muted list-disc pl-4">
              <li>Keep fail-open as default for runtime safety.</li>
              <li>Set hard timeout for every external executor.</li>
              <li>Review draft rules before publishing.</li>
            </ul>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {modules.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card hover padding="sm" className="h-full">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{item.title}</h3>
                <span className="material-symbols-outlined text-text-muted">arrow_forward</span>
              </div>
              <p className="text-sm text-text-muted mt-2">{item.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
