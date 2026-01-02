/* tslint:disable */
/* eslint-disable */

export enum AgentState {
  SeekPickup = 0,
  Loading = 1,
  SeekDelivery = 2,
  Unloading = 3,
}

export class PhysarumField {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
}

export class Simulation {
  free(): void;
  [Symbol.dispose](): void;
  get_vein_ptr(): number;
  randomize_map(): void;
  resize_agents(count: number): void;
  set_diffusion(val: number): void;
  get_pickup_ptr(): number;
  get_agents_flat(out_vec: Float32Array): void;
  get_delivery_ptr(): number;
  get_obstacles_ptr(): number;
  get_repulsion_ptr(): number;
  get_delivered_count(): number;
  constructor(agent_count: number);
  update(): void;
  set_decay(val: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_physarumfield_free: (a: number, b: number) => void;
  readonly __wbg_simulation_free: (a: number, b: number) => void;
  readonly simulation_get_agents_flat: (a: number, b: number, c: number, d: any) => void;
  readonly simulation_get_delivered_count: (a: number) => number;
  readonly simulation_get_delivery_ptr: (a: number) => number;
  readonly simulation_get_obstacles_ptr: (a: number) => number;
  readonly simulation_get_pickup_ptr: (a: number) => number;
  readonly simulation_get_repulsion_ptr: (a: number) => number;
  readonly simulation_get_vein_ptr: (a: number) => number;
  readonly simulation_new: (a: number) => number;
  readonly simulation_randomize_map: (a: number) => void;
  readonly simulation_resize_agents: (a: number, b: number) => void;
  readonly simulation_set_decay: (a: number, b: number) => void;
  readonly simulation_set_diffusion: (a: number, b: number) => void;
  readonly simulation_update: (a: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
