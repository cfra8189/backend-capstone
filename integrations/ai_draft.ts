import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { isAuthenticated } from "./auth";

const router = express.Router();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

router.post("/draft-agreement", isAuthenticated, async (req: any, res) => {
    try {
        const { templateTitle, terms, formData, collaborators } = req.body;

        const prompt = `
            You are a professional legal assistant for a music production agency called '.rvr | REVERIE'.
            Draft a professional, binding ${templateTitle} based on the following details:
            
            Core Terms: ${terms}
            
            Details:
            - Effective Date: ${formData.effectiveDate}
            - Track Title: ${formData.trackTitle}
            - Studio: ${formData.studioName || 'N/A'}
            - Producer: ${formData.producerName}
            - Client/Artist: ${formData.artistName}
            - Fee: ${formData.fee || formData.exclusiveFee || 'N/A'}
            - Royalty: ${formData.royalty || '0'}%
            ${formData.masterShare ? `- Master Share: ${formData.masterShare}%` : ''}
            - Jurisdiction: ${formData.jurisdiction || 'New York, NY'}
            
            Collaborators:
            ${collaborators.map((c: any) => `- Name: ${c.name}, Role: ${c.role}, Share: ${c.split}%`).join('\n')}
            
            Format the response as CLEAN HTML suitable for embedding in a document viewer. 
            Use inline CSS for styling (monospace fonts, clean borders).
            Ensure it includes signature lines at the end.
            DO NOT include <html> or <body> tags, just the inner content blocks.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Clean up markdown code blocks if necessary
        const cleanHtml = text.replace(/```html|```/g, "").trim();

        res.json({ draft: cleanHtml });
    } catch (error) {
        console.error("Gemini Draft Error:", error);
        res.status(500).json({ message: "AI Drafting failed" });
    }
});

export default router;
