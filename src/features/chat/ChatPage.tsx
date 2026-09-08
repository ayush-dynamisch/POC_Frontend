import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatApi, type BackendConversation } from '../../services/api';
import { useChatStream } from './useChatStream';
import { STEP_LABELS } from '../../types/events';
import type { ChatMessage } from '../../types';

export const ChatPage: React.FC = () => {
  const [conversations, setConversations] = useState<BackendConversation[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { liveSteps, startStream, cancelStream } = useChatStream();

  // Abort any open stream if the user navigates away mid-response.
  useEffect(() => {
    return () => cancelStream();
  }, [cancelStream]);

  // Load conversations list on mount
  useEffect(() => {
    async function loadThreads() {
      try {
        const res = await chatApi.listConversations();
        setConversations(res.conversations || []);
        if (res.conversations && res.conversations.length > 0) {
          setActiveSessionId(res.conversations[0].id);
        }
      } catch (err: any) {
        console.error('Failed to load conversations:', err);
      }
    }

    loadThreads();
  }, []);

  // Load messages when activeSessionId changes
  useEffect(() => {
    if (!activeSessionId) return;

    async function loadMessages() {
      setLoadingHistory(true);
      setError(null);
      try {
        const detail = await chatApi.loadConversation(activeSessionId!);
        const mapped: ChatMessage[] = (detail.messages || []).map((m) => ({
          id: m.id,
          sender: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
          timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          citations: (m.citations || []).map((c: any) => ({
            title: typeof c === 'string' ? c : c.title || c.citation || 'Policy Citation',
            sourceType: c.source_type || 'Policy'
          })),
          reasoningPath: m.agent_run_id ? `Orchestration Job: ${m.agent_run_id.substring(0, 8)}` : undefined
        }));
        setMessages(mapped);
      } catch {
        // If empty or brand new session, start with empty transcript
        setMessages([]);
      } finally {
        setLoadingHistory(false);
      }
    }

    loadMessages();
  }, [activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  const handleNewChat = async () => {
    try {
      setError(null);
      const newSession = await chatApi.createConversation();
      const newThread: BackendConversation = {
        id: newSession.session_id,
        title: newSession.title || 'New Compliance Chat',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      setConversations([newThread, ...conversations]);
      setActiveSessionId(newSession.session_id);
      setMessages([]);
    } catch (err: any) {
      setError(err.message || 'Could not create new chat thread');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isProcessing) return;

    const userText = inputPrompt.trim();
    setInputPrompt('');
    setError(null);

    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      sender: 'user',
      content: userText,
      timestamp: 'Just now'
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const response = await chatApi.sendMessage(userText, activeSessionId || undefined);

      const targetSessionId = response.session_id || activeSessionId;
      if (targetSessionId && targetSessionId !== activeSessionId) {
        setActiveSessionId(targetSessionId);
      }

      // Check if response contains immediate answer (inline tasks mode)
      if (response.answer) {
        const aiMsg: ChatMessage = {
          id: `msg_ai_${Date.now()}`,
          sender: 'assistant',
          content: response.answer,
          timestamp: 'Just now',
          citations: (response.citations || []).map((c: any) => ({
            title: typeof c === 'string' ? c : c.title || c.citation || 'Citation',
            sourceType: 'Policy'
          })),
          reasoningPath: response.plan ? `Plan: ${response.plan.join(' → ')}` : undefined,
          reportCard: response.report_id
            ? {
                id: response.report_id,
                title: 'Drafted Compliance Report',
                type: 'Generated Audit Report',
                generatedAgo: 'Just now',
                status: 'pending_approval'
              }
            : undefined
        };
        setMessages((prev) => [...prev, aiMsg]);
        setIsProcessing(false);
      } else if (response.job_id) {
        // Stream live progress via SSE until a terminal event arrives.
        const terminalEvent = await startStream(response.job_id);

        if (terminalEvent.step === 'complete') {
          const output = terminalEvent.output || {};
          const aiMsg: ChatMessage = {
            id: `msg_ai_${Date.now()}`,
            sender: 'assistant',
            content: output.answer || 'Execution completed.',
            timestamp: 'Just now',
            citations: (output.citations || []).map((c: any) => ({
              title: typeof c === 'string' ? c : c.title || c.citation || 'Citation',
              sourceType: 'Policy'
            })),
            reasoningPath: output.plan ? `Plan: ${output.plan.join(' → ')}` : undefined,
            reportCard: output.report_id
              ? {
                  id: output.report_id,
                  title: 'Drafted Compliance Report',
                  type: 'Generated Audit Report',
                  generatedAgo: 'Just now',
                  status: 'pending_approval'
                }
              : undefined
          };
          setMessages((prev) => [...prev, aiMsg]);
        } else if (terminalEvent.step === 'awaiting_approval') {
          const aiMsg: ChatMessage = {
            id: `msg_ai_${Date.now()}`,
            sender: 'assistant',
            content: 'Your compliance report has been drafted and is awaiting human approval before delivery.',
            timestamp: 'Just now',
            reportCard: {
              id: terminalEvent.report_id,
              title: 'Drafted Compliance Report',
              type: 'Generated Audit Report',
              generatedAgo: 'Just now',
              status: 'pending_approval'
            }
          };
          setMessages((prev) => [...prev, aiMsg]);
        } else if (terminalEvent.step === 'error') {
          setError(terminalEvent.message || 'Error occurred during AI orchestration');
        }

        setIsProcessing(false);
      } else {
        setIsProcessing(false);
      }

      // Refresh threads list
      const updatedThreads = await chatApi.listConversations();
      setConversations(updatedThreads.conversations || []);
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      setIsProcessing(false);
    }
  };

  const activeTitle = conversations.find((c) => c.id === activeSessionId)?.title || 'Compliance Orchestrator';

  return (
    <div className="flex h-[calc(100vh-65px)] overflow-hidden bg-[#f8f9ff]">
      {/* LEFT: Conversation Threads Sidebar */}
      <aside className="w-80 border-r border-[#E2E8F0] bg-white flex flex-col shrink-0 hidden md:flex">
        {/* Header with New Chat button */}
        <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <span className="font-heading font-bold text-sm text-[#0b1c30]">Conversations</span>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#eff4ff] hover:bg-[#d3e4fe] text-[#0a6659] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            New Chat
          </button>
        </div>

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#57605f]">
              <span className="material-symbols-outlined text-2xl text-[#6f7976] mb-1">chat_bubble</span>
              <p>No chat history yet.</p>
              <p className="text-[11px] text-[#8e9996] mt-1">Start a conversation using the prompt below.</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeSessionId;
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveSessionId(conv.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors cursor-pointer flex flex-col gap-1 border ${
                    isActive
                      ? 'bg-[#eff4ff] border-[#0a6659]/30 text-[#0b1c30]'
                      : 'border-transparent hover:bg-[#f8f9ff] text-[#57605f]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold truncate max-w-[170px] text-[#0b1c30]">
                      {conv.title || 'Untitled Thread'}
                    </span>
                    <span className="text-[10px] text-[#6f7976]">
                      {new Date(conv.updated_at || conv.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#6f7976] truncate">
                    Session: {conv.id.substring(0, 8)}...
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT: Chat Main Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        {/* Chat Header */}
        <div className="h-14 border-b border-[#E2E8F0] px-6 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#eff4ff] flex items-center justify-center text-[#0a6659]">
              <span className="material-symbols-outlined text-[18px]">neurology</span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#0b1c30] truncate max-w-md">
                {activeTitle}
              </h2>
              <p className="text-[11px] text-[#57605f]">
                D3 Multi-Agent Orchestrator (D1 RAG • D2 Memory • D4 Connectors • D5 Guardrails)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-[#0a6659] bg-[#dcfce7] px-2.5 py-0.5 rounded-full font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a] animate-pulse"></span>
              FastAPI Live
            </span>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 p-3 bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a] rounded-lg text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loadingHistory ? (
            <div className="flex items-center justify-center h-full text-xs text-[#57605f] gap-2">
              <span className="material-symbols-outlined animate-spin text-[#0a6659]">sync</span>
              <span>Loading chat transcript...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#eff4ff] text-[#0a6659] flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-[32px]">clinical_notes</span>
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg text-[#0b1c30]">
                  AI Compliance Intelligence
                </h3>
                <p className="text-xs text-[#57605f] mt-1 leading-relaxed">
                  Ask questions about state licensing requirements, hospital compliance policies, expired clinician credentials, or generate compliance reports.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 w-full pt-2">
                {[
                  'Show all clinicians in California with expiring credentials',
                  'What are the mandatory requirements for RN licenses in Org 1?',
                  'Draft a compliance report for clinicians with missing background checks'
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInputPrompt(prompt);
                    }}
                    className="p-3 text-left rounded-lg border border-[#CBD5E1] bg-[#f8f9ff] hover:bg-[#eff4ff] hover:border-[#0a6659]/30 text-xs text-[#0b1c30] transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{prompt}</span>
                    <span className="material-symbols-outlined text-[16px] text-[#0a6659]">arrow_forward</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                      isUser
                        ? 'bg-[#0a6659] text-white'
                        : 'bg-[#eff4ff] text-[#0a6659] border border-[#d3e4fe]'
                    }`}
                  >
                    {isUser ? 'ME' : <span className="material-symbols-outlined text-[16px]">smart_toy</span>}
                  </div>

                  {/* Bubble */}
                  <div className="space-y-2">
                    <div
                      className={`p-4 rounded-2xl text-sm leading-relaxed ${
                        isUser
                          ? 'bg-[#0a6659] text-white rounded-tr-none'
                          : 'bg-[#f8f9ff] text-[#0b1c30] border border-[#E2E8F0] rounded-tl-none whitespace-pre-line'
                      }`}
                    >
                      {msg.content}
                    </div>

                    {/* Reasoning Path if available */}
                    {msg.reasoningPath && (
                      <div className="text-[11px] text-[#6f7976] flex items-center gap-1.5 px-1 font-mono">
                        <span className="material-symbols-outlined text-[14px]">account_tree</span>
                        <span>{msg.reasoningPath}</span>
                      </div>
                    )}

                    {/* Citations if available */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {msg.citations.map((c, i) => (
                          <div
                            key={i}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#eff4ff] text-[#0a6659] text-[11px] font-medium border border-[#d3e4fe]"
                          >
                            <span className="material-symbols-outlined text-[13px]">book</span>
                            <span>{c.title}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Report Card Embedded */}
                    {msg.reportCard && (
                      <div className="p-4 bg-white border border-[#CBD5E1] rounded-xl shadow-xs flex items-center justify-between gap-4 mt-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0a6659]">
                            <span className="material-symbols-outlined text-[20px]">description</span>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#0b1c30]">{msg.reportCard.title}</p>
                            <p className="text-[11px] text-[#57605f]">{msg.reportCard.type}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => navigate('/reports')}
                          className="px-3 py-1.5 bg-[#0a6659] text-white text-xs font-semibold rounded-lg hover:bg-[#004c42] transition-colors cursor-pointer"
                        >
                          Review &amp; Sign
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isProcessing && (
            <div className="flex gap-3 max-w-3xl mr-auto">
              <div className="w-8 h-8 rounded-full bg-[#eff4ff] text-[#0a6659] flex items-center justify-center shrink-0 border border-[#d3e4fe]">
                <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
              </div>
              <div className="p-4 rounded-2xl bg-[#f8f9ff] text-[#57605f] border border-[#E2E8F0] rounded-tl-none text-xs space-y-1.5 min-w-[260px]">
                {liveSteps.length === 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] animate-spin text-[#0a6659]">neurology</span>
                    <span>Connecting to orchestrator...</span>
                  </div>
                ) : (
                  liveSteps.map((step) => (
                    <div key={step.step} className="flex items-center gap-2">
                      <span
                        className={`material-symbols-outlined text-[16px] ${
                          step.status === 'running'
                            ? 'animate-spin text-[#0a6659]'
                            : step.status === 'error'
                              ? 'text-[#ba1a1a]'
                              : 'text-[#16a34a]'
                        }`}
                      >
                        {step.status === 'running' ? 'sync' : step.status === 'error' ? 'error' : 'check_circle'}
                      </span>
                      <span className={step.status === 'done' ? 'text-[#57605f]' : 'text-[#0b1c30] font-medium'}>
                        {STEP_LABELS[step.step] || step.detail || step.step}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-[#E2E8F0] bg-white">
          <form onSubmit={handleSendMessage} className="flex gap-3 max-w-4xl mx-auto">
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Ask a compliance query or draft report (e.g. 'Draft compliance report for Sandra Okafor')..."
              className="flex-1 px-4 py-3 bg-[#f8f9ff] border border-[#CBD5E1] rounded-xl text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
            />
            <button
              type="submit"
              disabled={isProcessing || !inputPrompt.trim()}
              className="px-6 py-3 bg-[#0a6659] hover:bg-[#004c42] disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
