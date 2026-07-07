import * as React from "react";

import { cn } from "@/lib/utils";



const STATUS_COLORS: Record<string, string> = {

  DRAFT_CREATED: "bg-slate-100 text-slate-700",

  COLLECTING_INPUTS: "bg-gdi-blue/10 text-gdi-blue",

  PREP_FINAL_SPRINT: "bg-gdi-navy/10 text-gdi-navy",

  DRAFT_GENERATED: "bg-amber-100 text-amber-800",

  VP_REVIEW: "bg-gdi-blue/15 text-gdi-navy",

  APPROVED: "bg-gdi-green/10 text-gdi-green",

  READY_FOR_MEETING: "bg-gdi-blue/10 text-gdi-blue",

  PRESENTED: "bg-gdi-green/15 text-gdi-green",

  SURVEY_SENT: "bg-slate-100 text-slate-600",

  CLOSED: "bg-gray-200 text-gray-600",

};



export function Badge({

  children,

  className,

  status,

}: {

  children: React.ReactNode;

  className?: string;

  status?: string;

}) {

  const color = status ? STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700" : "bg-accent text-accent-foreground";

  return (

    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", color, className)}>

      {children}

    </span>

  );

}

