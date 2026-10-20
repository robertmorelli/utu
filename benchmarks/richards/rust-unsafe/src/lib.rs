//! Richards, the "fastest Rust" port: arenas of raw pointers.
//!
//! This computes exactly the canonical Richards (Are We Fast Yet). Each run
//! owns its tasks and packets in two typed arenas inside the `Scheduler`, and
//! the linked lists join them with `*mut` edges (null where the original has
//! null). That avoids reference counting and RefCell bookkeeping; the task
//! table is indexed without bounds checks. The four kinds of task are one enum
//! of each kind's private data, which the scheduler matches on.
//!
//! Safety invariant, relied on by every `unsafe` block below: a `TaskPtr` or
//! `PacketPtr` is null or points into the arenas of the scheduler that made it,
//! which free nothing until the scheduler is dropped at the end of its run.
//! References made from these pointers last for one expression or one short
//! block that does not reach the same node through another path.

use std::ptr;

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

type TaskPtr = *mut Task;
type PacketPtr = *mut Packet;

/// Owns boxed values for one run and hands out stable raw pointers.
struct Arena<T> {
    items: Vec<*mut T>,
}

impl<T> Arena<T> {
    fn new() -> Self {
        Arena { items: Vec::new() }
    }

    fn alloc(&mut self, value: T) -> *mut T {
        let item = Box::into_raw(Box::new(value));
        self.items.push(item);
        item
    }
}

impl<T> Drop for Arena<T> {
    fn drop(&mut self) {
        for &item in &self.items {
            // SAFETY: each item came from `Box::into_raw` in `alloc` and is freed once, here.
            drop(unsafe { Box::from_raw(item) });
        }
    }
}

// ---------------------------------------------------------------------------
// Packets

struct Packet {
    link: PacketPtr,
    identity: i32,
    kind: i32,
    datum: i32,
    data: Box<[i32; DATA_SIZE]>,
}

/// Adds `packet` to the end of the queue, which may be null; the queue's head.
unsafe fn append(packet: PacketPtr, queue_head: PacketPtr) -> PacketPtr {
    (*packet).link = ptr::null_mut();
    if queue_head.is_null() {
        return packet;
    }
    let mut mouse = queue_head;
    let mut next;
    while {
        next = (*mouse).link;
        !next.is_null()
    } {
        mouse = next;
    }
    (*mouse).link = packet;
    queue_head
}

// ---------------------------------------------------------------------------
// Task control blocks

/// What each kind of task keeps between its runs.
enum TaskData {
    Idle { control: i32, count: i32 },
    Device { pending: PacketPtr },
    Handler { work_in: PacketPtr, device_in: PacketPtr },
    Worker { destination: i32, count: i32 },
}

struct Task {
    link: TaskPtr,
    identity: i32,
    priority: i32,
    input: PacketPtr,
    packet_pending: bool,
    task_waiting: bool,
    task_holding: bool,
    data: TaskData,
}

impl Task {
    fn is_task_holding_or_waiting(&self) -> bool {
        self.task_holding || (!self.packet_pending && self.task_waiting)
    }

    fn is_waiting_with_packet(&self) -> bool {
        self.packet_pending && self.task_waiting && !self.task_holding
    }
}

unsafe fn add_input_and_check_priority(t: TaskPtr, packet: PacketPtr, old_task: TaskPtr) -> TaskPtr {
    if (*t).input.is_null() {
        (*t).input = packet;
        (*t).packet_pending = true;
        if (*t).priority > (*old_task).priority {
            return t;
        }
    } else {
        (*t).input = append(packet, (*t).input);
    }
    old_task
}

unsafe fn run_task(t: TaskPtr, s: &mut Scheduler) -> TaskPtr {
    let mut message = ptr::null_mut();
    if (*t).is_waiting_with_packet() {
        message = (*t).input;
        (*t).input = (*message).link;
        if (*t).input.is_null() {
            (*t).packet_pending = false;
            (*t).task_waiting = false;
            (*t).task_holding = false;
        } else {
            (*t).packet_pending = true;
            (*t).task_waiting = false;
            (*t).task_holding = false;
        }
    }
    s.run_function(ptr::addr_of_mut!((*t).data), message)
}

// ---------------------------------------------------------------------------
// The scheduler

struct Scheduler {
    task_list: TaskPtr,
    current_task: TaskPtr,
    current_task_identity: i32,
    task_table: [TaskPtr; NUM_TYPES],
    hold_count: i32,
    queue_packet_count: i32,
    tasks: Arena<Task>,
    packets: Arena<Packet>,
}

impl Scheduler {
    fn new() -> Scheduler {
        Scheduler {
            task_list: ptr::null_mut(),
            current_task: ptr::null_mut(),
            current_task_identity: 0,
            task_table: [ptr::null_mut(); NUM_TYPES],
            hold_count: 0,
            queue_packet_count: 0,
            tasks: Arena::new(),
            packets: Arena::new(),
        }
    }

    fn new_packet(&mut self, link: PacketPtr, identity: i32, kind: i32) -> PacketPtr {
        self.packets.alloc(Packet { link, identity, kind, datum: 0, data: Box::new([0; DATA_SIZE]) })
    }

    #[allow(clippy::too_many_arguments)]
    fn create_task(
        &mut self,
        identity: i32,
        priority: i32,
        work: PacketPtr,
        packet_pending: bool,
        task_waiting: bool,
        task_holding: bool,
        data: TaskData,
    ) {
        let t = self.tasks.alloc(Task {
            link: self.task_list,
            identity,
            priority,
            input: work,
            packet_pending,
            task_waiting,
            task_holding,
            data,
        });
        self.task_table[identity as usize] = t;
        self.task_list = t;
    }

    unsafe fn find_task(&self, identity: i32) -> TaskPtr {
        let t = *self.task_table.get_unchecked(identity as usize);
        debug_assert!(!t.is_null(), "findTask failed");
        t
    }

    unsafe fn hold_self(&mut self) -> TaskPtr {
        self.hold_count += 1;
        let t = self.current_task;
        (*t).task_holding = true;
        (*t).link
    }

    unsafe fn wait_task(&mut self) -> TaskPtr {
        let t = self.current_task;
        (*t).task_waiting = true;
        t
    }

    unsafe fn release(&mut self, identity: i32) -> TaskPtr {
        let t = self.find_task(identity);
        (*t).task_holding = false;
        let current = self.current_task;
        if (*t).priority > (*current).priority {
            t
        } else {
            current
        }
    }

    unsafe fn queue_packet(&mut self, packet: PacketPtr) -> TaskPtr {
        let t = self.find_task((*packet).identity);
        self.queue_packet_count += 1;
        (*packet).link = ptr::null_mut();
        (*packet).identity = self.current_task_identity;
        add_input_and_check_priority(t, packet, self.current_task)
    }

    /// One run of a task of each kind, given the packet it received, if any.
    unsafe fn run_function(&mut self, data: *mut TaskData, work: PacketPtr) -> TaskPtr {
        match &mut *data {
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
            TaskData::Device { pending } => {
                if !work.is_null() {
                    *pending = work;
                    self.hold_self()
                } else if pending.is_null() {
                    self.wait_task()
                } else {
                    let p = *pending;
                    *pending = ptr::null_mut();
                    self.queue_packet(p)
                }
            }
            TaskData::Handler { work_in, device_in } => {
                if !work.is_null() {
                    if (*work).kind == WORK_PACKET_KIND {
                        *work_in = append(work, *work_in);
                    } else {
                        *device_in = append(work, *device_in);
                    }
                }
                let work_packet = *work_in;
                if work_packet.is_null() {
                    return self.wait_task();
                }
                let count = (*work_packet).datum;
                if count >= DATA_SIZE as i32 {
                    *work_in = (*work_packet).link;
                    return self.queue_packet(work_packet);
                }
                let device_packet = *device_in;
                if device_packet.is_null() {
                    return self.wait_task();
                }
                *device_in = (*device_packet).link;
                (*device_packet).datum = *(*work_packet).data.get_unchecked(count as usize);
                (*work_packet).datum = count + 1;
                self.queue_packet(device_packet)
            }
            TaskData::Worker { destination, count } => {
                if work.is_null() {
                    return self.wait_task();
                }
                *destination = if *destination == HANDLER_A { HANDLER_B } else { HANDLER_A };
                (*work).identity = *destination;
                (*work).datum = 0;
                for i in 0..DATA_SIZE {
                    *count += 1;
                    if *count > 26 {
                        *count = 1;
                    }
                    (*work).data[i] = *count;
                }
                self.queue_packet(work)
            }
        }
    }

    fn schedule(&mut self) {
        self.current_task = self.task_list;
        while !self.current_task.is_null() {
            let t = self.current_task;
            // SAFETY: t is a live task of this scheduler (see the invariant above).
            unsafe {
                if (*t).is_task_holding_or_waiting() {
                    self.current_task = (*t).link;
                } else {
                    self.current_task_identity = (*t).identity;
                    self.current_task = run_task(t, self);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// The benchmark

/// One simulation: queuePacketCount * 100000 + holdCount (23246 and 9297).
fn richards() -> i64 {
    let mut s = Scheduler::new();
    s.create_task(IDLER, 0, ptr::null_mut(), false, false, false, TaskData::Idle { control: 1, count: 10000 });

    let mut work_q = s.new_packet(ptr::null_mut(), WORKER, WORK_PACKET_KIND);
    work_q = s.new_packet(work_q, WORKER, WORK_PACKET_KIND);
    s.create_task(WORKER, 1000, work_q, true, true, false, TaskData::Worker { destination: HANDLER_A, count: 0 });

    work_q = s.new_packet(ptr::null_mut(), DEVICE_A, DEVICE_PACKET_KIND);
    work_q = s.new_packet(work_q, DEVICE_A, DEVICE_PACKET_KIND);
    work_q = s.new_packet(work_q, DEVICE_A, DEVICE_PACKET_KIND);
    s.create_task(HANDLER_A, 2000, work_q, true, true, false, TaskData::Handler { work_in: ptr::null_mut(), device_in: ptr::null_mut() });

    work_q = s.new_packet(ptr::null_mut(), DEVICE_B, DEVICE_PACKET_KIND);
    work_q = s.new_packet(work_q, DEVICE_B, DEVICE_PACKET_KIND);
    work_q = s.new_packet(work_q, DEVICE_B, DEVICE_PACKET_KIND);
    s.create_task(HANDLER_B, 3000, work_q, true, true, false, TaskData::Handler { work_in: ptr::null_mut(), device_in: ptr::null_mut() });

    s.create_task(DEVICE_A, 4000, ptr::null_mut(), false, true, false, TaskData::Device { pending: ptr::null_mut() });
    s.create_task(DEVICE_B, 5000, ptr::null_mut(), false, true, false, TaskData::Device { pending: ptr::null_mut() });

    s.schedule();
    s.queue_packet_count as i64 * 100000 + s.hold_count as i64
}

/// Each iteration runs the simulation `INNER_ITERATIONS` times.
const INNER_ITERATIONS: i32 = 10;

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
