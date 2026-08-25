"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Search,
  FileText,
  ShieldCheck,
  Scan,
  Server,
  Building2,
  Award,
  AlertTriangle,
  GraduationCap,
  Users,
  ClipboardCheck,
  BookMarked,
  Bot,
  Send,
  Loader2,
  Plus,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KNOWLEDGE_CATEGORIES } from "@/lib/knowledge-categories";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  sop: ClipboardCheck,
  protocol: Scan,
  manual: Server,
  vendor: Building2,
  quality: ShieldCheck,
  accreditation: Award,
  radiation: AlertTriangle,
  policy: BookMarked,
  training: GraduationCap,
  template: FileText,
  preparation: Users,
};

interface Document {
  id: string;
  title: string;
  category: string;
  docType: string;
  summary: string | null;
  content: string;
  tags: string[];
  version: string;
  author: string | null;
  status: string;
  approvedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selected, setSelected] = useState<Document | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: "", category: "sop", docType: "guide", summary: "", content: "", tags: "", version: "1.0", author: "Clinical Operations" });
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchDocs = useCallback(async (cat = category, q = query) => {
    const params = new URLSearchParams();
    if (cat !== "all") params.set("category", cat);
    if (q) params.set("q", q);
    const res = await fetch(`/api/knowledge?${params.toString()}`);
    const data = await res.json();
    if (data.ok) setDocuments(data.documents ?? []);
  }, [category, query]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const openDoc = (doc: Document) => {
    setSelected(doc);
    setEditorOpen(false);
  };

  const saveDoc = async () => {
    if (!newDoc.title || !newDoc.content) return;
    setEditing(true);
    try {
      await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newDoc.title,
          category: newDoc.category,
          docType: newDoc.docType,
          summary: newDoc.summary || null,
          content: newDoc.content,
          tags: newDoc.tags.split(",").map((t) => t.trim()).filter(Boolean),
          version: newDoc.version,
          author: newDoc.author,
          status: "published",
          approvedBy: "Clinical Director",
        }),
      });
      setEditorOpen(false);
      setNewDoc({ title: "", category: "sop", docType: "guide", summary: "", content: "", tags: "", version: "1.0", author: "Clinical Operations" });
      fetchDocs();
    } catch { /* ignore */ }
    setEditing(false);
  };

  const askKnowledgeAgent = async () => {
    if (!chatInput.trim() || chatting) return;
    const message = chatInput.trim();
    setChatInput("");
    setChatMessages((m) => [...m, { role: "user", content: message }]);
    setChatting(true);
    try {
      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: "knowledge", message }),
      });
      const data = await res.json();
      setChatMessages((m) => [...m, { role: "assistant", content: data.reply ?? "The Knowledge Agent could not answer.", sources: data.sources ?? [] }]);
    } catch {
      setChatMessages((m) => [...m, { role: "assistant", content: "Knowledge Agent unreachable." }]);
    }
    setChatting(false);
  };

  const docCount = (key: string) => documents.filter((d) => d.category === key).length;

  return (
    <Shell title="Knowledge Platform" description="The organisational brain — approved SOPs, protocols, manuals and standards">
      {/* Stats strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft"><BookOpen className="h-5 w-5 text-brand" /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-slate-100">{documents.length}</p><p className="text-xs text-slate-500 dark:text-slate-400">Approved Documents</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950"><ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-slate-100">{documents.filter((d) => d.status === "published").length}</p><p className="text-xs text-slate-500 dark:text-slate-400">Published</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ai-soft"><GraduationCap className="h-5 w-5 text-ai" /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-slate-100">{KNOWLEDGE_CATEGORIES.length}</p><p className="text-xs text-slate-500 dark:text-slate-400">Categories</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ai-soft"><Bot className="h-5 w-5 text-ai" /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-slate-100">1</p><p className="text-xs text-slate-500 dark:text-slate-400">Knowledge Agent</p></div>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* ── Category sidebar ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0">
              <button
                onClick={() => { setCategory("all"); fetchDocs("all", query); }}
                className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors", category === "all" ? "bg-brand-soft font-medium text-brand-text" : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800")}
              >
                <span>All documents</span>
                <Badge variant="outline" className="text-[9px]">{documents.length}</Badge>
              </button>
              {KNOWLEDGE_CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICONS[c.key] ?? FileText;
                return (
                  <button
                    key={c.key}
                    onClick={() => { setCategory(c.key); fetchDocs(c.key, query); }}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors", category === c.key ? "bg-brand-soft font-medium text-brand-text" : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800")}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                    <span className="flex-1 text-left">{c.label}</span>
                    <Badge variant="outline" className="text-[9px]">{docCount(c.key)}</Badge>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Knowledge Agent chat */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4 text-ai" /> Ask the Knowledge Agent
              </CardTitle>
              <CardDescription>Answers exclusively from approved internal documentation</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="mb-2 flex items-center gap-1.5 rounded-md border border-ai/40 bg-ai-soft px-2 py-1.5 text-[10px] text-ai-text">
                <Lock className="h-3 w-3" /> Sources restricted to published documents
              </div>
              <div className="mb-2 h-52 space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
                {chatMessages.length === 0 && (
                  <p className="p-2 text-center text-xs text-slate-400">Ask about a protocol, SOP or policy…</p>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs", m.role === "user" ? "bg-ai-hover text-white" : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200")}>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      {m.sources && m.sources.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.sources.map((s) => (
                            <Badge key={s} variant="outline" className="text-[8px]">📄 {s}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {chatting && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching approved documents…
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. CT contrast protocol for renal impairment"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") askKnowledgeAgent(); }}
                  className="h-9 text-sm"
                />
                <Button size="sm" className="h-9 gap-1" onClick={askKnowledgeAgent} disabled={chatting || !chatInput.trim()}>
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Document browser ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Document Library</CardTitle>
                  <CardDescription>{category === "all" ? "All approved documentation" : KNOWLEDGE_CATEGORIES.find((c) => c.key === category)?.label}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Search documents…"
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); fetchDocs(category, e.target.value); }}
                      className="h-9 w-64 pl-8 text-sm"
                    />
                  </div>
                  <Button size="sm" className="h-9 gap-1" onClick={() => setEditorOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> New Document
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {documents.length === 0 && <EmptyState padding="py-10">No documents found in this category</EmptyState>}
                {documents.map((d) => {
                  const Icon = CATEGORY_ICONS[d.category] ?? FileText;
                  return (
                    <button
                      key={d.id}
                      onClick={() => openDoc(d)}
                      className={cn(
                        "w-full rounded-lg border p-4 text-left transition-colors",
                        selected?.id === d.id
                          ? "border-brand bg-brand-soft/60"
                          : "border-slate-100 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-600"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                            <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{d.title}</p>
                              <Badge variant="outline" className="text-[9px]">v{d.version}</Badge>
                              <Badge variant="success" className="text-[9px]">Approved</Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{d.summary ?? d.content.slice(0, 140) + "…"}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                              <span className="capitalize">{d.docType}</span>
                              <span>·</span>
                              <span>{d.author ?? "Unknown"}</span>
                              <span>·</span>
                              <span>Updated {new Date(d.updatedAt).toLocaleDateString()}</span>
                              {d.tags.length > 0 && (
                                <>
                                  <span>·</span>
                                  <span>{d.tags.slice(0, 3).map((t) => `#${t}`).join(" ")}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className="text-[9px] capitalize">{d.category}</Badge>
                          <span className="flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> {d.approvedBy ?? "Approved"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── Document viewer ── */}
          {selected && (
            <Card className="animate-fade-in">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                      {selected.title}
                      <Badge variant="outline" className="text-[9px]">v{selected.version}</Badge>
                      <Badge variant="success" className="text-[9px]">Published</Badge>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {KNOWLEDGE_CATEGORIES.find((c) => c.key === selected.category)?.label} · {selected.docType} · {selected.author} · {new Date(selected.updatedAt).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {selected.tags.map((t) => <Badge key={t} variant="secondary" className="text-[9px]">#{t}</Badge>)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none rounded-lg border border-slate-100 bg-slate-50/60 p-6 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                  {selected.content.split("\n").map((line, i) => {
                    if (line.startsWith("# ")) return <h2 key={i} className="mb-2 mt-4 text-lg font-semibold text-slate-900 first:mt-0 dark:text-slate-100">{line.slice(2)}</h2>;
                    if (line.startsWith("## ")) return <h3 key={i} className="mb-2 mt-3 text-base font-semibold text-slate-800 dark:text-slate-200">{line.slice(3)}</h3>;
                    if (line.startsWith("- ")) return <p key={i} className="ml-3 flex items-start gap-1.5"><span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-brand" /><span>{line.slice(2)}</span></p>;
                    if (line.trim() === "") return <div key={i} className="h-2" />;
                    return <p key={i} className="mb-1.5">{line}</p>;
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── New document dialog ── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> New Knowledge Document</DialogTitle>
            <DialogDescription>Documents are published as approved references for the Knowledge Agent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Title</label>
                <Input value={newDoc.title} onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })} placeholder="e.g. CT Contrast Administration Protocol" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Category</label>
                <Select value={newDoc.category} onChange={(e) => setNewDoc({ ...newDoc, category: e.target.value })}>
                  {KNOWLEDGE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Doc type</label>
                <Select value={newDoc.docType} onChange={(e) => setNewDoc({ ...newDoc, docType: e.target.value })}>
                  {["sop", "guide", "protocol", "manual", "policy", "checklist", "template", "standard"].map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Summary</label>
                <Input value={newDoc.summary} onChange={(e) => setNewDoc({ ...newDoc, summary: e.target.value })} placeholder="One-line summary shown in search results" />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Content (markdown-ish: # headings, - bullets)</label>
                <textarea
                  value={newDoc.content}
                  onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
                  placeholder={"# Purpose\n\nDescribe the procedure…\n\n## Steps\n- Step one\n- Step two"}
                  className="min-h-40 w-full rounded-md border border-slate-300 bg-white p-3 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="col-span-1">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Tags (comma separated)</label>
                <Input value={newDoc.tags} onChange={(e) => setNewDoc({ ...newDoc, tags: e.target.value })} placeholder="contrast, safety, renal" />
              </div>
              <div className="col-span-1">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Version</label>
                <Input value={newDoc.version} onChange={(e) => setNewDoc({ ...newDoc, version: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button onClick={saveDoc} disabled={editing || !newDoc.title || !newDoc.content}>
                {editing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Publish Document
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
