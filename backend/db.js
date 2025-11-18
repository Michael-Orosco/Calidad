/**
 * @file db.js
 * @description Módulo de conexión a base de datos MySQL.
 * Implementa un Pool de conexiones para manejar alta concurrencia.
 */

const mysql = require('mysql2');

// Configuración segura del Pool
// Se recomienda usar variables de entorno (.env) en producción
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'My$Q2p0wer!2025', // <--- CAMBIAR ESTO
    database: process.env.DB_NAME || 'tetris_db',
    
    // Configuración de rendimiento
    waitForConnections: true,
    connectionLimit: 15, // Aumentamos el límite para tráfico
    queueLimit: 0,
    
    // Configuración de tipos
    dateStrings: true // Manejo de fechas como strings para evitar conversiones raras
});

// Verificación inicial de conexión
// Esto ayuda a depurar si el servidor MySQL está apagado
pool.getConnection((err, connection) => {
    if (err) {
        console.error('-------------------------------------------');
        console.error('❌ ERROR FATAL: No se pudo conectar a MySQL');
        console.error('Código:', err.code);
        console.error('Mensaje:', err.message);
        console.error('-------------------------------------------');
    } else {
        console.log('-------------------------------------------');
        console.log('✅ CONEXIÓN ESTABLECIDA CON BASE DE DATOS');
        console.log('   ID de Hilo:', connection.threadId);
        console.log('-------------------------------------------');
        connection.release();
    }
});

// Exportamos la interfaz de Promesas para usar async/await
module.exports = pool.promise();