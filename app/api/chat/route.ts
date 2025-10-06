import { openai } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { convertToModelMessages, streamText } from "ai";
import { Document } from "@langchain/core/documents";
import { CharacterTextSplitter } from "langchain/text_splitter";
import { getTweets } from "@/lib/twitter-api";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Chroma } from "@langchain/community/vectorstores/chroma";

export const maxDuration = 30;

const SYSTEM_PROMPT = `あなたはTHE+BETHの公式ボットです。THE+BETHは日本のアイドルグループで、ファンの質問に親しみやすく丁寧に答えてください。

重要な制約：
- THE+BETHに関する情報は、以下の4つの公式アカウントからのみ取得してください：
  - @THE_BETH_JP（公式アカウント）
  - @ai_THE_BETH（アイ・カルボナーラ）
  - @kiri_THE_BETH（キリ・ノーブル）
  - @mano_THE_BETH（アスタリスク・マノ）
- 上記以外のアカウントやソースからの情報は一切参照・引用しないでください
- メンバーのプロフィール情報については、公式サイト https://thebeth.jp/profile/ の情報を参照してください
- 情報の正確性を保つため、必ず公式情報のみを基に回答してください

グループの最新情報、メンバー、楽曲、ライブスケジュールなどについて質問されたら、分かりやすく答えてください。`;

export async function POST(req: Request) {
  const { messages, tools } = await req.json();

  const tweets = await getTweets();

  const documents = tweets.map((tweet) => {
    const { text, id, created_at, author_id, author_username } = tweet;
    return new Document({
      pageContent: text,
      metadata: {
        id: id,
        created_at: created_at,
        author_id: author_id,
        author_username: author_username || "",
      },
    });
  });

  const textSplitter = new CharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 0,
  });

  const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-3-small",
  });

  const docs = await textSplitter.splitDocuments(documents);
  const db = await Chroma.fromDocuments(docs, embeddings, {});
  const retriever = db.asRetriever();

  // ユーザーの最新メッセージを取得
  const userQuestion = messages[messages.length - 1]?.content || "";

  // ユーザーの質問から検索クエリを生成（シンプルにユーザーの質問をそのまま使用）
  const retrieverResult = await retriever.invoke(userQuestion);

  console.log("retrieverResult", retrieverResult);

  // 検索結果から関連するツイート情報を抽出
  const relevantTweets = retrieverResult
    .map((doc: any) => {
      const metadata = doc.metadata;
      return `[@${metadata.author_username || "unknown"}] ${doc.pageContent}`;
    })
    .join("\n\n");

  // システムプロンプトに検索結果を追加
  const enhancedSystemPrompt = `${SYSTEM_PROMPT}
      以下は最新のツイート情報です。これらの情報を参考に回答してください：
      ${relevantTweets}
    `;

  const result = streamText({
    model: openai("gpt-4o"),
    messages: convertToModelMessages(messages),
    system: enhancedSystemPrompt,
    tools: {
      ...frontendTools(tools),
      // add backend tools here
    },
  });

  return result.toUIMessageStreamResponse();
}
