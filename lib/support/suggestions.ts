// Mel ends most replies with a line like
//   [[options: Yes, that worked | No, still stuck | Something else]]
// which /help turns into tap-to-reply buttons (easier than typing for
// students who aren't comfortable with tech). Kept in the stored message body so
// the bot sees its own offer in history; stripped everywhere it's shown.
// Client-safe — no server imports.
const OPTIONS_RE = /\n?\s*\[\[options:\s*([^\]]*)\]\]\s*$/i;

export function splitSuggestions(body: string | null): { text: string | null; suggestions: string[] } {
  if (!body) return { text: body, suggestions: [] };
  const m = body.match(OPTIONS_RE);
  if (!m) return { text: body, suggestions: [] };
  const suggestions = m[1]
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 60)
    .slice(0, 4);
  return { text: body.replace(OPTIONS_RE, "").trim() || null, suggestions };
}
