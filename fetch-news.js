// ============================================================
// NEWS WAVE — Auto Post System
// Fetches: Google News, BBC, CNN, Reuters, Times of India
// AI Rewrite: Google Gemini (Free API)
// Images: Pollinations.ai (100% Free, No Key Needed)
// Runs: 7 AM, 1 PM, 6 PM IST daily
// ============================================================

const Parser = require('rss-parser');
const fetch = require('node-fetch');
const fs = require('fs');

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'NewsWave/1.0' }
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ── All News Sources ──
const RSS_SOURCES = [
  // Google News
  { name: 'Google News India',    url: 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en',          cat: 'News' },
  { name: 'Google News World',    url: 'https://news.google.com/rss?hl=en&gl=US&ceid=US:en',              cat: 'World' },
  { name: 'Google Trends India',  url: 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=IN', cat: 'Trending' },
  // BBC
  { name: 'BBC World',            url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                     cat: 'World' },
  { name: 'BBC Technology',       url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',                cat: 'Tech' },
  { name: 'BBC Business',         url: 'https://feeds.bbci.co.uk/news/business/rss.xml',                  cat: 'Business' },
  { name: 'BBC India',            url: 'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml',          cat: 'India' },
  // CNN
  { name: 'CNN Top Stories',      url: 'http://rss.cnn.com/rss/edition.rss',                              cat: 'World' },
  { name: 'CNN Technology',       url: 'http://rss.cnn.com/rss/edition_technology.rss',                   cat: 'Tech' },
  { name: 'CNN Business',         url: 'http://rss.cnn.com/rss/money_latest.rss',                         cat: 'Business' },
  // Reuters
  { name: 'Reuters World',        url: 'https://feeds.reuters.com/reuters/worldNews',                     cat: 'World' },
  { name: 'Reuters Business',     url: 'https://feeds.reuters.com/reuters/businessNews',                  cat: 'Business' },
  { name: 'Reuters Technology',   url: 'https://feeds.reuters.com/reuters/technologyNews',                cat: 'Tech' },
  // Times of India
  { name: 'TOI Top Stories',      url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',      cat: 'India' },
  { name: 'TOI India',            url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms',      cat: 'India' },
  { name: 'TOI Business',         url: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms',        cat: 'Business' },
  // Hindustan Times
  { name: 'HT India',             url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml', cat: 'India' },
  // NDTV
  { name: 'NDTV India',           url: 'https://feeds.feedburner.com/ndtvnews-top-stories',               cat: 'India' },
];

// ── Category Colors ──
const CAT_COLORS = {
  'News': '#1a6fa0', 'World': '#1a6fa0', 'India': '#c0392b',
  'Tech': '#2e7d32', 'Business': '#004d6d', 'Trending': '#7c3aed',
  'Fashion': '#c2185b', 'Travel': '#e65100', 'Video': '#6a1b9a'
};

// ── Session Time ──
function getTimeOfDay() {
  const hour = new Date().getUTCHours();
  const istHour = (hour + 5) % 24 + (new Date().getUTCMinutes() >= 30 ? 0 : 0);
  const istH = (hour * 60 + 30 + new Date().getUTCMinutes()) / 60 % 24;
  if (istH >= 5 && istH < 12) return 'Morning';
  if (istH >= 12 && istH < 17) return 'Afternoon';
  return 'Evening';
}

// ── Fetch RSS with timeout ──
async function fetchRSS(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = (feed.items || []).slice(0, 2); // 2 articles per source
    return items.map(item => ({
      title: item.title || '',
      snippet: item.contentSnippet || item.summary || item.content || '',
      link: item.link || '',
      source: source.name,
      cat: source.cat
    }));
  } catch (e) {
    console.log(`Skipped ${source.name}: ${e.message}`);
    return [];
  }
}

// ── Gemini AI Rewrite ──
async function rewriteWithGemini(title, snippet, cat) {
  if (!GEMINI_API_KEY) {
    // Fallback: use original with minor cleanup
    return {
      headline: title.replace(/ - .+$/, '').substring(0, 80),
      body: snippet.substring(0, 300) || 'Read the full story for complete details.',
      tags: [cat, 'News', 'Latest']
    };
  }

  try {
    const prompt = `You are a professional news editor. Rewrite this news article for a modern news website.

Original Title: ${title}
Original Content: ${snippet}

Rules:
1. Write a catchy, clear headline (max 80 chars)
2. Write 2-3 sentences body (max 200 words, simple English)
3. Add 3 relevant tags

Respond in EXACTLY this JSON format (no extra text):
{"headline":"...","body":"...","tags":["tag1","tag2","tag3"]}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 400 }
        })
      }
    );

    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        headline: parsed.headline || title,
        body: parsed.body || snippet,
        tags: parsed.tags || [cat, 'News']
      };
    }
    throw new Error('No JSON in response');

  } catch (e) {
    console.log(`Gemini fallback for "${title}": ${e.message}`);
    return {
      headline: title.replace(/ - .+$/, '').substring(0, 80),
      body: snippet.substring(0, 250) || 'Full story available at the source.',
      tags: [cat, 'News', 'Latest']
    };
  }
}

// ── Generate Image URL (Pollinations.ai - FREE) ──
function generateImageUrl(headline, cat) {
  const safePrompt = encodeURIComponent(
    `${headline}, ${cat}, news photography, professional, high quality, 4k, realistic`
  );
  const seed = Math.floor(Math.random() * 9999);
  return `https://image.pollinations.ai/prompt/${safePrompt}?width=800&height=450&seed=${seed}&nologo=true`;
}

// ── Main Function ──
async function main() {
  console.log('🌊 News Wave Auto Post Starting...');
  console.log(`Session: ${getTimeOfDay()} | Time: ${new Date().toISOString()}`);

  // Load existing posts
  let existingPosts = [];
  try {
    const raw = fs.readFileSync('posts.json', 'utf8');
    existingPosts = JSON.parse(raw);
    console.log(`Existing posts: ${existingPosts.length}`);
  } catch(e) {
    console.log('Starting fresh posts.json');
  }

  // Track existing titles to avoid duplicates
  const existingTitles = new Set(existingPosts.map(p => p.title.toLowerCase().substring(0, 40)));

  // Fetch from all sources
  console.log('Fetching RSS feeds...');
  const allArticles = [];
  for (const source of RSS_SOURCES) {
    const articles = await fetchRSS(source);
    allArticles.push(...articles);
    if (articles.length > 0) {
      console.log(`  ✓ ${source.name}: ${articles.length} articles`);
    }
    // Small delay to be polite to servers
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`Total fetched: ${allArticles.length} articles`);

  // Filter duplicates and pick top articles
  const unique = allArticles.filter(a => {
    const key = a.title.toLowerCase().substring(0, 40);
    if (existingTitles.has(key) || !a.title || a.title.length < 10) return false;
    existingTitles.add(key);
    return true;
  });

  // Pick 6 articles per session (2 per time slot × 3 categories mix)
  const selected = unique.slice(0, 6);
  console.log(`Selected ${selected.length} new articles to post`);

  // Process each article
  const newPosts = [];
  for (const article of selected) {
    console.log(`Processing: "${article.title.substring(0, 50)}..."`);

    // AI Rewrite
    const rewritten = await rewriteWithGemini(article.title, article.snippet, article.cat);

    // Generate image
    const imageUrl = generateImageUrl(rewritten.headline, article.cat);

    const post = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      title: rewritten.headline,
      excerpt: rewritten.body,
      image: imageUrl,
      cat: article.cat,
      catColor: CAT_COLORS[article.cat] || '#1a6fa0',
      source: article.source,
      sourceUrl: article.link,
      tags: rewritten.tags,
      session: getTimeOfDay(),
      date: new Date().toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        timeZone: 'Asia/Kolkata'
      }),
      time: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      }),
      timestamp: Date.now()
    };

    newPosts.push(post);

    // Delay between Gemini calls (rate limit)
    await new Promise(r => setTimeout(r, 1000));
  }

  // Merge: new posts at top, keep last 150 posts max
  const allPosts = [...newPosts, ...existingPosts].slice(0, 150);

  // Save posts.json
  fs.writeFileSync('posts.json', JSON.stringify(allPosts, null, 2));
  console.log(`✅ posts.json updated: ${allPosts.length} total posts`);
  console.log(`New posts added: ${newPosts.length}`);

  if (newPosts.length > 0) {
    console.log('\nNew Headlines:');
    newPosts.forEach((p, i) => console.log(`  ${i+1}. [${p.cat}] ${p.title}`));
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
