import React, { useState, useEffect, useRef, useCallback } from "react";
import { Activity, Cpu, Terminal, CheckCircle2, AlertTriangle, Plus, Wrench, Circle, Zap, WifiOff, X, FileText, ChevronDown, ChevronUp, MessageSquare, Send, Trash2, Repeat } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";
const POLL_MS = 1500;

// ---------------------------------------------------------------------------
// Fonts + design tokens - Mistral AI design system
// ---------------------------------------------------------------------------
const FontImport = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

    .fc-root {
      /* Mistral color palette */
      --canvas: #ffffff;
      --surface: #fafafa;
      --cream: #fff8e0;
      --cream-soft: #fffaeb;
      --ink: #1f1f1f;
      --ink-tint: #3d3d3d;
      --charcoal: #2c2c2c;
      --slate: #4a4a4a;
      --steel: #6a6a6a;
      --stone: #8a8a8a;
      --muted: #a8a8a8;
      --hairline: #e5e5e5;
      --hairline-soft: #ededed;
      --hairline-strong: #c7c7c7;
      
      /* Mistral accent colors */
      --primary: #fa520f;           /* Mistral Orange */
      --primary-deep: #cc3a05;
      --sunshine-700: #ffa110;
      --sunshine-800: #ff8105;
      --sunshine-900: #ff8a00;
      --yellow-saturated: #ffd900;
      --beige-deep: #e6d5a8;
      
      /* Derived colors for UI */
      --bg: var(--canvas);
      --panel: var(--cream);
      --panel-2: var(--cream-soft);
      --border: var(--hairline-strong);
      --text: var(--ink);
      --text-dim: var(--slate);
      --text-faint: var(--stone);
      --amber: var(--primary);
      --cyan: #00a3ff;
      --violet: #8b5cf6;
      --green: #10b981;
      --red: #ef4444;
      
      /* Typography */
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .fc-mono { font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace; }

    .fc-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .fc-scroll::-webkit-scrollbar-track { background: transparent; }
    .fc-scroll::-webkit-scrollbar-thumb { background: var(--hairline-strong); border-radius: 4px; }

    @keyframes fc-pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.35; }
    }
    .fc-live-dot { animation: fc-pulse-dot 1.6s ease-in-out infinite; }

    @keyframes fc-feed-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .fc-feed-item { animation: fc-feed-in 0.25s ease-out; }

    @media (prefers-reduced-motion: reduce) {
      .fc-live-dot { animation: none; }
      .fc-feed-item { animation: none; }
    }

    .fc-focus:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
  `}</style>
);

const STATE_META = {
  idle: { label: "Idle", color: "var(--text-faint)", icon: Circle },
  running: { label: "Running", color: "var(--amber)", icon: Activity },
  tool_call: { label: "Tool call", color: "var(--cyan)", icon: Wrench },
  blocked: { label: "Blocked", color: "var(--violet)", icon: AlertTriangle },
  done: { label: "Done", color: "var(--green)", icon: CheckCircle2 },
  error: { label: "Error", color: "var(--red)", icon: AlertTriangle },
};

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------
function Pulse({ values, color }) {
  const w = 88, h = 24;
  if (!values || values.length < 2) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="var(--border)" strokeWidth="1.5" />
      </svg>
    );
  }
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StateBadge({ state }) {
  const meta = STATE_META[state] || STATE_META.idle;
  const Icon = meta.icon;
  return (
    <span
      className="fc-mono inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] uppercase tracking-wide"
      style={{ color: meta.color, background: `${meta.color}1A`, border: `1px solid ${meta.color}40` }}
    >
      <Icon size={11} className={state === "running" || state === "tool_call" ? "fc-live-dot" : ""} />
      {meta.label}
    </span>
  );
}

function AgentCard({ agent, pulse, onKill, onChatOpen }) {
  const meta = STATE_META[agent.state] || STATE_META.idle;
  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3 min-w-[240px] group relative"
      style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
    >
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onChatOpen(agent)}
          className="fc-focus p-1 rounded"
          style={{ color: "var(--text-dim)", background: "var(--panel-2)" }}
          title={`Chat with ${agent.name}`}
          aria-label={`Chat with ${agent.name}`}
        >
          <MessageSquare size={14} />
        </button>
        <button
          onClick={() => onKill(agent)}
          className="fc-focus p-1 rounded"
          style={{ color: "var(--text-faint)", background: "var(--panel-2)" }}
          title={`Kill ${agent.name}`}
          aria-label={`Kill ${agent.name}`}
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex items-start justify-between pr-6">
        <div className="flex items-center gap-2">
          <Cpu size={14} style={{ color: "var(--text-dim)" }} />
          <span className="font-semibold tracking-tight">{agent.name}</span>
        </div>
        <StateBadge state={agent.state} />
      </div>

      <div className="fc-mono text-[11px]" style={{ color: "var(--text-dim)" }}>
        {agent.model}
      </div>

      <Pulse values={pulse} color={meta.color} />

      <div className="text-[13px] leading-snug min-h-[2.5em]" style={{ color: agent.task ? "var(--text)" : "var(--text-faint)" }}>
        {agent.task ? agent.task : "No task assigned"}
      </div>

      <div className="flex items-center justify-between fc-mono text-[11px] pt-2" style={{ color: "var(--text-faint)", borderTop: "1px solid var(--border)" }}>
        <span>{agent.completed} completed</span>
        <span>{agent.tokens.toLocaleString()} tok</span>
      </div>
    </div>
  );
}

function TaskCard({ task, agents, onAssign }) {
  const agent = agents.find((a) => a.id === task.agentId);
  const hasRepeat = task.repeatInterval && task.repeatInterval !== "none";
  
  return (
    <div
      className="rounded-md p-3 flex flex-col gap-2"
      style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start gap-2">
        <div className="text-[13px] leading-snug flex-1">{task.title}</div>
        {hasRepeat && (
          <span
            className="flex items-center gap-1 fc-mono text-[10px] px-1.5 py-0.5 rounded"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              color: "var(--text-faint)",
            }}
            title={`Repeats ${task.repeatInterval || ''}`}
          >
            <Repeat size={10} />
          </span>
        )}
      </div>
      {agent ? (
        <div className="fc-mono text-[11px] flex items-center gap-1.5" style={{ color: "var(--text-dim)" }}>
          <Cpu size={11} /> {agent.name}
        </div>
      ) : task.status === "todo" ? (
        <select
          className="fc-mono fc-focus text-[11px] rounded px-2 py-1 bg-transparent"
          style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}
          value=""
          onChange={(e) => e.target.value && onAssign(task.id, e.target.value)}
        >
          <option value="" disabled>Assign agent…</option>
          {agents.filter((a) => a.state === "idle").map((a) => (
            <option key={a.id} value={a.id} style={{ background: "var(--panel)" }}>{a.name}</option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function Column({ title, color, tasks, agents, onAssign }) {
  return (
    <div className="flex-1 min-w-[220px] flex flex-col gap-2.5">
      <div className="flex items-center gap-2 px-0.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <span className="fc-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{title}</span>
        <span className="fc-mono text-[11px]" style={{ color: "var(--text-faint)" }}>{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.length === 0 && (
          <div className="text-[12px] italic px-1" style={{ color: "var(--text-faint)" }}>Nothing here</div>
        )}
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} agents={agents} onAssign={onAssign} />
        ))}
      </div>
    </div>
  );
}

function OutputCard({ item }) {
  const [open, setOpen] = useState(false);
  const isLong = (item.output || "").length > 220;
  const preview = isLong && !open ? item.output.slice(0, 220) + "…" : item.output;
  return (
    <div
      className="rounded-md p-3 flex flex-col gap-2"
      style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <div className="fc-mono text-[11px] flex items-center gap-2" style={{ color: "var(--text-dim)" }}>
          <span style={{ color: "var(--green)" }}>{item.agentName}</span>
          <span style={{ color: "var(--text-faint)" }}>{item.time}</span>
        </div>
        {isLong && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="fc-focus flex items-center gap-1 fc-mono text-[10.5px]"
            style={{ color: "var(--text-faint)" }}
          >
            {open ? <>less <ChevronUp size={11} /></> : <>more <ChevronDown size={11} /></>}
          </button>
        )}
      </div>
      <div className="text-[12.5px] font-medium" style={{ color: "var(--text)" }}>{item.taskTitle}</div>
      <div className="text-[12.5px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-dim)" }}>
        {preview}
      </div>
    </div>
  );
}

function FeedItem({ item }) {
  const meta = STATE_META[item.kind] || STATE_META.running;
  return (
    <div className="fc-feed-item fc-mono text-[11.5px] leading-relaxed flex gap-2 px-0.5">
      <span style={{ color: "var(--text-faint)" }}>{item.time}</span>
      <span style={{ color: meta.color }}>{item.agent}</span>
      <span style={{ color: "var(--text-dim)" }}>{item.text}</span>
    </div>
  );
}

function CreateAgentPanel({ models, toolNames, onCreate, onClose }) {
  const [name, setName] = useState("");
  const [model, setModel] = useState(models[0]?.id || "");
  const [selectedTools, setSelectedTools] = useState([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const toggleTool = (t) => {
    setSelectedTools((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  };

  const submit = async () => {
    if (!name.trim()) { setError("Name is required."); return; }
    setSubmitting(true);
    setError(null);
    const ok = await onCreate({ name: name.trim(), model, systemPrompt, tools: selectedTools });
    setSubmitting(false);
    if (ok) onClose();
    else setError("Could not create agent — check the backend is running.");
  };

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <span className="fc-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>New agent</span>
        <button onClick={onClose} className="fc-focus p-1 rounded" style={{ color: "var(--text-faint)" }} aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="fc-mono text-[11px]" style={{ color: "var(--text-faint)" }}>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. juno"
            className="fc-focus fc-mono text-[12.5px] rounded px-2.5 py-1.5 bg-transparent"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="fc-mono text-[11px]" style={{ color: "var(--text-faint)" }}>Model</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="fc-focus fc-mono text-[12.5px] rounded px-2.5 py-1.5 bg-transparent"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id} style={{ background: "var(--panel)" }}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="fc-mono text-[11px]" style={{ color: "var(--text-faint)" }}>System prompt</span>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="What is this agent's job?"
          rows={2}
          className="fc-focus text-[12.5px] rounded px-2.5 py-1.5 bg-transparent resize-none"
          style={{ border: "1px solid var(--border)", color: "var(--text)" }}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="fc-mono text-[11px]" style={{ color: "var(--text-faint)" }}>Tools</span>
        <div className="flex flex-wrap gap-2">
          {toolNames.map((t) => {
            const active = selectedTools.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleTool(t)}
                className="fc-focus fc-mono text-[11px] px-2.5 py-1 rounded-full transition-colors"
                style={{
                  border: `1px solid ${active ? "var(--cyan)" : "var(--border)"}`,
                  color: active ? "var(--cyan)" : "var(--text-dim)",
                  background: active ? "var(--cyan)1A" : "transparent",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {error && <div className="text-[12px]" style={{ color: "var(--red)" }}>{error}</div>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onClose}
          className="fc-focus fc-mono text-[12px] px-3 py-1.5 rounded-md"
          style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="fc-focus fc-mono text-[12px] px-3 py-1.5 rounded-md"
          style={{ background: "var(--amber)", color: "var(--canvas)", opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? "Creating…" : "Create agent"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat Panel Component
// ---------------------------------------------------------------------------
function ChatPanel({ agent, chatHistory, onClose, onSendMessage }) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [localHistory, setLocalHistory] = useState(chatHistory || []);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localHistory]);

  // Initialize from prop on mount
  useEffect(() => {
    setLocalHistory(chatHistory || []);
  }, []); // Empty dependency array - only runs on mount

  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || isLoading) return;
    
    const messageToSend = message.trim();
    setIsLoading(true);
    setError(null);
    setMessage("");
    
    // Optimistically add user message
    const newUserMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: messageToSend,
    };
    setLocalHistory((prev) => [...prev, newUserMessage]);
    
    try {
      const result = await onSendMessage(agent.id, messageToSend);
      // Replace with backend's full history (includes assistant response)
      if (result?.chatHistory) {
        setLocalHistory(result.chatHistory);
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setError(err.message || "Failed to send message");
      // On error, keep the optimistic message so user sees what they sent
    } finally {
      setIsLoading(false);
    }
  };

  const hasMessages = localHistory?.length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex flex-col h-[80vh] max-h-[600px] w-full max-w-2xl rounded-lg"
        style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <Cpu size={18} style={{ color: "var(--text-dim)" }} />
            <span className="font-semibold tracking-tight">{agent?.name}</span>
            <span
              className="fc-mono text-[11px] px-2 py-0.5 rounded"
              style={{
                background: "var(--panel-2)",
                color: "var(--text-faint)",
              }}
            >
              {agent?.model}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (window.confirm(`Clear chat history with ${agent?.name}?`)) {
                  fetch(`${API_BASE}/api/agents/${agent?.id}/chat`, { method: "DELETE" })
                    .then(() => onClose())
                    .catch(console.error);
                }
              }}
              className="fc-focus p-1.5 rounded"
              style={{ color: "var(--text-faint)" }}
              title="Clear chat"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={onClose}
              className="fc-focus p-1.5 rounded"
              style={{ color: "var(--text-faint)" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {hasMessages ? (
            localHistory.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2.5 fc-mono text-[13px] leading-relaxed whitespace-pre-wrap`}
                  style={{
                    background:
                      msg.role === "user"
                        ? "var(--primary)"
                        : msg.role === "assistant"
                        ? "var(--panel-2)"
                        : "var(--cream)",
                    color:
                      msg.role === "user"
                        ? "var(--canvas)"
                        : msg.role === "tool"
                        ? "var(--text-dim)"
                        : "var(--text)",
                    border:
                      msg.role === "tool"
                        ? "1px solid var(--border)"
                        : "none",
                  }}
                >
                  {msg.role === "tool" ? (
                    <span className="text-[11px] opacity-70">
                      {msg.content}
                    </span>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))
          ) : (
            <div
              className="flex flex-col items-center justify-center h-full text-center"
              style={{ color: "var(--text-faint)" }}
            >
              <MessageSquare size={40} className="opacity-50 mb-3" />
              <p className="fc-mono text-[12px]">Start a conversation with {agent?.name}</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error message */}
        {error && (
          <div className="px-4 pb-2 text-[12px]" style={{ color: "var(--red)" }}>
            {error}
          </div>
        )}
        
        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-end gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Message ${agent?.name}...`}
              disabled={isLoading || !agent}
              className="flex-1 fc-mono text-[13px] px-3 py-2.5 rounded-md"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  handleSubmit(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !message.trim()}
              className="fc-focus p-2.5 rounded-full"
              style={{
                background: message.trim() ? "var(--primary)" : "var(--panel-2)",
                color: message.trim() ? "var(--canvas)" : "var(--text-faint)",
              }}
            >
              {isLoading ? (
                <Activity size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------
export default function App() {
  const [agents, setAgents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [feed, setFeed] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [models, setModels] = useState([]);
  const [toolNames, setToolNames] = useState([]);
  const [newTask, setNewTask] = useState("");
  const [repeatInterval, setRepeatInterval] = useState("none");
  const [repeatOptions, setRepeatOptions] = useState([]);
  const [connected, setConnected] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [chattingAgent, setChattingAgent] = useState(null);
  const feedRef = useRef(null);
  const prevTokens = useRef({}); // agentId -> last seen token count
  const pulses = useRef({}); // agentId -> ring buffer of recent token deltas

  const poll = useCallback(async () => {
    try {
      const [a, t, f, o] = await Promise.all([
        fetch(`${API_BASE}/api/agents`).then((r) => r.json()),
        fetch(`${API_BASE}/api/tasks`).then((r) => r.json()),
        fetch(`${API_BASE}/api/feed`).then((r) => r.json()),
        fetch(`${API_BASE}/api/outputs`).then((r) => r.json()),
      ]);

      a.agents.forEach((agent) => {
        const prev = prevTokens.current[agent.id] ?? agent.tokens;
        const delta = Math.max(0, agent.tokens - prev);
        prevTokens.current[agent.id] = agent.tokens;
        const buf = pulses.current[agent.id] || [];
        pulses.current[agent.id] = [...buf, delta].slice(-24);
      });

      setAgents(a.agents);
      setTasks(t.tasks);
      setFeed(f.feed);
      setOutputs(o.outputs);
      setConnected(true);
    } catch (err) {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    fetch(`${API_BASE}/api/models`).then((r) => r.json()).then((d) => setModels(d.models)).catch(() => {});
    fetch(`${API_BASE}/api/tool-names`).then((r) => r.json()).then((d) => setToolNames(d.tools)).catch(() => {});
    fetch(`${API_BASE}/api/repeat-intervals`).then((r) => r.json()).then((d) => setRepeatOptions(d.intervals)).catch(() => {});
  }, []);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [feed]);

  const assignTask = async (taskId, agentId) => {
    try {
      await fetch(`${API_BASE}/api/tasks/${taskId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      poll();
    } catch (err) {
      setConnected(false);
    }
  };

  const createAgent = async ({ name, model, systemPrompt, tools }) => {
    try {
      const res = await fetch(`${API_BASE}/api/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, model, systemPrompt, tools }),
      });
      if (!res.ok) return false;
      poll();
      return true;
    } catch (err) {
      setConnected(false);
      return false;
    }
  };

  const killAgent = async (agent) => {
    const activeWarning = agent.task ? ` It's mid-task ("${agent.task}") — the task will be returned to todo.` : "";
    if (!window.confirm(`Kill agent "${agent.name}"?${activeWarning}`)) return;
    try {
      await fetch(`${API_BASE}/api/agents/${agent.id}`, { method: "DELETE" });
      poll();
    } catch (err) {
      setConnected(false);
    }
  };

  const sendChatMessage = async (agentId, message) => {
    try {
      const response = await fetch(`${API_BASE}/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send message");
      }
      
      const data = await response.json();
      
      // Update the chatting agent with new history
      setChattingAgent((prev) => prev?.id === agentId ? {
        ...prev,
        chatHistory: data.chatHistory,
      } : prev);
      
      // Trigger a poll to update agent state
      poll();
      
      return data;
    } catch (err) {
      console.error("Error sending chat message:", err);
      throw err;
    }
  };

  const closeChat = () => {
    setChattingAgent(null);
  };

  const openChat = async (agent) => {
    try {
      const response = await fetch(`${API_BASE}/api/agents/${agent.id}/chat`);
      if (!response.ok) throw new Error("Failed to load chat history");
      const data = await response.json();
      setChattingAgent({ ...agent, chatHistory: data.chatHistory });
    } catch (err) {
      console.error("Error opening chat:", err);
      // Open chat anyway, just without history
      setChattingAgent({ ...agent, chatHistory: [] });
    }
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    try {
      await fetch(`${API_BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTask.trim(), repeatInterval }),
      });
      setNewTask("");
      setRepeatInterval("none");
      poll();
    } catch (err) {
      setConnected(false);
    }
  };

  const todo = tasks.filter((t) => t.status === "todo");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "done");
  const activeCount = agents.filter((a) => a.state !== "idle" && a.state !== "done").length;

  return (
    <div className="fc-root min-h-screen w-full">
      <FontImport />
      <div className="max-w-[1280px] mx-auto px-5 py-6 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
            >
              <Zap size={16} style={{ color: "var(--amber)" }} />
            </div>
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight leading-none">Mistral Agents</h1>
              <p className="fc-mono text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>Agent management dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-4 fc-mono text-[11.5px]" style={{ color: "var(--text-dim)" }}>
            {!connected && (
              <span className="flex items-center gap-1.5" style={{ color: "var(--red)" }}>
                <WifiOff size={12} /> backend unreachable
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full fc-live-dot" style={{ background: "var(--amber)" }} />
              {activeCount} active
            </span>
            <span>{agents.length} agents</span>
            <button
              onClick={() => setShowCreateForm((s) => !s)}
              className="fc-focus flex items-center gap-1.5 px-3 py-1.5 rounded-md"
              style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}
            >
              <Plus size={13} /> New agent
            </button>
          </div>
        </div>

        {showCreateForm && (
          <CreateAgentPanel
            models={models}
            toolNames={toolNames}
            onCreate={createAgent}
            onClose={() => setShowCreateForm(false)}
          />
        )}

        {/* Agent grid */}
        <div className="flex gap-3.5 overflow-x-auto fc-scroll pb-1">
          {agents.length === 0 && (
            <div className="text-[13px]" style={{ color: "var(--text-faint)" }}>
              {connected ? "No agents returned by the backend yet." : "Waiting for backend at " + API_BASE}
            </div>
          )}
          {agents.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              pulse={pulses.current[a.id]}
              onKill={killAgent}
              onChatOpen={openChat}
            />
          ))}
        </div>

        {/* Kanban + Feed */}
        <div className="flex gap-5 flex-col lg:flex-row">
          <div
            className="flex-1 rounded-lg p-4"
            style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="fc-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Task board</span>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTask()}
                  placeholder="New task…"
                  className="fc-focus fc-mono text-[12px] rounded px-2.5 py-1.5 bg-transparent w-[180px]"
                  style={{ border: "1px solid var(--border)", color: "var(--text)" }}
                />
                <select
                  value={repeatInterval}
                  onChange={(e) => setRepeatInterval(e.target.value)}
                  className="fc-focus fc-mono text-[11px] rounded px-2 py-1.5 bg-transparent"
                  style={{ border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  {Object.entries(repeatOptions).map(([key, label]) => (
                    <option key={key} value={key} style={{ background: "var(--panel)" }}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={addTask}
                  className="fc-focus p-1.5 rounded-md"
                  style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
                  aria-label="Add task"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="flex gap-4 flex-col sm:flex-row">
              <Column title="Todo" color="var(--text-faint)" tasks={todo} agents={agents} onAssign={assignTask} />
              <Column title="In progress" color="var(--amber)" tasks={inProgress} agents={agents} onAssign={assignTask} />
              <Column title="Done" color="var(--green)" tasks={done} agents={agents} onAssign={assignTask} />
            </div>
          </div>

          <div
            className="lg:w-[340px] rounded-lg p-4 flex flex-col"
            style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Terminal size={13} style={{ color: "var(--text-dim)" }} />
              <span className="fc-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Live feed</span>
            </div>
            <div ref={feedRef} className="flex flex-col gap-1.5 overflow-y-auto fc-scroll" style={{ maxHeight: 360 }}>
              {feed.length === 0 && (
                <div className="text-[12px] italic" style={{ color: "var(--text-faint)" }}>Assign a task to see agents in motion.</div>
              )}
              {feed.map((item) => <FeedItem key={item.id} item={item} />)}
            </div>
          </div>
        </div>

        {/* Outputs */}
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <FileText size={13} style={{ color: "var(--text-dim)" }} />
            <span className="fc-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Outputs</span>
            <span className="fc-mono text-[11px]" style={{ color: "var(--text-faint)" }}>{outputs.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto fc-scroll pr-1">
            {outputs.length === 0 && (
              <div className="text-[12px] italic" style={{ color: "var(--text-faint)" }}>
                Completed tasks will show their final answer here.
              </div>
            )}
            {[...outputs].reverse().map((o) => <OutputCard key={o.id} item={o} />)}
          </div>
        </div>
      </div>
      
      {/* Chat Panel Modal */}
      {chattingAgent && (
        <ChatPanel
          key={`chat-${chattingAgent.id}`}
          agent={chattingAgent}
          chatHistory={chattingAgent.chatHistory || []}
          onClose={closeChat}
          onSendMessage={sendChatMessage}
        />
      )}
    </div>
  );
}
