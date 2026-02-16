"use client";

import { useEffect, useRef, useState } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import ChatHeader from "./ChatHeader";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import TypingIndicator from "./TypingIndicator";
import { executeEditorTool } from "@/lib/editor-tools";
import { EditorToolCall } from "@/types/editor-tools";
import { CheckCircle, AlertCircle, Loader2, Edit3, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  toolCall?: EditorToolCall;
  toolResult?: {
    success: boolean;
    message: string;
    data?: unknown;
  };
}

interface PendingPermission {
  messageId: string;
  toolCall: EditorToolCall;
  description: string;
}

interface ChatPanelProps {
  editor?: BlockNoteEditor;
  documentContext: {
    title: string;
    description: string;
    blocksPreview: string;
  };
  onClose: () => void;
  onRequestEdit?: () => void; // Callback to enable edit mode
}

export default function ChatPanel({
  editor,
  documentContext,
  onClose,
  onRequestEdit,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [executingTool, setExecutingTool] = useState(false);
  const [pendingPermission, setPendingPermission] =
    useState<PendingPermission | null>(null);

  // Add welcome message after hydration to avoid hydration mismatch
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content:
            "Hi! I'm here to help improve your documentation. I can also edit the content directly if you give me permission. Just ask!",
          createdAt: new Date(),
        },
      ]);
    }
  }, [messages.length]);
  const [isAutoContinuing, setIsAutoContinuing] = useState(false);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const continueConversationWithPrompt = async (prompt: string) => {
    if (isLoading || isAutoContinuing) {
      return;
    }

    setIsAutoContinuing(true);

    // Add a hidden system message to guide the AI
    const systemPrompt: Message = {
      id: Date.now().toString(),
      role: "user",
      content: prompt,
      createdAt: new Date(),
    };

    // Use functional update to get latest messages
    setMessages((prevMessages) => {
      const updatedMessages = [...prevMessages, systemPrompt];

      // Call AI with updated messages asynchronously
      setTimeout(() => {
        callAI(updatedMessages).finally(() => {
          setIsAutoContinuing(false);
        });
      }, 100);

      return updatedMessages;
    });
  };

  const callAI = async (messagesToSend: Message[]) => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/doc-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: messagesToSend
            .filter((m) => m.content.trim().length > 0)
            .map((m) => {
              let content = m.content;

              // Include tool results in the conversation so AI can reference them
              if (m.toolResult && m.toolResult.data) {
                content += `\n\n[Tool Result: ${m.toolResult.message}]\n${JSON.stringify(m.toolResult.data, null, 2)}`;
              }

              return {
                role: m.role === "system" ? "assistant" : m.role,
                content,
              };
            }),
          documentContext,
          editorEnabled: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[ChatPanel] Error response:", errorText);
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      const toolCalls: EditorToolCall[] = [];

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (reader) {
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Extract ALL tool calls (using global match)
          const toolCallMatches = Array.from(
            buffer.matchAll(/\[TOOL_CALL\]([\s\S]*?)\[\/TOOL_CALL\]/g)
          );

          if (toolCallMatches.length > 0) {
            toolCalls.length = 0;
            let cleanedBuffer = buffer;

            for (const match of toolCallMatches) {
              try {
                const toolCall = JSON.parse(match[1]);
                toolCalls.push(toolCall);
                cleanedBuffer = cleanedBuffer.replace(match[0], "");
              } catch (e) {
                console.error("Failed to parse tool call:", e);
              }
            }

            buffer = cleanedBuffer;
          }

          assistantContent = buffer;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, content: assistantContent, toolCall: toolCalls[0] || undefined }
                : m,
            ),
          );
        }
      }

      // Execute all tool calls sequentially (with deduplication)
      if (toolCalls.length > 0) {
        // Deduplicate tool calls based on JSON stringification
        const uniqueToolCalls = toolCalls.filter(
          (call, index, self) =>
            index ===
            self.findIndex((c) => JSON.stringify(c) === JSON.stringify(call))
        );

        for (const toolCall of uniqueToolCalls) {
          await handleToolExecution(assistantMessage.id, toolCall);
        }
      }
    } catch (error) {
      console.error("[callAI] Error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e?: { preventDefault: () => void }) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    await callAI([...messages, userMessage]);
  };

  const getToolDescription = (toolCall: EditorToolCall): string => {
    switch (toolCall.tool) {
      case "insert_blocks":
        return `Insert ${toolCall.parameters.blocks.length} block(s) at ${toolCall.parameters.position}`;
      case "update_block":
        return `Update block content`;
      case "delete_blocks":
        return `Delete ${toolCall.parameters.blockIds.length} block(s)`;
      case "replace_text":
        return `Replace "${toolCall.parameters.find}" with "${toolCall.parameters.replace}"`;
      case "search_blocks":
        return `Search for blocks`;
      case "get_blocks_structure":
        return `Get document structure`;
      default:
        return "Perform editor action";
    }
  };

  const handleToolExecution = async (
    messageId: string,
    toolCall: EditorToolCall,
  ) => {
    // Check if editor exists (not available for sections)
    if (!editor) {
      setMessages((prev) => [...prev, {
        id: `${Date.now()}-error`,
        role: "system",
        content: "⚠️ Editor tools are not available for section pages",
        createdAt: new Date(),
      }]);
      return;
    }

    // Check if editor is editable - if not, request permission
    if (!editor.isEditable && onRequestEdit) {
      // Update message to show permission is required
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                toolResult: {
                  success: false,
                  message: "Waiting for edit mode permission...",
                },
              }
            : m,
        ),
      );

      // Add system message
      const permissionMessage: Message = {
        id: `${Date.now()}-system`,
        role: "system",
        content: "⏳ Edit mode permission required - please enable editing to proceed",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, permissionMessage]);

      // Show permission request
      setPendingPermission({
        messageId,
        toolCall,
        description: getToolDescription(toolCall),
      });
      return;
    }

    // Execute the tool
    setExecutingTool(true);

    try {
      // Editor is guaranteed to exist here due to check above
      const result = await executeEditorTool(editor!, toolCall);

      // Update message with tool result
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                toolResult: {
                  success: result.success,
                  message: result.message,
                  data: result.data,
                },
              }
            : m,
        ),
      );

      // Add system message about the tool execution
      const systemMessage: Message = {
        id: `${Date.now()}-system`,
        role: "system",
        content: result.success
          ? `✓ ${result.message}`
          : `✗ ${result.message}`,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, systemMessage]);

      // Auto-continue for search results or structure retrieval (only if not already auto-continuing)
      if (!isAutoContinuing && result.success && result.data) {
        // Handle search_blocks with exact matches
        if (
          toolCall.tool === "search_blocks" &&
          Array.isArray(result.data) &&
          result.data.length > 0
        ) {
          const hasExactMatch = result.data.some(
            (item: { matchType?: string }) => !item.matchType || item.matchType === "exact"
          );

          // Auto-trigger follow-up for exact matches (max 3 results to avoid ambiguity)
          if (hasExactMatch && result.data.length <= 3 && result.data.length >= 1) {
            continueConversationWithPrompt(
              "The search found exact matches. Please proceed with the requested update/modification using the block IDs from the search results above."
            );
          }
        }
        // Handle get_blocks_structure when user wants to check/update content
        else if (
          toolCall.tool === "get_blocks_structure" &&
          Array.isArray(result.data) &&
          result.data.length > 0
        ) {
          continueConversationWithPrompt(
            "The document structure has been retrieved. Please analyze the content as requested and make any necessary updates."
          );
        }
      }
    } catch (error) {
      console.error("Tool execution error:", error);
      const errorMessage: Message = {
        id: `${Date.now()}-error`,
        role: "system",
        content: "Failed to execute editor action",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setExecutingTool(false);
    }
  };

  const handlePermissionGrant = async () => {
    if (!pendingPermission || !onRequestEdit) return;

    const { messageId, toolCall } = pendingPermission;

    // Update the pending message to show permission was granted
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              toolResult: {
                success: true,
                message: "Edit permission granted, executing...",
              },
            }
          : m,
      ),
    );

    // Remove the permission waiting message
    setMessages((prev) =>
      prev.filter((m) => m.content !== "⏳ Edit mode permission required - please enable editing to proceed")
    );

    // Enable edit mode
    onRequestEdit();

    // Clear permission request
    setPendingPermission(null);

    // Wait a bit for edit mode to activate
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Now execute the tool
    await handleToolExecution(messageId, toolCall);
  };

  const handlePermissionDeny = () => {
    if (!pendingPermission) return;

    const { messageId } = pendingPermission;

    // Update the pending message to show permission was denied
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              toolResult: {
                success: false,
                message: "Edit permission denied",
              },
            }
          : m,
      ),
    );

    // Update the system message
    setMessages((prev) =>
      prev.map((m) =>
        m.content === "⏳ Edit mode permission required - please enable editing to proceed"
          ? {
              ...m,
              content: "✗ Edit permission denied. To make changes, enable edit mode manually.",
            }
          : m,
      ),
    );

    // Clear permission request
    setPendingPermission(null);
  };

  return (
    <div className="fixed bottom-6 right-6 w-[400px] h-[600px] bg-white shadow-2xl border border-gray-200 rounded-lg z-40 flex flex-col animate-in slide-in-from-bottom fade-in duration-300">
      <ChatHeader onClose={onClose} />

      {/* Permission Request Dialog */}
      {pendingPermission && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 rounded-lg">
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-sm w-full border-2 border-blue-500 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-full">
                <Edit3 className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">
                  Enable Edit Mode?
                </h3>
                <p className="text-sm text-gray-600">
                  I need to enable edit mode to perform this action:
                </p>
                <p className="text-sm font-medium text-gray-900 mt-2 bg-gray-50 p-2 rounded border border-gray-200">
                  {pendingPermission.description}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handlePermissionDeny}
                variant="outline"
                className="flex-1 gap-2"
              >
                <X size={16} />
                Cancel
              </Button>
              <Button
                onClick={handlePermissionGrant}
                className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Edit3 size={16} />
                Enable & Proceed
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((message) => (
          <div key={message.id}>
            {/* Only render ChatMessage for user and assistant messages */}
            {message.role !== "system" && (
              <ChatMessage
                message={{
                  id: message.id,
                  role: message.role as "user" | "assistant",
                  content: message.content,
                  createdAt: message.createdAt,
                }}
              />
            )}

            {/* Show tool execution status */}
            {message.toolCall && (
              <div className="mt-2 ml-4 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                <div className="flex items-center gap-2 text-blue-700">
                  {executingTool ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Executing: {message.toolCall.tool.replace(/_/g, " ")}</span>
                    </>
                  ) : message.toolResult ? (
                    <>
                      {message.toolResult.success ? (
                        <CheckCircle size={14} className="text-green-600" />
                      ) : (
                        <AlertCircle size={14} className="text-red-600" />
                      )}
                      <span className={message.toolResult.success ? "text-green-700" : "text-red-700"}>
                        {message.toolResult.message}
                      </span>
                    </>
                  ) : (
                    <span>Tool: {message.toolCall.tool.replace(/_/g, " ")}</span>
                  )}
                </div>
              </div>
            )}

            {/* System messages with special styling */}
            {message.role === "system" && (
              <div className="p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
                {message.content}
              </div>
            )}
          </div>
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit}>
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={() => handleSubmit()}
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
