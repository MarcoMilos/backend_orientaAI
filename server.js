const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuracion de Multer para manejar archivos
const storage =  multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir =  'uploads/';
        // Crear directorio si no existe
        if (!fs.existsSync(uploadDir)){
            fs.mkdirSync(uploadDir, { recursivee: true  });
        }
        cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
        // Crear nombre unico para el archivo
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Filtrar tipos de archivos permitidos
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/jpeg',
        'image/jpg',
        'image/png'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de archivo no permitido'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limite por archivo
        files: 5 // Maximo 5 archivos por solicitud
    }
});

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

Manejo de archivos adjuntos:
Cuando el usuario suba archivos (CV, documentos académicos, etc.), debes:
1. Reconocer el tipo de documento
2. Extraer información relevante para orientación vocacional
3. Proporcionar análisis basado en el contenido del documento
4. Sugerir mejoras o áreas de desarrollo profesional

FORMATO DE RESPUESTAS:
1. **Estructura clara**: Usa párrafos cortos y separación visual
2. **Enfatiza puntos clave**: Usa negritas para conceptos importantes
3. **Listas organizadas**: Presenta opciones en forma de lista
4. **Pregunta de seguimiento**: Termina con una pregunta que fomente la reflexión
5. **Lenguaje motivador**: Sé alentador y positivo
6. **Evita textos largos y densos**: Divide la información en secciones digeribles

EJEMPLO DE FORMATO IDEAL:
"¡Excelente interés en [área]! 

**Opciones de estudio relacionadas:**
• [Carrera 1] - [Breve descripción]
• [Carrera 2] - [Breve descripción]
• [Carrera 3] - [Breve descripción]

**Habilidades clave a desarrollar:**
• [Habilidad 1]
• [Habilidad 2] 

**Siguientes pasos recomendados:**
[Consejos prácticos]

¿Qué aspecto de estas opciones te llama más la atención?"`;

// Función para extraer texto de diferentes tipos de archivos
async function extractTextFromFile(filePath, fileType) {
    try {
        // Para archivos de texto simples
        if (fileType.includes('text/plain')) {
            return fs.readFileSync(filePath, 'utf-8');
        }
        
        // Para PDFs (requiere librería adicional)
        if (fileType.includes('application/pdf')) {
            // Necesitarías instalar: npm install pdf-parse
            // const pdf = require('pdf-parse');
            // const dataBuffer = fs.readFileSync(filePath);
            // const data = await pdf(dataBuffer);
            // return data.text;
            return `[Contenido de PDF extraído: ${path.basename(filePath)}]`;
        }
        
        // Para documentos Word (requiere librería adicional)
        if (fileType.includes('application/msword') || 
            fileType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
            // Necesitarías instalar: npm install mammoth
            // const mammoth = require('mammoth');
            // const result = await mammoth.extractRawText({path: filePath});
            // return result.value;
            return `[Contenido de documento Word extraído: ${path.basename(filePath)}]`;
        }
        
        // Para imágenes (requiere OCR)
        if (fileType.includes('image/')) {
            // Necesitarías instalar: npm install tesseract.js
            // const Tesseract = require('tesseract.js');
            // const result = await Tesseract.recognize(filePath, 'spa');
            // return result.data.text;
            return `[Imagen procesada: ${path.basename(filePath)}]`;
        }
        
        return `[Archivo de tipo: ${fileType}]`;
    } catch (error) {
        console.error(`Error extrayendo texto de ${filePath}:`, error);
        return `[Error al procesar el archivo: ${path.basename(filePath)}]`;
    }
}

// Endpoint para chat con OpenAI
app.post('/api/chat', upload.any(), async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        const files =  req.files || [];

        if(!message && files.length === 0) {
            return res.status(400).json({ error: 'Se requiere mensaje o cuanto menos un archivo'});
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

        // Procesar archivos si existen
        let fileContents = '';
        if  (files.length > 0)  {
            fileContents = `\n\n[Archivos adjuntos:]\n`;

            for  (const file of files) {
                const fileText = await extractTextFromFile(file.path, file.mimetype);
                fileContents += `\n--- ${file.originalname} (${file.mimetype}) ---\n`;
                fileContents += fileText.substring(0,  2000);  // limitamos el texto extraido
                fileContents += `\n--- Fin del archivo ---\n`;
            }
        }

        // Crear el mensaje completo
        let fullMessage = message || '';
        if (files.length > 0) {
            fullMessage += fileContents;
        }

        // Agregar el mensaje del usuario al historial
        sessionHistory.push({
            role: 'user',
            content: fullMessage
        });

        // Llamar a OpenAI
        const response = await axios.post('https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: sessionHistory,
                max_tokens: 800, // aumentamos los tokens de 600 a 800 para permitir el manejo de archivos
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

        // limpiar archivos temporales despues de procesar
        files.forEach(file => {
            try {
                fs.unlinkSync(file.path);
            } catch (error) {
                console.error(`Error eliminando archivo temporal ${file.path}:`, error);
            }
        });

        res.json({ response: aiResponse, filesProcessed: files.length });

    } catch (error) {
        console.error('Error en el endpoint /api/chat:', error.response?.data ||  error.message);

        // Manejar errores específicos de Multer
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    error: 'El archivo es demasiado grande. Tamaño máximo: 10MB por archivo.' 
                });
            }
            if (error.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({ 
                    error: 'Demasiados archivos. Máximo: 5 archivos por solicitud.' 
                });
            }
        }

        res.status(500).json({
            error: 'Lo siento, estoy teniendo dificultades técnicas. Como tu asistente de orientación vocacional, te invito a reflexionar sobre tus intereses profesionales mientras soluciono este problema.' 
        });
    }
});

// Endpoint solo para texto (backward compatibility)
app.post('/api/chat-text', async (req, res) => {
    try {
        const { message, sessionId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
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
                presence_penalty: 0.1,
                frequency_penalty: 0.1
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
            role: 'assistant',
            content: aiResponse
        });

        // limitar el historial
        if (sessionHistory.length > 12) {
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

// Endpoint para obtener información de archivos subidos (opcional)
app.get('/api/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'uploads', filename);
    
    if (fs.existsSync(filepath)) {
        res.sendFile(filepath);
    } else {
        res.status(404).json({ error: 'Archivo no encontrado' });
    }
});

// Endpoint de salud
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Orienta.AI Backend',
        purpose: 'Orientacion vocacional y profesional',
        features: ['chat con texto', 'procesamiento de archivos'],
        maxFileSize: '10MB',
        maxFiles: 5
    });
});

// Crear directorio de uploads si no existe
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads', { recursive: true });
}

app.listen(PORT, () => {
    console.log(`Servidor de Orienta.AI ejecutándose en puerto ${PORT}`);
    console.log(`Modo archivos: HABILITADO`);
    console.log(`Directorio de uploads: ${path.join(__dirname, 'uploads')}`);
});