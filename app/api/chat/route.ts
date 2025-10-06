import { openai } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { convertToModelMessages, streamText } from "ai";
import { getTweets } from "@/lib/twitter-api";
import { OpenAIEmbeddings } from "@langchain/openai";
import { client } from "@/lib/chromadb";

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
  try {
    const { messages, tools } = await req.json();

    let tweets: any[] = [];
    try {
      tweets = await getTweets();
      console.log("Successfully fetched tweets:", tweets.length);
    } catch (twitterError) {
      console.error("Twitter API error:", twitterError);
      // Twitter APIのエラーでも継続（ツイートなしで動作）
      tweets = [];
    }

    const embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
    });

    const userQuestion = messages[messages.length - 1]?.content || "";

    // ツイートがない場合は直接回答
    if (tweets.length === 0) {
      const result = streamText({
        model: openai("gpt-4o"),
        messages: convertToModelMessages(messages),
        system: SYSTEM_PROMPT,
        tools: {
          ...frontendTools(tools),
        },
      });
      return result.toUIMessageStreamResponse();
    }

    try {
    // ChromaDB Cloudのコレクションを取得または作成
    const collectionName = "thebeth-tweets";
    const collection = await client.getOrCreateCollection({
      name: collectionName,
    });

    // ツイートをエンベディングに変換
    const tweetTexts = tweets.map((t) => t.text);
    const tweetEmbeddings = await embeddings.embedDocuments(tweetTexts);

    // 既存のデータをクリア（すべてのレコードを削除）
    await collection.delete({});

    // 新しいデータを追加
    await collection.add({
      ids: tweets.map((t) => t.id),
      embeddings: tweetEmbeddings,
      documents: tweetTexts,
      metadatas: tweets.map((t) => ({
        author_username: t.author_username || "unknown",
        created_at: t.created_at,
        author_id: t.author_id,
      })),
    });

    // ユーザーの質問をエンベディングに変換して検索
    const queryEmbedding = await embeddings.embedQuery(userQuestion);
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: 5,
    });

    // 検索結果をフォーマット
    const relevantTweets =
      results.documents[0]
        ?.map((doc, i) => {
          const metadata = results.metadatas[0]?.[i];
          return `[@${metadata?.author_username || "unknown"}] ${doc}`;
        })
        .join("\n\n") || "";

    // システムプロンプトに検索結果を追加
    const enhancedSystemPrompt = `${SYSTEM_PROMPT}
        以下は最新のツイート情報です。これらの情報を参考に回答してください：
      ${relevantTweets}`;

    const result = streamText({
      model: openai("gpt-4o"),
      messages: convertToModelMessages(messages),
      system: enhancedSystemPrompt,
      tools: {
        ...frontendTools(tools),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (chromaError) {
    console.error("ChromaDB error:", chromaError);
    // ChromaDBのエラーでも最新ツイートで回答を継続
    const fallbackTweets = tweets
      .slice(0, 10)
      .map(t => `[@${t.author_username || "unknown"}] ${t.text}`)
      .join("\n\n");

    const fallbackSystemPrompt = `${SYSTEM_PROMPT}

以下は最新のツイート情報です。これらの情報を参考に回答してください：

${fallbackTweets}`;

    const result = streamText({
      model: openai("gpt-4o"),
      messages: convertToModelMessages(messages),
      system: fallbackSystemPrompt,
      tools: {
        ...frontendTools(tools),
      },
    });

    return result.toUIMessageStreamResponse();
  }
  } catch (error) {
    console.error("API route error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
