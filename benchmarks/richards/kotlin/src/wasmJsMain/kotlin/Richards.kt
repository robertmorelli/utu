// Richards, Martin Richards' operating-system scheduler simulation, as the
// Are We Fast Yet suite has it, in idiomatic Kotlin: task control blocks and
// packets are linked lists, and each of the four kinds of task is a subclass
// of a sealed class of private data whose `run` method the scheduler
// dispatches to. Compiled to WasmGC by Kotlin/Wasm; bench is exported to
// JavaScript.

@file:OptIn(ExperimentalJsExport::class)

const val IDLER = 0
const val WORKER = 1
const val HANDLER_A = 2
const val HANDLER_B = 3
const val DEVICE_A = 4
const val DEVICE_B = 5
const val NUM_TYPES = 6

const val DEVICE_PACKET_KIND = 0
const val WORK_PACKET_KIND = 1
const val DATA_SIZE = 4

class Packet(var link: Packet?, var identity: Int, val kind: Int) {
    var datum = 0
    val data = IntArray(DATA_SIZE)
}

// Adds packet to the end of the queue, which may be empty; the queue's head.
fun append(packet: Packet, queueHead: Packet?): Packet {
    packet.link = null
    if (queueHead == null) return packet
    var mouse: Packet = queueHead
    while (true) {
        val next = mouse.link ?: break
        mouse = next
    }
    mouse.link = packet
    return queueHead
}

// ---------------------------------------------------------------------------
// What each kind of task keeps between its runs, and one run of it.

sealed class TaskData {
    abstract fun run(s: Scheduler, work: Packet?): Task?
}

class IdleTaskData : TaskData() {
    var control = 1
    var count = 10000

    override fun run(s: Scheduler, work: Packet?): Task? {
        count--
        if (count == 0) return s.holdSelf()
        if ((control and 1) == 0) {
            control = control / 2
            return s.release(DEVICE_A)
        }
        control = (control / 2) xor 53256
        return s.release(DEVICE_B)
    }
}

class DeviceTaskData : TaskData() {
    var pending: Packet? = null

    override fun run(s: Scheduler, work: Packet?): Task? {
        if (work != null) {
            pending = work
            return s.holdSelf()
        }
        val p = pending ?: return s.waitTask()
        pending = null
        return s.queuePacket(p)
    }
}

class HandlerTaskData : TaskData() {
    var workIn: Packet? = null
    var deviceIn: Packet? = null

    override fun run(s: Scheduler, work: Packet?): Task? {
        if (work != null) {
            if (work.kind == WORK_PACKET_KIND) {
                workIn = append(work, workIn)
            } else {
                deviceIn = append(work, deviceIn)
            }
        }
        val workPacket = workIn ?: return s.waitTask()
        val count = workPacket.datum
        if (count >= DATA_SIZE) {
            workIn = workPacket.link
            return s.queuePacket(workPacket)
        }
        val devicePacket = deviceIn ?: return s.waitTask()
        deviceIn = devicePacket.link
        devicePacket.datum = workPacket.data[count]
        workPacket.datum = count + 1
        return s.queuePacket(devicePacket)
    }
}

class WorkerTaskData : TaskData() {
    var destination = HANDLER_A
    var count = 0

    override fun run(s: Scheduler, work: Packet?): Task? {
        if (work == null) return s.waitTask()
        destination = if (destination == HANDLER_A) HANDLER_B else HANDLER_A
        work.identity = destination
        work.datum = 0
        for (i in 0 until DATA_SIZE) {
            count++
            if (count > 26) count = 1
            work.data[i] = count
        }
        return s.queuePacket(work)
    }
}

// ---------------------------------------------------------------------------
// Task control blocks

class Task(
    val link: Task?,
    val identity: Int,
    val priority: Int,
    var input: Packet?,
    var packetPending: Boolean,
    var taskWaiting: Boolean,
    var taskHolding: Boolean,
    val data: TaskData,
) {
    fun isTaskHoldingOrWaiting(): Boolean = taskHolding || (!packetPending && taskWaiting)

    fun isWaitingWithPacket(): Boolean = packetPending && taskWaiting && !taskHolding

    fun addInputAndCheckPriority(packet: Packet, oldTask: Task): Task {
        if (input == null) {
            input = packet
            packetPending = true
            if (priority > oldTask.priority) return this
        } else {
            input = append(packet, input)
        }
        return oldTask
    }

    fun runTask(s: Scheduler): Task? {
        var message: Packet? = null
        if (isWaitingWithPacket()) {
            message = input!!
            input = message.link
            if (input == null) {
                packetPending = false
                taskWaiting = false
                taskHolding = false
            } else {
                packetPending = true
                taskWaiting = false
                taskHolding = false
            }
        }
        return data.run(s, message)
    }
}

// ---------------------------------------------------------------------------
// The scheduler

class Scheduler {
    var taskList: Task? = null
    var currentTask: Task? = null
    var currentTaskIdentity = 0
    val taskTable = arrayOfNulls<Task>(NUM_TYPES)
    var holdCount = 0
    var queuePacketCount = 0

    fun createTask(
        identity: Int,
        priority: Int,
        work: Packet?,
        packetPending: Boolean,
        taskWaiting: Boolean,
        taskHolding: Boolean,
        data: TaskData,
    ) {
        val t = Task(taskList, identity, priority, work, packetPending, taskWaiting, taskHolding, data)
        taskTable[identity] = t
        taskList = t
    }

    fun findTask(identity: Int): Task = taskTable[identity] ?: throw IllegalStateException("findTask failed")

    fun holdSelf(): Task? {
        holdCount++
        val t = currentTask!!
        t.taskHolding = true
        return t.link
    }

    fun waitTask(): Task {
        val t = currentTask!!
        t.taskWaiting = true
        return t
    }

    fun release(identity: Int): Task {
        val t = findTask(identity)
        t.taskHolding = false
        val current = currentTask!!
        return if (t.priority > current.priority) t else current
    }

    fun queuePacket(packet: Packet): Task {
        val t = findTask(packet.identity)
        queuePacketCount++
        packet.link = null
        packet.identity = currentTaskIdentity
        return t.addInputAndCheckPriority(packet, currentTask!!)
    }

    fun schedule() {
        currentTask = taskList
        while (true) {
            val t = currentTask ?: break
            if (t.isTaskHoldingOrWaiting()) {
                currentTask = t.link
            } else {
                currentTaskIdentity = t.identity
                currentTask = t.runTask(this)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// The benchmark

// One simulation: queuePacketCount * 100000 + holdCount (23246 and 9297).
fun richards(): Long {
    val s = Scheduler()
    s.createTask(IDLER, 0, null, false, false, false, IdleTaskData())

    var workQ = Packet(null, WORKER, WORK_PACKET_KIND)
    workQ = Packet(workQ, WORKER, WORK_PACKET_KIND)
    s.createTask(WORKER, 1000, workQ, true, true, false, WorkerTaskData())

    workQ = Packet(null, DEVICE_A, DEVICE_PACKET_KIND)
    workQ = Packet(workQ, DEVICE_A, DEVICE_PACKET_KIND)
    workQ = Packet(workQ, DEVICE_A, DEVICE_PACKET_KIND)
    s.createTask(HANDLER_A, 2000, workQ, true, true, false, HandlerTaskData())

    workQ = Packet(null, DEVICE_B, DEVICE_PACKET_KIND)
    workQ = Packet(workQ, DEVICE_B, DEVICE_PACKET_KIND)
    workQ = Packet(workQ, DEVICE_B, DEVICE_PACKET_KIND)
    s.createTask(HANDLER_B, 3000, workQ, true, true, false, HandlerTaskData())

    s.createTask(DEVICE_A, 4000, null, false, true, false, DeviceTaskData())
    s.createTask(DEVICE_B, 5000, null, false, true, false, DeviceTaskData())

    s.schedule()
    return s.queuePacketCount * 100000L + s.holdCount
}

// Each iteration runs the simulation INNER_ITERATIONS times.
const val INNER_ITERATIONS = 10

@JsExport
fun bench(iterations: Int): Long {
    var sink = 0L
    for (i in 0 until iterations * INNER_ITERATIONS) sink += richards()
    return sink
}
