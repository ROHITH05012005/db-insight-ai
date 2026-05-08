import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);

async function listModels() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Testing connection
    console.log("Checking available models...");
    
    // In current SDK, we can use the listModels method if available, 
    // but the most reliable way to check what works is to just try a simple prompt.
    // However, the SDK does have a method to list models.
    
    // Note: The listModels method is often on the genAI object or requires a specific client.
    // Since we are using the simple SDK, let's try to fetch model info.
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.VITE_GEMINI_API_KEY}`);
    const data = await response.json();
    
    if (data.error) {
      console.error("API Error:", data.error.message);
      return;
    }

    console.log("\nAvailable Models:");
    data.models.forEach(m => {
      console.log(`- ${m.name.replace('models/', '')} (${m.displayName})`);
    });

  } catch (error) {
    console.error("Error:", error.message);
  }
}

listModels();
