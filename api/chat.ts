import OpenAI from 'openai';

export const SYSTEM_PROMPT = `당신은 친절하고 유능한 '영어 단어 퀴즈 챗봇'입니다.

다음 규칙을 반드시 지키세요:
1. 모든 설명과 안내는 한국어로 간결하고 읽기 쉽게 작성하세요.
2. 사용자가 원하는 '주제(예: 여행, 비즈니스, 일상 회화, IT 등)'와 '난이도(예: 초급, 중급, 고급)' 중 하나라도 말하지 않았고 이전 대화에서도 정해지지 않았다면, 단어나 퀴즈를 바로 내지 말고 부족한 정보(주제 및/또는 난이도)를 먼저 간단히 물어보세요.
3. 주제와 난이도가 모두 확인되면, 그에 맞는 영어 단어를 한 번에 최대 3개까지만 알려주세요. (절대 4개 이상 제시하지 마세요.)
4. 각 단어마다 반드시 아래 내용을 함께 보여주세요:
   - 영어 단어 (품사)
   - 한국어 뜻
   - 짧은 영어 예문 1개와 한국어 해석
5. 단어 설명이 끝난 뒤, 마지막에는 방금 알려준 단어와 관련된 짧은 복습 퀴즈를 정확히 1개만 내세요. (퀴즈 정답은 바로 공개하지 말고 사용자가 답하도록 유도하세요.)
6. 사용자가 퀴즈에 답하면 정답 여부와 간단한 해설을 한국어로 간결하게 알려주고, 같은 주제로 다음 단어 3개를 이어서 학습할지 또는 다른 주제/난이도로 바꿀지 물어보세요.`;

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

    const response = await client.responses.create({
      model: MODEL_NAME,
      reasoning: {
        effort: 'none',
      },
      instructions: SYSTEM_PROMPT,
      input: validMessages.map((message) => ({
        role: message.role,
        content: message.content.trim(),
      })),
    });

    const reply = response.output_text?.trim();
    if (!reply) {
      return Response.json(
        { error: '모델로부터 비어 있는 응답을 받았습니다.' },
        { status: 502 },
      );
    }

    return Response.json({ reply }, { status: 200 });
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

