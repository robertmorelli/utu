// Richards, Martin Richards' operating-system scheduler simulation, as the
// Are We Fast Yet suite has it, in idiomatic AssemblyScript: task control
// blocks and packets are linked lists, and each of the four kinds of task is a
// class of private data whose `run` method the scheduler dispatches to.

const IDLER: i32 = 0;
const WORKER: i32 = 1;
const HANDLER_A: i32 = 2;
const HANDLER_B: i32 = 3;
const DEVICE_A: i32 = 4;
const DEVICE_B: i32 = 5;
const NUM_TYPES: i32 = 6;

const DEVICE_PACKET_KIND: i32 = 0;
const WORK_PACKET_KIND: i32 = 1;
const DATA_SIZE: i32 = 4;

class Packet {
  link: Packet | null;
  identity: i32;
  kind: i32;
  datum: i32;
  data: Int32Array;

  constructor(link: Packet | null, identity: i32, kind: i32) {
    this.link = link;
    this.identity = identity;
    this.kind = kind;
    this.datum = 0;
    this.data = new Int32Array(DATA_SIZE);
  }
}

// Adds packet to the end of the queue, which may be empty; the queue's head.
function append(packet: Packet, queueHead: Packet | null): Packet {
  packet.link = null;
  if (queueHead === null) return packet;
  let mouse: Packet = queueHead;
  let next: Packet | null;
  while ((next = mouse.link) !== null) mouse = next;
  mouse.link = packet;
  return queueHead;
}

// ---------------------------------------------------------------------------
// What each kind of task keeps between its runs, and one run of it.

abstract class TaskData {
  abstract run(s: Scheduler, work: Packet | null): Task | null;
}

class IdleTaskData extends TaskData {
  control: i32 = 1;
  count: i32 = 10000;

  run(s: Scheduler, work: Packet | null): Task | null {
    this.count--;
    if (this.count === 0) return s.holdSelf();
    if ((this.control & 1) === 0) {
      this.control = this.control / 2;
      return s.release(DEVICE_A);
    }
    this.control = (this.control / 2) ^ 53256;
    return s.release(DEVICE_B);
  }
}

class DeviceTaskData extends TaskData {
  pending: Packet | null = null;

  run(s: Scheduler, work: Packet | null): Task | null {
    if (work !== null) {
      this.pending = work;
      return s.holdSelf();
    }
    const p = this.pending;
    if (p === null) return s.waitTask();
    this.pending = null;
    return s.queuePacket(p);
  }
}

class HandlerTaskData extends TaskData {
  workIn: Packet | null = null;
  deviceIn: Packet | null = null;

  run(s: Scheduler, work: Packet | null): Task | null {
    if (work !== null) {
      if (work.kind === WORK_PACKET_KIND) this.workIn = append(work, this.workIn);
      else this.deviceIn = append(work, this.deviceIn);
    }
    const workPacket = this.workIn;
    if (workPacket === null) return s.waitTask();
    const count = workPacket.datum;
    if (count >= DATA_SIZE) {
      this.workIn = workPacket.link;
      return s.queuePacket(workPacket);
    }
    const devicePacket = this.deviceIn;
    if (devicePacket === null) return s.waitTask();
    this.deviceIn = devicePacket.link;
    devicePacket.datum = workPacket.data[count];
    workPacket.datum = count + 1;
    return s.queuePacket(devicePacket);
  }
}

class WorkerTaskData extends TaskData {
  destination: i32 = HANDLER_A;
  count: i32 = 0;

  run(s: Scheduler, work: Packet | null): Task | null {
    if (work === null) return s.waitTask();
    this.destination = this.destination === HANDLER_A ? HANDLER_B : HANDLER_A;
    work.identity = this.destination;
    work.datum = 0;
    for (let i = 0; i < DATA_SIZE; i++) {
      this.count++;
      if (this.count > 26) this.count = 1;
      work.data[i] = this.count;
    }
    return s.queuePacket(work);
  }
}

// ---------------------------------------------------------------------------
// Task control blocks

class Task {
  link: Task | null;
  identity: i32;
  priority: i32;
  input: Packet | null;
  packetPending: bool;
  taskWaiting: bool;
  taskHolding: bool;
  data: TaskData;

  constructor(link: Task | null, identity: i32, priority: i32, input: Packet | null, packetPending: bool, taskWaiting: bool, taskHolding: bool, data: TaskData) {
    this.link = link;
    this.identity = identity;
    this.priority = priority;
    this.input = input;
    this.packetPending = packetPending;
    this.taskWaiting = taskWaiting;
    this.taskHolding = taskHolding;
    this.data = data;
  }

  isTaskHoldingOrWaiting(): bool {
    return this.taskHolding || (!this.packetPending && this.taskWaiting);
  }

  isWaitingWithPacket(): bool {
    return this.packetPending && this.taskWaiting && !this.taskHolding;
  }

  addInputAndCheckPriority(packet: Packet, oldTask: Task): Task {
    if (this.input === null) {
      this.input = packet;
      this.packetPending = true;
      if (this.priority > oldTask.priority) return this;
    } else {
      this.input = append(packet, this.input);
    }
    return oldTask;
  }

  runTask(s: Scheduler): Task | null {
    let message: Packet | null = null;
    if (this.isWaitingWithPacket()) {
      message = this.input;
      this.input = message!.link;
      if (this.input === null) {
        this.packetPending = false;
        this.taskWaiting = false;
        this.taskHolding = false;
      } else {
        this.packetPending = true;
        this.taskWaiting = false;
        this.taskHolding = false;
      }
    }
    return this.data.run(s, message);
  }
}

// ---------------------------------------------------------------------------
// The scheduler

class Scheduler {
  taskList: Task | null = null;
  currentTask: Task | null = null;
  currentTaskIdentity: i32 = 0;
  taskTable: Array<Task | null> = new Array<Task | null>(NUM_TYPES).fill(null);
  holdCount: i32 = 0;
  queuePacketCount: i32 = 0;

  createTask(identity: i32, priority: i32, work: Packet | null, packetPending: bool, taskWaiting: bool, taskHolding: bool, data: TaskData): void {
    const t = new Task(this.taskList, identity, priority, work, packetPending, taskWaiting, taskHolding, data);
    this.taskTable[identity] = t;
    this.taskList = t;
  }

  findTask(identity: i32): Task {
    const t = this.taskTable[identity];
    if (t === null) throw new Error('findTask failed');
    return t;
  }

  holdSelf(): Task | null {
    this.holdCount++;
    const t = this.currentTask!;
    t.taskHolding = true;
    return t.link;
  }

  waitTask(): Task | null {
    const t = this.currentTask!;
    t.taskWaiting = true;
    return t;
  }

  release(identity: i32): Task | null {
    const t = this.findTask(identity);
    t.taskHolding = false;
    const current = this.currentTask!;
    return t.priority > current.priority ? t : current;
  }

  queuePacket(packet: Packet): Task | null {
    const t = this.findTask(packet.identity);
    this.queuePacketCount++;
    packet.link = null;
    packet.identity = this.currentTaskIdentity;
    return t.addInputAndCheckPriority(packet, this.currentTask!);
  }

  schedule(): void {
    this.currentTask = this.taskList;
    while (this.currentTask !== null) {
      const t = this.currentTask!;
      if (t.isTaskHoldingOrWaiting()) {
        this.currentTask = t.link;
      } else {
        this.currentTaskIdentity = t.identity;
        this.currentTask = t.runTask(this);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The benchmark

// One simulation: queuePacketCount * 100000 + holdCount (23246 and 9297).
function richards(): i64 {
  const s = new Scheduler();
  s.createTask(IDLER, 0, null, false, false, false, new IdleTaskData());

  let workQ = new Packet(null, WORKER, WORK_PACKET_KIND);
  workQ = new Packet(workQ, WORKER, WORK_PACKET_KIND);
  s.createTask(WORKER, 1000, workQ, true, true, false, new WorkerTaskData());

  workQ = new Packet(null, DEVICE_A, DEVICE_PACKET_KIND);
  workQ = new Packet(workQ, DEVICE_A, DEVICE_PACKET_KIND);
  workQ = new Packet(workQ, DEVICE_A, DEVICE_PACKET_KIND);
  s.createTask(HANDLER_A, 2000, workQ, true, true, false, new HandlerTaskData());

  workQ = new Packet(null, DEVICE_B, DEVICE_PACKET_KIND);
  workQ = new Packet(workQ, DEVICE_B, DEVICE_PACKET_KIND);
  workQ = new Packet(workQ, DEVICE_B, DEVICE_PACKET_KIND);
  s.createTask(HANDLER_B, 3000, workQ, true, true, false, new HandlerTaskData());

  s.createTask(DEVICE_A, 4000, null, false, true, false, new DeviceTaskData());
  s.createTask(DEVICE_B, 5000, null, false, true, false, new DeviceTaskData());

  s.schedule();
  return <i64>s.queuePacketCount * 100000 + s.holdCount;
}

// Each iteration runs the simulation INNER_ITERATIONS times.
const INNER_ITERATIONS: i32 = 10;

export function bench(iterations: i32): i64 {
  let sink: i64 = 0;
  for (let i = 0; i < iterations * INNER_ITERATIONS; i++) sink += richards();
  return sink;
}
