# Project MYXOMYCETES: Dual-Runtime Swarm Logistics Engine

![Build Status](https://github.com/Funmatu/myxo-compute-rs/actions/workflows/deploy.yml/badge.svg)
![Rust](https://img.shields.io/badge/Language-Rust-orange.svg)
![WASM](https://img.shields.io/badge/Platform-WebAssembly-blue.svg)
![Python](https://img.shields.io/badge/Platform-Python-yellow.svg)

**Project MYXOMYCETES** (myxo-compute-rs) is a high-performance, agent-based simulation engine inspired by the biological transport networks of *Physarum polycephalum* (True Slime Mold). 

This project ports a legacy JavaScript-based simulation into a **Rust-based Dual-Runtime Architecture**, enabling:
1.  **Web**: 60fps+ visualization in the browser via WebAssembly (WASM).
2.  **Science**: Headless, accelerated simulation in Python for reinforcement learning and statistical analysis.

---

## 1. Theoretical Background

### 1.1. Biological Inspiration
Slime molds solve the "Steiner Tree Problem" and "Shortest Path Problem" without a central nervous system. They rely on emergent behavior driven by local interactions:
* **Chemotaxis:** Movement towards attractants (food sources).
* **Tube Reinforcement:** Successful paths (veins) thicken with flow.
* **Tube Degeneration:** Unused paths decay over time.

### 1.2. Algorithmic Implementation
This engine models the system using a hybrid Lagrangian-Eulerian approach:

* **Eulerian Grid (Environment):**
    * Uses Diffusion-Decay equations to propagate signals (Pickup, Delivery, Repulsion).
    * Solved via 5-point Laplacian stencil operations.
    * $\frac{\partial C}{\partial t} = D \nabla^2 C - \lambda C + Sources$
* **Lagrangian Agents (AGVs):**
    * Independent entities navigating the gradient fields.
    * **Sensory System:** 3-ray sensor (Front, Left, Right) to sample field potentials.
    * **Memory:** Agents deposit "Vein" markers upon successful delivery, modifying the environment for future agents.

---

## 2. Architecture & Performance

### 2.1. Dual-Runtime Strategy
The core logic resides in `src/lib.rs`. Through conditional compilation (Feature Flags), we target two environments:

| Feature | WASM Target (`--features wasm`) | Python Target (`--features python`) |
| :--- | :--- | :--- |
| **Interface** | `wasm-bindgen` | `PyO3` |
| **Memory** | Shared Linear Memory (Zero-Copy) | Python Heap / NumPy Interop |
| **Use Case** | Real-time Visualization, Demos | Batch Processing, ML Training |
| **Parallelism**| Single-Threaded (Simplicity) | Multi-Threaded (`Rayon`) capable |

### 2.2. Zero-Copy Visualization (WASM)
To achieve high frame rates with massive agent counts, we bypass the standard JS-WASM serialization overhead.
* **Direct Memory Access:** The JS frontend obtains raw pointers (`*const f32`) to the Rust vectors.
* **Texture Streaming:** These memory views are fed directly into WebGL textures (`THREE.DataTexture`), allowing the GPU to render the simulation state without CPU-side copying.

---

## 3. Installation & Usage

### A. Web Development (Visual)
Prerequisites: `rustup`, `wasm-pack`, `npm` (optional)

```bash
# 1. Build WASM package
wasm-pack build --target web --out-dir www/pkg --no-default-features --features wasm

# 2. Serve locally
cd www
python3 -m http.server 8000

```

Visit `http://localhost:8000` to see the swarm dynamics.

### B. Python Research (Headless)

Prerequisites: `maturin`

```bash
# 1. Install as a Python module (optimized)
maturin develop --release --features python

# 2. Run Benchmark
python -c "import nx_compute_rs; print(f'Delivered: {nx_compute_rs.run_simulation_bench(1000, 200)}')"

```

---

## 4. Source Code Structure

* `src/lib.rs`: The monolith core. Contains `PhysarumField` struct and `update()` loop.
* `www/index.js`: The "Glue" code. Orchestrates the render loop and manages WASM memory views.
* `www/index.html`: WebGL container and Shader (GLSL) definitions.
* `.github/workflows`: Automated deployment to GitHub Pages.

---

## 5. Future Roadmap

1. **WGPU Compute Shaders:** Move the Diffusion step entirely to the GPU using `wgpu`, freeing the CPU for millions of agents.
2. **RL Interface:** Expose the `Simulation` struct as a Gym Environment for training agents with Reinforcement Learning.
3. **3D Topology:** Extend the grid to 3D voxels for aerial swarm logistics.

---

*License: MIT | Copyright (c) 2026 Project MYXOMYCETES by Funmatu*
