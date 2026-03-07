"use client";

import { Card } from "@/shared/components";

export default function PlaygroundPage() {
  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Playground"
        subtitle="Quickly test models and providers"
        icon="experiment"
      >
        <p className="text-sm text-text-muted">
          Playground is being initialized.
        </p>
      </Card>
    </div>
  );
}
