import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function chatWithAI(
  messages: { role: string; content: string }[],
  onChunk: (chunk: string) => void
) {
  const model = "gemini-3-flash-preview";
  const systemInstruction = `Bạn là Chatbot mini - StudyAI. 
Bạn cực kỳ lịch sự, thân thiện và nồng hậu.
Bạn hỗ trợ học tập, giải toán và trả lời mọi câu hỏi.
Khi trả lời, hãy chia nhỏ các ý bằng cách xuống dòng để dễ đọc. 
Sử dụng các ký hiệu toán học chuẩn (LaTeX) khi cần thiết như $x^2$, $\\frac{a}{b}$, v.v. Bao quanh LaTeX bằng dấu $ cho inline và $$ cho block.
Bạn tuyệt đối không sử dụng ngôn ngữ bậy bạ và sẽ nhắc nhở người dùng lịch sự nếu họ dùng lời lẽ không hay.
Luôn giữ thái độ tích cực và khích lệ người học.
Đặc biệt: Khi giải toán, hãy giải chi tiết từng bước.`;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const response = await ai.models.generateContentStream({
    model,
    contents,
    config: {
      systemInstruction,
    },
  });

  let fullText = "";
  for await (const chunk of response) {
    const text = chunk.text || "";
    fullText += text;
    onChunk(fullText);
  }
}
