//! Foundry simulation in Rust: SPEC.md, tick for tick.

use serde::{Deserialize, Serialize};

pub const ITEMS: usize = 26;
const COAL: i32 = 2;
const RED: i32 = 17;
const U238: usize = 20;
const U235: usize = 21;
const WATER: i32 = 22;
const CRUDE: i32 = 23;
const ROCKET_PART: usize = 18;
const DX: [i32; 4] = [0, 1, 0, -1];
const DY: [i32; 4] = [-1, 0, 1, 0];

const BURNER_MINER: usize = 0;
const OFFSHORE_PUMP: usize = 2;
const STEEL_FURNACE: usize = 5;
const FILTER_INSERTER: usize = 23;
const STACK_INSERTER: usize = 24;

// ── game content ─────────────────────────────────────────────────────────────

#[derive(Deserialize, Clone)]
pub struct Item {
    pub name: String,
    pub label: String,
    pub fluid: bool,
    pub color: String,
}

#[derive(Deserialize, Clone)]
pub struct Recipe {
    pub name: String,
    pub category: String,
    pub time: i32,
    pub ingredients: Vec<[i32; 2]>,
    pub products: Vec<[i32; 2]>,
}

#[derive(Deserialize, Clone)]
pub struct Machine {
    pub name: String,
    pub label: String,
    pub class: String,
    pub speed: i32,
    pub power: i32,
    pub burner: bool,
    pub category: String,
    pub reach: i32,
}

#[derive(Deserialize, Clone)]
pub struct Tech {
    pub name: String,
    pub label: String,
    pub units: i32,
    pub time: i32,
    pub packs: [i32; 3],
    pub prereqs: Vec<usize>,
    pub machines: Vec<usize>,
    pub recipes: Vec<usize>,
}

#[derive(Deserialize, Clone)]
pub struct Start {
    pub machines: Vec<usize>,
    pub recipes: Vec<usize>,
}

#[derive(Deserialize, Clone)]
pub struct Game {
    pub items: Vec<Item>,
    pub recipes: Vec<Recipe>,
    pub machines: Vec<Machine>,
    pub techs: Vec<Tech>,
    pub start: Start,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Cls {
    Miner, Pump, Furnace, Assembler, Chemical, Refinery, Centrifuge,
    Belt, Splitter, Underground, Pipe, Inserter, Chest, Steam, Solar,
    Accumulator, Lab, Radar, Beacon, Combinator, Lamp, Silo,
}

impl Cls {
    fn from_name(name: &str) -> Cls {
        use Cls::*;
        match name {
            "miner" => Miner, "pump" => Pump, "furnace" => Furnace, "assembler" => Assembler,
            "chemical" => Chemical, "refinery" => Refinery, "centrifuge" => Centrifuge,
            "belt" => Belt, "splitter" => Splitter, "underground" => Underground, "pipe" => Pipe,
            "inserter" => Inserter, "chest" => Chest, "steam" => Steam, "solar" => Solar,
            "accumulator" => Accumulator, "lab" => Lab, "radar" => Radar, "beacon" => Beacon,
            "combinator" => Combinator, "lamp" => Lamp, "silo" => Silo,
            other => panic!("unknown machine class {other}"),
        }
    }
    pub fn is_crafter(self) -> bool {
        matches!(self, Cls::Furnace | Cls::Assembler | Cls::Chemical | Cls::Refinery | Cls::Centrifuge)
    }
    pub fn is_belt_like(self) -> bool {
        matches!(self, Cls::Belt | Cls::Splitter | Cls::Underground)
    }
    fn has_inventory(self) -> bool {
        self.is_crafter() || matches!(self, Cls::Chest | Cls::Lab | Cls::Silo)
    }
}

// ── entities and saves ───────────────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub id: i32,
    pub machine: usize,
    pub x: i32,
    pub y: i32,
    pub dir: i32,
    pub recipe: i32,
    pub progress: i32,
    pub busy: bool,
    pub fuel: i32,
    pub burn: i32,
    pub heat: i32,
    pub inv: Option<Vec<i32>>,
    pub out: Option<Vec<i32>>,
    pub belt: Option<Vec<i32>>,
    pub state: i32,
    pub timer: i32,
    pub hand: i32,
    pub held: i32,
    pub pick: i32,
    pub stack: i32,
    pub priority: i32,
    pub toggle: i32,
    pub role: i32,
    pub fluid: i32,
    pub amount: i32,
    pub charge: i32,
    pub cond_item: i32,
    pub cond_op: i32,
    pub cond_value: i32,
    pub signal: bool,
    pub crafts: i32,
    pub moved: i32,
    #[serde(skip, default = "default_cls")]
    pub cls: Cls,
}

fn default_cls() -> Cls {
    Cls::Miner
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ResearchSave {
    pub current: i32,
    pub progress: i32,
    pub done: Vec<usize>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Save {
    pub version: i32,
    pub tick: i32,
    pub width: i32,
    pub height: i32,
    pub next_id: i32,
    pub terrain: String,
    pub resources: Vec<[i32; 4]>,
    pub revealed: String,
    pub research: ResearchSave,
    pub entities: Vec<Entity>,
}

pub enum Command {
    Place { machine: usize, x: i32, y: i32, dir: i32 },
    Remove { x: i32, y: i32 },
    Rotate { x: i32, y: i32 },
    Launch { x: i32, y: i32 },
    Recipe { x: i32, y: i32, value: i32 },
    Filter { x: i32, y: i32, value: i32 },
    Priority { x: i32, y: i32, value: i32 },
    Stack { x: i32, y: i32, value: i32 },
    Role { x: i32, y: i32, value: i32 },
    Condition { x: i32, y: i32, item: i32, op: i32, value: i32 },
    Research { tech: usize },
}

// ── the world ────────────────────────────────────────────────────────────────

pub struct World {
    pub game: Game,
    pub width: i32,
    pub height: i32,
    pub tick: i32,
    pub next_id: i32,
    pub satisfaction: i32,
    pub light: i32,
    pub demand: i32,
    pub supply: i32,
    pub water: Vec<bool>,
    pub res_kind: Vec<i32>,
    pub res_amount: Vec<i32>,
    pub revealed: Vec<bool>,
    pub chunks_x: i32,
    pub chunks_y: i32,
    /// Entity id on each tile, 0 for none.
    pub grid: Vec<i32>,
    /// Entities indexed by id.
    pub slots: Vec<Option<Entity>>,
    /// Ids in id order: all entities, per class, and the multi-class groups.
    pub order: Vec<i32>,
    pub by_class: Vec<Vec<i32>>,
    pub crafters: Vec<i32>,
    pub belts: Vec<i32>,
    pub fluid_machines: Vec<i32>,
    pub research_current: i32,
    pub research_progress: i32,
    pub done: Vec<bool>,
    pub machine_unlocked: Vec<bool>,
    pub recipe_unlocked: Vec<bool>,
    pub produced: Vec<f64>,
    pub commands: Vec<Command>,
    classes: Vec<Cls>,
    smelts: Vec<i32>,
}

impl World {
    pub fn new(game: Game, width: i32, height: i32) -> World {
        let tiles = (width * height) as usize;
        let chunks_x = (width + 7) / 8;
        let chunks_y = (height + 7) / 8;
        let classes: Vec<Cls> = game.machines.iter().map(|m| Cls::from_name(&m.class)).collect();
        let mut smelts = vec![-1; ITEMS];
        for (r, recipe) in game.recipes.iter().enumerate() {
            if recipe.category == "smelting" && recipe.ingredients.len() == 1 {
                let item = recipe.ingredients[0][0] as usize;
                if smelts[item] < 0 {
                    smelts[item] = r as i32;
                }
            }
        }
        let mut machine_unlocked = vec![false; game.machines.len()];
        let mut recipe_unlocked = vec![false; game.recipes.len()];
        for &m in &game.start.machines { machine_unlocked[m] = true; }
        for &r in &game.start.recipes { recipe_unlocked[r] = true; }
        World {
            width, height, tick: 0, next_id: 1, satisfaction: 1000, light: 0, demand: 0, supply: 0,
            water: vec![false; tiles], res_kind: vec![-1; tiles], res_amount: vec![0; tiles],
            revealed: vec![false; (chunks_x * chunks_y) as usize], chunks_x, chunks_y,
            grid: vec![0; tiles], slots: vec![None], order: Vec::new(), by_class: vec![Vec::new(); 22],
            crafters: Vec::new(), belts: Vec::new(), fluid_machines: Vec::new(),
            research_current: -1, research_progress: 0, done: vec![false; game.techs.len()],
            machine_unlocked, recipe_unlocked, produced: vec![0.0; ITEMS], commands: Vec::new(),
            classes, smelts, game,
        }
    }

    pub fn new_entity(&self, id: i32, machine: usize, x: i32, y: i32, dir: i32) -> Entity {
        let cls = self.classes[machine];
        Entity {
            id, machine, x, y, dir, recipe: -1, progress: 0, busy: false, fuel: 0, burn: 0,
            heat: if machine == STEEL_FURNACE { 20 } else { 0 },
            inv: cls.has_inventory().then(|| vec![0; ITEMS]),
            out: cls.is_crafter().then(|| vec![0; ITEMS]),
            belt: cls.is_belt_like().then(Vec::new),
            state: 0, timer: 0, hand: -1, held: 0, pick: -1,
            stack: if machine == STACK_INSERTER { 4 } else { 1 },
            priority: 0, toggle: 0, role: 0, fluid: -1, amount: 0, charge: 0,
            cond_item: 0, cond_op: 0, cond_value: 0, signal: false, crafts: 0, moved: 0, cls,
        }
    }

    // ── queries ──────────────────────────────────────────────────────────────

    pub fn inside(&self, x: i32, y: i32) -> bool {
        x >= 0 && y >= 0 && x < self.width && y < self.height
    }

    pub fn id_at(&self, x: i32, y: i32) -> i32 {
        if self.inside(x, y) { self.grid[(y * self.width + x) as usize] } else { 0 }
    }

    pub fn get(&self, id: i32) -> &Entity {
        self.slots[id as usize].as_ref().expect("entity")
    }

    fn get_mut(&mut self, id: i32) -> &mut Entity {
        self.slots[id as usize].as_mut().expect("entity")
    }

    pub fn entity_at(&self, x: i32, y: i32) -> Option<&Entity> {
        let id = self.id_at(x, y);
        if id == 0 { None } else { Some(self.get(id)) }
    }

    fn front_id(&self, id: i32, distance: i32) -> i32 {
        let e = self.get(id);
        self.id_at(e.x + DX[e.dir as usize] * distance, e.y + DY[e.dir as usize] * distance)
    }

    fn back_id(&self, id: i32, distance: i32) -> i32 {
        let e = self.get(id);
        self.id_at(e.x - DX[e.dir as usize] * distance, e.y - DY[e.dir as usize] * distance)
    }

    fn neighbor_ids(&self, id: i32) -> [i32; 4] {
        let e = self.get(id);
        [self.id_at(e.x, e.y - 1), self.id_at(e.x + 1, e.y), self.id_at(e.x, e.y + 1), self.id_at(e.x - 1, e.y)]
    }

    fn is_ore(&self, tile: usize) -> bool {
        self.res_kind[tile] >= 0 && !self.game.items[self.res_kind[tile] as usize].fluid && self.res_amount[tile] > 0
    }

    // ── placing ──────────────────────────────────────────────────────────────

    pub fn can_place(&self, machine: usize, x: i32, y: i32, dir: i32) -> bool {
        if !self.inside(x, y) || !self.revealed[((y >> 3) * self.chunks_x + (x >> 3)) as usize] { return false; }
        let tile = (y * self.width + x) as usize;
        if self.water[tile] || self.grid[tile] != 0 || !self.machine_unlocked[machine] { return false; }
        match self.game.machines[machine].name.as_str() {
            "burner-miner" => self.is_ore(tile),
            "electric-miner" => (-1..=1).any(|oy| (-1..=1).any(|ox| self.inside(x + ox, y + oy) && self.is_ore(((y + oy) * self.width + x + ox) as usize))),
            "pumpjack" => self.res_kind[tile] == CRUDE,
            "offshore-pump" => {
                let (fx, fy) = (x + DX[dir as usize], y + DY[dir as usize]);
                self.inside(fx, fy) && self.water[(fy * self.width + fx) as usize]
            }
            _ => true,
        }
    }

    pub fn place(&mut self, machine: usize, x: i32, y: i32, dir: i32) -> i32 {
        let id = self.next_id;
        self.next_id += 1;
        let e = self.new_entity(id, machine, x, y, dir);
        self.add(e);
        id
    }

    pub fn add(&mut self, e: Entity) {
        let id = e.id;
        let cls = e.cls;
        self.grid[(e.y * self.width + e.x) as usize] = id;
        if self.slots.len() <= id as usize { self.slots.resize_with(id as usize + 1, || None); }
        self.slots[id as usize] = Some(e);
        // Ids only grow, so pushing keeps every list in id order.
        self.order.push(id);
        self.by_class[cls as usize].push(id);
        if cls.is_crafter() { self.crafters.push(id); }
        if cls.is_belt_like() { self.belts.push(id); }
        if matches!(cls, Cls::Chemical | Cls::Refinery | Cls::Steam) { self.fluid_machines.push(id); }
    }

    pub fn remove(&mut self, id: i32) {
        let e = self.slots[id as usize].take().expect("entity");
        self.grid[(e.y * self.width + e.x) as usize] = 0;
        for list in [&mut self.order, &mut self.by_class[e.cls as usize], &mut self.crafters, &mut self.belts, &mut self.fluid_machines] {
            list.retain(|&other| other != id);
        }
    }

    // ── commands ─────────────────────────────────────────────────────────────

    pub fn apply(&mut self, command: Command) {
        let at = |w: &World, x: i32, y: i32| w.id_at(x, y);
        match command {
            Command::Research { tech } => {
                if tech < self.game.techs.len() && !self.done[tech] && self.game.techs[tech].prereqs.iter().all(|&p| self.done[p]) {
                    self.research_current = tech as i32;
                    self.research_progress = 0;
                }
            }
            Command::Place { machine, x, y, dir } => {
                if self.can_place(machine, x, y, dir) { self.place(machine, x, y, dir); }
            }
            Command::Remove { x, y } => { let id = at(self, x, y); if id != 0 { self.remove(id); } }
            Command::Rotate { x, y } => { let id = at(self, x, y); if id != 0 { let e = self.get_mut(id); e.dir = (e.dir + 1) % 4; } }
            Command::Launch { x, y } => {
                let id = at(self, x, y);
                if id != 0 { let e = self.get_mut(id); if e.cls == Cls::Silo && e.held == 20 { e.held = 0; e.crafts += 1; } }
            }
            Command::Recipe { x, y, value } => {
                let id = at(self, x, y);
                if id != 0 && self.recipe_allowed(id, value) { let e = self.get_mut(id); e.recipe = value; e.busy = false; e.progress = 0; }
            }
            Command::Filter { x, y, value } => { let id = at(self, x, y); if id != 0 { self.get_mut(id).pick = value; } }
            Command::Priority { x, y, value } => { let id = at(self, x, y); if id != 0 { self.get_mut(id).priority = value; } }
            Command::Stack { x, y, value } => { let id = at(self, x, y); if id != 0 { self.get_mut(id).stack = value.clamp(1, 4); } }
            Command::Role { x, y, value } => { let id = at(self, x, y); if id != 0 { self.get_mut(id).role = value; } }
            Command::Condition { x, y, item, op, value } => {
                let id = at(self, x, y);
                if id != 0 { let e = self.get_mut(id); e.cond_item = item; e.cond_op = op; e.cond_value = value; }
            }
        }
    }

    pub fn recipe_allowed(&self, id: i32, r: i32) -> bool {
        if r < 0 || r as usize >= self.game.recipes.len() || !self.recipe_unlocked[r as usize] { return false; }
        let e = self.get(id);
        let recipe = &self.game.recipes[r as usize];
        let category = match e.cls {
            Cls::Assembler => "crafting",
            Cls::Chemical => "chemistry",
            Cls::Refinery => "refining",
            Cls::Centrifuge => "centrifuge",
            _ => return false,
        };
        recipe.category == category && (self.game.machines[e.machine].name != "assembler-1" || recipe.ingredients.len() <= 2)
    }

    // ── inserting ────────────────────────────────────────────────────────────

    /// How many of `n` `item` the entity takes; with `commit`, take them.
    fn insert(&mut self, id: i32, item: i32, n: i32, commit: bool) -> i32 {
        if n <= 0 { return 0; }
        let research_current = self.research_current;
        let research_open = research_current >= 0 && !self.done[research_current as usize];
        let speed = self.game.machines[self.get(id).machine].speed;
        let burner = self.game.machines[self.get(id).machine].burner;
        let smelt = self.smelts[item as usize];
        let packs = if research_open { self.game.techs[research_current as usize].packs } else { [0; 3] };
        let recipes = &self.game.recipes;
        let e = self.slots[id as usize].as_mut().expect("entity");
        let c = e.cls;
        if c.is_belt_like() {
            let belt = e.belt.as_mut().unwrap();
            if !belt.is_empty() && belt[belt.len() - 1] < 64 { return 0; }
            if commit { belt.push(item); belt.push(0); }
            return 1;
        }
        match c {
            Cls::Chest => {
                let inv = e.inv.as_mut().unwrap();
                let used: i32 = inv.iter().map(|&count| (count + 49) / 50).sum();
                let partial = inv[item as usize] % 50;
                let room = (speed - used) * 50 + if partial > 0 { 50 - partial } else { 0 };
                let taken = n.min(room).max(0);
                if commit { inv[item as usize] += taken; }
                taken
            }
            _ if c.is_crafter() => {
                let inv = e.inv.as_mut().unwrap();
                let mut recipe = e.recipe;
                if recipe < 0 && c == Cls::Furnace && inv.iter().all(|&v| v == 0) { recipe = smelt; }
                if recipe >= 0 {
                    if let Some(ingredient) = recipes[recipe as usize].ingredients.iter().find(|[i, _]| *i == item) {
                        let taken = n.min(2 * ingredient[1] - inv[item as usize]).max(0);
                        if commit && taken > 0 {
                            inv[item as usize] += taken;
                            e.recipe = recipe;
                        }
                        return taken;
                    }
                }
                if burner && item == COAL { return fuel_up(e, n, commit); }
                0
            }
            Cls::Lab => {
                if !research_open || !(RED..=RED + 2).contains(&item) || packs[(item - RED) as usize] == 0 { return 0; }
                let inv = e.inv.as_mut().unwrap();
                let taken = n.min(4 - inv[item as usize]).max(0);
                if commit { inv[item as usize] += taken; }
                taken
            }
            Cls::Silo => {
                let Some(ingredient) = recipes[ROCKET_PART].ingredients.iter().find(|[i, _]| *i == item) else { return 0 };
                let inv = e.inv.as_mut().unwrap();
                let taken = n.min(2 * ingredient[1] - inv[item as usize]).max(0);
                if commit { inv[item as usize] += taken; }
                taken
            }
            _ if (c == Cls::Steam || e.machine == BURNER_MINER) && item == COAL => fuel_up(e, n, commit),
            _ => 0,
        }
    }

    fn push_fluid(&mut self, amount: i32, fluid: i32, target: i32) -> i32 {
        let capacity = self.game.machines[self.get(target).machine].speed;
        let t = self.get_mut(target);
        if t.cls != Cls::Pipe || (t.fluid != fluid && t.fluid != -1) || amount <= 0 { return 0; }
        let moved = amount.min(capacity - t.amount);
        if moved <= 0 { return 0; }
        t.amount += moved;
        t.fluid = fluid;
        moved
    }

    // ── the tick ─────────────────────────────────────────────────────────────

    pub fn step(&mut self) {
        for command in std::mem::take(&mut self.commands) { self.apply(command); }
        self.power();
        self.signals();
        self.fluids();
        for i in 0..self.by_class[Cls::Miner as usize].len() { let id = self.by_class[Cls::Miner as usize][i]; self.mine(id); }
        for i in 0..self.crafters.len() { let id = self.crafters[i]; self.craft(id); }
        for i in 0..self.by_class[Cls::Lab as usize].len() { let id = self.by_class[Cls::Lab as usize][i]; self.lab(id); }
        for i in 0..self.by_class[Cls::Silo as usize].len() { let id = self.by_class[Cls::Silo as usize][i]; self.silo(id); }
        for i in 0..self.by_class[Cls::Radar as usize].len() { let id = self.by_class[Cls::Radar as usize][i]; self.radar(id); }
        for i in 0..self.by_class[Cls::Inserter as usize].len() { let id = self.by_class[Cls::Inserter as usize][i]; self.swing(id); }
        for i in 0..self.belts.len() { let id = self.belts[i]; self.move_belt(id); }
        self.tick += 1;
    }

    fn power(&mut self) {
        let p = self.tick % 25200;
        self.light = if p < 2520 { p * 1000 / 2520 } else if p < 12600 { 1000 } else if p < 15120 { (15120 - p) * 1000 / 2520 } else { 0 };
        let mut demand = 0;
        for &id in &self.order {
            let e = self.slots[id as usize].as_ref().unwrap();
            if e.busy || e.cls == Cls::Radar || e.cls == Cls::Beacon { demand += self.game.machines[e.machine].power; }
        }
        let mut supply = 0;
        for i in 0..self.by_class[Cls::Steam as usize].len() {
            let id = self.by_class[Cls::Steam as usize][i];
            let e = self.get_mut(id);
            if demand > 0 && e.amount >= 1 && (e.burn > 0 || e.fuel > 0) {
                if e.burn == 0 { e.fuel -= 1; e.burn = 900; }
                e.burn -= 1;
                e.amount -= 1;
                supply += 900;
                e.busy = true;
            } else {
                e.busy = false;
            }
        }
        supply += self.by_class[Cls::Solar as usize].len() as i32 * (60 * self.light / 1000);
        let accumulators = self.by_class[Cls::Accumulator as usize].clone();
        if supply > demand {
            let mut excess = supply - demand;
            for id in accumulators {
                let e = self.get_mut(id);
                let c = 300.min(5000 - e.charge).min(excess);
                e.charge += c;
                excess -= c;
            }
        } else if supply < demand {
            let mut deficit = demand - supply;
            for id in accumulators {
                let e = self.get_mut(id);
                let d = 300.min(e.charge).min(deficit);
                e.charge -= d;
                deficit -= d;
                supply += d;
            }
        }
        self.demand = demand;
        self.supply = supply;
        self.satisfaction = if demand == 0 { 1000 } else { 1000.min(supply * 1000 / demand) };
    }

    fn signals(&mut self) {
        for i in 0..self.by_class[Cls::Combinator as usize].len() {
            let id = self.by_class[Cls::Combinator as usize][i];
            let source = self.back_id(id, 1);
            let (item, op, value) = { let e = self.get(id); (e.cond_item, e.cond_op, e.cond_value) };
            let count = if source == 0 {
                0
            } else {
                let s = self.get(source);
                if let Some(inv) = &s.inv { inv[item as usize] }
                else if let Some(belt) = &s.belt { belt.chunks(2).filter(|pair| pair[0] == item).count() as i32 }
                else { 0 }
            };
            self.get_mut(id).signal = match op { 0 => count > value, 1 => count < value, _ => count == value };
        }
        for i in 0..self.by_class[Cls::Lamp as usize].len() {
            let id = self.by_class[Cls::Lamp as usize][i];
            let lit = self.neighbor_ids(id).iter().any(|&n| n != 0 && { let e = self.get(n); e.cls == Cls::Combinator && e.signal });
            self.get_mut(id).signal = lit;
        }
    }

    fn fluids(&mut self) {
        for i in 0..self.by_class[Cls::Pump as usize].len() {
            let id = self.by_class[Cls::Pump as usize][i];
            let (machine, x, y, dir) = { let e = self.get(id); (e.machine, e.x, e.y, e.dir) };
            if machine == OFFSHORE_PUMP {
                let (fx, fy) = (x + DX[dir as usize], y + DY[dir as usize]);
                let target = self.back_id(id, 1);
                let mut pushed = 0;
                if self.inside(fx, fy) && self.water[(fy * self.width + fx) as usize] && target != 0 {
                    pushed = self.push_fluid(10, WATER, target);
                }
                self.get_mut(id).busy = pushed > 0;
                self.produced[WATER as usize] += pushed as f64;
                continue;
            }
            let tile = (y * self.width + x) as usize;
            let satisfaction = self.satisfaction;
            if self.res_kind[tile] == CRUDE {
                let output = (self.res_amount[tile] / 100).clamp(100, 1000);
                let rate = output * satisfaction / 1000;
                let e = self.slots[id as usize].as_mut().unwrap();
                if e.amount < 100 && rate > 0 {
                    e.progress += rate;
                    e.busy = true;
                    if e.progress >= 6000 {
                        e.progress -= 6000;
                        e.amount += 1;
                        self.produced[CRUDE as usize] += 1.0;
                        if self.res_amount[tile] > 0 { self.res_amount[tile] -= 1; }
                    }
                } else {
                    e.busy = false;
                }
            } else {
                self.get_mut(id).busy = false;
            }
            let target = self.front_id(id, 1);
            if target != 0 {
                let amount = self.get(id).amount;
                let moved = self.push_fluid(amount, CRUDE, target);
                self.get_mut(id).amount -= moved;
            }
        }
        for i in 0..self.by_class[Cls::Pipe as usize].len() {
            let a = self.by_class[Cls::Pipe as usize][i];
            for b in self.neighbor_ids(a) {
                if b == 0 || b <= a || self.get(b).cls != Cls::Pipe { continue; }
                let (fa, fb) = (self.get(a).fluid, self.get(b).fluid);
                if fa >= 0 && fb >= 0 && fa != fb { continue; }
                let f = if fa >= 0 { fa } else { fb };
                if f < 0 { continue; }
                let cap_a = self.game.machines[self.get(a).machine].speed;
                let cap_b = self.game.machines[self.get(b).machine].speed;
                let total = self.get(a).amount + self.get(b).amount;
                let new_a = total * cap_a / (cap_a + cap_b);
                { let e = self.get_mut(a); e.amount = new_a; e.fluid = if new_a > 0 { f } else { -1 }; }
                { let e = self.get_mut(b); e.amount = total - new_a; e.fluid = if total - new_a > 0 { f } else { -1 }; }
            }
        }
        for i in 0..self.fluid_machines.len() {
            let id = self.fluid_machines[i];
            let neighbors = self.neighbor_ids(id);
            if self.get(id).cls == Cls::Steam {
                for n in neighbors {
                    if n == 0 { continue; }
                    let have = self.get(id).amount;
                    let e = self.get_mut(n);
                    if e.cls != Cls::Pipe || e.fluid != WATER { continue; }
                    let take = e.amount.min(100 - have);
                    if take <= 0 { continue; }
                    e.amount -= take;
                    if e.amount == 0 { e.fluid = -1; }
                    self.get_mut(id).amount += take;
                }
                continue;
            }
            let recipe = self.get(id).recipe;
            if recipe < 0 { continue; }
            let ingredients = self.game.recipes[recipe as usize].ingredients.clone();
            let products = self.game.recipes[recipe as usize].products.clone();
            for [f, need] in ingredients {
                if !self.game.items[f as usize].fluid { continue; }
                for n in neighbors {
                    if n == 0 { continue; }
                    let have = self.get(id).inv.as_ref().unwrap()[f as usize];
                    let e = self.get_mut(n);
                    if e.cls != Cls::Pipe || e.fluid != f { continue; }
                    let take = e.amount.min(2 * need - have);
                    if take <= 0 { continue; }
                    e.amount -= take;
                    if e.amount == 0 { e.fluid = -1; }
                    self.get_mut(id).inv.as_mut().unwrap()[f as usize] += take;
                }
            }
            for [f, _] in products {
                if !self.game.items[f as usize].fluid { continue; }
                for n in neighbors {
                    if n == 0 { continue; }
                    let amount = self.get(id).out.as_ref().unwrap()[f as usize];
                    let moved = self.push_fluid(amount, f, n);
                    self.get_mut(id).out.as_mut().unwrap()[f as usize] -= moved;
                }
            }
        }
    }

    fn mining_tile(&self, id: i32) -> i32 {
        let e = self.get(id);
        let ok = |t: usize| self.is_ore(t) && (e.held == 0 || self.res_kind[t] == e.hand);
        if e.machine == BURNER_MINER {
            let t = (e.y * self.width + e.x) as usize;
            return if ok(t) { t as i32 } else { -1 };
        }
        for oy in -1..=1 {
            for ox in -1..=1 {
                if !self.inside(e.x + ox, e.y + oy) { continue; }
                let t = ((e.y + oy) * self.width + e.x + ox) as usize;
                if ok(t) { return t as i32; }
            }
        }
        -1
    }

    fn mine(&mut self, id: i32) {
        let tile = self.mining_tile(id);
        let machine = self.get(id).machine;
        let speed = self.game.machines[machine].speed;
        let burner = self.game.machines[machine].burner;
        let satisfaction = self.satisfaction;
        let held = self.get(id).held;
        if tile >= 0 && held < 5 {
            let tile = tile as usize;
            let e = self.slots[id as usize].as_mut().unwrap();
            let mut rate = 0;
            if burner {
                if e.burn == 0 && e.fuel > 0 { e.fuel -= 1; e.burn = 3600; }
                if e.burn > 0 { rate = speed; e.burn -= 1; }
            } else {
                rate = speed * satisfaction / 1000;
            }
            e.progress += rate;
            e.busy = rate > 0;
            if e.progress >= 60000 {
                e.progress = 0;
                e.hand = self.res_kind[tile];
                e.held += 1;
                self.produced[e.hand as usize] += 1.0;
                self.res_amount[tile] -= 1;
                if self.res_amount[tile] == 0 { self.res_kind[tile] = -1; }
            }
        } else {
            self.get_mut(id).busy = false;
        }
        if self.get(id).held > 0 {
            let target = self.front_id(id, 1);
            let hand = self.get(id).hand;
            if target != 0 && self.insert(target, hand, 1, true) == 1 {
                let e = self.get_mut(id);
                e.held -= 1;
                if e.held == 0 { e.hand = -1; }
            }
        }
    }

    fn beacons(&self, id: i32) -> i32 {
        let e = self.get(id);
        let mut count = 0;
        for oy in -2..=2 {
            for ox in -2..=2 {
                let b = self.id_at(e.x + ox, e.y + oy);
                if b != 0 && self.get(b).cls == Cls::Beacon { count += 1; }
            }
        }
        count
    }

    fn craft(&mut self, id: i32) {
        let satisfaction = self.satisfaction;
        let bonus = if self.get(id).busy || self.get(id).recipe >= 0 { 250 * self.beacons(id) * satisfaction / 1000 } else { 0 };
        let machine = &self.game.machines[self.get(id).machine];
        let (speed, burner, steel) = (machine.speed, machine.burner, self.get(id).machine == STEEL_FURNACE);
        let recipes = &self.game.recipes;
        let produced = &mut self.produced;
        let e = self.slots[id as usize].as_mut().unwrap();
        let inv = e.inv.as_mut().unwrap();
        let out = e.out.as_mut().unwrap();
        if !e.busy && e.recipe >= 0 {
            let recipe = &recipes[e.recipe as usize];
            let ready = recipe.ingredients.iter().all(|[i, n]| inv[*i as usize] >= *n)
                && recipe.products.iter().all(|[p, n]| out[*p as usize] <= *n)
                && (e.cls != Cls::Centrifuge || (out[U238] <= 1 && out[U235] <= 1));
            if ready {
                for [i, n] in &recipe.ingredients { inv[*i as usize] -= n; }
                e.busy = true;
                e.progress = 0;
            }
        }
        if e.busy {
            let mut rate = 0;
            if burner {
                if e.burn == 0 && e.fuel > 0 { e.fuel -= 1; e.burn = 3600; }
                if e.burn > 0 { e.burn -= 1; rate = speed + bonus; }
            } else {
                rate = (speed + bonus) * satisfaction / 1000;
            }
            e.progress += rate;
            let recipe = &recipes[e.recipe as usize];
            if e.progress >= recipe.time * 1000 {
                if e.cls == Cls::Centrifuge {
                    let product = if e.crafts % 7 == 6 { U235 } else { U238 };
                    out[product] += 1;
                    produced[product] += 1.0;
                } else {
                    for [p, n] in &recipe.products {
                        out[*p as usize] += n;
                        produced[*p as usize] += *n as f64;
                    }
                }
                e.crafts += 1;
                e.busy = false;
                e.progress = 0;
            }
        }
        if e.cls == Cls::Furnace && !e.busy && inv.iter().all(|&v| v == 0) && out.iter().all(|&v| v == 0) { e.recipe = -1; }
        if steel { e.heat = if e.busy { (e.heat + 3).min(1500) } else { (e.heat - 1).max(20) }; }
    }

    fn lab(&mut self, id: i32) {
        let r = self.research_current;
        if r < 0 || self.done[r as usize] {
            let e = self.get_mut(id);
            e.busy = false;
            e.progress = 0;
            return;
        }
        let (packs, time, units) = { let t = &self.game.techs[r as usize]; (t.packs, t.time, t.units) };
        let satisfaction = self.satisfaction;
        let e = self.slots[id as usize].as_mut().unwrap();
        let inv = e.inv.as_mut().unwrap();
        let red = RED as usize;
        if !e.busy && inv[red] >= packs[0] && inv[red + 1] >= packs[1] && inv[red + 2] >= packs[2] {
            for k in 0..3 { inv[red + k] -= packs[k]; }
            e.busy = true;
            e.progress = 0;
        }
        if e.busy {
            e.progress += satisfaction;
            if e.progress >= time * 1000 {
                e.busy = false;
                e.progress = 0;
                self.research_progress += 1;
                if self.research_progress >= units { self.complete(r as usize); }
            }
        }
    }

    pub fn complete(&mut self, r: usize) {
        self.done[r] = true;
        for &m in &self.game.techs[r].machines { self.machine_unlocked[m] = true; }
        for &recipe in &self.game.techs[r].recipes { self.recipe_unlocked[recipe] = true; }
        self.research_current = -1;
        self.research_progress = 0;
    }

    fn silo(&mut self, id: i32) {
        let speed = self.game.machines[self.get(id).machine].speed;
        let satisfaction = self.satisfaction;
        let recipe = &self.game.recipes[ROCKET_PART];
        let e = self.slots[id as usize].as_mut().unwrap();
        if e.held >= 20 { e.busy = false; return; }
        let inv = e.inv.as_mut().unwrap();
        if !e.busy && recipe.ingredients.iter().all(|[i, n]| inv[*i as usize] >= *n) {
            for [i, n] in &recipe.ingredients { inv[*i as usize] -= n; }
            e.busy = true;
            e.progress = 0;
        }
        if e.busy {
            e.progress += speed * satisfaction / 1000;
            if e.progress >= recipe.time * 1000 {
                e.held += 1;
                e.busy = false;
                e.progress = 0;
            }
        }
    }

    fn radar(&mut self, id: i32) {
        let satisfaction = self.satisfaction;
        let (x, y) = {
            let e = self.get_mut(id);
            e.busy = true;
            e.progress += satisfaction;
            if e.progress < 300000 { return; }
            e.progress = 0;
            (e.x, e.y)
        };
        let (cx, cy) = (x >> 3, y >> 3);
        for r in 0..=3i32 {
            for oy in -r..=r {
                for ox in -r..=r {
                    if ox.abs().max(oy.abs()) != r { continue; }
                    let (x, y) = (cx + ox, cy + oy);
                    if x < 0 || y < 0 || x >= self.chunks_x || y >= self.chunks_y { continue; }
                    let chunk = (y * self.chunks_x + x) as usize;
                    if !self.revealed[chunk] {
                        self.revealed[chunk] = true;
                        self.get_mut(id).crafts += 1;
                        return;
                    }
                }
            }
        }
    }

    fn disabled(&self, id: i32) -> bool {
        self.neighbor_ids(id).iter().any(|&n| n != 0 && { let e = self.get(n); e.cls == Cls::Combinator && !e.signal })
    }

    fn swing(&mut self, id: i32) {
        let machine = self.get(id).machine;
        let reach = self.game.machines[machine].reach;
        let time = self.game.machines[machine].speed;
        match self.get(id).state {
            0 => {
                if self.disabled(id) { return; }
                let (source, target) = (self.back_id(id, reach), self.front_id(id, reach));
                if source == 0 || target == 0 { return; }
                if let Some((item, n)) = self.choose(id, source, target) {
                    self.take_from(source, item, n);
                    let e = self.get_mut(id);
                    e.hand = item;
                    e.held = n;
                    e.state = 1;
                    e.timer = time;
                }
            }
            1 => {
                if self.get(id).timer > 0 { self.get_mut(id).timer -= 1; }
                if self.get(id).timer == 0 {
                    let target = self.front_id(id, reach);
                    let (hand, held) = { let e = self.get(id); (e.hand, e.held) };
                    let accepted = if target != 0 { self.insert(target, hand, held, true) } else { 0 };
                    let e = self.get_mut(id);
                    e.held -= accepted;
                    e.moved += accepted;
                    if e.held == 0 {
                        e.hand = -1;
                        e.state = 2;
                        e.timer = time;
                    }
                }
            }
            _ => {
                let e = self.get_mut(id);
                e.timer -= 1;
                if e.timer == 0 { e.state = 0; }
            }
        }
    }

    /// The item an inserter would take from `source`, and how many.
    fn choose(&mut self, id: i32, source: i32, target: i32) -> Option<(i32, i32)> {
        let (machine, pick, stack) = { let e = self.get(id); (e.machine, e.pick, e.stack) };
        let filter = if machine == FILTER_INSERTER { pick } else { -2 };
        if filter == -1 { return None; }
        let allowed = |item: i32| filter == -2 || item == filter;
        let s = self.get(source);
        if s.cls.is_belt_like() {
            let belt = s.belt.as_ref().unwrap();
            if belt.is_empty() || !allowed(belt[0]) { return None; }
            let item = belt[0];
            return if self.insert(target, item, 1, false) >= 1 { Some((item, 1)) } else { None };
        }
        let counts = if s.cls == Cls::Chest { s.inv.clone() } else if s.cls.is_crafter() { s.out.clone() } else { None };
        if let Some(counts) = counts {
            for item in 0..ITEMS as i32 {
                let count = counts[item as usize];
                if count <= 0 || !allowed(item) || self.game.items[item as usize].fluid { continue; }
                let accepted = self.insert(target, item, stack.min(count), false);
                if accepted >= 1 { return Some((item, accepted)); }
            }
            return None;
        }
        if s.cls == Cls::Miner && s.held > 0 && allowed(s.hand) {
            let (hand, held) = (s.hand, s.held);
            let accepted = self.insert(target, hand, stack.min(held), false);
            return if accepted >= 1 { Some((hand, accepted)) } else { None };
        }
        None
    }

    fn take_from(&mut self, source: i32, item: i32, n: i32) {
        let s = self.get_mut(source);
        if s.cls.is_belt_like() { s.belt.as_mut().unwrap().drain(0..2); }
        else if s.cls == Cls::Chest { s.inv.as_mut().unwrap()[item as usize] -= n; }
        else if s.cls.is_crafter() { s.out.as_mut().unwrap()[item as usize] -= n; }
        else if s.cls == Cls::Miner {
            s.held -= n;
            if s.held == 0 { s.hand = -1; }
        }
    }

    /// Pass the front item of `id`'s belt to `target` if it is belt-like with room.
    fn pass(&mut self, id: i32, target: i32) -> bool {
        if target == 0 || target == id || !self.get(target).cls.is_belt_like() { return false; }
        {
            let tb = self.get(target).belt.as_ref().unwrap();
            if !tb.is_empty() && tb[tb.len() - 1] < 64 { return false; }
        }
        let item = { let belt = self.get_mut(id).belt.as_mut().unwrap(); let item = belt[0]; belt.drain(0..2); item };
        let tb = self.get_mut(target).belt.as_mut().unwrap();
        tb.push(item);
        tb.push(0);
        true
    }

    fn move_belt(&mut self, id: i32) {
        let speed = self.game.machines[self.get(id).machine].speed;
        {
            let belt = self.get_mut(id).belt.as_mut().unwrap();
            let mut i = 0;
            while i < belt.len() {
                let limit = if i == 0 { 256 } else { belt[i - 1] - 64 };
                let pos = belt[i + 1];
                belt[i + 1] = pos.max((pos + speed).min(limit));
                i += 2;
            }
            if belt.is_empty() || belt[1] < 256 { return; }
        }
        let (cls, dir, role, x, y, pick, priority, toggle, item) = {
            let e = self.get(id);
            (e.cls, e.dir, e.role, e.x, e.y, e.pick, e.priority, e.toggle, e.belt.as_ref().unwrap()[0])
        };
        match cls {
            Cls::Belt => { let t = self.front_id(id, 1); self.pass(id, t); }
            Cls::Underground => {
                if role == 1 { let t = self.front_id(id, 1); self.pass(id, t); return; }
                for d in 1..=5 {
                    let t = self.front_id(id, d);
                    if t != 0 { let e = self.get(t); if e.cls == Cls::Underground && e.dir == dir && e.role == 1 { self.pass(id, t); return; } }
                }
            }
            _ => {
                let front = self.front_id(id, 1);
                let side_dir = ((dir + 1) % 4) as usize;
                let side = self.id_at(x + DX[dir as usize] + DX[side_dir], y + DY[dir as usize] + DY[side_dir]);
                let order: Vec<(i32, bool)> = if pick >= 0 {
                    if item == pick { vec![(side, false)] } else { vec![(front, true)] }
                } else if priority == 1 || (priority != 2 && toggle == 0) {
                    vec![(front, true), (side, false)]
                } else {
                    vec![(side, false), (front, true)]
                };
                for (t, is_front) in order {
                    if self.pass(id, t) {
                        self.get_mut(id).toggle = if is_front { 1 } else { 0 };
                        return;
                    }
                }
            }
        }
    }

    // ── hash, save, load ─────────────────────────────────────────────────────

    pub fn hash(&self) -> u32 {
        let mut h: u32 = 2166136261;
        let mut feed = |v: i32| {
            for k in 0..4 { h = (h ^ ((v as u32 >> (8 * k)) & 255)).wrapping_mul(16777619); }
        };
        let done_mask = self.done.iter().enumerate().fold(0i32, |mask, (t, &d)| if d { mask | (1 << t) } else { mask });
        let revealed = self.revealed.iter().filter(|&&r| r).count() as i32;
        let resources = self.res_amount.iter().fold(0i32, |sum, &a| sum.wrapping_add(a));
        for v in [self.tick, self.satisfaction, self.research_current, self.research_progress, done_mask, revealed, resources] { feed(v); }
        for &id in &self.order {
            let e = self.get(id);
            for v in [e.id, e.machine as i32, e.x, e.y, e.dir, e.recipe, e.progress, e.busy as i32, e.fuel, e.burn, e.heat] { feed(v); }
            for list in [&e.inv, &e.out, &e.belt] {
                match list {
                    None => feed(0),
                    Some(values) => { feed(values.len() as i32); for &v in values { feed(v); } }
                }
            }
            for v in [e.state, e.timer, e.hand, e.held, e.pick, e.stack, e.priority, e.toggle, e.role, e.fluid,
                e.amount, e.charge, e.cond_item, e.cond_op, e.cond_value, e.signal as i32, e.crafts, e.moved] { feed(v); }
        }
        h
    }

    pub fn load(game: Game, save: Save) -> World {
        let mut w = World::new(game, save.width, save.height);
        w.tick = save.tick;
        w.next_id = save.next_id;
        for (i, c) in save.terrain.bytes().enumerate() { w.water[i] = c == b'~'; }
        for [x, y, kind, amount] in save.resources {
            let tile = (y * w.width + x) as usize;
            w.res_kind[tile] = kind;
            w.res_amount[tile] = amount;
        }
        for (i, c) in save.revealed.bytes().enumerate() { w.revealed[i] = c == b'1'; }
        for &t in &save.research.done { w.complete(t); }
        w.research_current = save.research.current;
        w.research_progress = save.research.progress;
        let mut entities = save.entities;
        entities.sort_by_key(|e| e.id);
        for mut e in entities {
            e.cls = w.classes[e.machine];
            w.add(e);
        }
        w
    }

    pub fn save(&self) -> Save {
        Save {
            version: 1, tick: self.tick, width: self.width, height: self.height, next_id: self.next_id,
            terrain: self.water.iter().map(|&w| if w { '~' } else { '.' }).collect(),
            resources: (0..self.res_kind.len()).filter(|&t| self.res_kind[t] >= 0)
                .map(|t| [t as i32 % self.width, t as i32 / self.width, self.res_kind[t], self.res_amount[t]]).collect(),
            revealed: self.revealed.iter().map(|&r| if r { '1' } else { '0' }).collect(),
            research: ResearchSave {
                current: self.research_current, progress: self.research_progress,
                done: (0..self.done.len()).filter(|&t| self.done[t]).collect(),
            },
            entities: self.order.iter().map(|&id| self.get(id).clone()).collect(),
        }
    }
}

fn fuel_up(e: &mut Entity, n: i32, commit: bool) -> i32 {
    let taken = n.min(5 - e.fuel).max(0);
    if commit { e.fuel += taken; }
    taken
}
