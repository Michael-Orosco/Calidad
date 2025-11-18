/**
 * @file utils.js
 * @description Funciones auxiliares para validación, seguridad y formato.
 * Incluye lógica Anti-Cheat para verificar la integridad de los puntajes.
 */

const jwt = require('jsonwebtoken');
const SECRET_KEY = 'super_secret_key_tetris_enterprise_2025';

/**
 * Genera un Token JWT firmado para el usuario.
 * @param {Object} user - Objeto con id y username.
 * @returns {string} Token JWT.
 */
exports.generateToken = (user) => {
    return jwt.sign(
        { id: user.id, username: user.username },
        SECRET_KEY,
        { expiresIn: '7d' } // Token dura 7 días
    );
};

/**
 * Middleware para validar el Token en rutas protegidas.
 */
exports.verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(403).json({ 
            success: false, 
            error: 'Acceso denegado. Token no proporcionado.' 
        });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token inválido o expirado.' 
            });
        }
        req.user = user;
        next();
    });
};

/**
 * SISTEMA ANTI-CHEAT (Validación Matemática)
 * Verifica si un puntaje es teóricamente posible dado el tiempo y nivel.
 * * @param {number} score - Puntaje reportado
 * @param {number} lines - Líneas borradas
 * @param {number} time - Tiempo en segundos
 * @param {number} level - Nivel alcanzado
 */
exports.validateScore = (score, lines, time, level) => {
    // 1. Validaciones básicas de tipos
    if (typeof score !== 'number' || typeof lines !== 'number') return false;
    if (score < 0 || lines < 0 || time < 0) return false;

    // 2. Umbral máximo teórico
    // Un "Tetris" perfecto (4 líneas) da ~1200 pts por nivel.
    // Asumimos un juego perfecto de Tetris Back-to-Back.
    const maxPointsPerLine = 1500 * (level + 1); 
    
    // Puntos posibles por Hard Drop (suponemos 2 drops por segundo máx)
    const dropPoints = time * 40; 

    const theoreticalMax = (lines * maxPointsPerLine) + dropPoints + 5000; // +5000 colchón

    if (score > theoreticalMax) {
        console.warn(`[ANTI-CHEAT] Score rechazado: ${score} pts en ${lines} líneas.`);
        return false;
    }

    // 3. Validación de Velocidad Humana
    // Récord mundial: ~0.3s por línea en niveles altos.
    // Si alguien borra 100 líneas en 10 segundos, es un bot.
    if (lines > 10 && time < (lines * 0.2)) {
        console.warn(`[ANTI-CHEAT] Tiempo imposible: ${lines} líneas en ${time}s.`);
        return false;
    }

    return true;
};

/**
 * Formatea respuestas estandarizadas para la API.
 */
exports.successResponse = (res, data, message = 'OK') => {
    res.status(200).json({
        success: true,
        message,
        data
    });
};

exports.errorResponse = (res, error, code = 500) => {
    console.error(`[API ERROR] ${error}`);
    res.status(code).json({
        success: false,
        error
    });
};