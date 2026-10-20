//! Richards, Martin Richards' operating-system scheduler simulation, as the
//! Are We Fast Yet suite has it, in idiomatic safe Rust.
//!
//! Task control blocks and packets are reference-counted linked lists: a
//! `Task` is an `Rc` whose mutable state sits in `Cell`s and `RefCell`s (so a
//! task's private data can be borrowed while the scheduler updates its flags),
//! and a packet is an `Rc<RefCell<Packet>>`. The four kinds of task are one
//! enum of each kind's private data, which the scheduler matches on.
//!
//! There is no `unsafe` code. The crate denies `unsafe_code` rather than
//! forbidding it only because that lint also flags `#[no_mangle]`, so the
//! export at the bottom opts out of it.
#![deny(unsafe_code)]

use std::cell::{Cell, RefCell};
use std::rc::Rc;

const IDLER: i32 = 0;
const WORKER: i32 = 1;
const HANDLER_A: i32 = 2;
const HANDLER_B: i32 = 3;
const DEVICE_A: i32 = 4;
const DEVICE_B: i32 = 5;
const NUM_TYPES: usize = 6;

const DEVICE_PACKET_KIND: i32 = 0;
const WORK_PACKET_KIND: i32 = 1;
const DATA_SIZE: usize = 4;

// ---------------------------------------------------------------------------
// Packets

type PacketRef = Rc<RefCell<Packet>>;

struct Packet {
    link: Option<PacketRef>,
    identity: i32,
    kind: i32,
    datum: i32,
    data: Box<[i32; DATA_SIZE]>,
}

impl Packet {
    fn new(link: Option<PacketRef>, identity: i32, kind: i32) -> PacketRef {
        Rc::new(RefCell::new(Packet { link, identity, kind, datum: 0, data: Box::new([0; DATA_SIZE]) }))
    }
}

/// Adds `packet` to the end of the queue, which may be empty; the queue's head.
fn append(packet: PacketRef, queue_head: Option<PacketRef>) -> PacketRef {
    packet.borrow_mut().link = None;
    match queue_head {
        None => packet,
        Some(head) => {
            let mut mouse = head.clone();
            loop {
                let next = mouse.borrow().link.clone();
                match next {
                    Some(next) => mouse = next,
                    None => break,
                }
            }
            mouse.borrow_mut().link = Some(packet);
            head
        }
    }
}

// ---------------------------------------------------------------------------
// Task control blocks

/// What each kind of task keeps between its runs.
enum TaskData {
    Idle { control: i32, count: i32 },
    Device { pending: Option<PacketRef> },
    Handler { work_in: Option<PacketRef>, device_in: Option<PacketRef> },
    Worker { destination: i32, count: i32 },
}

type TaskRef = Rc<Task>;

struct Task {
    link: Option<TaskRef>,
    identity: i32,
    priority: i32,
    input: RefCell<Option<PacketRef>>,
    packet_pending: Cell<bool>,
    task_waiting: Cell<bool>,
    task_holding: Cell<bool>,
    data: RefCell<TaskData>,
}

impl Task {
    fn is_task_holding_or_waiting(&self) -> bool {
        self.task_holding.get() || (!self.packet_pending.get() && self.task_waiting.get())
    }

    fn is_waiting_with_packet(&self) -> bool {
        self.packet_pending.get() && self.task_waiting.get() && !self.task_holding.get()
    }

    fn add_input_and_check_priority(self: &TaskRef, packet: PacketRef, old_task: &TaskRef) -> TaskRef {
        let mut input = self.input.borrow_mut();
        match input.take() {
            None => {
                *input = Some(packet);
                self.packet_pending.set(true);
                if self.priority > old_task.priority {
                    return self.clone();
                }
            }
            Some(queue) => *input = Some(append(packet, Some(queue))),
        }
        old_task.clone()
    }

    fn run_task(self: &TaskRef, s: &mut Scheduler) -> Option<TaskRef> {
        let mut message = None;
        if self.is_waiting_with_packet() {
            let m = self.input.borrow_mut().take().expect("a waiting packet");
            *self.input.borrow_mut() = m.borrow().link.clone();
            if self.input.borrow().is_none() {
                self.packet_pending.set(false);
                self.task_waiting.set(false);
                self.task_holding.set(false);
            } else {
                self.packet_pending.set(true);
                self.task_waiting.set(false);
                self.task_holding.set(false);
            }
            message = Some(m);
        }
        s.run_function(&mut self.data.borrow_mut(), message)
    }
}

// ---------------------------------------------------------------------------
// The scheduler

struct Scheduler {
    task_list: Option<TaskRef>,
    current_task: Option<TaskRef>,
    current_task_identity: i32,
    task_table: Vec<Option<TaskRef>>,
    hold_count: i32,
    queue_packet_count: i32,
}

impl Scheduler {
    fn new() -> Scheduler {
        Scheduler {
            task_list: None,
            current_task: None,
            current_task_identity: 0,
            task_table: vec![None; NUM_TYPES],
            hold_count: 0,
            queue_packet_count: 0,
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn create_task(
        &mut self,
        identity: i32,
        priority: i32,
        work: Option<PacketRef>,
        packet_pending: bool,
        task_waiting: bool,
        task_holding: bool,
        data: TaskData,
    ) {
        let t = Rc::new(Task {
            link: self.task_list.take(),
            identity,
            priority,
            input: RefCell::new(work),
            packet_pending: Cell::new(packet_pending),
            task_waiting: Cell::new(task_waiting),
            task_holding: Cell::new(task_holding),
            data: RefCell::new(data),
        });
        self.task_table[identity as usize] = Some(t.clone());
        self.task_list = Some(t);
    }

    fn current(&self) -> &TaskRef {
        self.current_task.as_ref().expect("a current task")
    }

    fn find_task(&self, identity: i32) -> TaskRef {
        self.task_table[identity as usize].clone().expect("findTask failed")
    }

    fn hold_self(&mut self) -> Option<TaskRef> {
        self.hold_count += 1;
        let t = self.current();
        t.task_holding.set(true);
        t.link.clone()
    }

    fn wait_task(&mut self) -> Option<TaskRef> {
        let t = self.current();
        t.task_waiting.set(true);
        Some(t.clone())
    }

    fn release(&mut self, identity: i32) -> Option<TaskRef> {
        let t = self.find_task(identity);
        t.task_holding.set(false);
        let current = self.current();
        if t.priority > current.priority {
            Some(t)
        } else {
            Some(current.clone())
        }
    }

    fn queue_packet(&mut self, packet: PacketRef) -> Option<TaskRef> {
        let identity = packet.borrow().identity;
        let t = self.find_task(identity);
        self.queue_packet_count += 1;
        {
            let mut p = packet.borrow_mut();
            p.link = None;
            p.identity = self.current_task_identity;
        }
        Some(t.add_input_and_check_priority(packet, self.current()))
    }

    /// One run of a task of each kind, given the packet it received, if any.
    fn run_function(&mut self, data: &mut TaskData, work: Option<PacketRef>) -> Option<TaskRef> {
        match data {
            TaskData::Idle { control, count } => {
                *count -= 1;
                if *count == 0 {
                    self.hold_self()
                } else if (*control & 1) == 0 {
                    *control /= 2;
                    self.release(DEVICE_A)
                } else {
                    *control = (*control / 2) ^ 53256;
                    self.release(DEVICE_B)
                }
            }
            TaskData::Device { pending } => match work {
                Some(w) => {
                    *pending = Some(w);
                    self.hold_self()
                }
                None => match pending.take() {
                    Some(p) => self.queue_packet(p),
                    None => self.wait_task(),
                },
            },
            TaskData::Handler { work_in, device_in } => {
                if let Some(w) = work {
                    if w.borrow().kind == WORK_PACKET_KIND {
                        *work_in = Some(append(w, work_in.take()));
                    } else {
                        *device_in = Some(append(w, device_in.take()));
                    }
                }
                match work_in.clone() {
                    Some(work_packet) => {
                        let count = work_packet.borrow().datum;
                        if count >= DATA_SIZE as i32 {
                            *work_in = work_packet.borrow().link.clone();
                            self.queue_packet(work_packet)
                        } else {
                            match device_in.clone() {
                                Some(device_packet) => {
                                    *device_in = device_packet.borrow().link.clone();
                                    device_packet.borrow_mut().datum = work_packet.borrow().data[count as usize];
                                    work_packet.borrow_mut().datum = count + 1;
                                    self.queue_packet(device_packet)
                                }
                                None => self.wait_task(),
                            }
                        }
                    }
                    None => self.wait_task(),
                }
            }
            TaskData::Worker { destination, count } => match work {
                Some(w) => {
                    *destination = if *destination == HANDLER_A { HANDLER_B } else { HANDLER_A };
                    {
                        let mut p = w.borrow_mut();
                        p.identity = *destination;
                        p.datum = 0;
                        for i in 0..DATA_SIZE {
                            *count += 1;
                            if *count > 26 {
                                *count = 1;
                            }
                            p.data[i] = *count;
                        }
                    }
                    self.queue_packet(w)
                }
                None => self.wait_task(),
            },
        }
    }

    fn schedule(&mut self) {
        self.current_task = self.task_list.clone();
        while let Some(t) = self.current_task.clone() {
            if t.is_task_holding_or_waiting() {
                self.current_task = t.link.clone();
            } else {
                self.current_task_identity = t.identity;
                self.current_task = t.run_task(self);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// The benchmark

/// One simulation: queuePacketCount * 100000 + holdCount (23246 and 9297).
fn richards() -> i64 {
    let mut s = Scheduler::new();
    s.create_task(IDLER, 0, None, false, false, false, TaskData::Idle { control: 1, count: 10000 });

    let mut work_q = Packet::new(None, WORKER, WORK_PACKET_KIND);
    work_q = Packet::new(Some(work_q), WORKER, WORK_PACKET_KIND);
    s.create_task(WORKER, 1000, Some(work_q), true, true, false, TaskData::Worker { destination: HANDLER_A, count: 0 });

    work_q = Packet::new(None, DEVICE_A, DEVICE_PACKET_KIND);
    work_q = Packet::new(Some(work_q), DEVICE_A, DEVICE_PACKET_KIND);
    work_q = Packet::new(Some(work_q), DEVICE_A, DEVICE_PACKET_KIND);
    s.create_task(HANDLER_A, 2000, Some(work_q), true, true, false, TaskData::Handler { work_in: None, device_in: None });

    work_q = Packet::new(None, DEVICE_B, DEVICE_PACKET_KIND);
    work_q = Packet::new(Some(work_q), DEVICE_B, DEVICE_PACKET_KIND);
    work_q = Packet::new(Some(work_q), DEVICE_B, DEVICE_PACKET_KIND);
    s.create_task(HANDLER_B, 3000, Some(work_q), true, true, false, TaskData::Handler { work_in: None, device_in: None });

    s.create_task(DEVICE_A, 4000, None, false, true, false, TaskData::Device { pending: None });
    s.create_task(DEVICE_B, 5000, None, false, true, false, TaskData::Device { pending: None });

    s.schedule();
    s.queue_packet_count as i64 * 100000 + s.hold_count as i64
}

/// Each iteration runs the simulation `INNER_ITERATIONS` times.
const INNER_ITERATIONS: i32 = 10;

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn bench(iterations: i32) -> i64 {
    (0..iterations * INNER_ITERATIONS).map(|_| richards()).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_packets_and_holds() {
        assert_eq!(richards(), 2324609297);
        assert_eq!(bench(2), 20 * 2324609297);
    }
}
