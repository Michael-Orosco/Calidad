import { ParticleSystem } from './particles.js';

const API_URL = 'http://localhost:3000/api';
const BLOCK_SIZE = 30;
const COLORS = [null, '#00f2ea', '#f0f000', '#a000f0', '#00ff00', '#ff0050', '#0055ff', '#ffaa00'];
const PIECES = 'ILJOTSZ';
const SHAPES = [
    [], [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]], [[0, 0, 2], [2, 2, 2], [0, 0, 0]],
    [[3, 0, 0], [3, 3, 3], [0, 0, 0]], [[4, 4], [4, 4]], [[0, 5, 0], [5, 5, 5], [0, 0, 0]],
    [[0, 6, 6], [6, 6, 0], [0, 0, 0]], [[7, 7, 0], [0, 7, 7], [0, 0, 0]]
];

const fx = new ParticleSystem('board');

// ESTADO
const state = {
    token: localStorage.getItem('tetris_token'),
    user: localStorage.getItem('tetris_user'),
    // AQUÍ FORZAMOS LOS NUEVOS CONTROLES (v2)
    keys: JSON.parse(localStorage.getItem('tetris_keys_v2')) || { 
        left: 'KeyA', right: 'KeyD', down: 'ArrowDown', 
        drop: 'Space', rot: 'KeyH', hold: 'KeyC' 
    },
    board: Array(20).fill().map(() => Array(10).fill(0)),
    player: { pos: {x:0, y:0}, matrix: null },
    queue: [], holdPiece: null, canHold: true,
    isRunning: false, isPaused: false, lastTime: 0, dropCounter: 0,
    score: 0, lines: 0, level: 1, startTime: 0, breakdown: { singles:0, doubles:0, triples:0, tetris:0 }
};

const ctx = document.getElementById('board').getContext('2d');
const nextCtx = document.getElementById('next').getContext('2d');
const holdCtx = document.getElementById('hold').getContext('2d');

// API
const api = async (url, method='GET', body=null) => {
    const headers = {'Content-Type': 'application/json'};
    if(state.token) headers['Authorization'] = `Bearer ${state.token}`;
    try {
        const res = await fetch(`${API_URL}${url}`, { method, headers, body: body ? JSON.stringify(body) : null });
        return await res.json();
    } catch(e) { return {success: false, error: 'Error de conexión'}; }
};

// MOTOR
function createPiece(t) { return SHAPES[PIECES.indexOf(t)+1].map(r => [...r]); }

function resetPlayer() {
    while(state.queue.length < 3) state.queue.push(createPiece(PIECES[Math.random()*PIECES.length|0]));
    state.player.matrix = state.queue.shift();
    state.player.pos = {x: (10-state.player.matrix[0].length)/2|0, y:0};
    state.canHold = true;
    if(collide(state.board, state.player)) gameOver();
    drawSidePanels();
}

function collide(b, p) {
    const [m, o] = [p.matrix, p.pos];
    for(let y=0; y<m.length; ++y) for(let x=0; x<m[y].length; ++x)
        if(m[y][x] !== 0 && (b[y+o.y] && b[y+o.y][x+o.x]) !== 0) return true;
    return false;
}

function merge() {
    state.player.matrix.forEach((r, y) => r.forEach((v, x) => {
        if(v) state.board[y+state.player.pos.y][x+state.player.pos.x] = v;
    }));
}

function rotate(dir) {
    const pos = state.player.pos.x;
    let offset = 1;
    const rot = (m) => {
        for(let y=0; y<m.length; ++y) for(let x=0; x<y; ++x) [m[x][y], m[y][x]] = [m[y][x], m[x][y]];
        dir > 0 ? m.forEach(r => r.reverse()) : m.reverse();
    };
    rot(state.player.matrix);
    while(collide(state.board, state.player)) {
        state.player.pos.x += offset;
        offset = -(offset + (offset>0 ? 1 : -1));
        if(offset > state.player.matrix[0].length) { rot(state.player.matrix); state.player.pos.x = pos; return; }
    }
}

function sweep() {
    let count = 0;
    outer: for(let y=state.board.length-1; y>0; --y) {
        for(let x=0; x<10; ++x) if(state.board[y][x] === 0) continue outer;
        for(let x=0; x<10; x++) fx.explode(x, y, COLORS[state.board[y][x]]);
        const row = state.board.splice(y, 1)[0].fill(0);
        state.board.unshift(row);
        ++y; count++;
    }
    if(count > 0) {
        state.score += [0, 100, 300, 500, 800][count] * state.level;
        state.lines += count;
        state.level = Math.floor(state.lines/10)+1;
        const k = ['singles', 'doubles', 'triples', 'tetris'][count-1];
        if(k) state.breakdown[k]++;
        updateStatsUI();
    }
}

function update(time = 0) {
    if(!state.isRunning) return;
    const dt = time - state.lastTime;
    state.lastTime = time;
    state.dropCounter += dt;
    if(!state.isPaused && state.dropCounter > Math.max(100, 1000 - ((state.level-1)*100))) playerDrop();
    draw(); fx.update();
    requestAnimationFrame(update);
}

function playerDrop() {
    state.player.pos.y++;
    if(collide(state.board, state.player)) {
        state.player.pos.y--; merge(); resetPlayer(); sweep(); state.score++; updateStatsUI();
    }
    state.dropCounter = 0;
}

// UI
function drawBlock(c, x, y, color, s=BLOCK_SIZE) {
    c.fillStyle = color; c.fillRect(x*s, y*s, s, s);
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.strokeRect(x*s, y*s, s, s);
    c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(x*s, y*s, s, 4);
}

function draw() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 300, 600);
    state.board.forEach((r, y) => r.forEach((v, x) => v && drawBlock(ctx, x, y, COLORS[v])));
    
    if(state.player.matrix && !state.isPaused) {
        // Ghost
        const g = {pos: {...state.player.pos}, matrix: state.player.matrix};
        while(!collide(state.board, g)) g.pos.y++;
        g.pos.y--;
        g.matrix.forEach((r, y) => r.forEach((v, x) => {
            if(v) {
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.strokeRect((g.pos.x+x)*BLOCK_SIZE, (g.pos.y+y)*BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            }
        }));
        // Player
        state.player.matrix.forEach((r, y) => r.forEach((v, x) => v && drawBlock(ctx, x+state.player.pos.x, y+state.player.pos.y, COLORS[v])));
    }
}

function drawSidePanels() {
    [nextCtx, holdCtx].forEach(c => c.clearRect(0,0,100,300));
    state.queue.forEach((p, i) => p.forEach((r, y) => r.forEach((v, x) => v && drawBlock(nextCtx, x+1, y+1+(i*4), COLORS[v], 20))));
    if(state.holdPiece) state.holdPiece.forEach((r, y) => r.forEach((v, x) => v && drawBlock(holdCtx, x+1, y+1, COLORS[v], 20)));
}

function initGame() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('game-ui').classList.remove('hidden');
    document.getElementById('user-display').innerText = state.user;
    state.board.forEach(r => r.fill(0));
    state.score = 0; state.lines = 0; state.level = 1; state.breakdown = {singles:0, doubles:0, triples:0, tetris:0};
    state.startTime = Date.now(); state.queue = []; state.holdPiece = null;
    resetPlayer(); state.isRunning = true; state.isPaused = false; fx.clear();
    updateStatsUI(); update();
}

async function gameOver() {
    state.isRunning = false;
    await api('/stats', 'POST', {
        score: state.score, lines: state.lines, level: state.level,
        time: Math.floor((Date.now()-state.startTime)/1000), breakdown: state.breakdown
    });
    document.getElementById('modal-over').classList.remove('hidden');
    document.getElementById('final-score').innerText = state.score;
    const bars = document.getElementById('bars');
    bars.innerHTML = '';
    const total = Object.values(state.breakdown).reduce((a,b)=>a+b,0) || 1;
    const lbl = {singles:'1 LÍNEA', doubles:'2 LÍNEAS', triples:'3 LÍNEAS', tetris:'TETRIS'};
    Object.entries(state.breakdown).forEach(([k, v]) => {
        bars.innerHTML += `
        <div class="bar-row">
            <span class="bar-label">${lbl[k]}</span>
            <div class="progress-track"><div class="progress-fill" style="width:${(v/total)*100}%"></div></div>
            <span class="bar-value">${v}</span>
        </div>`;
    });
}

function updateStatsUI() {
    document.getElementById('score').innerText = state.score.toLocaleString();
    document.getElementById('lines').innerText = state.lines;
    document.getElementById('level').innerText = state.level;
    const m = (Date.now()-state.startTime)/60000;
    document.getElementById('lpm').innerText = m>0 ? Math.floor(state.lines/m) : 0;
}

// INPUTS
document.addEventListener('keydown', e => {
    if(!document.getElementById('modal-cfg').classList.contains('hidden')) return;
    if(!state.isRunning || state.isPaused) return;
    const k = e.code, m = state.keys;
    if(k === m.left) { state.player.pos.x--; if(collide(state.board, state.player)) state.player.pos.x++; }
    else if(k === m.right) { state.player.pos.x++; if(collide(state.board, state.player)) state.player.pos.x--; }
    else if(k === m.down) playerDrop();
    else if(k === m.rot) rotate(1);
    else if(k === m.drop) { while(!collide(state.board, state.player)) { state.player.pos.y++; state.score+=2; } state.player.pos.y--; merge(); resetPlayer(); sweep(); updateStatsUI(); }
    else if(k === m.hold) {
        if(!state.canHold) return;
        const c = state.player.matrix;
        state.player.matrix = state.holdPiece || state.queue.shift();
        state.holdPiece = c; state.player.pos = {x:3, y:0}; state.canHold = false;
        if(!state.player.matrix) resetPlayer();
        drawSidePanels();
    }
});

// EVENTOS UI
document.getElementById('login-form').onsubmit = async e => {
    e.preventDefault();
    const res = await api('/auth/login', 'POST', { username:document.getElementById('u-in').value, password:document.getElementById('p-in').value });
    if(res.token) {
        state.token = res.token; state.user = res.username;
        localStorage.setItem('tetris_token', res.token); localStorage.setItem('tetris_user', res.username);
        initGame();
    } else alert(res.error);
};
document.getElementById('btn-reg').onclick = async (e) => {
    e.preventDefault();
    const res = await api('/auth/register', 'POST', { username:document.getElementById('u-in').value, password:document.getElementById('p-in').value });
    alert(res.message || res.error);
};
document.getElementById('btn-retry').onclick = () => { document.getElementById('modal-over').classList.add('hidden'); initGame(); };
document.getElementById('btn-logout').onclick = () => { localStorage.clear(); location.reload(); };
document.getElementById('btn-settings').onclick = () => {
    state.isPaused = true;
    document.getElementById('modal-cfg').classList.remove('hidden');
    document.getElementById('pause-overlay').classList.remove('hidden');
    const list = document.getElementById('cfg-list');
    list.innerHTML = '';
    const labels = {left:'IZQUIERDA', right:'DERECHA', down:'BAJAR LENTO', drop:'BAJAR RÁPIDO', rot:'ROTAR', hold:'HOLD (C)'};
    Object.entries(state.keys).forEach(([act, code]) => {
        const d = document.createElement('div');
        d.className = 'key-item';
        d.innerHTML = `<span>${labels[act]}</span> <b>${code.replace('Key','')}</b>`;
        d.onclick = () => {
            d.innerHTML = `<span>${labels[act]}</span> <b>...</b>`;
            d.classList.add('listening');
            const h = (ev) => {
                state.keys[act] = ev.code;
                localStorage.setItem('tetris_keys_v2', JSON.stringify(state.keys));
                api('/user/settings', 'PUT', {keyMap: state.keys});
                document.removeEventListener('keydown', h);
                document.getElementById('btn-settings').click();
            };
            document.addEventListener('keydown', h);
        };
        list.appendChild(d);
    });
};
document.getElementById('btn-cfg-close').onclick = () => {
    document.getElementById('modal-cfg').classList.add('hidden');
    state.isPaused = false;
    document.getElementById('pause-overlay').classList.add('hidden');
};
document.getElementById('btn-rank').onclick = async () => {
    const res = await api('/leaderboard');
    if(res.success) alert("🏆 RANKING:\n" + res.data.map((r,i)=>`#${i+1} ${r.username}: ${r.score}`).join('\n'));
};
document.getElementById('btn-reset').onclick = async () => {
    if(confirm("¿Borrar historial?")) { await api('/analytics/reset', 'DELETE'); alert("Borrado."); }
};

if(state.token) initGame();