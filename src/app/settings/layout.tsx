import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import SettingsNav from "./SettingsNav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Settings & Customization" subtitle="Configure company, planning rules, factory structure, master data, TNA templates, custom fields, statuses and appearance." />
      <SettingsNav />
      {children}
    </>
  );
}
