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
      const error = new Error(`X API error: ${response.status}`);
      throw error;
    }

    const data = await response.json();
    return data.data || [];
  } catch (error: any) {
    throw new Error(error.message || "Failed to fetch tweets");
  }
}
