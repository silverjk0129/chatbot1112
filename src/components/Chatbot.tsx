import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { streamChatMessage, type ChatMessage } from '../api/chat';

interface UiMessage extends ChatMessage {
  id: string;
}

const QUICK_PROMPTS = [
  '여행 영어 초급 단어 알려줘',
  '비즈니스 영어 중급 단어 알려줘',
  '일상 회화 고급 단어 알려줘',
  '영어 단어 알려줘',
];

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderFormattedText(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return <code key={index}>{token.slice(1, -1)}</code>;
    }
    return token;
  });
}

export function Chatbot() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isStreaming]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  async function submitPrompt(rawText: string) {
    const trimmed = rawText.trim();
    if (!trimmed || isLoading || isStreaming) {
      return;
    }

    const userMessage: UiMessage = {
      id: createMessageId(),
      role: 'user',
      content: trimmed,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setIsLoading(true);
    setIsStreaming(false);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const assistantMessageId = createMessageId();
    let hasReceivedFirstChunk = false;

    try {
      const apiMessages: ChatMessage[] = nextMessages.map(({ role, content }) => ({
        role,
        content,
      }));

      await streamChatMessage(
        apiMessages,
        (_delta, fullText) => {
          if (!hasReceivedFirstChunk) {
            hasReceivedFirstChunk = true;
            setIsStreaming(true);
            setMessages((prev) => [
              ...prev,
              {
                id: assistantMessageId,
                role: 'assistant',
                content: fullText,
              },
            ]);
          } else {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: fullText }
                  : msg,
              ),
            );
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : '알 수 없는 오류가 발생했습니다.';
      setError(message);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsLoading(false);
        setIsStreaming(false);
      }
      textareaRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPrompt(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt(input);
    }
  }

  function handleReset() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setInput('');
    setError(null);
    setIsLoading(false);
    setIsStreaming(false);
    textareaRef.current?.focus();
  }

  const isBusy = isLoading || isStreaming;

  return (
    <div className="chatbot-shell">
      <header className="chatbot-header">
        <div className="chatbot-title-group">
          <div className="chatbot-badge">AI English Vocab</div>
          <h1>영어 단어 퀴즈 챗봇</h1>
          <p>
            원하는 주제와 난이도를 말하면 단어 최대 3개와 복습 퀴즈 1개를 내드려요.
          </p>
        </div>
        <button
          type="button"
          className="reset-button"
          onClick={handleReset}
          disabled={messages.length === 0 && !isBusy && !error}
        >
          새 대화
        </button>
      </header>

      <main className="chatbot-messages" aria-live="polite">
        {messages.length === 0 ? (
          <section className="empty-state">
            <div className="empty-icon" aria-hidden="true">
              Aa
            </div>
            <h2>어떤 영어 단어를 공부해 볼까요?</h2>
            <p>
              주제(예: 여행, 비즈니스, IT)와 난이도(초급, 중급, 고급)를 입력해 보세요.
              정하지 못하셨다면 그냥 말을 걸어 보셔도 좋아요!
            </p>
            <div className="quick-prompts">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="quick-prompt-chip"
                  onClick={() => {
                    void submitPrompt(prompt);
                  }}
                  disabled={isBusy}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="message-list">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`message-row ${
                  message.role === 'user' ? 'message-user' : 'message-assistant'
                }`}
              >
                <div className="message-avatar" aria-hidden="true">
                  {message.role === 'user' ? '나' : 'AI'}
                </div>
                <div className="message-bubble">
                  <div className="message-content">
                    {message.role === 'assistant'
                      ? renderFormattedText(message.content)
                      : message.content}
                  </div>
                </div>
              </article>
            ))}

            {isLoading && !isStreaming && (
              <article className="message-row message-assistant">
                <div className="message-avatar" aria-hidden="true">
                  AI
                </div>
                <div className="message-bubble loading-bubble">
                  <span className="typing-dots" aria-label="답변 생성 중">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="loading-text">단어와 퀴즈를 준비하는 중...</span>
                </div>
              </article>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="error-dismiss"
            onClick={() => setError(null)}
            aria-label="오류 메시지 닫기"
          >
            닫기
          </button>
        </div>
      )}

      <form className="chatbot-input-area" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="주제·난이도를 입력하거나 퀴즈 정답을 적어보세요 (Enter 전송, Shift+Enter 줄바꿈)"
          rows={2}
          disabled={isBusy}
          aria-label="채팅 메시지 입력"
        />
        <button
          type="submit"
          className="send-button"
          disabled={isBusy || input.trim().length === 0}
        >
          {isBusy ? '전송 중...' : '전송'}
        </button>
      </form>
    </div>
  );
}
