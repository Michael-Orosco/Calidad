/**
 * @file controllers.js
 * @description Contiene toda la lógica de negocio: Autenticación,
 * Gestión de Usuarios, Guardado de Puntajes y Analíticas.
 */

const db = require('./db');
const bcrypt = require('bcrypt');
const { generateToken, validateScore, successResponse, errorResponse } = require('./utils');

// --- AUTENTICACIÓN ---

exports.register = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password || password.length < 4) {
        return errorResponse(res, 'Datos inválidos. Contraseña mín 4 caracteres.', 400);
    }

    try {
        // Verificar duplicados
        const [existing] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) return errorResponse(res, 'El usuario ya existe.', 409);

        // Encriptación
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // Transacción: Crear usuario + Configuración por defecto
        const [result] = await db.execute(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, hash]
        );

        const defaultKeys = { 
            left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown', 
            rot: 'ArrowUp', drop: 'Space', hold: 'KeyC' 
        };

        await db.execute(
            'INSERT INTO user_settings (user_id, key_map) VALUES (?, ?)',
            [result.insertId, JSON.stringify(defaultKeys)]
        );

        successResponse(res, { id: result.insertId, username }, 'Usuario registrado correctamente.');

    } catch (error) {
        errorResponse(res, error.message);
    }
};

exports.login = async (req, res) => {
    const { username, password } = req.body;

    try {
        const [users] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) return errorResponse(res, 'Usuario no encontrado.', 404);

        const user = users[0];
        const validPass = await bcrypt.compare(password, user.password_hash);

        if (!validPass) return errorResponse(res, 'Contraseña incorrecta.', 401);

        const token = generateToken(user);
        successResponse(res, { token, username: user.username }, 'Bienvenido de nuevo.');

    } catch (error) {
        errorResponse(res, error.message);
    }
};

// --- GAMEPLAY Y ESTADÍSTICAS ---

exports.saveScore = async (req, res) => {
    const { score, lines, level, time, breakdown } = req.body;
    const userId = req.user.id;

    // Validación Anti-Cheat
    const isValid = validateScore(score, lines, time, level);
    if (!isValid) {
        return errorResponse(res, 'Puntaje rechazado por inconsistencia detectada.', 400);
    }

    try {
        // Guardar score
        await db.execute(`
            INSERT INTO scores 
            (user_id, score, lines_cleared, level_reached, time_played_sec, game_data)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [userId, score, lines, level, time, JSON.stringify(breakdown || {})]);

        successResponse(res, null, 'Puntaje guardado y verificado.');

    } catch (error) {
        errorResponse(res, 'Error al guardar el puntaje en base de datos.');
    }
};

exports.getLeaderboard = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT u.username, s.score, s.level_reached, s.lines_cleared, s.played_at
            FROM scores s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.score DESC
            LIMIT 15
        `);
        successResponse(res, rows);
    } catch (error) {
        errorResponse(res, 'Error al obtener ranking.');
    }
};

// --- USUARIO ---

exports.getProfile = async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT u.username, s.key_map FROM users u LEFT JOIN user_settings s ON u.id = s.user_id WHERE u.id = ?',
            [req.user.id]
        );
        if (rows.length > 0) successResponse(res, rows[0]);
        else errorResponse(res, 'Perfil no encontrado', 404);
    } catch (error) {
        errorResponse(res, error.message);
    }
};

exports.updateSettings = async (req, res) => {
    const { keyMap } = req.body;
    try {
        await db.execute(`
            INSERT INTO user_settings (user_id, key_map) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE key_map = VALUES(key_map)
        `, [req.user.id, JSON.stringify(keyMap)]);
        successResponse(res, null, 'Configuración guardada.');
    } catch (error) {
        errorResponse(res, error.message);
    }
};

exports.resetHistory = async (req, res) => {
    try {
        const [result] = await db.execute('DELETE FROM scores WHERE user_id = ?', [req.user.id]);
        successResponse(res, { deleted: result.affectedRows }, 'Historial eliminado.');
    } catch (error) {
        errorResponse(res, error.message);
    }
};