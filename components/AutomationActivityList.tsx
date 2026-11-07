"use client";

import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatRelativeTime } from "./constants";

export interface AutomationEventItem {
  _id: string;
  type: "request_notification" | "overdue_reminder";
  status: "sent" | "failed";
  createdAt: number;
  idempotencyKey: string;
}

export function AutomationActivityList({
  events,
}: {
  events: AutomationEventItem[];
}) {
  if (!events || events.length === 0) {
    return (
      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
        <Activity className="h-3.5 w-3.5" />
        <span>No n8n automation activity recorded yet</span>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <Activity className="h-3.5 w-3.5 text-indigo-600" />
        <span>Recent Automation Activity (n8n)</span>
      </p>
      <ul className="space-y-1">
        {events.slice(0, 3).map((ev) => {
          const label =
            ev.type === "overdue_reminder"
              ? ev.status === "sent"
                ? "Overdue reminder sent"
                : "Overdue reminder failed"
              : ev.status === "sent"
                ? "Notification sent"
                : "Notification delivery failed";

          return (
            <li
              key={ev._id}
              className="flex items-center justify-between rounded bg-slate-50 px-2.5 py-1 text-xs"
            >
              <span className="flex items-center gap-1.5 text-slate-700">
                {ev.status === "sent" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                )}
                <span>
                  {label} {formatRelativeTime(ev.createdAt)}
                </span>
              </span>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                  ev.status === "sent"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {ev.status}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

