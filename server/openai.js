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
You are an expert AI data extraction assistant for content creators.
Analyze the following search engine results from ${platform.toUpperCase()} in the US state of ${targetState}.

Search Results Snippets:
${JSON.stringify(organic, null, 2)}

STRICT REQUIREMENTS:
1. Extract content creator profiles from the search results.
2. A single search snippet may contain MULTIPLE creators or handles. Extract EVERY individual creator found.
3. For each creator, split the name into TWO SECTIONS ("first_name" and "last_name") as well as full "name":
   - "first_name": First Name (e.g. "Sederia", "Karly", "Selena")
   - "last_name": Last Name (e.g. "Steger"), or null if unavailable
   - "name": Full Name or Channel Title (e.g. "Sederia Steger")
   - "platform": "${platform}"
   - "profile_url": Clean profile URL (e.g. "https://www.instagram.com/username/")
   - "email": Complete valid email address (MUST contain "@", e.g. "username@gmail.com")
   - "phone": US Phone number if present (e.g. "+1 ..."), or null
   - "location": US City/State confirmed from bio, hashtag, or area code (default to "${targetState}")
   - "bio": Short bio snippet

CRITICAL MANDATORY FILTER RULE:
- YOU MUST ONLY INCLUDE CREATORS THAT HAVE A COMPLETE VALID EMAIL ADDRESS (containing "@", e.g. "user@gmail.com").
- DO NOT INCLUDE ANY CREATOR WITH email = null, email = "", OR INCOMPLETE DOMAINS LIKE "gmail.com".
- REJECT AND DROP ALL PHONE-ONLY OR NO-EMAIL ENTRIES.

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
    const creators = parsed.creators || [];
    
    // Strict post-extraction filter: ONLY return creators that have a complete email containing '@'
    return creators.filter(c => c.email && typeof c.email === 'string' && c.email.includes('@') && c.email.trim().toLowerCase() !== 'gmail.com');
  } catch (err) {
    console.error("OpenAI Extraction Error:", err.message);
    return [];
  }
}

module.exports = {
  extractCreatorsFromSearch
};
