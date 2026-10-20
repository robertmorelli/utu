// Richards, Martin Richards' operating-system scheduler simulation, as the
// Are We Fast Yet suite has it, in idiomatic MoonBit.
//
// Task control blocks and packets are GC structs with mutable fields, linked
// into lists through `Task?` / `Packet?` references. The four kinds of task
// are one enum whose variants carry each kind's private data (a struct of
// mutable fields), which the scheduler matches on.

///|
const IDLER : Int = 0

///|
const WORKER : Int = 1

///|
const HANDLER_A : Int = 2

///|
const HANDLER_B : Int = 3

///|
const DEVICE_A : Int = 4

///|
const DEVICE_B : Int = 5

///|
const NUM_TYPES : Int = 6

///|
const DEVICE_PACKET_KIND : Int = 0

///|
const WORK_PACKET_KIND : Int = 1

///|
const DATA_SIZE : Int = 4

// ---------------------------------------------------------------------------
// Packets

///|
priv struct Packet {
  mut link : Packet?
  mut identity : Int
  kind : Int
  mut datum : Int
  data : FixedArray[Int]
}

///|
fn Packet::new(link : Packet?, identity : Int, kind : Int) -> Packet {
  { link, identity, kind, datum: 0, data: FixedArray::make(DATA_SIZE, 0) }
}

///|
/// Adds `packet` to the end of the queue, which may be empty; the queue's head.
fn append(packet : Packet, queue_head : Packet?) -> Packet {
  packet.link = None
  match queue_head {
    None => packet
    Some(head) => {
      let mut mouse = head
      while mouse.link is Some(next) {
        mouse = next
      }
      mouse.link = Some(packet)
      head
    }
  }
}

// ---------------------------------------------------------------------------
// Task control blocks

///|
priv struct IdleData {
  mut control : Int
  mut count : Int
}

///|
priv struct DeviceData {
  mut pending : Packet?
}

///|
priv struct HandlerData {
  mut work_in : Packet?
  mut device_in : Packet?
}

///|
priv struct WorkerData {
  mut destination : Int
  mut count : Int
}

///|
/// What each kind of task keeps between its runs.
priv enum TaskData {
  Idle(IdleData)
  Device(DeviceData)
  Handler(HandlerData)
  Worker(WorkerData)
}

///|
priv struct Task {
  link : Task?
  identity : Int
  priority : Int
  mut input : Packet?
  mut packet_pending : Bool
  mut task_waiting : Bool
  mut task_holding : Bool
  data : TaskData
}

///|
fn Task::is_task_holding_or_waiting(self : Task) -> Bool {
  self.task_holding || (!self.packet_pending && self.task_waiting)
}

///|
fn Task::is_waiting_with_packet(self : Task) -> Bool {
  self.packet_pending && self.task_waiting && !self.task_holding
}

///|
fn Task::add_input_and_check_priority(
  self : Task,
  packet : Packet,
  old_task : Task,
) -> Task {
  match self.input {
    None => {
      self.input = Some(packet)
      self.packet_pending = true
      if self.priority > old_task.priority {
        return self
      }
    }
    Some(_) as queue => self.input = Some(append(packet, queue))
  }
  old_task
}

///|
fn Task::run_task(self : Task, s : Scheduler) -> Task? {
  let mut message = None
  if self.is_waiting_with_packet() {
    guard self.input is Some(m) else { abort("a waiting packet") }
    self.input = m.link
    if self.input is None {
      self.packet_pending = false
      self.task_waiting = false
      self.task_holding = false
    } else {
      self.packet_pending = true
      self.task_waiting = false
      self.task_holding = false
    }
    message = Some(m)
  }
  s.run_function(self.data, message)
}

// ---------------------------------------------------------------------------
// The scheduler

///|
priv struct Scheduler {
  mut task_list : Task?
  mut current_task : Task?
  mut current_task_identity : Int
  task_table : FixedArray[Task?]
  mut hold_count : Int
  mut queue_packet_count : Int
}

///|
fn Scheduler::new() -> Scheduler {
  {
    task_list: None,
    current_task: None,
    current_task_identity: 0,
    task_table: FixedArray::make(NUM_TYPES, None),
    hold_count: 0,
    queue_packet_count: 0,
  }
}

///|
fn Scheduler::create_task(
  self : Scheduler,
  identity : Int,
  priority : Int,
  work : Packet?,
  packet_pending : Bool,
  task_waiting : Bool,
  task_holding : Bool,
  data : TaskData,
) -> Unit {
  let t : Task = {
    link: self.task_list,
    identity,
    priority,
    input: work,
    packet_pending,
    task_waiting,
    task_holding,
    data,
  }
  self.task_table[identity] = Some(t)
  self.task_list = Some(t)
}

///|
fn Scheduler::current(self : Scheduler) -> Task {
  self.current_task.unwrap()
}

///|
fn Scheduler::find_task(self : Scheduler, identity : Int) -> Task {
  guard self.task_table[identity] is Some(t) else { abort("findTask failed") }
  t
}

///|
fn Scheduler::hold_self(self : Scheduler) -> Task? {
  self.hold_count += 1
  let t = self.current()
  t.task_holding = true
  t.link
}

///|
fn Scheduler::wait_task(self : Scheduler) -> Task? {
  let t = self.current()
  t.task_waiting = true
  Some(t)
}

///|
fn Scheduler::release(self : Scheduler, identity : Int) -> Task? {
  let t = self.find_task(identity)
  t.task_holding = false
  let current = self.current()
  if t.priority > current.priority {
    Some(t)
  } else {
    Some(current)
  }
}

///|
fn Scheduler::queue_packet(self : Scheduler, packet : Packet) -> Task? {
  let t = self.find_task(packet.identity)
  self.queue_packet_count += 1
  packet.link = None
  packet.identity = self.current_task_identity
  Some(t.add_input_and_check_priority(packet, self.current()))
}

///|
/// One run of a task of each kind, given the packet it received, if any.
fn Scheduler::run_function(
  self : Scheduler,
  data : TaskData,
  work : Packet?,
) -> Task? {
  match data {
    Idle(d) => {
      d.count -= 1
      if d.count == 0 {
        self.hold_self()
      } else if (d.control & 1) == 0 {
        d.control = d.control / 2
        self.release(DEVICE_A)
      } else {
        d.control = (d.control / 2) ^ 53256
        self.release(DEVICE_B)
      }
    }
    Device(d) =>
      match work {
        Some(w) => {
          d.pending = Some(w)
          self.hold_self()
        }
        None =>
          match d.pending {
            Some(p) => {
              d.pending = None
              self.queue_packet(p)
            }
            None => self.wait_task()
          }
      }
    Handler(d) => {
      if work is Some(w) {
        if w.kind == WORK_PACKET_KIND {
          d.work_in = Some(append(w, d.work_in))
        } else {
          d.device_in = Some(append(w, d.device_in))
        }
      }
      match d.work_in {
        Some(work_packet) => {
          let count = work_packet.datum
          if count >= DATA_SIZE {
            d.work_in = work_packet.link
            self.queue_packet(work_packet)
          } else {
            match d.device_in {
              Some(device_packet) => {
                d.device_in = device_packet.link
                device_packet.datum = work_packet.data[count]
                work_packet.datum = count + 1
                self.queue_packet(device_packet)
              }
              None => self.wait_task()
            }
          }
        }
        None => self.wait_task()
      }
    }
    Worker(d) =>
      match work {
        Some(w) => {
          d.destination = if d.destination == HANDLER_A {
            HANDLER_B
          } else {
            HANDLER_A
          }
          w.identity = d.destination
          w.datum = 0
          for i in 0..<DATA_SIZE {
            d.count += 1
            if d.count > 26 {
              d.count = 1
            }
            w.data[i] = d.count
          }
          self.queue_packet(w)
        }
        None => self.wait_task()
      }
  }
}

///|
fn Scheduler::schedule(self : Scheduler) -> Unit {
  self.current_task = self.task_list
  while self.current_task is Some(t) {
    if t.is_task_holding_or_waiting() {
      self.current_task = t.link
    } else {
      self.current_task_identity = t.identity
      self.current_task = t.run_task(self)
    }
  }
}

// ---------------------------------------------------------------------------
// The benchmark

///|
/// One simulation: queuePacketCount * 100000 + holdCount (23246 and 9297).
fn richards() -> Int64 {
  let s = Scheduler::new()
  s.create_task(IDLER, 0, None, false, false, false, Idle({ control: 1, count: 10000 }))
  let mut work_q = Packet::new(None, WORKER, WORK_PACKET_KIND)
  work_q = Packet::new(Some(work_q), WORKER, WORK_PACKET_KIND)
  s.create_task(WORKER, 1000, Some(work_q), true, true, false, Worker({ destination: HANDLER_A, count: 0 }))
  work_q = Packet::new(None, DEVICE_A, DEVICE_PACKET_KIND)
  work_q = Packet::new(Some(work_q), DEVICE_A, DEVICE_PACKET_KIND)
  work_q = Packet::new(Some(work_q), DEVICE_A, DEVICE_PACKET_KIND)
  s.create_task(HANDLER_A, 2000, Some(work_q), true, true, false, Handler({ work_in: None, device_in: None }))
  work_q = Packet::new(None, DEVICE_B, DEVICE_PACKET_KIND)
  work_q = Packet::new(Some(work_q), DEVICE_B, DEVICE_PACKET_KIND)
  work_q = Packet::new(Some(work_q), DEVICE_B, DEVICE_PACKET_KIND)
  s.create_task(HANDLER_B, 3000, Some(work_q), true, true, false, Handler({ work_in: None, device_in: None }))
  s.create_task(DEVICE_A, 4000, None, false, true, false, Device({ pending: None }))
  s.create_task(DEVICE_B, 5000, None, false, true, false, Device({ pending: None }))
  s.schedule()
  s.queue_packet_count.to_int64() * 100000L + s.hold_count.to_int64()
}

///|
/// Each iteration runs the simulation `INNER_ITERATIONS` times.
const INNER_ITERATIONS : Int = 10

///|
pub fn bench(iterations : Int) -> Int64 {
  let mut sink = 0L
  for _ in 0..<(iterations * INNER_ITERATIONS) {
    sink += richards()
  }
  sink
}
