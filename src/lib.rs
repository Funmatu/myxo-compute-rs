use std::f64::consts::PI;
use rand::prelude::*;

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

#[cfg(not(target_family = "wasm"))]
use rayon::prelude::*;

// ============================================================================
//  CONSTANTS & CONFIG
// ============================================================================
const GRID_SIZE: usize = 128;
const FIELD_SIZE: usize = GRID_SIZE * GRID_SIZE;

// ============================================================================
//  STRUCTS
// ============================================================================

/// 粘菌フィールドの状態を管理する構造体
#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub struct PhysarumField {
    // 外部から直接アクセスさせるため、pubにしておく（Getter経由のほうが安全だがWASM高速化のため）
    pickup: Vec<f32>,
    delivery: Vec<f32>,
    repulsion: Vec<f32>,
    vein: Vec<f32>,
    obstacles: Vec<f32>, // 0.0 or 1.0 (Texture用にf32で管理)
    
    // ダブルバッファリング用（内部計算用）
    next_p: Vec<f32>,
    next_d: Vec<f32>,
    next_r: Vec<f32>,

    width: usize,
    height: usize,
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
#[derive(Clone, Copy, PartialEq)]
pub enum AgentState {
    SeekPickup = 0,
    Loading = 1,
    SeekDelivery = 2,
    Unloading = 3,
}

#[derive(Clone)]
struct Agent {
    x: f64,
    y: f64,
    angle: f64,
    state: AgentState,
    timer: u32,
    history: Vec<(f64, f64)>, // 経路記憶用
    speed: f64,
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub struct Simulation {
    field: PhysarumField,
    agents: Vec<Agent>,
    delivered_count: u32,
}

// ============================================================================
//  IMPLEMENTATION
// ============================================================================

impl PhysarumField {
    fn new(w: usize, h: usize) -> Self {
        let size = w * h;
        let mut f = Self {
            pickup: vec![0.0; size],
            delivery: vec![0.0; size],
            repulsion: vec![0.0; size],
            vein: vec![0.0; size],
            obstacles: vec![0.0; size],
            next_p: vec![0.0; size],
            next_d: vec![0.0; size],
            next_r: vec![0.0; size],
            width: w,
            height: h,
        };
        f.randomize_obstacles();
        f
    }

    fn randomize_obstacles(&mut self) {
        let mut rng = rand::thread_rng();
        // Clear
        self.obstacles.fill(0.0);
        self.pickup.fill(0.0);
        self.delivery.fill(0.0);
        self.vein.fill(0.0);

        // 外周の壁
        for i in 0..self.width {
            self.obstacles[i] = 1.0;
            self.obstacles[(self.height - 1) * self.width + i] = 1.0;
        }
        for i in 0..self.height {
            self.obstacles[i * self.width] = 1.0;
            self.obstacles[i * self.width + (self.width - 1)] = 1.0;
        }

        // ランダムブロック
        let block_count = rng.gen_range(12..20);
        for _ in 0..block_count {
            let bx = rng.gen_range(20..(self.width - 40));
            let by = rng.gen_range(20..(self.height - 40));
            let bw = rng.gen_range(5..20);
            let bh = rng.gen_range(5..20);

            for y in by..(by + bh) {
                for x in bx..(bx + bw) {
                    if y < self.height && x < self.width {
                        self.obstacles[y * self.width + x] = 1.0;
                    }
                }
            }
        }
    }

    fn update_diffusion(&mut self) {
        let w = self.width;
        let h = self.height;
        let diff = 0.15;
        let decay = 0.05;
        let r_decay = 0.15;
        let v_decay = 0.003;

        // ソースの放出 (固定位置)
        // Pickup (Top Left)
        self.pickup[12 * w + 12] = 10.0;
        self.pickup[13 * w + 12] = 10.0;
        // Delivery (Bottom Right)
        self.delivery[(h - 12) * w + (w - 12)] = 10.0;
        self.delivery[(h - 13) * w + (w - 12)] = 10.0;

        // 並列処理 (NativeならRayon、WASMなら直列)
        // ここでは可読性とWASM互換性のため、イテレータベースで記述
        // ※ 本気の高速化なら par_iter_mut を使う
        
        for y in 1..h-1 {
            for x in 1..w-1 {
                let i = y * w + x;
                if self.obstacles[i] > 0.5 {
                    self.next_r[i] = 1.0; // 壁は反発
                    continue;
                }

                // 5点ラプラシアン
                let lap_p = self.pickup[i-1] + self.pickup[i+1] + self.pickup[i-w] + self.pickup[i+w] - 4.0 * self.pickup[i];
                let lap_d = self.delivery[i-1] + self.delivery[i+1] + self.delivery[i-w] + self.delivery[i+w] - 4.0 * self.delivery[i];
                let lap_r = self.repulsion[i-1] + self.repulsion[i+1] + self.repulsion[i-w] + self.repulsion[i+w] - 4.0 * self.repulsion[i];

                self.next_p[i] = (self.pickup[i] + diff * lap_p) * (1.0 - decay);
                self.next_d[i] = (self.delivery[i] + diff * lap_d) * (1.0 - decay);
                self.next_r[i] = (self.repulsion[i] + diff * lap_r) * (1.0 - r_decay);
                
                // Vein decay
                self.vein[i] *= 1.0 - v_decay;
            }
        }
        
        // バッファスワップ（コピー）
        self.pickup.copy_from_slice(&self.next_p);
        self.delivery.copy_from_slice(&self.next_d);
        self.repulsion.copy_from_slice(&self.next_r);
    }
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
impl Simulation {
    #[cfg_attr(feature = "wasm", wasm_bindgen(constructor))]
    pub fn new(agent_count: usize) -> Self {
        let mut sim = Self {
            field: PhysarumField::new(GRID_SIZE, GRID_SIZE),
            agents: Vec::with_capacity(agent_count),
            delivered_count: 0,
        };
        sim.resize_agents(agent_count);
        sim
    }

    pub fn resize_agents(&mut self, count: usize) {
        let mut rng = rand::thread_rng();
        if count > self.agents.len() {
            for id in self.agents.len()..count {
                self.agents.push(Agent {
                    x: rng.gen_range(10.0..30.0),
                    y: rng.gen_range(10.0..30.0),
                    angle: rng.gen::<f64>() * 2.0 * PI,
                    state: AgentState::SeekPickup,
                    timer: 0,
                    history: Vec::new(),
                    speed: 0.4 + rng.gen::<f64>() * 0.15,
                });
            }
        } else {
            self.agents.truncate(count);
        }
    }

    pub fn randomize_map(&mut self) {
        self.field.randomize_obstacles();
        self.delivered_count = 0;
    }

    pub fn update(&mut self) {
        // 1. Field Diffusion
        self.field.update_diffusion();

        // 2. Agent Updates
        // Rustの所有権ルールのため、Fieldへの参照とAgentの可変参照を分離する必要がある
        // ここではシンプルなループで処理
        let w = self.field.width;
        let h = self.field.height;
        let sensor_dist = 6.0;
        let sensor_angle = 0.6;

        for agent in &mut self.agents {
            if agent.timer > 0 {
                agent.timer -= 1;
                // 待機中も反発場を出す
                add_repulsion(&mut self.field.repulsion, w, h, agent.x, agent.y, 0.6);
                continue;
            }

            // 目標フィールドの決定
            let (target_field, is_pickup) = match agent.state {
                AgentState::SeekPickup => (&self.field.pickup, true),
                _ => (&self.field.delivery, false),
            };

            // センサー関数 (Closure capture)
            let sense = |ang: f64| -> f32 {
                let sx = (agent.x + ang.cos() * sensor_dist).floor() as isize;
                let sy = (agent.y + ang.sin() * sensor_dist).floor() as isize;
                
                if sx < 0 || sx >= w as isize || sy < 0 || sy >= h as isize {
                    return -1.0;
                }
                let idx = (sy as usize) * w + (sx as usize);
                if self.field.obstacles[idx] > 0.5 {
                    return -5.0;
                }
                // ポテンシャル + 過去の記憶(Vein) - 他者への回避(Repulsion)
                target_field[idx] + self.field.vein[idx] * 0.4 - self.field.repulsion[idx] * 3.0
            };

            let f_val = sense(agent.angle);
            let l_val = sense(agent.angle - sensor_angle);
            let r_val = sense(agent.angle + sensor_angle);

            // 操舵ロジック
            if f_val < l_val && f_val < r_val {
                let mut rng = rand::thread_rng();
                agent.angle += (rng.gen::<f64>() - 0.5) * 1.5;
            } else if l_val > r_val {
                agent.angle -= 0.12;
            } else if r_val > l_val {
                agent.angle += 0.12;
            }

            // 移動
            let next_x = agent.x + agent.angle.cos() * agent.speed;
            let next_y = agent.y + agent.angle.sin() * agent.speed;
            let ni = (next_y.floor() as usize) * w + (next_x.floor() as usize);

            if next_x > 0.0 && next_x < w as f64 && next_y > 0.0 && next_y < h as f64 && self.field.obstacles[ni] < 0.5 {
                agent.x = next_x;
                agent.y = next_y;
            } else {
                let mut rng = rand::thread_rng();
                agent.angle += PI * (0.4 + rng.gen::<f64>() * 0.2);
            }

            // エージェント自身の反発場
            add_repulsion(&mut self.field.repulsion, w, h, agent.x, agent.y, 0.4);

            // 状態遷移 & 履歴記録
            if matches!(agent.state, AgentState::SeekDelivery) {
                agent.history.push((agent.x, agent.y));
                if agent.history.len() > 300 {
                    agent.history.remove(0);
                }
            }

            let curr_idx = (agent.y.floor() as usize) * w + (agent.x.floor() as usize);
            match agent.state {
                AgentState::SeekPickup if self.field.pickup[curr_idx] > 2.5 => {
                    agent.state = AgentState::Loading;
                    agent.timer = 50;
                    agent.history.clear();
                },
                AgentState::Loading if agent.timer == 0 => {
                    agent.state = AgentState::SeekDelivery;
                },
                AgentState::SeekDelivery if self.field.delivery[curr_idx] > 2.5 => {
                    agent.state = AgentState::Unloading;
                    agent.timer = 50;
                    // Vein Reinforcement
                    for &(hx, hy) in &agent.history {
                        add_vein(&mut self.field.vein, w, h, hx, hy, 0.35);
                    }
                    self.delivered_count += 1;
                },
                AgentState::Unloading if agent.timer == 0 => {
                    agent.state = AgentState::SeekPickup;
                },
                _ => {}
            }
        }
    }

    // --- Data Accessors for JS/Python (Zero-Copy Pointers) ---
    
    pub fn get_pickup_ptr(&self) -> *const f32 { self.field.pickup.as_ptr() }
    pub fn get_delivery_ptr(&self) -> *const f32 { self.field.delivery.as_ptr() }
    pub fn get_repulsion_ptr(&self) -> *const f32 { self.field.repulsion.as_ptr() }
    pub fn get_vein_ptr(&self) -> *const f32 { self.field.vein.as_ptr() }
    pub fn get_obstacles_ptr(&self) -> *const f32 { self.field.obstacles.as_ptr() }
    
    // Agentデータは構造体配列なので、シリアライズするか、
    // 描画用にフラットなf32配列（x, y, state, angle...）を作って渡すのが一般的。
    // ここでは簡易的に「レンダリングに必要な情報」を詰めるメソッドを用意。
    pub fn get_agents_flat(&self, out_vec: &mut [f32]) {
        // format: [x, y, state(float), angle] per agent
        for (i, agent) in self.agents.iter().enumerate() {
            if i * 4 + 3 >= out_vec.len() { break; }
            out_vec[i*4 + 0] = agent.x as f32;
            out_vec[i*4 + 1] = agent.y as f32;
            out_vec[i*4 + 2] = agent.state as u32 as f32; // enum to float
            out_vec[i*4 + 3] = agent.angle as f32;
        }
    }
    
    pub fn get_delivered_count(&self) -> u32 { self.delivered_count }
}

// Helper Functions
fn add_repulsion(grid: &mut Vec<f32>, w: usize, h: usize, x: f64, y: f64, val: f32) {
    let gx = x.floor() as isize;
    let gy = y.floor() as isize;
    if gx >= 0 && gx < w as isize && gy >= 0 && gy < h as isize {
        grid[(gy as usize) * w + (gx as usize)] += val;
    }
}

fn add_vein(grid: &mut Vec<f32>, w: usize, h: usize, x: f64, y: f64, val: f32) {
    add_repulsion(grid, w, h, x, y, val); // 同じロジック
}

// -----------------------------------------------------------------------------
// Module: Python Interface (PyO3)
// -----------------------------------------------------------------------------
#[cfg(feature = "python")]
use pyo3::prelude::*;

#[cfg(feature = "python")]
#[pyfunction]
fn run_simulation_bench(steps: usize, agent_count: usize) -> PyResult<u32> {
    let mut sim = Simulation::new(agent_count);
    for _ in 0..steps {
        sim.update();
    }
    Ok(sim.get_delivered_count())
}

#[cfg(feature = "python")]
#[pymodule]
fn nx_compute_rs(_py: Python, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(run_simulation_bench, m)?)?;
    Ok(())
}