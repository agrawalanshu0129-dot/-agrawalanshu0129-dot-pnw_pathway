// Optional-key vision check on a freshly uploaded document, same zero-cost
// fallback pattern as the rest of the AI features (see ai.js/city.js/news.js).
// Deliberately low-stakes: it only comments on scan quality/completeness
// (blurry, cropped, upside down, wrong file entirely) to save a round trip
// with staff -- never on the document's content, and never a substitute for
// the real human review that still happens regardless of what this says.
async function precheckDocument({ mimeType, base64Content, itemTitle }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const contentBlock = mimeType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: mimeType, data: base64Content } }
    : { type: "image", source: { type: "base64", media_type: mimeType, data: base64Content } };

  const prompt = `A student is uploading a document for the requirement "${itemTitle}" at a university international student services office.

Look at the attached file and answer in exactly this format: start with either "OK:" if it looks legible, complete, and right-side-up, or "CHECK:" if there's an obvious problem (blurry, cropped, upside down, or it looks like the wrong kind of document entirely). Follow with one short sentence (under 30 words) explaining why.

Do not comment on or repeat any personal or financial details visible in the document -- only comment on scan quality and whether it appears complete. This is not a review of whether the document satisfies the requirement, only whether it's a usable scan.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 150,
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }],
      }),
    });
    if (!resp.ok) throw new Error(`LLM API returned ${resp.status}`);
    const data = await resp.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
    if (!text) return null;

    const match = text.match(/^(OK|CHECK):\s*(.*)$/is);
    return match
      ? { status: match[1].toLowerCase(), note: match[2].trim() }
      : { status: null, note: text };
  } catch (err) {
    console.error("Document precheck failed:", err.message);
    return null;
  }
}

module.exports = { precheckDocument };
