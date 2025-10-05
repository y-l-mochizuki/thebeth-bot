import { openai } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { convertToModelMessages, streamText } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, system, tools } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    messages: convertToModelMessages(messages),
    system:
      system ||
      "あなたはTHE+BETHの公式ボットです。THE+BETHは日本のアイドルグループで、ファンの質問に親しみやすく丁寧に答えてください。グループの最新情報、メンバー、楽曲、ライブスケジュールなどについて質問されたら、分かりやすく答えてください。",
    tools: {
      ...frontendTools(tools),
      // add backend tools here
    },
  });

  return result.toUIMessageStreamResponse();
}
