"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  SendIcon,
  LoaderIcon,
  UserIcon,
  BotIcon,
  TrashIcon,
  CopyIcon,
  CheckIcon,
  SparklesIcon,
  ZapIcon,
  GitBranchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  toolCalls?: { tool: string; result: string }[];
};

interface CodeChatProps {
  repoAnalysis?: {
    name: string;
    owner: string;
    stats: {
      modules: number;
      files: number;
      functions: number;
    };
  };
  selectedNode?: {
    id: string;
    name: string;
    type: string;
    file?: string;
    moduleId?: string;
    purpose?: string;
    calls?: string[];
    calledBy?: string[];
    params?: string[];
    returnType?: string;
    isExported?: boolean;
    startLine?: number;
    endLine?: number;
  } | null;
  graphData?: {
    nodes: { id: string; name: string; type: string }[];
    edges: { source: string; target: string; type: string }[];
  };
  onNodeClick?: (nodeId: string) => void;
}

const MIKK_TOOLS = [
  {
    name: "mikk_get_session_context",
    description: "Get project overview, modules, and constraints",
    icon: <SparklesIcon className="size-3" />,
  },
  {
    name: "mikk_query_context",
    description: "Query codebase with natural language",
    icon: <SparklesIcon className="size-3" />,
  },
  {
    name: "mikk_impact_analysis",
    description: "See blast radius of changes",
    icon: <GitBranchIcon className="size-3" />,
  },
  {
    name: "mikk_get_function_detail",
    description: "Get function params, body, and call graph",
    icon: <SparklesIcon className="size-3" />,
  },
  {
    name: "mikk_find_usages",
    description: "Find all callers of a function",
    icon: <SparklesIcon className="size-3" />,
  },
  {
    name: "mikk_dead_code",
    description: "Detect unused code",
    icon: <SparklesIcon className="size-3" />,
  },
];

export default function CodeChat({
  repoAnalysis,
  selectedNode,
  graphData: _graphData,
  onNodeClick: _onNodeClick,
}: CodeChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `👋 Welcome to the Mikk Codebase Assistant!

I can help you understand and navigate your codebase using Mikk's architectural intelligence.

**How it works:**
1. Click nodes in the 3D graph to select them
2. Ask me questions about the selected code
3. I'll use Mikk's MCP tools to find answers

**Try asking:**
• "What does this function do?"
• "What depends on this module?"
• "Show me the call chain"
• "Is this safe to modify?"

${selectedNode ? `\n**Currently selected:** ${selectedNode.name} (${selectedNode.type})` : ""}`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedNode) {
      const nodeContext = `**Selected: ${selectedNode.name}** (${selectedNode.type})
${selectedNode.file ? `File: ${selectedNode.file}` : ""}
${selectedNode.moduleId ? `Module: ${selectedNode.moduleId}` : ""}
${selectedNode.purpose ? `Purpose: ${selectedNode.purpose}` : ""}
${selectedNode.params?.length ? `Params: ${selectedNode.params.join(", ")}` : ""}
${selectedNode.returnType ? `Returns: ${selectedNode.returnType}` : ""}
${selectedNode.isExported !== undefined ? `Exported: ${selectedNode.isExported}` : ""}
${selectedNode.calls?.length ? `Calls: ${selectedNode.calls.slice(0, 5).join(", ")}${selectedNode.calls.length > 5 ? ` +${selectedNode.calls.length - 5} more` : ""}` : ""}
${selectedNode.startLine ? `Lines: ${selectedNode.startLine}-${selectedNode.endLine}` : ""}`;

      setMessages((prev) => [
        ...prev,
        {
          id: `context-${Date.now()}`,
          role: "system",
          content: `## Selected Node\n\n${nodeContext}\n\nAsk me anything about this!`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [selectedNode]);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Build context
    let context = "";
    if (repoAnalysis) {
      context += `\n## Repository\n- Name: ${repoAnalysis.owner}/${repoAnalysis.name}\n`;
      context += `- Stats: ${repoAnalysis.stats.modules} modules, ${repoAnalysis.stats.files} files, ${repoAnalysis.stats.functions} functions\n`;
    }

    if (selectedNode) {
      context += `\n## Selected Node\n`;
      context += `- Name: ${selectedNode.name}\n`;
      context += `- Type: ${selectedNode.type}\n`;
      if (selectedNode.file) context += `- File: ${selectedNode.file}\n`;
      if (selectedNode.moduleId) context += `- Module: ${selectedNode.moduleId}\n`;
      if (selectedNode.purpose) context += `- Purpose: ${selectedNode.purpose}\n`;
      if (selectedNode.params?.length) context += `- Params: ${selectedNode.params.join(", ")}\n`;
      if (selectedNode.returnType) context += `- Returns: ${selectedNode.returnType}\n`;
    }

    try {
      // Call Mikk query API
      const response = await fetch("/api/mikk-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: input,
          selectedNode,
          context: repoAnalysis ? { files: [], functions: [] } : undefined,
        }),
      });

      const data = await response.json();

      // Build assistant response
      let assistantContent = "";

      if (data.explanation) {
        assistantContent += `${data.explanation}\n\n`;
      }

      if (data.wouldUse?.length) {
        assistantContent += `## Mikk Tools That Would Help\n`;
        for (const tool of data.wouldUse) {
          assistantContent += `- ${tool}\n`;
        }
        assistantContent += "\n";
      }

      if (data.prompt) {
        assistantContent += data.prompt;
      }

      // Add demo response based on query
      if (!response.ok || !data.prompt) {
        const query = input.toLowerCase();

        if (query.includes("what does") || query.includes("explain")) {
          if (selectedNode) {
            assistantContent = `## ${selectedNode.name}\n\n`;
            if (selectedNode.purpose) {
              assistantContent += `**Purpose:** ${selectedNode.purpose}\n\n`;
            }
            assistantContent += `This ${selectedNode.type} is located at \`${selectedNode.file || "unknown"}\``;
            if (selectedNode.params?.length) {
              assistantContent += `\n\n**Parameters:**\n`;
              for (const param of selectedNode.params) {
                assistantContent += `- \`${param}\`\n`;
              }
            }
            if (selectedNode.calls?.length) {
              assistantContent += `\n**Calls:** ${selectedNode.calls.slice(0, 5).join(", ")}`;
              if (selectedNode.calls.length > 5) {
                assistantContent += ` +${selectedNode.calls.length - 5} more`;
              }
            }
            assistantContent += `\n\n*Mikk would call \`mikk_get_function_detail\` to get the full source code and call graph.*`;
          } else {
            assistantContent = `Select a function or module in the graph to see its details. Click on any node to analyze it.`;
          }
        } else if (query.includes("depend") || query.includes("impact")) {
          if (selectedNode) {
            assistantContent = `## Impact Analysis: ${selectedNode.name}\n\n`;
            assistantContent += `To understand the blast radius of changing \`${selectedNode.name}\`, Mikk would:\n`;
            assistantContent += `1. Call \`mikk_impact_analysis\` on the file\n`;
            assistantContent += `2. Run \`mikk_find_usages\` to find all callers\n`;
            assistantContent += `3. Trace call chains with \`mikk_query_context\`\n\n`;
            assistantContent += `**Estimated impact:** All functions in the same module and any module that imports from this file.\n\n`;
            assistantContent += `*Click "Analyze Impact" to run Mikk's safety gates.*`;
          } else {
            assistantContent = `Select a node to analyze its impact on the codebase. Changes to high-impact nodes (modules with many dependents) require extra caution.`;
          }
        } else if (query.includes("safe") || query.includes("modify") || query.includes("change")) {
          assistantContent = `## Safety Check: ${selectedNode?.name || "No selection"}\n\n`;
          assistantContent += `Before making changes, Mikk runs 6 safety gates:\n\n`;
          assistantContent += `| Gate | What it checks |\n`;
          assistantContent += `|------|----------------|\n`;
          assistantContent += `| RISK_SCORE | Is the risk score below 90? |\n`;
          assistantContent += `| IMPACT_SCALE | Are fewer than 10 nodes affected? |\n`;
          assistantContent += `| PROTECTED_MODULE | Is a protected module touched? |\n`;
          assistantContent += `| BREAKING_CHANGE | Is an exported API changed without BREAKING: ? |\n`;
          assistantContent += `| TEST_COVERAGE | Are tests modified? |\n`;
          assistantContent += `| DOCUMENTATION | Are docs updated? |\n\n`;
          assistantContent += `Run \`mikk_validate_edit\` before making changes to see the full safety report.`;
        } else if (query.includes("route") || query.includes("endpoint")) {
          assistantContent = `## HTTP Routes\n\n`;
          assistantContent += `Mikk detects routes from Express, Fastify, Hapi, NestJS, and more frameworks.\n\n`;
          assistantContent += `Available tools:\n`;
          assistantContent += `- \`mikk_get_routes\` - List all detected routes\n`;
          assistantContent += `- \`mikk_get_function_detail\` - Get handler implementation\n`;
          assistantContent += `- \`mikk_impact_analysis\` - See what breaks if handler changes\n\n`;
          assistantContent += `*Routes are extracted from AST during \`mikk analyze\`.*`;
        } else if (query.includes("call") || query.includes("chain")) {
          if (selectedNode && selectedNode.calls?.length) {
            assistantContent = `## Call Chain: ${selectedNode.name}\n\n`;
            assistantContent += `**Calls:**\n`;
            for (const call of selectedNode.calls.slice(0, 10)) {
              assistantContent += `- \`${call}\`\n`;
            }
            assistantContent += `\n**Called by:**\n`;
            if (selectedNode.calledBy?.length) {
              for (const caller of selectedNode.calledBy.slice(0, 10)) {
                assistantContent += `- \`${caller}\`\n`;
              }
            } else {
              assistantContent += `- No external callers (entry point)\n`;
            }
            assistantContent += `\n*Mikk tracks call edges from TypeScript type inference.*`;
          } else {
            assistantContent = `Select a function to see its call chain. Click on any function node in the graph to analyze who it calls and who calls it.`;
          }
        } else {
          assistantContent = `## Codebase Query\n\n`;
          assistantContent += `I can help you understand:\n`;
          assistantContent += `- **Code structure** - functions, modules, exports\n`;
          assistantContent += `- **Dependencies** - imports, call graphs, impact\n`;
          assistantContent += `- **Safety** - constraint violations, risk scores\n`;
          assistantContent += `- **Routes** - API endpoints and handlers\n\n`;
          assistantContent += `Select a node in the graph and ask a specific question!\n\n`;
          assistantContent += `*Example: "What does this function do?" or "Is this safe to modify?"*`;
        }
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: assistantContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `I encountered an error. Please make sure the repository is analyzed first, then try again.\n\nError: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, repoAnalysis, selectedNode]);

  const clearChat = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "Chat cleared! Select a node and ask me about the codebase.",
        timestamp: new Date(),
      },
    ]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === "user" && "justify-end"
            )}
          >
            {message.role !== "user" && (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                {message.role === "system" ? (
                  <ZapIcon className="size-4 text-primary" />
                ) : (
                  <BotIcon className="size-4 text-primary" />
                )}
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : message.role === "system"
                  ? "bg-blue-500/10 border border-blue-500/20"
                  : "bg-muted"
              )}
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.content.split("\n").map((line, i) => {
                  // Format markdown-like content
                  if (line.startsWith("## ")) {
                    return (
                      <div key={i} className="font-semibold mt-2 mb-1">
                        {line.replace("## ", "")}
                      </div>
                    );
                  }
                  if (line.startsWith("**") && line.endsWith("**")) {
                    return (
                      <div key={i} className="font-medium">
                        {line.replace(/\*\*/g, "")}
                      </div>
                    );
                  }
                  if (line.startsWith("- ")) {
                    return (
                      <div key={i} className="flex items-start gap-2 ml-2">
                        <span>•</span>
                        <span>{line.replace("- ", "")}</span>
                      </div>
                    );
                  }
                  if (line.startsWith("|")) {
                    return (
                      <div key={i} className="font-mono text-xs">
                        {line}
                      </div>
                    );
                  }
                  if (line.startsWith("`") && line.endsWith("`")) {
                    return (
                      <div key={i} className="inline-code">
                        {line.replace(/`/g, "")}
                      </div>
                    );
                  }
                  return <div key={i}>{line || "\u00A0"}</div>;
                })}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => handleCopy(message.content, message.id)}
                  className="flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
                >
                  {copiedId === message.id ? (
                    <>
                      <CheckIcon className="size-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <CopyIcon className="size-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
            {message.role === "user" && (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                <UserIcon className="size-4 text-primary" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <BotIcon className="size-4 text-primary" />
            </div>
            <div className="bg-muted rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderIcon className="size-4 animate-spin" />
                Analyzing with Mikk...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the codebase..."
              className="w-full resize-none rounded-xl border bg-background px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              rows={1}
              style={{ minHeight: "48px", maxHeight: "120px" }}
            />
          </div>
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="shrink-0"
          >
            {isLoading ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <SendIcon className="size-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">
            Press Enter to send, Shift+Enter for new line
          </p>
          <Button variant="ghost" size="sm" onClick={clearChat}>
            <TrashIcon className="size-3 mr-1" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
