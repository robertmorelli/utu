//! Foundry in Rust: the simulation, and a wasm-bindgen API for JavaScript.
pub mod sim;

use sim::{Game, Save, World};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Foundry {
    world: World,
}

#[wasm_bindgen]
impl Foundry {
    #[wasm_bindgen(constructor)]
    pub fn new(game: &str, save: &str) -> Result<Foundry, JsError> {
        let game: Game = serde_json::from_str(game)?;
        let save: Save = serde_json::from_str(save)?;
        Ok(Foundry { world: World::load(game, save) })
    }

    pub fn run(&mut self, ticks: u32) {
        for _ in 0..ticks {
            self.world.step();
        }
    }

    pub fn hash(&self) -> u32 {
        self.world.hash()
    }

    pub fn save(&self) -> Result<String, JsError> {
        Ok(serde_json::to_string(&self.world.save())?)
    }

    #[wasm_bindgen(js_name = entityCount)]
    pub fn entity_count(&self) -> usize {
        self.world.order.len()
    }
}
