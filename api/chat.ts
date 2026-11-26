import OpenAI from 'openai';

export const SYSTEM_PROMPT = `당신은 친절하고 유능한 '영어 단어 퀴즈 챗봇'입니다. 단어 학습과 복습 퀴즈는 반드시 단계별로 분리하여 진행합니다.

다음 규칙을 반드시 엄격히 지키세요:
1. 모든 설명과 안내는 한국어로 간결하고 읽기 쉽게 작성하세요.
2. 사용자가 원하는 '주제(예: 여행, 비즈니스, 일상 회화, IT 등)'와 '난이도(예: 초급, 중급, 고급)' 중 하나라도 정해지지 않았다면, 단어나 퀴즈를 바로 내지 말고 부족한 정보(주제 및/또는 난이도)를 먼저 간단히 물어보세요.
3. [단어 소개 단계] 주제와 난이도가 확인되면 먼저 해당 조건에 맞는 영어 단어 정확히 3개만 알려주세요. (절대 4개 이상 제시하지 마세요.)
   - 각 단어마다 다음 항목을 포함하세요:
     - 영어 단어 (품사)
     - 한국어 뜻
     - 짧은 영어 예문 1개와 한국어 해석
   - **이 첫 번째 응답에서는 절대 복습 퀴즈를 바로 내지 마세요.**
   - 첫 번째 응답의 마지막에는 반드시 다음 문장으로만 안내하세요:
     준비되면 "퀴즈 시작"이라고 입력해 주세요.
4. [복습 퀴즈 단계] 사용자가 "퀴즈 시작"이라고 입력하면, 직전에 소개한 3개 단어 중 하나의 예문을 활용해 복습 퀴즈를 정확히 1개만 내세요.
   - 복습 퀴즈는 항상 "빈칸 채우기" 형식으로 통일합니다. (예문 속 정답 단어를 ______ 로 빈칸 처리)
   - 정답이 바로 드러나지 않도록 한국어 해석 전체를 그대로 보여주지 말고, 정답을 직접 말하지 않는 짧은 한국어 힌트만 제공하세요.
   - 퀴즈 출력 형식은 반드시 아래 형식을 정확히 고정해서 출력하세요:

복습 퀴즈
Q. 다음 빈칸에 들어갈 알맞은 단어를 입력해보세요.
[정답 단어가 빈칸 처리된 영어 예문]
힌트: [정답을 직접 말하지 않는 짧은 한국어 힌트]
답을 입력해보세요.

5. [정답 확인 및 다음 단계] 사용자가 퀴즈 답을 입력하면 정답 여부(정답/오답)와 정답 단어, 예문 전체 해석을 간결히 설명하고, 같은 주제로 다음 단어 3개를 이어서 학습할지 또는 다른 주제/난이도로 바꿀지 물어보세요.`;

const MODEL_NAME = 'gpt-6-luna';

interface ChatMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  messages?: unknown;
}

function isValidChatMessage(item: unknown): item is ChatMessageInput {
  if (typeof item !== 'object' || item === null) {
    return false;
  }

  const candidate = item as Record<string, unknown>;
  return (
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.content === 'string' &&
    candidate.content.trim().length > 0
  );
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        error:
          '서버에 OPENAI_API_KEY가 설정되지 않았습니다. .env.local 파일 또는 Vercel 환경 변수를 확인해 주세요.',
      },
      { status: 500 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json(
      { error: '요청 본문이 올바른 JSON 형식이 아닙니다.' },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json(
      { error: '대화 메시지(messages) 배열이 필요합니다.' },
      { status: 400 },
    );
  }

  const validMessages = body.messages.filter(isValidChatMessage);
  if (validMessages.length === 0) {
    return Response.json(
      { error: '유효한 메시지가 없습니다.' },
      { status: 400 },
    );
  }

  try {
    const client = new OpenAI({ apiKey });

    const stream = await client.responses.create({
      model: MODEL_NAME,
      stream: true,
      reasoning: {
        effort: 'none',
      },
      instructions: SYSTEM_PROMPT,
      input: validMessages.map((message) => ({
        role: message.role,
        content: message.content.trim(),
      })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'response.output_text.delta' && event.delta) {
              controller.enqueue(encoder.encode(event.delta));
            } else if (event.type === 'error') {
              throw new Error(
                event.message || '응답 생성 중 오류가 발생했습니다.',
              );
            }
          }
          controller.close();
        } catch (streamError) {
          controller.error(streamError);
        }
      },
      cancel() {
        stream.controller.abort();
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[api/chat] OpenAI API error:', error);

    if (error instanceof OpenAI.APIError) {
      const status = error.status && error.status >= 400 ? error.status : 502;
      return Response.json(
        { error: `OpenAI API 오류가 발생했습니다: ${error.message}` },
        { status },
      );
    }

    return Response.json(
      { error: '답변을 생성하는 중 서버 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<Response> {
  return Response.json(
    { error: 'Method Not Allowed. Use POST.' },
    { status: 405 },
  );
}
