/**
 * TETRIS ENTERPRISE SERVER - ULTIMATE EDITION
 * ------------------------------------------------
 * @version 4.0.0 (Full Architecture)
 * @description Servidor monolítico de alto rendimiento.
 * Incluye: Auth JWT, Anti-Cheat de Tiempo, Logs en Disco, 
 * Caché en Memoria, Seguridad HTTP y Monitoreo de Recursos.
 */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');
const path = require('path');
const fs = require('fs');
const os = require('os'); // Para monitoreo de sistema

// --- 1. CONFIGURACIÓN DEL SISTEMA ---
const CONFIG = {
    PORT: process.env.PORT || 3000,
    ENV: process.env.NODE_ENV || 'development',
    JWT_SECRET: 'tetris_super_secret_key_v4_ultimate',
    JWT_EXPIRE: '7d',
    LOG_FILE: path.join(__dirname, 'server.log'),
    CACHE_TTL: 30 * 1000, // Tiempo de vida del Caché (30 seg)
    PAGINATION_LIMIT: 10
};

// --- 2. CLASE: GESTOR DE CACHÉ (OPTIMIZACIÓN) ---
// Almacena respuestas pesadas en RAM para no saturar la Base de Datos
class CacheManager {
    constructor() {
        this.cache = new Map();
        this.stats = { hits: 0, misses: 0 };
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            this.stats.misses++;
            return null;
        }
        
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return item.data;
    }

    set(key, data, ttl = CONFIG.CACHE_TTL) {
        this.cache.set(key, {
            data,
            expiry: Date.now() + ttl
        });
    }

    clear(key) {
        if (key) this.cache.delete(key);
        else this.cache.clear();
    }

    getStats() {
        return this.stats;
    }
}
const serverCache = new CacheManager();

// --- 3. CLASE: LOGGER DE ARCHIVOS (AUDITORÍA) ---
// Escribe los eventos en un archivo de texto físico
class AuditLogger {
    static getTimestamp() {
        return new Date().toISOString().replace('T', ' ').substring(0, 19);
    }

    static async writeToFile(level, context, message) {
        const logLine = `[${this.getTimestamp()}] [${level}] [${context}]: ${message}\n`;
        
        // Escritura asíncrona para no bloquear el servidor
        fs.appendFile(CONFIG.LOG_FILE, logLine, (err) => {
            if (err) console.error('Error escribiendo logs en disco:', err);
        });
    }

    static log(level, context, message, metadata = null) {
        const timestamp = this.getTimestamp();
        
        // 1. Imprimir en Consola con Colores
        let color = '\x1b[0m';
        switch(level) {
            case 'INFO': color = '\x1b[36m'; break; // Cyan
            case 'SUCCESS': color = '\x1b[32m'; break; // Verde
            case 'WARN': color = '\x1b[33m'; break; // Amarillo
            case 'ERROR': color = '\x1b[31m'; break; // Rojo
            case 'SECURITY': color = '\x1b[35m'; break; // Magenta
        }

        console.log(`${color}[${timestamp}] [${level}] [${context}]: ${message}\x1b[0m`);
        if (metadata) console.log(JSON.stringify(metadata, null, 2));

        // 2. Guardar en Disco (Persistencia)
        this.writeToFile(level, context, message);
    }
}

// --- 4. CLASE: ESCUDO DE SEGURIDAD ---
// Headers manuales para proteger contra ataques comunes
class SecurityShield {
    static applyHeaders(req, res, next) {
        // Protección contra Clickjacking
        res.setHeader('X-Frame-Options', 'DENY');
        // Protección contra MIME-sniffing
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Protección XSS básica
        res.setHeader('X-XSS-Protection', '1; mode=block');
        // HSTS (Strict Transport Security)
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        // Ocultar tecnología del servidor
        res.removeHeader('X-Powered-By');
        next();
    }
}

// --- 5. CLASE: VALIDACIÓN DE TIEMPO (ANTI-CHEAT) ---
class TimeValidator {
    static analyze(score, lines, level, timeSeconds) {
        if (!score || !lines || !level || timeSeconds === undefined) return 'Datos corruptos.';
        if (timeSeconds < 0 || score < 0) return 'Valores negativos no permitidos.';

        // Umbral de "Speedrun" imposible
        if (score > 100 && timeSeconds < 2) {
            return 'Tiempo humanamente imposible.';
        }

        // Puntos por Segundo (PPS)
        const pps = score / (timeSeconds || 1);
        const maxPPS = 500 * level; // Tolerancia alta

        if (pps > maxPPS) {
            AuditLogger.log('SECURITY', 'ANTI-CHEAT', `PPS Excesivo detectado: ${pps.toFixed(2)}`);
            return 'Puntaje rechazado por anomalía estadística.';
        }
        return null;
    }
}

// --- 6. CLASE: MANEJADOR DE RESPUESTAS ---
class ResponseHandler {
    static send(res, status, success, data = null, message = null, error = null) {
        const payload = {
            success,
            timestamp: new Date().toISOString(),
            environment: CONFIG.ENV
        };
        
        if (data) payload.data = data;
        if (message) payload.message = message;
        if (error) payload.error = error;

        return res.status(status).json(payload);
    }

    static success(res, data, msg) { return this.send(res, 200, true, data, msg); }
    static created(res, data, msg) { return this.send(res, 201, true, data, msg); }
    static badRequest(res, err) { return this.send(res, 400, false, null, null, err); }
    static unauthorized(res, err) { return this.send(res, 401, false, null, null, err); }
    static serverError(res, err) { 
        AuditLogger.log('ERROR', 'SERVER', 'Excepción no controlada', err);
        return this.send(res, 500, false, null, null, 'Error interno del servidor'); 
    }
}

// --- INICIALIZACIÓN EXPRESS ---
const app = express();

// Middlewares Globales
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(SecurityShield.applyHeaders); // Aplicar escudo
app.use(express.static(path.join(__dirname, '../frontend')));

// Logger de Tráfico
app.use((req, res, next) => {
    if (!req.url.includes('favicon')) { // Ignorar ruido
        AuditLogger.log('INFO', 'HTTP', `${req.method} ${req.url} [${req.ip}]`);
    }
    next();
});

// --- MIDDLEWARE AUTH ---
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return ResponseHandler.unauthorized(res, 'Token requerido');

    jwt.verify(token, CONFIG.JWT_SECRET, (err, user) => {
        if (err) return ResponseHandler.unauthorized(res, 'Token expirado o inválido');
        req.user = user;
        next();
    });
};

// ==========================================
//              RUTAS DE LA API
// ==========================================

// 1. REGISTRO
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password || password.length < 4) {
        return ResponseHandler.badRequest(res, 'Usuario/Pass inválidos (min 4 chars)');
    }

    try {
        const [existing] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) return ResponseHandler.badRequest(res, 'El usuario ya existe');

        const hash = await bcrypt.hash(password, 10);
        
        // Transacción implícita
        const [result] = await db.execute(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)', 
            [username, hash]
        );

        // Crear configuración inicial (A/D/H/Space)
        const defaultKeys = { 
            left: 'KeyA', right: 'KeyD', down: 'ArrowDown', 
            drop: 'Space', rot: 'KeyH', hold: 'KeyC' 
        };
        
        await db.execute(
            'INSERT INTO user_settings (user_id, key_map) VALUES (?, ?)',
            [result.insertId, JSON.stringify(defaultKeys)]
        );

        AuditLogger.log('SUCCESS', 'AUTH', `Nuevo registro: ${username} (ID: ${result.insertId})`);
        ResponseHandler.created(res, { id: result.insertId, username }, 'Usuario creado correctamente');

    } catch (error) {
        ResponseHandler.serverError(res, error);
    }
});

// 2. LOGIN
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [users] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
        
        if (users.length === 0) return ResponseHandler.unauthorized(res, 'Usuario no encontrado');

        const user = users[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            AuditLogger.log('WARN', 'AUTH', `Intento fallido login: ${username}`);
            return ResponseHandler.unauthorized(res, 'Contraseña incorrecta');
        }

        const token = jwt.sign(
            { id: user.id, username: user.username }, 
            CONFIG.JWT_SECRET, 
            { expiresIn: CONFIG.JWT_EXPIRE }
        );

        AuditLogger.log('SUCCESS', 'AUTH', `Login exitoso: ${username}`);
        ResponseHandler.success(res, { token, username: user.username, userId: user.id });

    } catch (error) {
        ResponseHandler.serverError(res, error);
    }
});

// 3. PERFIL DE USUARIO
app.get('/api/user/profile', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT u.id, u.username, u.created_at, s.key_map 
            FROM users u 
            LEFT JOIN user_settings s ON u.id = s.user_id 
            WHERE u.id = ?
        `;
        const [rows] = await db.execute(query, [req.user.id]);

        if (rows.length === 0) return ResponseHandler.badRequest(res, 'Usuario no encontrado');

        const data = rows[0];
        if (typeof data.key_map === 'string') data.key_map = JSON.parse(data.key_map);

        ResponseHandler.success(res, data);

    } catch (error) {
        ResponseHandler.serverError(res, error);
    }
});

// 4. ACTUALIZAR CONTROLES
app.put('/api/user/settings', verifyToken, async (req, res) => {
    const { keyMap } = req.body;

    try {
        await db.execute(`
            INSERT INTO user_settings (user_id, key_map) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE key_map = VALUES(key_map)
        `, [req.user.id, JSON.stringify(keyMap)]);
        
        AuditLogger.log('INFO', 'USER', `Controles actualizados para ID: ${req.user.id}`);
        ResponseHandler.success(res, null, 'Configuración guardada');

    } catch (error) {
        ResponseHandler.serverError(res, error);
    }
});

// 5. GUARDAR PUNTAJE
app.post('/api/stats', verifyToken, async (req, res) => {
    const { score, lines, level, time, breakdown } = req.body;

    // Anti-Cheat Check
    const error = TimeValidator.analyze(score, lines, level, time);
    if (error) return ResponseHandler.badRequest(res, error);

    try {
        await db.execute(`
            INSERT INTO scores (user_id, score, lines_cleared, level_reached, time_played_sec, game_data)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [req.user.id, score, lines, level, time, JSON.stringify(breakdown || {})]);

        // Invalidar Caché del Leaderboard
        serverCache.clear('leaderboard_global');
        
        AuditLogger.log('SUCCESS', 'GAME', `Score: ${score} - Usuario: ${req.user.username}`);
        ResponseHandler.created(res, null, 'Puntaje registrado');

    } catch (error) {
        ResponseHandler.serverError(res, error);
    }
});

// 6. LEADERBOARD (CON CACHÉ INTELIGENTE)
app.get('/api/leaderboard', async (req, res) => {
    // Intentar obtener de Caché primero
    const cachedData = serverCache.get('leaderboard_global');
    if (cachedData) {
        return ResponseHandler.success(res, cachedData, 'Datos obtenidos desde Caché RAM');
    }

    try {
        AuditLogger.log('INFO', 'DB', 'Consultando Ranking en Base de Datos...');
        const query = `
            SELECT u.username, s.score, s.level_reached, s.lines_cleared, s.played_at
            FROM scores s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.score DESC
            LIMIT 15
        `;
        const [rows] = await db.execute(query);

        // Guardar en Caché
        serverCache.set('leaderboard_global', rows);

        ResponseHandler.success(res, rows, 'Datos frescos de DB');

    } catch (error) {
        ResponseHandler.serverError(res, error);
    }
});

// 7. RESETEAR HISTORIAL
app.delete('/api/analytics/reset', verifyToken, async (req, res) => {
    try {
        const [result] = await db.execute('DELETE FROM scores WHERE user_id = ?', [req.user.id]);
        
        serverCache.clear('leaderboard_global'); // Limpiar caché
        AuditLogger.log('WARN', 'DATA', `Reset de historial. Eliminados: ${result.affectedRows}`);
        
        ResponseHandler.success(res, { deleted: result.affectedRows }, 'Historial eliminado');

    } catch (error) {
        ResponseHandler.serverError(res, error);
    }
});

// 8. MONITOR DE SISTEMA (Nuevo)
app.get('/api/health', (req, res) => {
    const health = {
        status: 'ONLINE',
        uptime: process.uptime().toFixed(2) + 's',
        timestamp: AuditLogger.getTimestamp(),
        system: {
            platform: os.platform(),
            arch: os.arch(),
            memoryUsage: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
            freeMem: Math.round(os.freemem() / 1024 / 1024) + ' MB'
        },
        cacheStats: serverCache.getStats()
    };
    res.status(200).json(health);
});

// --- MANEJO DE ERRORES 404 ---
app.use((req, res) => {
    ResponseHandler.badRequest(res, `Ruta no encontrada: ${req.method} ${req.url}`);
});

// --- ARRANQUE ---
app.listen(CONFIG.PORT, () => {
    console.log('\n===================================================');
    console.log(`🚀 SERVER ULTIMATE (v4.0) EN PUERTO: ${CONFIG.PORT}`);
    console.log(`📁 Logs: ${CONFIG.LOG_FILE}`);
    console.log(`🛡️ Seguridad HTTP: Activada`);
    console.log(`⚡ Caché en Memoria: Activado`);
    console.log('===================================================\n');
});