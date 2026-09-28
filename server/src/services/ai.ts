import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

export const aiConfigured = !!env.ai.apiKey;

interface ChatMsg { role: 'user' | 'assistant'; content: string }

const SYSTEM_PROMPT = (workspaceName: string, userName: string) => `You are the in-app assistant for "${workspaceName}", a team's private workspace on CollabSpace (a project/task/chat/wiki/calendar tool). You are chatting with ${userName}.

Help with things like: drafting task descriptions, meeting agendas, status updates, wiki content, project plans, prioritization advice, and general work questions. Be concise and practical. You do not have live access to this workspace's actual projects, tasks or files unless the person pastes the details into the chat - don't invent specifics about their work. If asked to do something outside a text response (like actually creating a task), tell them to use the relevant CollabSpace page, since you can only chat.`;

/**
 * Calls the Anthropic Messages API. Requires ANTHROPIC_API_KEY (get one at console.anthropic.com).
 * Swap the model via the AI_MODEL env var if needed.
 */
export async function askAssistant(history: ChatMsg[], workspaceName: string, userName: string): Promise<string> {
  if (!aiConfigured) throw ApiError.badRequest('The AI assistant is not configured. Ask an administrator to set ANTHROPIC_API_KEY on the server.', 'AI_NOT_CONFIGURED');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ai.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.ai.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT(workspaceName, userName),
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[ai] Anthropic API error', res.status, body);
    if (res.status === 401) throw ApiError.badRequest('The AI assistant is misconfigured (invalid API key).', 'AI_NOT_CONFIGURED');
    if (res.status === 429) throw new ApiError(429, 'The AI assistant is busy right now. Try again shortly.', 'AI_RATE_LIMIT');
    throw new ApiError(502, 'The AI assistant could not respond right now. Try again shortly.', 'AI_UPSTREAM_ERROR');
  }
  const data: any = await res.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  if (!text) throw new ApiError(502, 'The AI assistant returned an empty response.', 'AI_UPSTREAM_ERROR');
  return text;
}
