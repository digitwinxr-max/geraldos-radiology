"use client";

import React, { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { useIntegrationsClientConfig } from "@/hooks/use-integrations";
import { mutate } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Bot,
  UserPlus,
  Calendar,
  Wrench,
  Package,
  BarChart3,
  GitBranch,
  Zap,
  MessageSquare,
  Send,
  Loader2,
  Receipt,
  FileText,
  ShieldCheck,
  BookOpen,
  Crosshair,
  Database,
  Radio,
  Cpu,
} from "lucide-react";

interface AgentDef {
  id: string;
  name: string;
  mission: string;
  description: string;
  icon: React.ElementType;
  lightColor: string;
  textColor: string;
  tools: string[];
  memory: string;
  events: string[];
  responsibilities: string[];
}

const AGENTS: AgentDef[] = [
  {
    id: "reception",
    name: "Reception Agent",
    mission: "Deliver a frictionless patient journey from registration to first appointment.",
    description: "Automates patient check-in, validates insurance via FHIR Coverage resources, and manages consent workflows.",
    icon: UserPlus,
    lightColor: "bg-brand-soft",
    textColor: "text-brand",
    tools: ["Patient registry", "FHIR Coverage lookup", "Consent tracker", "Queue board"],
    memory: "Patient contact/insurance history, consent status, wait times",
    events: ["patient.registered", "appointment.checked_in", "referral.received"],
    responsibilities: ["Verify identity & eligibility", "Manage consents", "Estimate wait times", "Surface registration blockers"],
  },
  {
    id: "scheduling",
    name: "Scheduling Agent",
    mission: "Optimise machine and radiographer allocation so no slot is ever wasted.",
    description: "Detects conflicts, manages priority escalation, and triggers n8n reallocation workflows.",
    icon: Calendar,
    lightColor: "bg-ai-soft",
    textColor: "text-ai",
    tools: ["Appointment ledger", "Equipment calendar", "Radiographer roster", "Priority rules"],
    memory: "Slot utilisation history, conflict records, no-show patterns",
    events: ["appointment.created", "appointment.delayed", "equipment.offline", "equipment.online"],
    responsibilities: ["Conflict detection", "Priority allocation", "Slot reallocation", "Workload balancing"],
  },
  {
    id: "workflow",
    name: "Workflow Agent",
    mission: "Keep every study moving through the pipeline and flag anything that stalls.",
    description: "Monitors study progression, detects bottlenecks, and escalates TAT breaches through n8n.",
    icon: GitBranch,
    lightColor: "bg-brand-soft",
    textColor: "text-brand",
    tools: ["Stage tracker", "TAT thresholds", "n8n escalation", "Assignment board"],
    memory: "Per-study stage history and turnaround times",
    events: ["study.uploaded", "study.started", "study.completed", "report.approved"],
    responsibilities: ["Monitor progression", "Detect bottlenecks", "Suggest assignments", "Escalate urgent studies"],
  },
  {
    id: "reporting",
    name: "Reporting Agent",
    mission: "Assist the radiologist with structured, consistent, high-quality reports — never diagnose.",
    description: "Recommends templates, drafts structure, flags critical terms and scores quality. The radiologist always signs.",
    icon: FileText,
    lightColor: "bg-ai-soft",
    textColor: "text-ai",
    tools: ["Structured templates", "Prior-study comparison", "Measurement extraction", "Quality scoring"],
    memory: "Report version history, template preferences, terminology consistency",
    events: ["report.started", "report.drafted", "report.versioned", "report.signed"],
    responsibilities: ["Template recommendation", "Draft structure", "Critical finding flags", "Quality scoring"],
  },
  {
    id: "equipment",
    name: "Equipment Agent",
    mission: "Maximise fleet uptime through proactive health monitoring.",
    description: "Monitors equipment health, predicts maintenance needs, and manages calibration schedules.",
    icon: Wrench,
    lightColor: "bg-operational-soft",
    textColor: "text-operational",
    tools: ["Equipment registry", "Calibration tracker", "Service dispatcher (n8n)", "Downtime model"],
    memory: "Calibration/maintenance history, utilisation rates",
    events: ["equipment.online", "equipment.offline", "maintenance.scheduled"],
    responsibilities: ["Calibration alerts", "Downtime impact", "Service dispatch", "Lifecycle tracking"],
  },
  {
    id: "inventory",
    name: "Inventory Agent",
    mission: "Guarantee critical consumables are never out of stock at scan time.",
    description: "Forecasts consumption, automates reorder triggers, and monitors expiry dates.",
    icon: Package,
    lightColor: "bg-brand-soft",
    textColor: "text-brand",
    tools: ["Stock ledger", "Reorder thresholds", "MinIO manifests", "Expiry monitor"],
    memory: "Consumption rates, supplier lead times, expiry records",
    events: ["inventory.updated", "inventory.low_stock"],
    responsibilities: ["Reorder advisories", "Expiry monitoring", "Consumption forecasting", "Supplier tracking"],
  },
  {
    id: "quality",
    name: "Quality Assurance Agent",
    mission: "Protect clinical quality through structured, audited checks.",
    description: "Scores study completeness, verifies AI observation decisions and tracks report quality against accreditation standards.",
    icon: ShieldCheck,
    lightColor: "bg-ai-soft",
    textColor: "text-ai",
    tools: ["Quality checklists", "Observation audit trail", "Report quality scoring", "Accreditation standards"],
    memory: "QA history per study, technician, modality",
    events: ["study.completed", "report.drafted", "ai.observation_accepted"],
    responsibilities: ["Completeness scoring", "AI audit verification", "Report quality tracking", "Standard deviation flags"],
  },
  {
    id: "executive",
    name: "Executive Intelligence Agent",
    mission: "Turn operational data into concise, decision-ready intelligence.",
    description: "Generates executive summaries, identifies trends, and surfaces actionable insights from live operational data.",
    icon: BarChart3,
    lightColor: "bg-premium-soft",
    textColor: "text-premium",
    tools: ["Analytics engine", "Finance analytics", "Integration health", "Trend models"],
    memory: "Historical KPIs, revenue trends, incident records",
    events: ["decision.proposed", "decision.executed", "report.signed", "equipment.offline"],
    responsibilities: ["Executive summaries", "Bottleneck detection", "Revenue-at-risk", "Decision proposals"],
  },
  {
    id: "knowledge",
    name: "Knowledge Agent",
    mission: "Answer exclusively from approved internal documentation.",
    description: "Answers questions citing approved SOPs, protocols and manuals — never unapproved or external sources.",
    icon: BookOpen,
    lightColor: "bg-ai-soft",
    textColor: "text-ai",
    tools: ["Knowledge base search", "SOP/protocol retrieval", "Version control"],
    memory: "Document index, categories, approval status",
    events: ["knowledge.published"],
    responsibilities: ["Citing answers", "Refusing unapproved sources", "Protocol suggestions", "Version pointing"],
  },
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  source?: string;
  sources?: string[];
}

const SOURCE_LABELS: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  langgraph: { label: "LangGraph Live", variant: "success" },
  "local-fallback": { label: "Fallback (LangGraph down)", variant: "warning" },
  "local-simulation": { label: "Simulated (unconfigured)", variant: "secondary" },
};

export default function AgentsPage() {
  const configQuery = useIntegrationsClientConfig();
  const langgraphEnabled = Boolean(configQuery.data?.langgraphEnabled);
  const [chatAgent, setChatAgent] = useState<AgentDef | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openChat = (agent: AgentDef) => {
    setChatAgent(agent);
    setMessages([{ role: "assistant", content: `${agent.name} online. ${agent.mission}` }]);
  };

  const send = async () => {
    if (!input.trim() || sending || !chatAgent) return;
    const userMessage = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMessage }]);
    setSending(true);
    try {
      const data = await mutate<{ reply?: string; error?: string; source?: string; sources?: string[] }>("POST", "/api/agents/chat", { agent: chatAgent.id, message: userMessage });
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? data.error ?? "No response from agent runtime.", source: data.source, sources: data.sources },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Agent endpoint unreachable." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Shell title="AI Agent Organisation" description="Nine independent specialised agents — no monolithic chatbot">
      {/* Runtime card */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">LangGraph Multi-Agent Orchestration</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Each agent is an independent state graph with its own mission, tools, memory and event subscriptions.
                Agent runs execute on the LangGraph runtime and fall back to live-data simulation when offline.
                AI actions never execute directly — they flow through the Decision Engine for approval.
              </p>
            </div>
            <Badge variant={langgraphEnabled ? "success" : "secondary"} className="whitespace-nowrap">
              {langgraphEnabled ? "LangGraph Connected" : "Local Simulation Mode"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Agent grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((agent) => (
          <Card key={agent.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${agent.lightColor}`}>
                  <agent.icon className={`h-5 w-5 ${agent.textColor}`} />
                </div>
                <div>
                  <CardTitle className="text-base">{agent.name}</CardTitle>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Independent Agent</Badge>
                    <Badge variant="success" className="text-xs">Active</Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="flex items-start gap-2 text-xs font-medium italic text-slate-700 dark:text-slate-300">
                  <Crosshair className="mt-0.5 h-3 w-3 flex-shrink-0 text-brand" />
                  {agent.mission}
                </p>
              </div>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{agent.description}</p>

              <div className="mt-4 space-y-2 text-xs">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Database className="h-3 w-3" /> Tools
                </p>
                <div className="flex flex-wrap gap-1">
                  {agent.tools.map((t) => <Badge key={t} variant="outline" className="text-[9px] font-normal">{t}</Badge>)}
                </div>
                <p className="flex items-center gap-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Cpu className="h-3 w-3" /> Memory
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{agent.memory}</p>
                <p className="flex items-center gap-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Radio className="h-3 w-3" /> Reacts to events
                </p>
                <div className="flex flex-wrap gap-1">
                  {agent.events.map((e) => <Badge key={e} variant="secondary" className="font-mono text-[9px] font-normal">{e}</Badge>)}
                </div>
                <p className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Responsibilities</p>
                <div className="space-y-1">
                  {agent.responsibilities.map((r) => (
                    <div key={r} className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                      <Zap className="h-2.5 w-2.5 flex-shrink-0 text-slate-400" /> {r}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex-1" />
              <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => openChat(agent)}>
                <MessageSquare className="h-3 w-3" />
                Interact with Agent
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chat dialog */}
      <Dialog open={chatAgent !== null} onOpenChange={(open) => { if (!open) setChatAgent(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {chatAgent && <chatAgent.icon className={`h-5 w-5 ${chatAgent.textColor}`} />}
              {chatAgent?.name}
            </DialogTitle>
            <DialogDescription>
              {chatAgent?.mission}
            </DialogDescription>
          </DialogHeader>

          <div className="h-80 space-y-3 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-brand-hover text-white"
                      : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.sources.map((s) => <Badge key={s} variant="outline" className="text-[9px]">📄 {s}</Badge>)}
                    </div>
                  )}
                  {m.role === "assistant" && m.source && (
                    <div className="mt-1 flex justify-end">
                      <Badge variant={SOURCE_LABELS[m.source]?.variant ?? "secondary"} className="text-[10px]">
                        {SOURCE_LABELS[m.source]?.label ?? m.source}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Agent is thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2">
            <Input
              placeholder={`Message the ${chatAgent?.name}…`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              disabled={sending}
            />
            <Button onClick={send} disabled={sending || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
