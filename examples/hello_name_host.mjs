import fs from "node:fs";

function readLine(fd) {
  const buffer = Buffer.alloc(1);
  let value = "";
  while (true) {
    const bytesRead = fs.readSync(fd, buffer, 0, 1, null);
    if (bytesRead === 0) break;
    const ch = buffer.toString("utf8", 0, bytesRead);
    if (ch === "\n") break;
    if (ch !== "\r") value += ch;
  }
  return value;
}

function promptSync(message) {
  const scriptedName = process.env.UTU_NAME;
  if (typeof scriptedName === "string" && scriptedName.length > 0) {
    if (message) process.stdout.write(message);
    process.stdout.write(`${scriptedName}\n`);
    return scriptedName;
  }

  if (typeof globalThis.prompt === "function") {
    return globalThis.prompt(message) ?? "";
  }

  if (message) process.stdout.write(message);
  return readLine(0);
}

export default {
  es: {
    prompt: promptSync,
  },
};
