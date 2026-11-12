export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatSuccessResponse {
  reply: string;
}

interface ChatErrorResponse {
  error?: string;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  const data = (await response.json().catch(() => ({}))) as
    | ChatSuccessResponse
    | ChatErrorResponse;

  if (!response.ok) {
    const errorMessage =
      'error' in data && typeof data.error === 'string' && data.error.length > 0
        ? data.error
        : `요청 처리 중 오류가 발생했습니다. (HTTP ${response.status})`;
    throw new Error(errorMessage);
  }

  if (!('reply' in data) || typeof data.reply !== 'string') {
    throw new Error('서버 응답 형식이 올바르지 않습니다.');
  }

  return data.reply;
}

