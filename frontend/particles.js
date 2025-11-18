/**
 * @file particles.js
 * @description Sistema de partículas para efectos visuales en Canvas.
 * Gestiona explosiones, gravedad y desvanecimiento de elementos decorativos.
 */

export class ParticleSystem {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        // Obtenemos el contexto 2D. Nota: Compartimos el canvas del tablero.
        // Esto significa que dibujamos SOBRE el juego.
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
    }

    /**
     * Genera una explosión en una coordenada específica del tablero.
     * @param {number} boardX - Coordenada X de la celda (0-9)
     * @param {number} boardY - Coordenada Y de la celda (0-19)
     * @param {string} color - Color hexadecimal de la pieza que explotó
     */
    explode(boardX, boardY, color) {
        const blockSize = 30; // Debe coincidir con el tamaño de bloque del juego
        
        // Convertir coordenadas de matriz a píxeles reales
        const centerX = (boardX * blockSize) + (blockSize / 2);
        const centerY = (boardY * blockSize) + (blockSize / 2);

        // Crear 10 partículas por bloque
        for (let i = 0; i < 12; i++) {
            this.particles.push({
                x: centerX,
                y: centerY,
                // Velocidad aleatoria en todas direcciones
                vx: (Math.random() - 0.5) * 10, 
                vy: (Math.random() - 0.5) * 10,
                life: 1.0, // Opacidad inicial (100%)
                color: color,
                size: Math.random() * 4 + 2, // Tamaño variado
                gravity: 0.4 // Fuerza de caída
            });
        }
    }

    /**
     * Actualiza la posición y estado de todas las partículas vivas.
     * Debe llamarse en cada frame del bucle de juego.
     */
    update() {
        // 1. Filtrar partículas muertas (life <= 0) para liberar memoria
        if (this.particles.length === 0) return;

        this.particles = this.particles.filter(p => p.life > 0);

        // 2. Actualizar y Dibujar cada partícula
        this.particles.forEach(p => {
            // Física básica
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity; // Aplicar gravedad
            p.life -= 0.03;    // Desvanecer lentamente

            // Dibujar
            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, p.life); // Transparencia
            this.ctx.fillStyle = p.color;
            
            // Dibujamos cuadrados pequeños para mantener estética Tetris
            this.ctx.fillRect(p.x, p.y, p.size, p.size);
            
            // Brillo extra
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = p.color;
            
            this.ctx.restore();
        });
    }

    /**
     * Limpia todas las partículas (útil al reiniciar juego)
     */
    clear() {
        this.particles = [];
    }
}