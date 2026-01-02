import init, { Simulation, AgentState } from './pkg/nx_compute_rs.js';

const GRID_SIZE = 128;
const TEXTURE_SIZE = GRID_SIZE * GRID_SIZE;

async function run() {
    // 1. Initialize WASM
    const wasm = await init();
    
    // 2. Setup Simulation
    const agentCount = 50;
    const sim = new Simulation(agentCount);
    
    // 3. Setup Three.js (Rendering)
    const container = document.body;
    // ... (Three.js setup code similar to original, omitted for brevity) ...
    // NOTE: シェーダー用のTexture作成部分は以下のように変更する
    
    // WASMメモリへのビューを作成（これらはシミュレーション中に再確保されると無効になる可能性があるため、ループ内で取得推奨だが、サイズ固定ならこれでもいける）
    // 安全のため、updateループ内でメモリバッファを取得しなおすパターンで実装します。
    
    // Agent Mesh Pool
    const agentMeshes = [];
    const agentGeo = new THREE.BoxGeometry(1.5, 2.5, 1.2);
    const agentMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    
    const scene = new THREE.Scene();
    // ... Camera, Renderer setup ...

    // Field Mesh Setup with Shader (Same as original)
    // ...

    // 4. Animation Loop
    const agentsData = new Float32Array(agentCount * 4); // x, y, state, angle

    function animate() {
        requestAnimationFrame(animate);

        // Rust Update
        for(let i=0; i<2; i++) sim.update(); // 2 sub-steps

        // === Zero-Copy Texture Update ===
        // WASMのリニアメモリバッファを取得
        const memory = wasm.memory.buffer;

        // ポインタを取得し、JSのFloat32Arrayとしてラップする
        const pickupView = new Float32Array(memory, sim.get_pickup_ptr(), TEXTURE_SIZE);
        const deliveryView = new Float32Array(memory, sim.get_delivery_ptr(), TEXTURE_SIZE);
        const repulsionView = new Float32Array(memory, sim.get_repulsion_ptr(), TEXTURE_SIZE);
        const veinView = new Float32Array(memory, sim.get_vein_ptr(), TEXTURE_SIZE);
        const obsView = new Float32Array(memory, sim.get_obstacles_ptr(), TEXTURE_SIZE);

        // Three.jsのTextureに流し込む (DataTextureのimage.dataを差し替える)
        // ※ Three.jsのDataTextureは通常 .set() を使うか、source.dataを書き換えて needsUpdate
        fieldMesh.material.uniforms.uPickup.value.image.data.set(pickupView);
        fieldMesh.material.uniforms.uPickup.value.needsUpdate = true;
        
        // ... 他のTextureも同様に ...

        // === Agent Update ===
        sim.get_agents_flat(agentsData); // Rustからデータをコピー
        
        // メッシュ同期
        for (let i = 0; i < agentCount; i++) {
            let mesh = agentMeshes[i];
            if (!mesh) {
                 mesh = new THREE.Mesh(agentGeo, agentMat.clone());
                 scene.add(mesh);
                 agentMeshes[i] = mesh;
            }
            
            const x = agentsData[i*4 + 0];
            const y = agentsData[i*4 + 1];
            const state = agentsData[i*4 + 2];
            const angle = agentsData[i*4 + 3];

            mesh.position.set(x, y, 1.5);
            mesh.rotation.z = angle - Math.PI/2;
            
            // Color logic based on state
            if (state === 0) mesh.material.color.set(0x00ffff); // SeekPickup
            else if (state === 2) mesh.material.color.set(0xffff00); // SeekDelivery
            else mesh.material.color.set(0xff00ff);
        }

        renderer.render(scene, camera);
        
        // Stats
        document.getElementById('throughput').innerText = sim.get_delivered_count();
    }
    
    animate();
}
run();