import init, { Simulation } from './pkg/myxo_compute_rs.js';

const GRID_SIZE = 128;
const TEXTURE_SIZE = GRID_SIZE * GRID_SIZE;

const THREE = window.THREE;
const dat = window.dat;

async function run() {
    // DOM Elements
    const statusEl = document.getElementById('status');
    const throughputEl = document.getElementById('throughput');
    const loadingEl = document.getElementById('loading');
    const agvCountEl = document.getElementById('agv-count-display');
    const logEl = document.getElementById('log');

    // === Helper: System Log ===
    function log(msg) {
        const time = new Date().toLocaleTimeString();
        if(logEl) {
            logEl.innerHTML = `[${time}] ${msg}<br>` + logEl.innerHTML;
        }
        console.log(msg);
    }

    // 1. Initialize WASM
    let wasm;
    try {
        wasm = await init();
        if (loadingEl) loadingEl.style.opacity = 0;
        if (statusEl) statusEl.innerText = "SWARM ACTIVE";
        log("WASM Core Initialized. High-Performance Mode.");
    } catch (e) {
        console.error("WASM Init Failed:", e);
        if (statusEl) statusEl.innerText = "WASM ERROR";
        return;
    }

    // 2. Configuration
    const config = {
        agvCount: 30,
        diffusion: 0.15,
        decay: 0.05,
        randomize: function() {
            sim.randomize_map();
            log("Map Randomized. Obstacles regenerated.");
        },
        resetStats: function() {
            startTime = Date.now();
            sim = new Simulation(config.agvCount);
            sim.set_diffusion(config.diffusion);
            sim.set_decay(config.decay);
            log("Statistics & Simulation Reset.");
        }
    };

    let sim = new Simulation(config.agvCount);
    // 初期値を反映
    sim.set_diffusion(config.diffusion);
    sim.set_decay(config.decay);

    // 3. Setup GUI
    const gui = new dat.GUI();
    const fSwarm = gui.addFolder('Swarm Configuration');
    
    fSwarm.add(config, 'agvCount', 10, 200).step(1).name('AGV Count')
        .onChange(v => {
            sim.resize_agents(v);
            agvCountEl.innerText = v;
            log(`AGV Fleet resized to ${v} units.`);
        });
    
    fSwarm.add(config, 'diffusion', 0.01, 0.3).name('Diffusion')
        .onChange(v => sim.set_diffusion(v));
    
    fSwarm.add(config, 'decay', 0.001, 0.1).name('Decay')
        .onChange(v => sim.set_decay(v));
    
    fSwarm.open();

    const fEnv = gui.addFolder('Environment Control');
    fEnv.add(config, 'randomize').name('Randomize');
    fEnv.add(config, 'resetStats').name('Reset Statistics');
    fEnv.open();

    // 4. Setup Three.js
    const scene = new THREE.Scene();
    
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(GRID_SIZE/2, -GRID_SIZE/1.1, GRID_SIZE/1.0);
    camera.lookAt(GRID_SIZE/2, GRID_SIZE/2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    const existingCanvas = document.querySelector('canvas');
    if (existingCanvas) existingCanvas.remove();
    document.body.appendChild(renderer.domElement);

    // 5. Data Textures & Field Mesh
    
    // 【修正箇所】ここを修正。関数外の変数を共有するのではなく、内部で毎回newする。
    function createDataTexture() {
        const data = new Float32Array(TEXTURE_SIZE).fill(0); 
        const tex = new THREE.DataTexture(data, GRID_SIZE, GRID_SIZE, THREE.RedFormat, THREE.FloatType);
        tex.needsUpdate = true;
        return tex;
    }

    const texPickup = createDataTexture();
    const texDelivery = createDataTexture();
    const texRepulsion = createDataTexture();
    const texVein = createDataTexture();
    const texObstacles = createDataTexture();

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uPickup: { value: texPickup },
            uDelivery: { value: texDelivery },
            uRepulsion: { value: texRepulsion },
            uVein: { value: texVein },
            uObstacles: { value: texObstacles }
        },
        vertexShader: `
            varying vec2 vUv;
            varying float vHeight;
            uniform sampler2D uVein;
            uniform sampler2D uObstacles;
            void main() {
                vUv = uv;
                float v = texture2D(uVein, uv).r;
                float obs = texture2D(uObstacles, uv).r;
                vHeight = v * 8.0 + obs * 4.0;
                vec3 pos = position;
                pos.z += vHeight;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform sampler2D uPickup;
            uniform sampler2D uDelivery;
            uniform sampler2D uRepulsion;
            uniform sampler2D uVein;
            uniform sampler2D uObstacles;
            void main() {
                float p = texture2D(uPickup, vUv).r;
                float d = texture2D(uDelivery, vUv).r;
                float r = texture2D(uRepulsion, vUv).r;
                float v = texture2D(uVein, vUv).r;
                float obs = texture2D(uObstacles, vUv).r;
                
                vec3 color = vec3(0.0);
                color.r = p * 1.0 + v * 0.6;
                color.g = d * 1.0 + v * 0.6;
                color.b = r * 0.6 + obs * 0.4;

                if(obs > 0.5) color = vec3(0.1, 0.1, 0.3);

                gl_FragColor = vec4(color, 0.95);
            }
        `,
        transparent: true
    });

    const geometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE, GRID_SIZE-1, GRID_SIZE-1);
    const fieldMesh = new THREE.Mesh(geometry, material);
    fieldMesh.position.set(GRID_SIZE/2, GRID_SIZE/2, 0);
    scene.add(fieldMesh);

    // 6. Agents
    const agentMeshes = [];
    const agentGeo = new THREE.BoxGeometry(1.5, 2.5, 1.2);
    const agentMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    
    const maxAgents = 200;
    const agentsData = new Float32Array(maxAgents * 4);

    // 7. Animation Loop
    let startTime = Date.now();
    let frameCount = 0;

    function animate() {
        requestAnimationFrame(animate);
        frameCount++;

        // Rust Update
        for(let i=0; i<2; i++) sim.update();

        // Texture Update
        const memory = wasm.memory.buffer;

        texPickup.image.data.set(new Float32Array(memory, sim.get_pickup_ptr(), TEXTURE_SIZE));
        texPickup.needsUpdate = true;

        texDelivery.image.data.set(new Float32Array(memory, sim.get_delivery_ptr(), TEXTURE_SIZE));
        texDelivery.needsUpdate = true;

        texRepulsion.image.data.set(new Float32Array(memory, sim.get_repulsion_ptr(), TEXTURE_SIZE));
        texRepulsion.needsUpdate = true;

        texVein.image.data.set(new Float32Array(memory, sim.get_vein_ptr(), TEXTURE_SIZE));
        texVein.needsUpdate = true;

        texObstacles.image.data.set(new Float32Array(memory, sim.get_obstacles_ptr(), TEXTURE_SIZE));
        texObstacles.needsUpdate = true;

        // Agent Update
        const currentCount = config.agvCount;
        sim.get_agents_flat(agentsData);

        // Mesh Pool
        while (agentMeshes.length < currentCount) {
            const mesh = new THREE.Mesh(agentGeo, agentMat.clone());
            scene.add(mesh);
            agentMeshes.push(mesh);
        }
        while (agentMeshes.length > currentCount) {
            const mesh = agentMeshes.pop();
            scene.remove(mesh);
        }

        for (let i = 0; i < currentCount; i++) {
            const mesh = agentMeshes[i];
            const x = agentsData[i*4 + 0];
            const y = agentsData[i*4 + 1];
            const state = agentsData[i*4 + 2]; 
            const angle = agentsData[i*4 + 3];

            mesh.position.set(x, y, 1.5);
            mesh.rotation.z = angle - Math.PI/2;

            if (state < 0.5) mesh.material.color.set(0x00ffff);
            else if (state >= 1.5 && state < 2.5) mesh.material.color.set(0xffff00);
            else mesh.material.color.set(0xff00ff);

            mesh.position.z = (state >= 1.5 && state < 2.5) ? 2.5 : 1.5;
        }

        // Stats
        if (frameCount % 10 === 0) {
            const currentTotal = sim.get_delivered_count();
            const elapsedMins = (Date.now() - startTime) / 60000;
            if (elapsedMins > 0.01 && throughputEl) {
                throughputEl.innerText = (currentTotal / elapsedMins).toFixed(1);
            }
            if (agvCountEl) agvCountEl.innerText = currentCount;
        }

        renderer.render(scene, camera);
    }

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
}

run();