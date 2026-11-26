export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type OnDeltaCallback = (delta: string, fullText: string) => void;

export async function streamChatMessage(
  messages: ChatMessage[],
  onDelta: OnDeltaCallback,
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

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    const errorMessage =
      errorData.error && errorData.error.trim().length > 0
        ? errorData.error
        : `요청 처리 중 오류가 발생했습니다. (HTTP ${response.status})`;
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error('응답 스트림을 읽을 수 없습니다.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) {
        fullText += chunk;
        onDelta(chunk, fullText);
      }
    }

    const remaining = decoder.decode();
    if (remaining) {
      fullText += remaining;
      onDelta(remaining, fullText);
    }
  } finally {
    reader.releaseLock();
  }

  if (fullText.trim().length === 0) {
    throw new Error('모델로부터 비어 있는 응답을 받았습니다.');
  }

  return fullText;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  return streamChatMessage(messages, () => {}, signal);
}
