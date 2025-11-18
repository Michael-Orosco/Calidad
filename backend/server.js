const express = require('express');
const cors = require('cors');
const path = require('path'); // <--- 1. NUEVO: Importamos manejo de rutas
const controllers = require('./controllers');
const { verifyToken } = require('./utils');

// Inicialización
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares Globales
app.use(cors());
app.use(express.json());

// <--- 2. NUEVO: Servir los archivos del Frontend (HTML, CSS, JS)
// Esto le dice al servidor: "Si alguien entra a la web, muéstrale la carpeta frontend"
app.use(express.static(path.join(__dirname, '../frontend')));

// Logger de Peticiones
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// --- RUTAS PÚBLICAS ---
app.post('/api/auth/register', controllers.register);
app.post('/api/auth/login', controllers.login);
app.get('/api/leaderboard', controllers.getLeaderboard);

// --- RUTAS PRIVADAS (Requieren Token) ---
app.get('/api/user/profile', verifyToken, controllers.getProfile);
app.put('/api/user/settings', verifyToken, controllers.updateSettings);
app.post('/api/stats', verifyToken, controllers.saveScore);
app.delete('/api/analytics/reset', verifyToken, controllers.resetHistory);

// --- MANEJO DE ERRORES GLOBAL ---
app.use((err, req, res, next) => {
    console.error('🔥 Error no controlado:', err.stack);
    res.status(500).json({ success: false, error: 'Error interno del servidor.' });
});

// Encender
app.listen(PORT, () => {
    console.log(`\n🚀 SERVER ENTERPRISE LISTO EN PUERTO ${PORT}`);
    console.log(`📡 JUEGA AQUÍ: http://localhost:${PORT}`); // <--- Actualizado para que sepas dónde entrar
});