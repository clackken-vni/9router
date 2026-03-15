"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";

const tabs = [
  { href: "/dashboard/stream-intervention/rules", label: "Rules" },
  { href: "/dashboard/stream-intervention/runtime", label: "Runtime Console" },
  { href: "/dashboard/stream-intervention/tool-routing", label: "Tool Routing" },
  { href: "/dashboard/stream-intervention/governance", label: "Governance" }
];

export default function StreamInterventionTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm border transition-colors",
            pathname === tab.href || pathname.startsWith(`${tab.href}/`)
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-text-muted hover:text-text-main hover:border-primary/30"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
