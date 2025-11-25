
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Scene } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Strict Schema for a single scene
const singleSceneSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    narrative: { type: Type.STRING, description: "The narrative text for the scene." },
    dialogue: { type: Type.STRING, description: "The dialogue conversation for the scene." },
  },
  required: ["narrative", "dialogue"]
};

// Robust ID Generator
const generateUniqueId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `scene-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Single Image Analysis
 */
export const generateSingleScene = async (
  image: { data: string; mimeType: string },
  context: { title: string; studentName: string; languageMode: 'ar' | 'bilingual' },
  index: number = 1
): Promise<{ narrative: string; dialogue: string }> => {
  const imagePart = {
    inlineData: {
      mimeType: image.mimeType,
      data: image.data
    }
  };

  // Prompt construction based on language mode
  let languageInstruction = "";
  if (context.languageMode === 'ar') {
    languageInstruction = `
      OUTPUT LANGUAGE: ARABIC ONLY.
      - The 'narrative' field must be purely Arabic.
      - The 'dialogue' field must be purely Arabic.
      - Do NOT include any English text.
      - Maintain RTL formatting structure.
    `;
  } else {
    languageInstruction = `
      OUTPUT LANGUAGE: BILINGUAL (ARABIC AND ENGLISH).
      - CRITICAL: You MUST provide the English translation for every Arabic section.
      - 'narrative' format: Write the Arabic paragraph first. Then add a new line. Then write the English translation.
      - 'dialogue' format: Write the Arabic line. Then immediately write the English translation below it.
      - Example Narrative: 
        "ذهب سعد إلى السوق لشراء التفاح.
        
        Saad went to the market to buy apples."
    `;
  }

  const prompt = `
    You are a bilingual story generator helper for a school application.
    Analyze the provided image for Scene ${index} of the story "${context.title}".
    
    CONTEXT:
    - This is scene number ${index}.
    - Characters: The main student "${context.studentName}", and friends "Saad" and "Reem".
    - Setting: Describe strictly what is visible in the image.

    CRITICAL INSTRUCTIONS:
    1. VISUAL RELEVANCE: The narrative MUST describe exactly what is in the image. If it's a market, talk about the market.
    2. CHARACTER CONSISTENCY: Always use names ${context.studentName}, Saad, and Reem where appropriate.
    3. LANGUAGE REQUIREMENT: 
       ${languageInstruction}
    4. LENGTH: Narrative max 150 words. Dialogue max 3 lines per person.
    5. FORMAT: Return JSON object with 'narrative' and 'dialogue'.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [imagePart, { text: prompt }] }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: singleSceneSchema,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    return JSON.parse(text);

  } catch (error) {
    console.error(`Error analyzing image:`, error);
    return {
      narrative: context.languageMode === 'ar' ? "تعذر تحليل الصورة." : "Could not analyze image.\n\nتعذر تحليل الصورة.",
      dialogue: ""
    };
  }
};

/**
 * Batch Analysis
 */
export const generateStoryFromImages = async (
  title: string,
  studentName: string,
  languageMode: 'ar' | 'bilingual',
  images: { data: string; mimeType: string }[]
): Promise<Scene[]> => {
  
  const scenePromises = images.map(async (image, index) => {
    const result = await generateSingleScene(image, { title, studentName, languageMode }, index + 1);
    
    return {
      id: generateUniqueId(), // Use robust ID generation
      media: [{ 
        url: `data:${image.mimeType};base64,${image.data}`, 
        type: 'image' as const 
      }],
      narrative: result.narrative,
      dialogue: result.dialogue,
      isAiGenerated: true
    };
  });

  return await Promise.all(scenePromises);
};

/**
 * Refine / Translate Text Helper
 * Used in the editor to manually translate or improve text based on current language mode.
 */
export const refineText = async (
  text: string,
  field: 'narrative' | 'dialogue',
  languageMode: 'ar' | 'bilingual'
): Promise<string> => {
  if (!text.trim()) return "";

  const prompt = `
    You are a professional bilingual story editor for an educational app.
    Task: Refine and translate the following text.
    
    Field: ${field}
    Language Mode: ${languageMode}
    Input Text: "${text}"

    INSTRUCTIONS:
    1. If mode is 'ar' (Arabic Only):
       - Fix grammar and style in Arabic.
       - Remove any English text.
       - Return ONLY the Arabic text.

    2. If mode is 'bilingual' (Arabic & English):
       - If the text is only Arabic: Keep it (improve if needed) AND generate an English translation.
       - If the text is only English: Generate an Arabic translation AND keep the English (improve if needed).
       - If mixed: Ensure the Arabic comes first, followed by English. Match the meaning exactly.
       
    FORMATTING RULES:
    - For Narrative: 
      [Arabic Paragraph]
      
      [English Paragraph]
    
    - For Dialogue:
      Match line by line or block by block.
      [Arabic Line]
      [English Line]

    OUTPUT: Return ONLY the final text string. No markdown, no labels, no quotes around it.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.3, 
      },
    });

    return response.text?.trim() || text;
  } catch (error) {
    console.error("Translation error:", error);
    return text; 
  }
};

/**
 * Translate Text for Export (Arabic -> English)
 * Used specifically when exporting 'Arabic Only' stories to create a bilingual output on the fly.
 */
export const translateText = async (text: string): Promise<string> => {
  if (!text.trim()) return "";

  const prompt = `
    Translate the following Arabic children's story text into simple, clear English. 
    Keep the meaning accurate but easy to read.
    Do not add explanations. Just return the English translation.
    
    Text to translate:
    "${text}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.3 },
    });
    return response.text?.trim() || "";
  } catch (error) {
    console.error("Export translation error:", error);
    return "";
  }
};
