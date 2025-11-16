const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Variable para almacenar el historial de conversacion por sesion
const conversationHistory = new Map();

// Prompt del sistema mejorado para orientacion vocacional
const PROMPT = `Eres Joaquín, un asistente virtual especializado EXCLUSIVAMENTE en orientación vocacional y profesional. 

TU ROL PRINCIPAL es ayudar a estudiantes y jóvenes a:
- Descubrir su vocación e intereses profesionales
- Explorar carreras universitarias y técnicas
- Identificar habilidades y aptitudes
- Planificar su futuro profesional
- Entender el mercado laboral y oportunidades

REGLAS ESTRICTAS:
1. SIEMPRE mantén el enfoque en orientación vocacional, incluso si el usuario pregunta sobre otros temas
2. Redirige conversaciones no relacionadas hacia temas de desarrollo profesional
3. Sé empático, motivador y proporciona información práctica
4. Usa ejemplos concretos de carreras, habilidades y oportunidades
5. Fomenta la autoevaluación y reflexión personal
6. Proporciona recursos y pasos accionables
7. Mantén un tono cálido, profesional y alentador

EJEMPLOS DE REDIRECCIÓN:
- Si preguntan sobre hobbies: "Es interesante cómo tus hobbies pueden relacionarse con carreras profesionales. Por ejemplo..."
- Si preguntan sobre temas personales: "Entiendo tu situación. Desde la perspectiva vocacional, esto puede ayudarnos a identificar..."
- Si preguntan sobre otros temas: "Como especialista en orientación vocacional, puedo ayudarte a conectar eso con posibles caminos profesionales..."

Recuerda: Tu objetivo es guiar hacia el descubrimiento vocacional y la planificación profesional.`;

// Endpoint para chat con OpenAI
app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId } = req.body;

        if(!message) {
            return res.status(400).json({ error: 'Message is required'});
        }

        // Obtener o inicializar el historial de la sesion
        if (!conversationHistory.has(sessionId)) {
            conversationHistory.set(sessionId, [
                {
                    role: 'system',
                    content: PROMPT
                }
            ]);
        }

        const sessionHistory = conversationHistory.get(sessionId);

        // Agregar el mensaje del usuario al historial
        sessionHistory.push({
            role: 'user',
            content: message
        });

        // Llamar a OpenAI
        const response = await axios.post('https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: sessionHistory,
                max_tokens: 600,
                temperature: 0.7,
                presence_penalty: 0.1, // Penaliza repetir temas no relacionados
                frequency_penalty: 0.1 // Penaliza lenguaje no profesional
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                }
            }
        );

        const aiResponse = response.data.choices[0].message.content;

        // Agregar la respuesta al historial
        sessionHistory.push({
            role:'assistant',
            content: aiResponse
        });

        // limitar el historial para no exceder limites de tokens
        if (sessionHistory.length > 12) { // Mantener system prompt + 5 intercambios
            // Conservar el system prompt y los ultimos 10 mensajes
            const systemPrompt = sessionHistory[0];
            const recentMessages = sessionHistory.slice(-10);
            conversationHistory.set(sessionId, [systemPrompt, ...recentMessages]);
        }

        res.json({ response: aiResponse });

    } catch (error) {
        console.error('Error calling OpenAI API:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Lo siento, estoy teniendo dificultades técnicas. Como tu asistente de orientación vocacional, te invito a reflexionar sobre tus intereses profesionales mientras soluciono este problema.' 
        });
    }
});

// Endpoint para limpiar historial de sesion
app.post('/api/clear-history', (req, res) => {
    const { sessionId } = req.body;
    if (sessionId && conversationHistory.has(sessionId)) {
        conversationHistory.delete(sessionId);
    }
    res.json({ success: true });
});

// Endpoint de salud
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Orienta.AI Backend',
        purpose: 'Orientacion vocacional y profesional'
    });
});

app.listen(PORT, () => {
    console.log('servidor de Orienta.AI ejecutandose en puerto ${PORT}');
});