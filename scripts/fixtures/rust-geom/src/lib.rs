use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn greet(name: &str) -> String { format!("Hello, {name}!") }

#[wasm_bindgen]
pub fn parse_number(text: &str) -> Option<f64> { text.trim().parse().ok() }

#[wasm_bindgen]
pub fn mean(values: Vec<f64>) -> f64 {
    if values.is_empty() { 0.0 } else { values.iter().sum::<f64>() / values.len() as f64 }
}

#[wasm_bindgen]
pub fn each_step(count: u32, callback: &js_sys::Function) {
    for i in 0..count { let _ = callback.call1(&JsValue::NULL, &JsValue::from(i)); }
}

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub enum Shape { Circle = 0, Square = 1 }

#[wasm_bindgen]
pub struct Polygon { sides: u32, length: f64, label: String }

#[wasm_bindgen]
impl Polygon {
    #[wasm_bindgen(constructor)]
    pub fn new(sides: u32, length: f64) -> Polygon { Polygon { sides, length, label: String::from("polygon") } }
    #[wasm_bindgen(getter)]
    pub fn perimeter(&self) -> f64 { self.sides as f64 * self.length }
    #[wasm_bindgen(getter)]
    pub fn label(&self) -> String { self.label.clone() }
    #[wasm_bindgen(setter)]
    pub fn set_label(&mut self, label: String) { self.label = label; }
    pub fn scale(&mut self, factor: f64) -> f64 { self.length *= factor; self.perimeter() }
    pub fn kind(&self) -> Shape { if self.sides == 0 { Shape::Circle } else { Shape::Square } }
    pub fn vertices(&self) -> Vec<f64> { (0..self.sides).map(|i| i as f64).collect() }
}
