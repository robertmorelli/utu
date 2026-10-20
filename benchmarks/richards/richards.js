// Richards, Martin Richards' operating-system scheduler simulation, as the
// Are We Fast Yet suite has it, in modern JavaScript: task control blocks and
// packets are linked lists, and each of the four kinds of task is a class of
// private data whose `run` method the scheduler dispatches to.

const IDLER = 0;
const WORKER = 1;
const HANDLER_A = 2;
const HANDLER_B = 3;
const DEVICE_A = 4;
const DEVICE_B = 5;
const NUM_TYPES = 6;

const DEVICE_PACKET_KIND = 0;
const WORK_PACKET_KIND = 1;
const DATA_SIZE = 4;

class Packet {
  constructor(link, identity, kind) {
    this.link = link;
    this.identity = identity;
    this.kind = kind;
    this.datum = 0;
    this.data = new Int32Array(DATA_SIZE);
  }
}

// Adds packet to the end of the queue, which may be empty; the queue's head.
function append(packet, queueHead) {
  packet.link = null;
  if (queueHead === null) return packet;
  let mouse = queueHead;
  let next;
  while ((next = mouse.link) !== null) mouse = next;
  mouse.link = packet;
  return queueHead;
}

// ---------------------------------------------------------------------------
// What each kind of task keeps between its runs, and one run of it.

class IdleTaskData {
  constructor() {
    this.control = 1;
    this.count = 10000;
  }

  run(s, work) {
    this.count--;
    if (this.count === 0) return s.holdSelf();
    if ((this.control & 1) === 0) {
      this.control = this.control / 2 | 0;
      return s.release(DEVICE_A);
    }
    this.control = (this.control / 2 | 0) ^ 53256;
    return s.release(DEVICE_B);
  }
}

class DeviceTaskData {
  constructor() {
    this.pending = null;
  }

  run(s, work) {
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

class HandlerTaskData {
  constructor() {
    this.workIn = null;
    this.deviceIn = null;
  }

  run(s, work) {
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

class WorkerTaskData {
  constructor() {
    this.destination = HANDLER_A;
    this.count = 0;
  }

  run(s, work) {
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
  constructor(link, identity, priority, input, packetPending, taskWaiting, taskHolding, data) {
    this.link = link;
    this.identity = identity;
    this.priority = priority;
    this.input = input;
    this.packetPending = packetPending;
    this.taskWaiting = taskWaiting;
    this.taskHolding = taskHolding;
    this.data = data;
  }

  isTaskHoldingOrWaiting() {
    return this.taskHolding || (!this.packetPending && this.taskWaiting);
  }

  isWaitingWithPacket() {
    return this.packetPending && this.taskWaiting && !this.taskHolding;
  }

  addInputAndCheckPriority(packet, oldTask) {
    if (this.input === null) {
      this.input = packet;
      this.packetPending = true;
      if (this.priority > oldTask.priority) return this;
    } else {
      this.input = append(packet, this.input);
    }
    return oldTask;
  }

  runTask(s) {
    let message = null;
    if (this.isWaitingWithPacket()) {
      message = this.input;
      this.input = message.link;
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
  constructor() {
    this.taskList = null;
    this.currentTask = null;
    this.currentTaskIdentity = 0;
    this.taskTable = new Array(NUM_TYPES).fill(null);
    this.holdCount = 0;
    this.queuePacketCount = 0;
  }

  createTask(identity, priority, work, packetPending, taskWaiting, taskHolding, data) {
    const t = new Task(this.taskList, identity, priority, work, packetPending, taskWaiting, taskHolding, data);
    this.taskTable[identity] = t;
    this.taskList = t;
  }

  findTask(identity) {
    const t = this.taskTable[identity];
    if (t === null) throw new Error('findTask failed');
    return t;
  }

  holdSelf() {
    this.holdCount++;
    const t = this.currentTask;
    t.taskHolding = true;
    return t.link;
  }

  waitTask() {
    const t = this.currentTask;
    t.taskWaiting = true;
    return t;
  }

  release(identity) {
    const t = this.findTask(identity);
    t.taskHolding = false;
    const current = this.currentTask;
    return t.priority > current.priority ? t : current;
  }

  queuePacket(packet) {
    const t = this.findTask(packet.identity);
    this.queuePacketCount++;
    packet.link = null;
    packet.identity = this.currentTaskIdentity;
    return t.addInputAndCheckPriority(packet, this.currentTask);
  }

  schedule() {
    this.currentTask = this.taskList;
    while (this.currentTask !== null) {
      const t = this.currentTask;
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
function richards() {
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
  return s.queuePacketCount * 100000 + s.holdCount;
}

// Each iteration runs the simulation INNER_ITERATIONS times.
const INNER_ITERATIONS = 10;

export function bench(iterations) {
  let sink = 0;
  for (let i = 0; i < iterations * INNER_ITERATIONS; i++) sink += richards();
  return sink;
}
