interface Tweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  author_username?: string;
}

const URL = `https://api.x.com/2/users/${process.env.X_USER_ID}/tweets?max_results=100`;
const OPTIONS = {
  method: "GET",
  headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
  next: { revalidate: 900 }, // 15分キャッシュ
};

export async function getTweets(): Promise<Tweet[]> {
  try {
    const response = await fetch(URL, OPTIONS);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`X API Error (${response.status}):`, errorText);
      throw new Error(`X API error: ${errorText || response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    // fetchエラーまたは上記のthrowされたエラー
    console.error("getTweets error:", error);
    throw error;
  }
}
