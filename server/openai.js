const { OpenAI } = require('openai');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function extractCreatorsFromSearch({ organic, platform, targetState }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing from .env file.");
  }

  if (!organic || organic.length === 0) {
    return [];
  }

  const prompt = `
You are an expert AI data extraction assistant for content creators, influencers, and brands.
Analyze the following search engine results from ${platform.toUpperCase()} in the US state of ${targetState}.

Search Results Snippets:
${JSON.stringify(organic, null, 2)}

STRICT extraction RULES:
1. Extract content creators, influencers, brands, or page contacts found in the search results.
2. IF ANY SNIPPET CONTAINS A VALID EMAIL ADDRESS (e.g. "tasteoftherunway@gmail.com"), YOU MUST EXTRACT THAT CREATOR/CONTACT RECORD.
3. For each creator:
   - "first_name": First Name or Organization Name
   - "last_name": Last Name (or null if unavailable)
   - "name": Full Name, Page Title, or Organization Name (e.g. "Fashion Project DC")
   - "platform": "${platform}"
   - "profile_url": The exact link URL from the result snippet or handle profile URL
   - "email": The complete valid email address (MUST contain "@", e.g. "tasteoftherunway@gmail.com")
   - "phone": US Phone number if present in snippet, or null
   - "location": US City/State confirmed from snippet (default to "${targetState}")
   - "bio": Short snippet description

CRITICAL MANDATORY FILTER RULE:
- YOU MUST ONLY INCLUDE CREATORS THAT HAVE A COMPLETE VALID EMAIL ADDRESS (containing "@").
- REJECT AND DROP ENTRIES THAT HAVE NO EMAIL ADDRESS.

Return your response strictly as a JSON object with key "creators":
{
  "creators": [
    {
      "first_name": "...",
      "last_name": "...",
      "name": "...",
      "platform": "...",
      "profile_url": "...",
      "email": "...",
      "phone": "...",
      "location": "...",
      "bio": "..."
    }
  ]
}
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    let creators = parsed.creators || [];
    
    // Strict post-extraction filter: ONLY return creators that have a complete email containing '@'
    creators = creators.filter(c => c.email && typeof c.email === 'string' && c.email.includes('@') && c.email.trim().toLowerCase() !== 'gmail.com');

    // DETERMINISTIC REGEX FALLBACK: Scan all organic search snippets to ensure 0% email loss
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const existingEmails = new Set(creators.map(c => c.email.toLowerCase()));

    for (const item of (organic || [])) {
      const text = `${item.title || ''} ${item.snippet || ''}`;
      const matches = text.match(emailRegex) || [];
      for (const rawEmail of matches) {
        const cleanEmail = rawEmail.trim().toLowerCase();
        if (cleanEmail === 'gmail.com' || cleanEmail.includes('example.com') || cleanEmail.endsWith('.png') || cleanEmail.endsWith('.jpg')) continue;

        if (!existingEmails.has(cleanEmail)) {
          existingEmails.add(cleanEmail);
          
          const rawTitle = (item.title || 'Content Creator').split('|')[0].split('-')[0].trim();
          const cleanName = rawTitle.length > 2 ? rawTitle : 'Content Creator';
          const nameParts = cleanName.split(' ');
          const phoneMatch = text.match(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);

          creators.push({
            first_name: nameParts[0] || 'Dear',
            last_name: nameParts.slice(1).join(' ') || null,
            name: cleanName,
            platform: platform,
            profile_url: item.link || `https://www.${platform}.com`,
            email: cleanEmail,
            phone: phoneMatch ? phoneMatch[0] : null,
            location: targetState,
            bio: item.snippet || ''
          });
        }
      }
    }

    return creators;
  } catch (err) {
    console.error("OpenAI Extraction Error:", err.message);
    return [];
  }
}

module.exports = {
  extractCreatorsFromSearch
};
