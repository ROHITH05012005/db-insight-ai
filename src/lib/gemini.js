import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

export const getGeminiResponse = async (schema, prompt, history = []) => {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const systemInstruction = `
    You are an expert SQL assistant. You are given a SQLite database schema.
    Your task is to convert the user's natural language question into a valid SQLite query.
    
    SCHEMA:
    ${schema}

    RULES:
    1. Only return the SQL query, nothing else. No markdown, no explanation.
    2. Ensure the SQL is compatible with SQLite.
    3. If the user asks for something that cannot be answered with the given schema, return "ERROR: Cannot answer based on schema."
    4. Use joins where necessary.
    5. Be careful with case sensitivity in column names if they are quoted.
  `;

  const chat = model.startChat({
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }],
    })),
    generationConfig: {
      maxOutputTokens: 1000,
    },
  });

  const fullPrompt = `${systemInstruction}\n\nUser Question: ${prompt}`;
  const result = await chat.sendMessage(fullPrompt);
  const response = await result.response;
  return response.text().trim().replace(/```sql|```/g, '');
};

export const interpretData = async (query, data, question) => {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
        User asked: "${question}"
        I executed this SQL: "${query}"
        And got these results: ${JSON.stringify(data.slice(0, 20))} ${data.length > 20 ? '(truncated)' : ''}
        
        Please provide a concise, natural language answer based on this data. 
        If the data is a table, summarize the key finding.
    `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
}
